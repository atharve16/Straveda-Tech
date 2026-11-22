import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { restoreActor } from '../src/domain.ts';
import { listInventory } from '../src/inventory.ts';
import { isStockEnabled, setProductStock, setStockEnabled, stockAvailable } from '../src/stock.ts';
import { initializeOrderWorkflow, previewDraftLines, saveOrderDraft, getOrderDetail } from '../src/order-workflows.ts';

const folder = mkdtempSync(join(tmpdir(), 'straveda-stock-'));
const dbPath = join(folder, 'stock.db');
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
const one = (db, sql, ...args) => db.raw.prepare(sql).get(...args);

test('stock uses setting timestamp and approved total EA, including FOC, across products', async () => {
  let db = open();
  const admin = await restoreActor(db, 'demo_super', 'rohan');
  const officer = await restoreActor(db, 'demo_rohan_ro', 'rohan');
  assert.ok(admin && officer);
  let snapshot = await listInventory(db, admin);
  assert.equal(snapshot.stockEnabled, true);
  assert.deepEqual(snapshot.products.map(p => p.available), [5000, 3000]);
  assert.equal(snapshot.products[0].rate, '1350.00');
  assert.ok(snapshot.foc.length > 0);
  assert.ok(snapshot.outlets.length >= (await listInventory(db, officer)).outlets.length);
  db.raw.prepare("UPDATE portal_settings SET updated_at='2026-11-01 00:00:00' WHERE skey IN ('stock_0','stock_1')").run();
  snapshot = await listInventory(db, admin);
  for (const product of snapshot.products) {
    const expected = one(db, "SELECT COALESCE(SUM(i.ea),0) AS n FROM portal_order_items i JOIN portal_orders o ON o.id=i.order_id WHERE i.item=? AND o.status='approved' AND o.decided_at>='2026-11-01 00:00:00'", product.name).n;
    assert.equal(product.used, expected);
    assert.equal(product.available, product.baseline - expected);
  }
  const first = snapshot.products[0];
  const approved = one(db, "SELECT i.order_id,i.ea,i.foc FROM portal_order_items i JOIN portal_orders o ON o.id=i.order_id WHERE i.item=? AND o.status='approved' LIMIT 1", first.name);
  assert.ok(approved.foc > 0);
  assert.equal(approved.ea, Number(one(db, 'SELECT paid FROM portal_order_items WHERE order_id=? AND item=?', approved.order_id, first.name).paid) + approved.foc);
  db.raw.prepare("UPDATE portal_orders SET status='pending' WHERE id=?").run(approved.order_id);
  const afterStatus = await stockAvailable(db, first.pid, first.name);
  assert.equal(afterStatus.available, first.available + approved.ea);
  db.raw.close();
  db = open();
  assert.equal((await stockAvailable(db, first.pid, first.name)).available, afterStatus.available);
  db.raw.close();
});

test('missing stock is unlimited, explicit disable preserves settings, and absent toggle infers enabled', async () => {
  const db = open();
  const admin = await restoreActor(db, 'demo_super', 'rohan');
  db.raw.prepare("DELETE FROM portal_settings WHERE skey='stock_1'").run();
  assert.equal(await stockAvailable(db, 1, 'TATA MOTORS HP GENUINE DEF 20L'), null);
  assert.equal((await listInventory(db, admin)).products[1].available, null);
  db.raw.prepare("UPDATE portal_settings SET svalue='0' WHERE skey='cfg_stock_enabled'").run();
  assert.equal(await isStockEnabled(db), false);
  assert.ok(one(db, "SELECT svalue FROM portal_settings WHERE skey='stock_0'"));
  db.raw.prepare("DELETE FROM portal_settings WHERE skey='cfg_stock_enabled'").run();
  assert.equal(await isStockEnabled(db), true);
  db.raw.prepare("DELETE FROM portal_settings WHERE skey='stock_0'").run();
  assert.equal(await isStockEnabled(db), false);
  db.raw.close();
});

