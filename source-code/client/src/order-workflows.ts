import type { SQLiteDatabase } from 'expo-sqlite';
import { inScope, type Actor, type Order } from './domain.ts';
import { isStockEnabled, stockAvailable } from './stock.ts';

export type DraftLine = { item: string; paid: number };
export type OrderLine = { id: number; item: string; paid: number; foc: number; ea: number; vol: number; rate: string | null; gst: string | null };
export type OrderEvent = { id: number; action: string; from_status: string | null; to_status: string; user_label: string; comment: string | null; created_at: string };
export type OrderFile = { kind: string; orig_name: string; stored_name: string; mime: string; size: number; created_at: string };
export type OrderReturn = { id: number; order_id: number; status: string; reason: string; credit_note: string; requested_by: string; requested_by_name: string; requested_at: string; decided_by_name: string | null; decision_comment: string | null; decided_at: string | null };
export type OrderDetail = { order: Order; lines: OrderLine[]; events: OrderEvent[]; files: OrderFile[]; returns: OrderReturn[] };

export async function initializeOrderWorkflow(db: SQLiteDatabase) {
  await db.execAsync(`CREATE TABLE IF NOT EXISTS app_order_sap (
    order_id INTEGER PRIMARY KEY REFERENCES portal_orders(id) ON DELETE CASCADE,
    sap TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS app_order_sap_sap ON app_order_sap(sap);
  CREATE INDEX IF NOT EXISTS app_return_order_status ON portal_order_returns(order_id,status);`);
}

const orderSql = `SELECT o.id,o.order_ref,o.status,o.order_date,o.outlet,o.zone,o.state,o.ro,o.sales_area,
  o.total_ea,o.created_by,o.created_by_name,o.decided_by_name,o.review_comment,o.placed_role,o.updated_at,o.delivery_stage,o.doc_type,o.invoice_mode,o.voucher_no,o.invoice_no,
  COALESCE((SELECT sap FROM app_order_sap WHERE order_id=o.id),
    (SELECT sap_code FROM portal_outlets WHERE outlet_name=o.outlet LIMIT 1),'') AS sap
  FROM portal_orders o WHERE o.id=?`;

async function scopedOrder(db: SQLiteDatabase, actor: Actor, id: number): Promise<Order> {
  const order = await db.getFirstAsync<Order>(orderSql, id);
  if (!order || !inScope(actor, order)) throw new Error('Order is unavailable in your scope.');
  return order;
}

export async function getOrderDetail(db: SQLiteDatabase, actor: Actor, id: number): Promise<OrderDetail> {
  const order = await scopedOrder(db, actor, id);
  const [lines, events, files, returns] = await Promise.all([
    db.getAllAsync<OrderLine>('SELECT id,item,COALESCE(paid,ea) AS paid,COALESCE(foc,0) AS foc,ea,vol,rate,gst FROM portal_order_items WHERE order_id=? ORDER BY id', id),
    db.getAllAsync<OrderEvent>('SELECT id,action,from_status,to_status,user_label,comment,created_at FROM portal_order_events WHERE order_id=? ORDER BY id', id),
    db.getAllAsync<OrderFile>('SELECT kind,orig_name,stored_name,mime,size,created_at FROM portal_order_files WHERE order_id=? ORDER BY id DESC', id),
    db.getAllAsync<OrderReturn>('SELECT id,order_id,status,reason,credit_note,requested_by,requested_by_name,requested_at,decided_by_name,decision_comment,decided_at FROM portal_order_returns WHERE order_id=? ORDER BY id DESC', id),
  ]);
  if (actor.org !== 'rohan') {
    const visible = await db.getFirstAsync<{ svalue: string }>("SELECT svalue FROM portal_settings WHERE skey='perm_hpcl_tax_invoice'");
    if (visible?.svalue !== '1') {
      order.invoice_no = null;
      return { order, lines, events, files: files.filter(file => file.kind !== 'invoice'), returns };
    }
  }
  return { order, lines, events, files, returns };
}

