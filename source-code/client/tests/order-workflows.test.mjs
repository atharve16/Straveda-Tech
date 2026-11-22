import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { restoreActor, submitOrder, decideOrder, listOrders, canDecideOrderWithTeam } from '../src/domain.ts';
import { initializeOrderWorkflow, previewDraftLines, saveOrderDraft, getOrderDetail, recordOrderFile, requestOrderReturn, decideOrderReturn, listOrderReturns } from '../src/order-workflows.ts';
import { validateOrderFile } from '../src/order-file-validation.ts';

const folder = mkdtempSync(join(tmpdir(), 'straveda-orders-'));
const dbPath = join(folder, 'orders.db');
copyFileSync(fileURLToPath(new URL('../assets/database/rohan_energy_demo.db', import.meta.url)), dbPath);

function open() {
  const raw = new DatabaseSync(dbPath);
  raw.exec('PRAGMA foreign_keys=ON');
  const adapter = {
    raw,
    execAsync: async sql => raw.exec(sql),
    runAsync: async (sql, ...args) => { const result = raw.prepare(sql).run(...args); return { ...result, lastInsertRowId: result.lastInsertRowid }; },
    getFirstAsync: async (sql, ...args) => raw.prepare(sql).get(...args) ?? null,
    getAllAsync: async (sql, ...args) => raw.prepare(sql).all(...args),
    withExclusiveTransactionAsync: async callback => {
      raw.exec('BEGIN IMMEDIATE');
      try { const result = await callback(adapter); raw.exec('COMMIT'); return result; }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
  };
  return adapter;
}

test('multi-line draft, edit, submit, approval, POD, return and restart persistence', async () => {
  let db = open();
  db.raw.exec('CREATE TABLE app_history(id INTEGER PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL,at TEXT NOT NULL)');
  await initializeOrderWorkflow(db);
  await initializeOrderWorkflow(db);
  const actor = await restoreActor(db, 'demo_rohan_ro', 'rohan');
  const admin = await restoreActor(db, 'demo_super', 'rohan');
  const zoneOfficer = await restoreActor(db, 'demo_rohan_zo', 'rohan');
  assert.ok(actor && admin);
  assert.ok(zoneOfficer);
  const teamOrder = (await listOrders(db, zoneOfficer)).find(order => order.id === 2);
  assert.equal(teamOrder?.canDecide, true);
  assert.equal(await canDecideOrderWithTeam(db, zoneOfficer, teamOrder), true);
  const products = db.raw.prepare('SELECT name FROM portal_products ORDER BY pid').all().map(row => row.name);
  const preview = await previewDraftLines(db, [{ item: products[0], paid: 100 }, { item: products[1], paid: 30 }]);
  assert.equal(preview[0].foc, 5);
  assert.equal(preview[0].ea, 105);
  assert.equal(preview.reduce((sum, line) => sum + line.paid * Number(line.rate), 0), 100 * 1350 + 30 * 1450);
  const originalCount = db.raw.prepare('SELECT count(*) AS n FROM portal_orders').get().n;
  const id = await saveOrderDraft(db, actor, '90000001', [{ item: products[0], paid: 100 }, { item: products[1], paid: 30 }]);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM portal_orders').get().n, originalCount + 1);
  let detail = await getOrderDetail(db, actor, id);
  assert.equal(detail.lines.length, 2);
  assert.equal(detail.order.sap, '90000001');
  assert.equal(detail.order.total_ea, preview.reduce((sum, line) => sum + line.ea, 0));
  await assert.rejects(saveOrderDraft(db, actor, '90000001', [{ item: products[0], paid: 2 }, { item: products[0], paid: 3 }], id), /once/);
  assert.equal((await getOrderDetail(db, actor, id)).lines.length, 2);
  await saveOrderDraft(db, actor, '90000001', [{ item: products[0], paid: 100 }], id);
  detail = await getOrderDetail(db, actor, id);
  assert.equal(detail.lines.length, 1);
  assert.equal(detail.lines[0].foc, 5);
  await submitOrder(db, actor, id);
  await assert.rejects(submitOrder(db, actor, id), /Only your draft/);
  await assert.rejects(decideOrder(db, actor, id, true), /not eligible/);
  await decideOrder(db, admin, id, true);
  await assert.rejects(decideOrder(db, admin, id, true), /not eligible/);
  await assert.rejects(recordOrderFile(db, actor, id, { kind: 'pod', origName: 'pod.pdf', storedName: 'pod.pdf', mime: 'application/pdf', size: 5 }), /payment receipt/);
  assert.equal(db.raw.prepare("SELECT count(*) AS n FROM portal_order_files WHERE order_id=? AND kind='pod'").get(id).n, 0);
  await recordOrderFile(db, actor, id, { kind: 'payment', origName: 'receipt.pdf', storedName: 'receipt.pdf', mime: 'application/pdf', size: 5 });
  await recordOrderFile(db, actor, id, { kind: 'pod', origName: 'pod.pdf', storedName: 'pod.pdf', mime: 'application/pdf', size: 5 });
  await assert.rejects(recordOrderFile(db, actor, id, { kind: 'pod', origName: 'pod2.pdf', storedName: 'pod2.pdf', mime: 'application/pdf', size: 5 }), /not permitted/);
  const beforeReturn = { ...db.raw.prepare('SELECT status,delivery_stage,invoice_no FROM portal_orders WHERE id=?').get(id) };
  const misBeforeReturn = db.raw.prepare('SELECT count(*) AS n FROM portal_mis_rows WHERE item_id IN (SELECT id FROM portal_order_items WHERE order_id=?)').get(id).n;
  await requestOrderReturn(db, actor, id, 'Damaged packaging', 'CN-001');
  await assert.rejects(requestOrderReturn(db, actor, id, 'Damaged packaging', 'CN-002'), /already exists/);
  const returns = await listOrderReturns(db, admin);
  const ret = returns.find(row => row.order_id === id);
  assert.ok(ret);
  await decideOrderReturn(db, admin, ret.id, true, 'Approved credit note');
  await assert.rejects(decideOrderReturn(db, admin, ret.id, true, ''), /already been decided/);
  assert.deepEqual({ ...db.raw.prepare('SELECT status,delivery_stage,invoice_no FROM portal_orders WHERE id=?').get(id) }, beforeReturn);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM portal_mis_rows WHERE item_id IN (SELECT id FROM portal_order_items WHERE order_id=?)').get(id).n, misBeforeReturn);
  db.raw.close();
  db = open();
  await initializeOrderWorkflow(db);
  detail = await getOrderDetail(db, actor, id);
  assert.equal(detail.order.delivery_stage, 'delivered');
  assert.equal(detail.lines[0].paid, 100);
  assert.equal(detail.returns[0].status, 'approved');
  assert.ok(detail.events.some(event => event.action === 'delivered'));
  const outlet = await restoreActor(db, '90000001', 'outlet');
  assert.ok(outlet);
  const invoiceOrderId = await saveOrderDraft(db, outlet, '90000001', [{ item: products[0], paid: 30 }]);
  assert.equal(db.raw.prepare('SELECT doc_type FROM portal_orders WHERE id=?').get(invoiceOrderId).doc_type, 'invoice');
  await submitOrder(db, outlet, invoiceOrderId);
  await decideOrder(db, admin, invoiceOrderId, true);
  assert.ok(db.raw.prepare('SELECT invoice_no FROM portal_orders WHERE id=?').get(invoiceOrderId).invoice_no);
  db.raw.close();
});

test('rejection, role scope, rollback, and file signatures', async () => {
  const db = open();
  const actor = await restoreActor(db, 'demo_rohan_ro', 'rohan');
  const admin = await restoreActor(db, 'demo_super', 'rohan');
  const outsider = await restoreActor(db, 'demo_rohan_ro2', 'rohan');
  assert.ok(actor && admin && outsider);
  const product = db.raw.prepare('SELECT name FROM portal_products ORDER BY pid LIMIT 1').get().name;
  const otherProduct = db.raw.prepare('SELECT name FROM portal_products ORDER BY pid DESC LIMIT 1').get().name;
  const combined = await saveOrderDraft(db, actor, '90000001', [{ item: product, paid: 15 }, { item: otherProduct, paid: 15 }]);
  await submitOrder(db, actor, combined);
  assert.equal(db.raw.prepare('SELECT status FROM portal_orders WHERE id=?').get(combined).status, 'pending');
  const id = await saveOrderDraft(db, actor, '90000001', [{ item: product, paid: 30 }]);
  await assert.rejects(saveOrderDraft(db, outsider, '90000001', [{ item: product, paid: 40 }], id));
  await submitOrder(db, actor, id);
  await assert.rejects(decideOrder(db, admin, id, false, ''), /reason/);
  await decideOrder(db, admin, id, false, 'Quantity mismatch');
  await assert.rejects(decideOrder(db, admin, id, false, 'Again'), /not eligible/);
  assert.equal(db.raw.prepare('SELECT status FROM portal_orders WHERE id=?').get(id).status, 'rejected');
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM portal_mis_rows WHERE item_id IN (SELECT id FROM portal_order_items WHERE order_id=?)').get(id).n, 0);
  await assert.rejects(requestOrderReturn(db, actor, id, 'Damage', 'CN-3'), /delivered/);
  const pendingSeedReturn = db.raw.prepare("SELECT id FROM portal_order_returns WHERE order_id=5 AND status='pending' LIMIT 1").get();
  assert.ok(pendingSeedReturn);
  await assert.rejects(decideOrderReturn(db, actor, pendingSeedReturn.id, true, ''), /not permitted/);
  await assert.rejects(decideOrderReturn(db, admin, pendingSeedReturn.id, false, ''), /rejection reason/);
  await decideOrderReturn(db, admin, pendingSeedReturn.id, false, 'Not supported by credit note');
  assert.equal(db.raw.prepare('SELECT status FROM portal_order_returns WHERE id=?').get(pendingSeedReturn.id).status, 'rejected');
  await requestOrderReturn(db, outsider, 5, 'Damaged seal', 'CN-RETRY');
  const count = db.raw.prepare('SELECT count(*) AS n FROM portal_order_items WHERE order_id=?').get(id).n;
  const originalRun = db.runAsync;
  db.runAsync = async (sql, ...args) => { if (sql.startsWith('INSERT INTO portal_order_items')) throw new Error('injected write failure'); return originalRun(sql, ...args); };
  await assert.rejects(saveOrderDraft(db, actor, '90000001', [{ item: product, paid: 50 }], id), /injected/);
  db.runAsync = originalRun;
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM portal_order_items WHERE order_id=?').get(id).n, count);
  assert.equal(db.raw.prepare('SELECT status FROM portal_orders WHERE id=?').get(id).status, 'rejected');
  await submitOrder(db, actor, id);
  assert.deepEqual({ ...db.raw.prepare('SELECT status,decided_by,review_comment FROM portal_orders WHERE id=?').get(id) }, { status: 'pending', decided_by: null, review_comment: null });
  assert.equal(validateOrderFile('pod', 'pod.pdf', 5, new Uint8Array([37,80,68,70,45])), 'application/pdf');
  assert.throws(() => validateOrderFile('pod', 'pod.pdf', 5, new Uint8Array([1,2,3,4,5])), /contents/);
  assert.throws(() => validateOrderFile('pod', 'pod.jpg', 3, new Uint8Array([255,216,255])), /Unsupported/);
  assert.throws(() => validateOrderFile('pod', 'missing.pdf', 0, new Uint8Array()), /nonempty/);
  db.raw.exec("UPDATE portal_settings SET svalue='1' WHERE skey='stock_0'");
  await assert.rejects(saveOrderDraft(db, actor, '90000001', [{ item: product, paid: 30 }]), /Insufficient stock/);
  db.raw.close();
});

after(() => rmSync(folder, { recursive: true, force: true }));
