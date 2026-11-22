import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { restoreActor, addMis, updateMis, deleteMis } from '../src/domain.ts';
import { parseMisCsvDetailed } from '../src/csv.ts';
import { initializeMisHistory } from '../src/mis-history.ts';
import { commitMisImport, deleteSelectedMis, listMisHistory, previewMisImport } from '../src/mis-workflows.ts';

const folder = mkdtempSync(join(tmpdir(), 'straveda-mis-'));
const dbPath = join(folder, 'mis.db');
copyFileSync(fileURLToPath(new URL('../assets/database/rohan_energy_demo.db', import.meta.url)), dbPath);
function open() {
  const raw = new DatabaseSync(dbPath);
  raw.exec('PRAGMA foreign_keys=ON');
  const db = {
    raw,
    execAsync: async sql => raw.exec(sql),
    runAsync: async (sql, ...args) => { const result = raw.prepare(sql).run(...args); return { ...result, lastInsertRowId: result.lastInsertRowid }; },
    getFirstAsync: async (sql, ...args) => raw.prepare(sql).get(...args) ?? null,
    getAllAsync: async (sql, ...args) => raw.prepare(sql).all(...args),
    withExclusiveTransactionAsync: async callback => {
      raw.exec('BEGIN IMMEDIATE');
      try { const result = await callback(db); raw.exec('COMMIT'); return result; }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
  };
  return db;
}
const count = (db, sql) => db.raw.prepare(sql).get().n;
const row = (db, sql, ...args) => db.raw.prepare(sql).get(...args);

test('bulk deletion removes sheet data, hides order projections, and keeps orders and MIS history across restart', async () => {
  let db = open();
  db.raw.exec('CREATE TABLE app_history(id INTEGER PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL,at TEXT NOT NULL)');
  await initializeMisHistory(db);
  await initializeMisHistory(db);
  const admin = await restoreActor(db, 'demo_super', 'rohan');
  assert.ok(admin);
  const sheet = row(db, "SELECT * FROM portal_mis_rows WHERE src='sheet' AND gone=0 LIMIT 1");
  db.raw.exec("INSERT INTO portal_mis_rows(d,sale_type,outlet,sap,location,district,state,sales_area,ro,zone,item,ea,litres,xs,src,item_id,gone,ver,updated_by,updated_at) SELECT d,sale_type,outlet,sap,location,district,state,sales_area,ro,zone,item,ea,litres,xs,'order',(SELECT id FROM portal_order_items LIMIT 1),0,1,'seed',datetime('now') FROM portal_mis_rows WHERE id=(SELECT id FROM portal_mis_rows WHERE src='sheet' LIMIT 1)");
  const order = row(db, "SELECT * FROM portal_mis_rows WHERE src='order' AND gone=0 LIMIT 1");
  assert.ok(sheet && order);
  const orderCount = count(db, 'SELECT count(*) AS n FROM portal_orders');
  assert.equal(await deleteSelectedMis(db, admin, [sheet, order]), 2);
  assert.equal(row(db, 'SELECT id FROM portal_mis_rows WHERE id=?', sheet.id), undefined);
  assert.equal(row(db, 'SELECT gone FROM portal_mis_rows WHERE id=?', order.id).gone, 1);
  assert.equal(count(db, 'SELECT count(*) AS n FROM portal_orders'), orderCount);
  assert.equal((await listMisHistory(db, admin)).filter(event => event.action === 'bulk_deleted').length, 2);
  db.raw.close();
  db = open();
  await initializeMisHistory(db);
  assert.equal(row(db, 'SELECT gone FROM portal_mis_rows WHERE id=?', order.id).gone, 1);
  assert.equal((await listMisHistory(db, admin)).filter(event => event.action === 'bulk_deleted').length, 2);
  db.raw.close();
});

test('bulk delete checks role, scope and versions atomically', async () => {
  const db = open();
  const zone = await restoreActor(db, 'demo_rohan_zo', 'rohan');
  const regional = await restoreActor(db, 'demo_rohan_ro', 'rohan');
  assert.ok(zone && regional);
  const own = row(db, 'SELECT * FROM portal_mis_rows WHERE zone=? AND gone=0 LIMIT 1', zone.zone);
  const outside = row(db, 'SELECT * FROM portal_mis_rows WHERE zone<>? AND gone=0 LIMIT 1', zone.zone);
  assert.ok(own && outside);
  await assert.rejects(deleteSelectedMis(db, regional, [own]), /not permitted/);
  await assert.rejects(deleteSelectedMis(db, zone, [own, outside]), /outside your scope/);
  assert.equal(row(db, 'SELECT gone FROM portal_mis_rows WHERE id=?', own.id).gone, 0);
  await assert.rejects(deleteSelectedMis(db, zone, [own, { id: own.id, ver: own.ver }]), /distinct/);
  await assert.rejects(deleteSelectedMis(db, zone, [{ id: own.id, ver: own.ver + 1 }]), /changed/);
  db.raw.close();
});

test('CSV preview, append commit, duplicate token protection, scope, validation and local history', async () => {
  const db = open();
  const admin = await restoreActor(db, 'demo_super', 'rohan');
  const zone = await restoreActor(db, 'demo_rohan_zo', 'rohan');
  const regional = await restoreActor(db, 'demo_rohan_ro', 'rohan');
  const outlet = row(db, 'SELECT * FROM portal_outlets WHERE zone=? LIMIT 1', zone.zone);
  const outside = row(db, 'SELECT * FROM portal_outlets WHERE zone<>? LIMIT 1', zone.zone);
  const csv = parseMisCsvDetailed(`d,sap,item,ea\n2026-11-20,${outlet.sap_code},HP DEF - 1X20L,2\n\n2026-11-21,${outlet.sap_code},HP DEF - 1X20L,3\n`);
  assert.equal(csv.skipped, 1);
  const preview = await previewMisImport(db, zone, csv.lines, csv.skipped, csv.issues);
  assert.deepEqual([preview.valid, preview.skipped, preview.issues.length], [2, 1, 0]);
  const before = count(db, 'SELECT count(*) AS n FROM portal_mis_rows');
  assert.deepEqual(await commitMisImport(db, zone, preview), { inserted: 2, skipped: 1, rejected: 0 });
  assert.equal(count(db, 'SELECT count(*) AS n FROM portal_mis_rows'), before + 2);
  assert.equal(Number(row(db, 'SELECT litres FROM portal_mis_rows ORDER BY id DESC LIMIT 1').litres), 60);
  await assert.rejects(commitMisImport(db, zone, preview), /already imported/);
  const malformed = parseMisCsvDetailed(`d,sap,item,ea\n\n2026-02-30,${outlet.sap_code},HP DEF,4\n2026-11-20,${outlet.sap_code},HP DEF,not-a-number\n2026-11-20,${outlet.sap_code},HP DEF\n`);
  const invalid = await previewMisImport(db, zone, malformed.lines, malformed.skipped, malformed.issues, malformed.rowNumbers);
  assert.deepEqual(invalid.issues.map(issue => issue.row), [3, 4, 5]);
  assert.ok(invalid.issues.some(issue => /date/.test(issue.reason)));
  assert.ok(invalid.issues.some(issue => /EA/.test(issue.reason)));
  assert.ok(invalid.issues.some(issue => /columns/.test(issue.reason)));
  await assert.rejects(commitMisImport(db, zone, invalid), /invalid/);
  const scoped = await previewMisImport(db, zone, [{ d: '2026-11-22', sap: outside.sap_code, item: 'HP DEF', ea: '1' }]);
  assert.match(scoped.issues[0].reason, /outside/);
  await assert.rejects(commitMisImport(db, zone, scoped), /invalid/);
  await assert.rejects(previewMisImport(db, regional, csv.lines), /not permitted/);
  assert.equal((await listMisHistory(db, admin)).filter(event => event.action === 'imported').length, 2);
  db.raw.close();
});

test('failed multi-row import rolls back rows, batch token and history; add/edit/delete record history', async () => {
  const db = open();
  const admin = await restoreActor(db, 'demo_super', 'rohan');
  const sap = row(db, 'SELECT sap_code FROM portal_outlets LIMIT 1').sap_code;
  const lines = [1, 2].map(ea => ({ d: '2026-11-22', sap, item: 'HP DEF', ea: String(ea) }));
  const preview = await previewMisImport(db, admin, lines);
  const before = count(db, 'SELECT count(*) AS n FROM portal_mis_rows');
  const historyBefore = count(db, 'SELECT count(*) AS n FROM app_mis_history');
  const originalRun = db.runAsync;
  let inserts = 0;
  db.runAsync = async (sql, ...args) => {
    if (sql.startsWith('INSERT INTO portal_mis_rows') && ++inserts === 2) throw new Error('Injected write failure');
    return originalRun(sql, ...args);
  };
  await assert.rejects(commitMisImport(db, admin, preview), /Injected/);
  db.runAsync = originalRun;
  assert.equal(count(db, 'SELECT count(*) AS n FROM portal_mis_rows'), before);
  assert.equal(row(db, 'SELECT token FROM app_mis_import_batches WHERE token=?', preview.token), undefined);
  assert.equal(count(db, 'SELECT count(*) AS n FROM app_mis_history'), historyBefore);
  await addMis(db, admin, '2026-11-22', sap, 'HP DEF', '4');
  let created = row(db, 'SELECT * FROM portal_mis_rows ORDER BY id DESC LIMIT 1');
  await updateMis(db, admin, created, '2026-11-23', '5');
  created = row(db, 'SELECT * FROM portal_mis_rows WHERE id=?', created.id);
  await deleteMis(db, admin, created);
  const actions = (await listMisHistory(db, admin)).map(event => event.action);
  assert.ok(actions.includes('created') && actions.includes('edited') && actions.includes('deleted'));
  db.raw.close();
});

after(() => rmSync(folder, { recursive: true, force: true }));
