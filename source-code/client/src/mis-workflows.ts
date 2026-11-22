import type { SQLiteDatabase } from 'expo-sqlite';
import { canEditMis, inScope, validDate, type Actor, type ImportLine, type MisRow } from './domain.ts';
import { recordMisHistory, type MisHistory } from './mis-history.ts';

export type ImportIssue = { row: number; reason: string };
export type MisImportPreview = { token: string; actor: string; lines: ImportLine[]; rowNumbers: number[]; skipped: number; issues: ImportIssue[]; valid: number };

export async function listMisHistory(db: SQLiteDatabase, actor: Actor): Promise<MisHistory[]> {
  const rows = await db.getAllAsync<MisHistory>('SELECT * FROM app_mis_history ORDER BY id DESC LIMIT 500');
  return rows.filter(row => inScope(actor, row)).slice(0, 100);
}

export async function deleteSelectedMis(db: SQLiteDatabase, actor: Actor, selected: Pick<MisRow, 'id' | 'ver'>[]): Promise<number> {
  if (!canEditMis(actor)) throw new Error('MIS deletion is not permitted.');
  if (!selected.length || selected.length > 500 || new Set(selected.map(row => row.id)).size !== selected.length ||
      selected.some(row => !Number.isInteger(row.id) || row.id < 1 || !Number.isInteger(row.ver))) throw new Error('Select 1 to 500 distinct current MIS rows.');
  await db.withExclusiveTransactionAsync(async tx => {
    for (const selectedRow of selected) {
      const row = await tx.getFirstAsync<MisRow & { gone: number }>('SELECT * FROM portal_mis_rows WHERE id=?', selectedRow.id);
      if (!row || row.gone || row.ver !== selectedRow.ver || !inScope(actor, row)) throw new Error(`MIS row #${selectedRow.id} changed or is outside your scope. Refresh and retry.`);
      const result = row.src === 'order'
        ? await tx.runAsync("UPDATE portal_mis_rows SET gone=1,ver=ver+1,updated_by=?,updated_at=datetime('now') WHERE id=? AND ver=? AND gone=0", actor.username,row.id,row.ver)
        : await tx.runAsync('DELETE FROM portal_mis_rows WHERE id=? AND ver=? AND gone=0', row.id,row.ver);
      if (result.changes !== 1) throw new Error(`MIS row #${row.id} changed. Refresh and retry.`);
      await recordMisHistory(tx, actor, 'bulk_deleted', row, `date=${row.d}; item=${row.item}; EA=${row.ea}; ${row.src === 'order' ? 'projection hidden' : 'sheet row removed'}`);
    }
    await tx.runAsync("INSERT INTO app_history(actor,action,detail,at) VALUES(?,?,?,datetime('now'))", actor.username,'mis_bulk_delete',`${selected.length} rows`);
  });
  return selected.length;
}

async function inspectLines(db: SQLiteDatabase, actor: Actor, lines: ImportLine[], rowNumbers: number[]) {
  const outlets = await db.getAllAsync<{ sap_code: string; outlet_name: string; zone: string; ro: string; state: string; sales_area: string; district: string }>('SELECT sap_code,outlet_name,zone,ro,state,sales_area,district FROM portal_outlets');
  const bySap = new Map(outlets.map(outlet => [outlet.sap_code, outlet]));
  const issues: ImportIssue[] = [];
  const valid: { line: ImportLine; outlet: typeof outlets[number]; ea: number }[] = [];
  lines.forEach((line, index) => {
    const row = rowNumbers[index] ?? index + 2;
    const outlet = bySap.get(line.sap.trim());
    const ea = Number(line.ea);
    let reason = '';
    if (!validDate(line.d)) reason = 'Invalid date; use YYYY-MM-DD.';
    else if (!outlet) reason = 'Outlet SAP is missing from the local master.';
    else if (!inScope(actor, { ...outlet, sap: outlet.sap_code })) reason = 'Outlet is outside your permitted area.';
    else if (!line.item.trim()) reason = 'Product item is blank.';
    else if (!line.ea.trim() || !Number.isFinite(ea) || ea <= 0 || ea > 1e9) reason = 'EA must be a positive number up to 1,000,000,000.';
    if (reason) issues.push({ row, reason });
    else valid.push({ line, outlet: outlet!, ea });
  });
  return { issues, valid };
}

