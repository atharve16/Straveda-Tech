import type { SQLiteDatabase } from 'expo-sqlite';
import type { Actor } from './domain.ts';

function requireStockAdmin(actor: Actor) {
  if (actor.org !== 'rohan' || actor.role !== 'superadmin') throw new Error('Only Rohan Super Admin may change stock settings.');
}

export async function isStockEnabled(db: SQLiteDatabase): Promise<boolean> {
  const toggle = await db.getFirstAsync<{ svalue: string }>("SELECT svalue FROM portal_settings WHERE skey='cfg_stock_enabled'");
  if (toggle) return toggle.svalue === '1';
  const setting = await db.getFirstAsync<{ skey: string }>("SELECT skey FROM portal_settings WHERE skey GLOB 'stock_[0-9]*' LIMIT 1");
  return !!setting;
}

export async function stockAvailable(db: SQLiteDatabase, pid: number, item: string): Promise<{
  baseline: number; used: number; available: number; settingAt: string;
} | null> {
  const setting = await db.getFirstAsync<{ svalue: string; updated_at: string }>('SELECT svalue,updated_at FROM portal_settings WHERE skey=?', `stock_${pid}`);
  if (!setting) return null;
  const baseline = Number(setting.svalue);
  if (!Number.isInteger(baseline) || baseline < 0) throw new Error(`Invalid stock setting for ${item}.`);
  const usedRow = await db.getFirstAsync<{ n: number }>(
    "SELECT COALESCE(SUM(i.ea),0) AS n FROM portal_order_items i JOIN portal_orders o ON o.id=i.order_id WHERE i.item=? AND o.status='approved' AND o.decided_at>=?",
    item, setting.updated_at
  );
  const used = Number(usedRow?.n || 0);
  return { baseline, used, available: baseline - used, settingAt: setting.updated_at };
}

export async function setProductStock(db: SQLiteDatabase, actor: Actor, pid: number, value: string): Promise<boolean> {
  requireStockAdmin(actor);
  const trimmed = value.trim();
  if (trimmed && (!/^\d+$/.test(trimmed) || Number(trimmed) > 100000000)) throw new Error('Stock must be a whole EA value from 0 to 100000000, or blank for unlimited.');
  let changed = false;
  await db.withExclusiveTransactionAsync(async tx => {
    const product = await tx.getFirstAsync<{ name: string }>('SELECT name FROM portal_products WHERE pid=?', pid);
    if (!product) throw new Error('Product no longer exists.');
    const current = await stockAvailable(tx, pid, product.name);
    if (!trimmed) {
      if (!current) return;
      await tx.runAsync('DELETE FROM portal_settings WHERE skey=?', `stock_${pid}`);
      changed = true;
      return;
    }
    const available = Number(trimmed);
    if (current?.available === available) return;
    await tx.runAsync("INSERT INTO portal_settings(skey,svalue,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(skey) DO UPDATE SET svalue=excluded.svalue,updated_at=excluded.updated_at", `stock_${pid}`, String(available));
    changed = true;
  });
  return changed;
}

export async function setStockEnabled(db: SQLiteDatabase, actor: Actor, enabled: boolean): Promise<boolean> {
  requireStockAdmin(actor);
  let changed = false;
  await db.withExclusiveTransactionAsync(async tx => {
    if (await isStockEnabled(tx) === enabled) return;
    await tx.runAsync("INSERT INTO portal_settings(skey,svalue,updated_at) VALUES('cfg_stock_enabled',?,datetime('now')) ON CONFLICT(skey) DO UPDATE SET svalue=excluded.svalue,updated_at=excluded.updated_at", enabled ? '1' : '0');
    changed = true;
  });
  return changed;
}