export async function previewDraftLines(db: SQLiteDatabase, lines: DraftLine[]) {
  if (!lines.length || lines.length > 20) throw new Error('Select 1 to 20 distinct products.');
  const seen = new Set<string>();
  const result: { item: string; paid: number; foc: number; ea: number; rate: string | null; gst: string | null }[] = [];
  for (const line of lines) {
    const item = line.item.trim();
    const key = item.toLowerCase();
    if (!item || seen.has(key)) throw new Error('Each product may appear only once.');
    seen.add(key);
    if (!Number.isInteger(line.paid) || line.paid < 1 || line.paid > 100000) throw new Error('Paid EA must be a whole number from 1 to 100000.');
    const product = await db.getFirstAsync<{ pid: number; name: string }>('SELECT pid,name FROM portal_products WHERE name=?', item);
    if (!product) throw new Error('Select a current product name.');
    const foc = await db.getFirstAsync<{ foc_qty: number }>('SELECT foc_qty FROM portal_foc WHERE pid=? AND min_qty<=? ORDER BY min_qty DESC LIMIT 1', product.pid, line.paid);
    const free = Math.max(0, Number(foc?.foc_qty || 0));
    if (!Number.isInteger(free) || line.paid + free > 100000) throw new Error('Total EA exceeds 100000.');
    const rate = await db.getFirstAsync<{ svalue: string }>('SELECT svalue FROM portal_settings WHERE skey=?', `rate_${product.pid}`);
    const gst = await db.getFirstAsync<{ svalue: string }>('SELECT svalue FROM portal_settings WHERE skey=?', `gst_${product.pid}`);
    result.push({ item: product.name, paid: line.paid, foc: free, ea: line.paid + free, rate: rate?.svalue ?? null, gst: gst?.svalue ?? null });
  }
  return result;
}