export async function previewMisImport(db: SQLiteDatabase, actor: Actor, lines: ImportLine[], skipped = 0, parserIssues: ImportIssue[] = [], rowNumbers = lines.map((_, index) => index + 2)): Promise<MisImportPreview> {
  if (!canEditMis(actor)) throw new Error('MIS importing is not permitted.');
  if (!lines.length || lines.length > 30000) throw new Error('Import must contain 1–30,000 nonempty data rows.');
  const checked = await inspectLines(db, actor, lines, rowNumbers);
  const combined = new Map<number, string>();
  for (const issue of [...parserIssues, ...checked.issues]) {
    combined.set(issue.row, combined.has(issue.row) ? `${combined.get(issue.row)} ${issue.reason}` : issue.reason);
  }
  return {
    token: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    actor: actor.username,
    lines,
    rowNumbers,
    skipped,
    issues: [...combined].sort(([a], [b]) => a - b).map(([row, reason]) => ({ row, reason })),
    valid: lines.length - combined.size,
  };
}

export async function commitMisImport(db: SQLiteDatabase, actor: Actor, preview: MisImportPreview): Promise<{ inserted: number; skipped: number; rejected: number }> {
  if (!canEditMis(actor) || preview.actor !== actor.username) throw new Error('MIS importing is not permitted.');
  if (!/^[0-9]+-[a-z0-9]+$/.test(preview.token) || !preview.lines.length || preview.lines.length > 30000) throw new Error('Invalid import preview.');
  let inserted = 0;
  await db.withExclusiveTransactionAsync(async tx => {
    const checked = await inspectLines(tx, actor, preview.lines, preview.rowNumbers);
    if (preview.issues.length || checked.issues.length) throw new Error(`${Math.max(preview.issues.length, checked.issues.length)} CSV row(s) are invalid or outside your scope. Review the preview.`);
    const prior = await tx.getFirstAsync<{ token: string }>('SELECT token FROM app_mis_import_batches WHERE token=?', preview.token);
    if (prior) throw new Error('This preview was already imported. Pick the CSV again for an intentional repeat import.');
    await tx.runAsync('INSERT INTO app_mis_import_batches(token,actor,inserted) VALUES(?,?,?)', preview.token,actor.username,checked.valid.length);
    for (const { line, outlet, ea } of checked.valid) {
      const created = await tx.runAsync("INSERT INTO portal_mis_rows(d,sale_type,outlet,sap,location,district,state,sales_area,ro,zone,item,ea,litres,xs,src,gone,ver,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'sheet',0,1,?,datetime('now'))", line.d,'HPCL Retail Outlet',outlet.outlet_name,outlet.sap_code,outlet.sales_area,outlet.district,outlet.state,outlet.sales_area,outlet.ro,outlet.zone,line.item.trim(),ea.toFixed(2),(ea*20).toFixed(2),'',actor.username);
      await recordMisHistory(tx,actor,'imported',{id:Number(created.lastInsertRowId),src:'sheet',sap:outlet.sap_code,zone:outlet.zone,ro:outlet.ro,state:outlet.state,sales_area:outlet.sales_area},`date=${line.d}; item=${line.item.trim()}; EA=${ea.toFixed(2)}`);
      inserted++;
    }
    await tx.runAsync("INSERT INTO app_history(actor,action,detail,at) VALUES(?,?,?,datetime('now'))",actor.username,'mis_import',`${inserted} inserted; ${preview.skipped} blank skipped`);
  });
  return { inserted, skipped: preview.skipped, rejected: 0 };
}