test('multi-line draft keeps priced and free EA separate, edits totals, enforces scope, and rolls back failed writes', async () => {
  const db = open();
  db.raw.exec('CREATE TABLE app_history(id INTEGER PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL,at TEXT NOT NULL)');
  await initializeOrderWorkflow(db);
  const officer = await restoreActor(db, 'demo_rohan_ro', 'rohan');
  const outsider = await restoreActor(db, 'demo_rohan_ro2', 'rohan');
  const names = db.raw.prepare('SELECT name FROM portal_products ORDER BY pid').all().map(p => p.name);
  const preview = await previewDraftLines(db, [{ item: names[0], paid: 100 }, { item: names[1], paid: 30 }]);
  assert.equal(preview[0].foc, 5);
  assert.equal(preview[0].ea, 105);
  assert.equal(preview.reduce((n, p) => n + p.paid * Number(p.rate), 0), 100 * 1350 + 30 * 1450);
  await assert.rejects(saveOrderDraft(db, outsider, '90000001', [{ item: names[0], paid: 100 }]), /outside/);
  const id = await saveOrderDraft(db, officer, '90000001', [{ item: names[0], paid: 100 }, { item: names[1], paid: 30 }]);
  let detail = await getOrderDetail(db, officer, id);
  assert.equal(detail.order.total_ea, preview.reduce((n, p) => n + p.ea, 0));
  assert.equal(detail.lines.length, 2);
  await saveOrderDraft(db, officer, '90000001', [{ item: names[0], paid: 30 }], id);
  detail = await getOrderDetail(db, officer, id);
  assert.equal(detail.lines.length, 1);
  assert.equal(detail.order.total_ea, detail.lines[0].paid + detail.lines[0].foc);
  const originalRun = db.runAsync;
  db.runAsync = async (sql, ...args) => {
    if (sql.startsWith('INSERT INTO portal_order_items')) throw new Error('Injected order line failure');
    return originalRun(sql, ...args);
  };
  await assert.rejects(saveOrderDraft(db, officer, '90000001', [{ item: names[1], paid: 40 }], id), /Injected/);
  db.runAsync = originalRun;
  detail = await getOrderDetail(db, officer, id);
  assert.equal(detail.lines[0].item, names[0]);
  assert.equal(detail.order.total_ea, detail.lines[0].ea);
  db.raw.close();
});

test('admin stock settings validate, preserve unchanged baseline, toggle safely, and roll back failures', async () => {
  const db = open();
  const admin = await restoreActor(db, 'demo_super', 'rohan');
  const officer = await restoreActor(db, 'demo_rohan_ro', 'rohan');
  const item = one(db, 'SELECT name FROM portal_products WHERE pid=0').name;
  db.raw.prepare("INSERT INTO portal_settings(skey,svalue,updated_at) VALUES('stock_0','10000','2026-01-01 00:00:00')").run();
  const current = await stockAvailable(db, 0, item);
  assert.equal(await setProductStock(db, admin, 0, String(current.available)), false);
  assert.equal(one(db, "SELECT updated_at FROM portal_settings WHERE skey='stock_0'").updated_at, '2026-01-01 00:00:00');
  await assert.rejects(setProductStock(db, officer, 0, '50'), /Super Admin/);
  await assert.rejects(setStockEnabled(db, officer, false), /Super Admin/);
  await assert.rejects(setProductStock(db, admin, 0, '-1'), /whole EA/);
  await assert.rejects(setProductStock(db, admin, 0, '1.5'), /whole EA/);
  await assert.rejects(setProductStock(db, admin, 999, '50'), /no longer exists/);
  const originalRun = db.runAsync;
  db.runAsync = async (sql, ...args) => {
    if (sql.startsWith('INSERT INTO portal_settings')) throw new Error('Injected stock failure');
    return originalRun(sql, ...args);
  };
  await assert.rejects(setProductStock(db, admin, 0, '50'), /Injected/);
  db.runAsync = originalRun;
  assert.equal(one(db, "SELECT svalue FROM portal_settings WHERE skey='stock_0'").svalue, '10000');
  assert.equal(await setProductStock(db, admin, 0, '50'), true);
  assert.equal(one(db, "SELECT svalue FROM portal_settings WHERE skey='stock_0'").svalue, '50');
  assert.equal(await setStockEnabled(db, admin, false), true);
  assert.equal(await isStockEnabled(db), false);
  assert.equal(one(db, "SELECT svalue FROM portal_settings WHERE skey='stock_0'").svalue, '50');
  assert.equal(await setStockEnabled(db, admin, true), true);
  assert.equal(await setProductStock(db, admin, 0, ''), true);
  assert.equal(await stockAvailable(db, 0, item), null);
  db.raw.close();
});

after(() => rmSync(folder, { recursive: true, force: true }));