export async function saveOrderDraft(db: SQLiteDatabase, actor: Actor, sap: string, lines: DraftLine[], editId?: number): Promise<number> {
  let savedId = 0;
  let savedStatus = 'draft';
  await db.withExclusiveTransactionAsync(async tx => {
    const prepared = await previewDraftLines(tx, lines);
    const outlet = await tx.getFirstAsync<any>('SELECT * FROM portal_outlets WHERE sap_code=?', sap.trim());
    if (!outlet || !inScope(actor, { ...outlet, sap: outlet.sap_code })) throw new Error('Outlet is outside your permitted area.');
    const total = prepared.reduce((sum, line) => sum + line.ea, 0);
    if (total > 100000) throw new Error('Total EA exceeds 100000.');
    const stockEnabled = await isStockEnabled(tx);
    if (stockEnabled) {
      for (const line of prepared) {
        const product = await tx.getFirstAsync<{ pid: number }>('SELECT pid FROM portal_products WHERE name=?', line.item);
        if (!product) throw new Error('Order item is no longer available.');
        const stock = await stockAvailable(tx, product.pid, line.item);
        if (stock && stock.available < line.ea) throw new Error(`Insufficient stock for ${line.item}.`);
      }
    }
    if (editId) {
      const existing = await tx.getFirstAsync<Order>(orderSql, editId);
      if (!existing || !inScope(actor, existing) || existing.created_by !== actor.username || !['draft', 'rejected'].includes(existing.status)) throw new Error('Only your draft or rejected order can be edited.');
      savedStatus = existing.status;
      const code = await tx.getFirstAsync<{ ro_code: string }>("SELECT ro_code FROM portal_orders WHERE ro=? AND ro_code<>'' LIMIT 1", outlet.ro);
      if (!code) throw new Error('Regional office code is missing from local reference data.');
      const updated = await tx.runAsync("UPDATE portal_orders SET zone=?,state=?,ro=?,ro_code=?,outlet=?,district=?,sales_area=?,outlet_address=?,outlet_phone=?,outlet_pincode=?,outlet_gstin=?,outlet_pan=?,invoice_name=?,invoice_address=?,invoice_state=?,invoice_pan=?,invoice_gstin=?,total_ea=?,total_vol=?,updated_at=datetime('now') WHERE id=? AND status IN ('draft','rejected')", outlet.zone,outlet.state,outlet.ro,code.ro_code,outlet.outlet_name,outlet.district,outlet.sales_area,outlet.address||'',outlet.phone||'',outlet.pincode||'',outlet.gstin||'',outlet.pan||'',outlet.inv_name||'',outlet.inv_address||'',outlet.inv_state||'',outlet.inv_pan||'',outlet.inv_gstin||'',total,total*20,editId);
      if (updated.changes !== 1) throw new Error('Order status changed. Refresh and try again.');
      await tx.runAsync('DELETE FROM portal_order_items WHERE order_id=?', editId);
      savedId = editId;
    } else {
      const code = await tx.getFirstAsync<{ ro_code: string }>("SELECT ro_code FROM portal_orders WHERE ro=? AND ro_code<>'' LIMIT 1", outlet.ro);
      if (!code) throw new Error('Regional office code is missing from local reference data.');
      const created = await tx.runAsync("INSERT INTO portal_orders(status,order_date,zone,state,ro,ro_code,outlet,district,sales_area,outlet_address,outlet_phone,outlet_pincode,outlet_gstin,outlet_pan,invoice_name,invoice_address,invoice_state,invoice_pan,invoice_gstin,remarks,total_ea,total_vol,created_by,created_by_name,created_at,updated_at,delivery_stage,doc_type,invoice_mode,inv_flag,placed_role) VALUES('draft',date('now'),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),'',?,'auto',0,?)", outlet.zone,outlet.state,outlet.ro,code.ro_code,outlet.outlet_name,outlet.district,outlet.sales_area,outlet.address||'',outlet.phone||'',outlet.pincode||'',outlet.gstin||'',outlet.pan||'',outlet.inv_name||'',outlet.inv_address||'',outlet.inv_state||'',outlet.inv_pan||'',outlet.inv_gstin||'','',total,total*20,actor.username,actor.label,actor.org==='rohan'?'so':'invoice',actor.sap?'hpcl_outlet':`${actor.org}_${actor.role==='superadmin'?'admin':actor.level==='regional'?'regional':'zone'}`);
      savedId = Number(created.lastInsertRowId);
      await tx.runAsync('UPDATE portal_orders SET order_ref=? WHERE id=?', `RE-ORD-${String(savedId).padStart(6,'0')}`, savedId);
    }
    await tx.runAsync('INSERT INTO app_order_sap(order_id,sap) VALUES(?,?) ON CONFLICT(order_id) DO UPDATE SET sap=excluded.sap', savedId, outlet.sap_code);
    for (const line of prepared) await tx.runAsync('INSERT INTO portal_order_items(order_id,item,ea,vol,rate,gst,foc,paid) VALUES(?,?,?,?,?,?,?,?)', savedId,line.item,line.ea,line.ea*20,line.rate,line.gst,line.foc,line.paid);
    await tx.runAsync('INSERT INTO portal_order_events(order_id,action,to_status,username,user_label,org,comment,created_at) VALUES(?,?,?,?,?,?,?,datetime(\'now\'))', savedId,editId?'edited':'created',savedStatus,actor.username,actor.label,actor.org,'');
    await tx.runAsync("INSERT INTO app_history(actor,action,detail,at) VALUES(?,?,?,datetime('now'))", actor.username,editId?'order_edit':'order_draft',String(savedId));
  });
  return savedId;
}

export async function listOrderReturns(db: SQLiteDatabase, actor: Actor): Promise<OrderReturn[]> {
  const rows = await db.getAllAsync<OrderReturn & Order>(`SELECT r.id,r.order_id,r.status,r.reason,r.credit_note,r.requested_by,r.requested_by_name,r.requested_at,r.decided_by_name,r.decision_comment,r.decided_at,
    o.zone,o.ro,o.state,o.sales_area,o.outlet,o.created_by,o.placed_role,
    COALESCE((SELECT sap FROM app_order_sap WHERE order_id=o.id),(SELECT sap_code FROM portal_outlets WHERE outlet_name=o.outlet LIMIT 1),'') AS sap
    FROM portal_order_returns r JOIN portal_orders o ON o.id=r.order_id ORDER BY r.id DESC LIMIT 500`);
  return rows.filter(row => inScope(actor, row));
}

export async function requestOrderReturn(db: SQLiteDatabase, actor: Actor, id: number, reason: string, creditNote: string) {
  const cleanReason = reason.trim().replace(/[\x00-\x1F]/g, '');
  const cleanNote = creditNote.trim().replace(/[\x00-\x1F]/g, '');
  if (cleanReason.length < 3 || cleanReason.length > 500 || !cleanNote || cleanNote.length > 200) throw new Error('Enter a reason of 3–500 characters and a credit note of 1–200 characters.');
  await db.withExclusiveTransactionAsync(async tx => {
    const order = await tx.getFirstAsync<Order>(orderSql, id);
    if (!order || !inScope(actor, order)) throw new Error('Order is unavailable in your scope.');
    if (order.status !== 'approved' || order.delivery_stage !== 'delivered') throw new Error('Only delivered approved orders can be returned.');
    const latest = await tx.getFirstAsync<{ status: string }>('SELECT status FROM portal_order_returns WHERE order_id=? ORDER BY id DESC LIMIT 1', id);
    if (latest && latest.status !== 'rejected') throw new Error('A return request already exists for this order.');
    await tx.runAsync("INSERT INTO portal_order_returns(order_id,status,reason,credit_note,requested_by,requested_by_name,requested_org,requested_at) VALUES(?,'pending',?,?,?,?,?,datetime('now'))", id,cleanReason,cleanNote,actor.username,actor.label,actor.org);
    await tx.runAsync("INSERT INTO portal_order_events(order_id,action,to_status,username,user_label,org,comment,created_at) VALUES(?,'return_requested',?,?,?,?,?,datetime('now'))", id,order.status,actor.username,actor.label,actor.org,`${cleanReason} | ${cleanNote}`);
  });
}

export async function decideOrderReturn(db: SQLiteDatabase, actor: Actor, returnId: number, approve: boolean, comment: string) {
  if (!approve && !comment.trim()) throw new Error('Enter a rejection reason.');
  const level = actor.role === 'superadmin' ? 'admin' : actor.sap ? 'regional' : actor.level;
  const org = actor.sap ? 'hpcl' : actor.org;
  const flag = await db.getFirstAsync<{ svalue: string }>('SELECT svalue FROM portal_settings WHERE skey=?', `perm_ret_${org}_${level}`);
  if (flag?.svalue !== '1') throw new Error('Return decisions are not permitted for this role.');
  await db.withExclusiveTransactionAsync(async tx => {
    const ret = await tx.getFirstAsync<OrderReturn>('SELECT * FROM portal_order_returns WHERE id=?', returnId);
    if (!ret || ret.status !== 'pending') throw new Error('Return has already been decided.');
    const order = await tx.getFirstAsync<Order>(orderSql, ret.order_id);
    if (!order || !inScope(actor, order)) throw new Error('Return is unavailable in your scope.');
    if (actor.role !== 'superadmin' && ret.requested_by === actor.username) throw new Error('You cannot decide your own return request.');
    const updated = await tx.runAsync("UPDATE portal_order_returns SET status=?,decided_by=?,decided_by_name=?,decided_org=?,decided_at=datetime('now'),decision_comment=? WHERE id=? AND status='pending'", approve?'approved':'rejected',actor.username,actor.label,actor.org,comment.trim(),returnId);
    if (updated.changes !== 1) throw new Error('Return has already been decided.');
    await tx.runAsync("INSERT INTO portal_order_events(order_id,action,to_status,username,user_label,org,comment,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'))", ret.order_id,approve?'return_approved':'return_rejected',order.status,actor.username,actor.label,actor.org,comment.trim());
  });
}

export async function canDecideReturns(db: SQLiteDatabase, actor: Actor): Promise<boolean> {
  const level = actor.role === 'superadmin' ? 'admin' : actor.sap ? 'regional' : actor.level;
  const org = actor.sap ? 'hpcl' : actor.org;
  const flag = await db.getFirstAsync<{ svalue: string }>('SELECT svalue FROM portal_settings WHERE skey=?', `perm_ret_${org}_${level}`);
  return flag?.svalue === '1';
}

export type StoredOrderFile = { kind: 'payment' | 'pod' | 'invoice'; origName: string; storedName: string; mime: string; size: number };

export async function recordOrderFile(db: SQLiteDatabase, actor: Actor, id: number, file: StoredOrderFile) {
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(file.storedName) || !file.origName || file.origName.length > 200 || file.size < 1 || file.size > 10 * 1024 * 1024) throw new Error('Invalid order document.');
  let replaced: string | null = null;
  await db.withExclusiveTransactionAsync(async tx => {
    const order = await tx.getFirstAsync<Order>(orderSql, id);
    if (!order || !inScope(actor, order)) throw new Error('Order is unavailable in your scope.');
    if (order.status !== 'approved') throw new Error('Only approved orders accept documents.');
    const rohan = actor.org === 'rohan';
    let teamOrder = false;
    if (rohan && actor.level === 'zone' && order.created_by !== actor.username) {
      const creator = await tx.getFirstAsync<{ data_json: string }>('SELECT data_json FROM officer_accounts WHERE username=?', order.created_by);
      try { teamOrder = !!creator && JSON.parse(creator.data_json).created_by === actor.username; } catch { teamOrder = false; }
    }
    const ownerOrAdmin = order.created_by === actor.username || actor.role === 'superadmin' || teamOrder ||
      rohan && order.placed_role?.startsWith('hpcl_') && order.doc_type === 'invoice';
    if (file.kind === 'pod') {
      if (!rohan || !ownerOrAdmin || order.delivery_stage !== 'transit') throw new Error('POD upload is not permitted for this order.');
      const receipt = await tx.getFirstAsync<{ id: number }>("SELECT id FROM portal_order_files WHERE order_id=? AND kind='payment' LIMIT 1", id);
      if (!receipt) throw new Error('Upload a payment receipt before POD.');
    } else if (file.kind === 'payment') {
      if (order.delivery_stage === 'delivered') throw new Error('Payment receipt cannot change after delivery.');
      if (!rohan) {
        const enabled = await tx.getFirstAsync<{ svalue: string }>("SELECT svalue FROM portal_settings WHERE skey='perm_hpcl_receipt'");
        if (actor.role === 'superadmin' || enabled?.svalue !== '1') throw new Error('Receipt upload is not permitted for this role.');
      } else if (!ownerOrAdmin) throw new Error('Receipt upload is not permitted for this order.');
    } else {
      if (!rohan || !ownerOrAdmin || order.doc_type !== 'invoice' || order.invoice_mode !== 'manual') throw new Error('Manual invoice upload is not permitted for this order.');
      const prior = await tx.getFirstAsync<{ id: number }>("SELECT id FROM portal_order_files WHERE order_id=? AND kind='invoice' LIMIT 1", id);
      if (prior && order.delivery_stage === 'delivered') throw new Error('Invoice cannot be replaced after delivery.');
    }
    const previous = await tx.getFirstAsync<{ stored_name: string }>('SELECT stored_name FROM portal_order_files WHERE order_id=? AND kind=? ORDER BY id DESC LIMIT 1', id, file.kind);
    if (previous) {
      replaced = previous.stored_name;
      await tx.runAsync('DELETE FROM portal_order_files WHERE order_id=? AND kind=?', id, file.kind);
    }
    await tx.runAsync("INSERT INTO portal_order_files(order_id,kind,orig_name,stored_name,mime,size,uploaded_by,uploaded_by_name,created_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'))", id,file.kind,file.origName,file.storedName,file.mime,file.size,actor.username,actor.label);
    const action = file.kind === 'pod' ? 'pod_uploaded' : file.kind === 'payment' ? 'receipt_uploaded' : 'invoice_uploaded';
    await tx.runAsync("INSERT INTO portal_order_events(order_id,action,to_status,username,user_label,org,comment,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'))", id,action,order.status,actor.username,actor.label,actor.org,file.origName);
    if (file.kind === 'pod') {
      const updated = await tx.runAsync("UPDATE portal_orders SET delivery_stage='delivered',updated_at=datetime('now') WHERE id=? AND status='approved' AND delivery_stage='transit'", id);
      if (updated.changes !== 1) throw new Error('Delivery status changed. Refresh and try again.');
      await tx.runAsync("INSERT INTO portal_order_events(order_id,action,to_status,username,user_label,org,comment,created_at) VALUES(?,'delivered','approved',?,?,?,'',datetime('now'))", id,actor.username,actor.label,actor.org);
    }
  });
  return replaced;
}
