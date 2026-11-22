import type { SQLiteDatabase } from 'expo-sqlite';
import bcrypt from 'bcryptjs';
import { recordMisHistory } from './mis-history.ts';
import { isStockEnabled, stockAvailable } from './stock.ts';

export type Actor = { username: string; label: string; role: string; org: string; level: string; zone?: string; ros: string[]; salesAreas: string[]; sap?: string; states: string[] };
export type MisRow = { id: number; d: string; outlet: string; sap: string; state: string; zone: string; ro: string; sales_area: string; item: string; ea: string; litres: string; src: string; ver: number; notes: string | null };
export type Order = { id: number; order_ref: string; status: string; order_date: string; outlet: string; sap: string; zone: string; state: string; ro: string; sales_area: string; total_ea: number; created_by: string; created_by_name?: string; decided_by_name?: string | null; review_comment?: string | null; placed_role: string; updated_at: string; delivery_stage: string; doc_type?: string; invoice_mode?: string; voucher_no?: string | null; invoice_no?: string | null; canDecide?: boolean };

function parseAccount(username: string, data: string): Actor {
  const a = JSON.parse(data);
  return { username, label: a.label || username, role: a.role || '', org: a.org || 'rohan', level: a.level || a.role || '', zone: a.filter?.zone, ros: Array.isArray(a.ros) ? a.ros : [], salesAreas: Array.isArray(a.sales_areas) ? a.sales_areas : [], states: Array.isArray(a.states) ? a.states : [] };
}
function accountIsDisabled(data: Record<string, unknown>): boolean {
  return data.disabled === true || data.disabled === 1 ||
    data.enabled === false || data.enabled === 0 || data.active === false || data.active === 0 ||
    data.is_active === false || data.is_active === 0 || data.status === 'disabled' || data.status === 'inactive';
}

// Rebuild authorization scope from the current account record, never from a saved actor.
export async function restoreActor(db: SQLiteDatabase, username: string, org: string): Promise<Actor | null> {
  if (!username || !['rohan', 'hpcl', 'outlet'].includes(org)) return null;
  if (org === 'outlet') {
    const row = await db.getFirstAsync<{ sap_code: string; label: string; zone: string; ro: string; disabled?: number | boolean; enabled?: number | boolean; active?: number | boolean }>(
      'SELECT u.*,o.zone,o.ro FROM portal_outlet_users u JOIN portal_outlets o ON o.sap_code=u.sap_code WHERE u.sap_code=?', username
    );
    if (!row || !row.zone || !row.ro || row.disabled === 1 || row.disabled === true || row.enabled === 0 || row.enabled === false || row.active === 0 || row.active === false) return null;
    return { username: row.sap_code, label: row.label, role: 'outlet', org: 'outlet', level: 'outlet', zone: row.zone, ros: [row.ro], salesAreas: [], sap: row.sap_code, states: [] };
  }
  const rows = await db.getAllAsync<{ username: string; data_json: string }>(
    'SELECT username,data_json FROM officer_accounts WHERE lower(username)=lower(?)', username
  );
  if (rows.length !== 1) return null;
  try {
    const data: unknown = JSON.parse(rows[0].data_json);
    if (!data || typeof data !== 'object' || Array.isArray(data) || accountIsDisabled(data as Record<string, unknown>)) return null;
    const actor = parseAccount(rows[0].username, rows[0].data_json);
    return actor.org === org && actor.role && actor.level ? actor : null;
  } catch {
    return null;
  }
}
export async function login(db: SQLiteDatabase, username: string, password: string, organization: string): Promise<Actor> {
  const name = username.trim();
  if (!name || !password) throw new Error('Enter username and password.');
  if (organization === 'outlet') {
    const row = await db.getFirstAsync<{ sap_code: string; label: string; pass: string; zone: string; ro: string }>(
      'SELECT u.sap_code,u.label,u.pass,o.zone,o.ro FROM portal_outlet_users u JOIN portal_outlets o ON o.sap_code=u.sap_code WHERE u.sap_code=?', name);
    if (!row || !bcrypt.compareSync(password, row.pass.replace(/^\$2y\$/, '$2a$')) || !row.zone || !row.ro) throw new Error('Invalid outlet credentials.');
    return { username: row.sap_code, label: row.label, role: 'outlet', org: 'outlet', level: 'outlet', zone: row.zone, ros: [row.ro], salesAreas: [], sap: row.sap_code, states: [] };
  }
  const rows = await db.getAllAsync<{ username: string; data_json: string; pass_hash: string }>('SELECT username,data_json,pass_hash FROM officer_accounts WHERE lower(username)=lower(?)', name);
  if (rows.length !== 1 || !bcrypt.compareSync(password, rows[0].pass_hash.replace(/^\$2y\$/, '$2a$'))) throw new Error('Invalid officer credentials.');
  const actor = parseAccount(rows[0].username, rows[0].data_json);
  if (actor.org !== organization) throw new Error('Account does not belong to this organization.');
  return actor;
}
export function inScope(a: Actor, row: { sap?: string | null; zone?: string | null; ro?: string | null; sales_area?: string | null; state?: string | null }): boolean {
  if (a.sap) return row.sap === a.sap;
  if (a.role === 'superadmin') return !a.states.length || !!row.state && a.states.includes(row.state);
  if (!a.zone || row.zone !== a.zone) return false;
  if (a.ros.length && (!row.ro || !a.ros.includes(row.ro))) return false;
  if (a.level === 'regional' && (!a.salesAreas.length || !row.sales_area || !a.salesAreas.includes(row.sales_area))) return false;
  return true;
}
export const canEditMis = (a: Actor) => a.org === 'rohan' && (a.role === 'superadmin' || a.level === 'zone');
export const canDecidePending = (a: Actor) => a.org === 'rohan' && a.role === 'superadmin';
export function validDate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const date = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === d;
}
export function canDecideOrder(a: Actor, o: Order): boolean {
  if (o.status !== 'pending' || !inScope(a, o)) return false;
  if (a.sap || a.org === 'rohan' && a.level === 'regional') return false;
  if (a.role === 'superadmin') return a.org === 'rohan' ||
    o.created_by === a.username || ['rohan_admin','rohan_zone','rohan_regional','hpcl_zone','hpcl_regional','hpcl_outlet'].includes(o.placed_role);
  if (a.org === 'rohan') return a.level === 'zone' &&
    (o.placed_role === 'rohan_admin' || o.placed_role === 'rohan_zone' && o.created_by === a.username);
  if (a.level === 'zone') return ['rohan_admin','rohan_zone','rohan_regional','hpcl_admin','hpcl_outlet'].includes(o.placed_role) ||
    o.placed_role === 'hpcl_zone' && o.created_by === a.username;
  return a.level === 'regional' && (o.placed_role === 'rohan_admin' || o.placed_role === 'hpcl_outlet');
}
export async function canDecideOrderWithTeam(db: SQLiteDatabase, a: Actor, o: Order): Promise<boolean> {
  if (canDecideOrder(a, o)) return true;
  if (o.status !== 'pending' || !inScope(a, o) || a.level !== 'zone' || a.sap ||
      o.placed_role !== `${a.org}_regional`) return false;
  const account = await db.getFirstAsync<{ data_json: string }>('SELECT data_json FROM officer_accounts WHERE username=?', o.created_by);
  if (!account) return false;
  try { return JSON.parse(account.data_json).created_by === a.username; }
  catch { return false; }
}
export async function dashboard(db: SQLiteDatabase, a: Actor) {
  const [orders, mis, pending] = await Promise.all([listOrders(db,a), listMis(db,a), listPending(db,a)]);
  return { orders: orders.length, mis: mis.length, pending: pending.length, litres: mis.reduce((n,r)=>n+Number(r.litres || 0),0) };
}
export async function listMis(db: SQLiteDatabase, a: Actor, search = ''): Promise<MisRow[]> {
  const rows = await db.getAllAsync<MisRow>('SELECT id,d,outlet,sap,state,zone,ro,sales_area,item,ea,litres,src,ver,notes FROM portal_mis_rows WHERE gone=0 ORDER BY d DESC,id DESC LIMIT 500');
  return rows.filter(r => inScope(a,r) && (!search || `${r.d} ${r.outlet} ${r.sap} ${r.item}`.toLowerCase().includes(search.toLowerCase())));
}
export async function exportMisRows(db:SQLiteDatabase,a:Actor):Promise<MisRow[]>{
  const rows=await db.getAllAsync<MisRow>('SELECT id,d,outlet,sap,state,zone,ro,sales_area,item,ea,litres,src,ver,notes FROM portal_mis_rows WHERE gone=0 ORDER BY d DESC,id DESC');
  return rows.filter(r=>inScope(a,r));
}
export async function listOrders(db: SQLiteDatabase, a: Actor): Promise<Order[]> {
  const rows = await db.getAllAsync<Order>("SELECT id,order_ref,status,order_date,outlet,zone,state,ro,sales_area,total_ea,created_by,placed_role,updated_at,delivery_stage,COALESCE((SELECT sap FROM app_order_sap WHERE order_id=portal_orders.id),(SELECT sap_code FROM portal_outlets WHERE outlet_name=portal_orders.outlet LIMIT 1),'') AS sap FROM portal_orders ORDER BY id DESC LIMIT 500");
  const scoped = rows.filter(r => inScope(a,r));
  await Promise.all(scoped.map(async order => { order.canDecide = await canDecideOrderWithTeam(db, a, order); }));
  return scoped;
}
export async function listProducts(db:SQLiteDatabase){return db.getAllAsync<{pid:number;name:string;brand:string}>('SELECT pid,name,brand FROM portal_products ORDER BY pid');}
export async function listOutlets(db:SQLiteDatabase,a:Actor){const rows=await db.getAllAsync<{sap_code:string;outlet_name:string;zone:string;state:string;ro:string;sales_area:string}>('SELECT sap_code,outlet_name,zone,state,ro,sales_area FROM portal_outlets ORDER BY outlet_name');return rows.filter(r=>inScope(a,{...r,sap:r.sap_code}));}
function placedRole(a:Actor){return a.sap?'hpcl_outlet':`${a.org}_${a.role==='superadmin'?'admin':a.level==='regional'?'regional':'zone'}`;}
export async function createOrderDraft(db:SQLiteDatabase,a:Actor,sap:string,item:string,paidText:string){
  const paid=Number(paidText);
  if(!Number.isInteger(paid)||paid<1||paid>100000)throw new Error('Paid EA must be a whole number from 1 to 100000.');
  const outlet=await db.getFirstAsync<any>('SELECT * FROM portal_outlets WHERE sap_code=?',sap.trim());
  if(!outlet||!inScope(a,{...outlet,sap:outlet.sap_code}))throw new Error('Outlet is outside your permitted area.');
  const product=await db.getFirstAsync<{pid:number;name:string}>('SELECT pid,name FROM portal_products WHERE name=?',item.trim());
  if(!product)throw new Error('Select a current product name.');
  const foc=await db.getFirstAsync<{foc_qty:number}>('SELECT foc_qty FROM portal_foc WHERE pid=? AND min_qty<=? ORDER BY min_qty DESC LIMIT 1',product.pid,paid);
  const total=paid+Number(foc?.foc_qty||0);
  await db.withExclusiveTransactionAsync(async tx=>{
    const code=await tx.getFirstAsync<{ro_code:string}>('SELECT ro_code FROM portal_orders WHERE ro=? AND ro_code<>\'\' LIMIT 1',outlet.ro);
    if(!code)throw new Error('Regional office code is missing from local reference data.');
    const created=await tx.runAsync("INSERT INTO portal_orders(status,order_date,zone,state,ro,ro_code,outlet,district,sales_area,outlet_address,outlet_phone,outlet_pincode,outlet_gstin,outlet_pan,invoice_name,invoice_address,invoice_state,invoice_pan,invoice_gstin,remarks,total_ea,total_vol,created_by,created_by_name,created_at,updated_at,delivery_stage,doc_type,invoice_mode,inv_flag,placed_role) VALUES('draft',date('now'),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),'','so','auto',0,?)",outlet.zone,outlet.state,outlet.ro,code.ro_code,outlet.outlet_name,outlet.district,outlet.sales_area,outlet.address||'',outlet.phone||'',outlet.pincode||'',outlet.gstin||'',outlet.pan||'',outlet.inv_name||'',outlet.inv_address||'',outlet.inv_state||'',outlet.inv_pan||'',outlet.inv_gstin||'','',total,total*20,a.username,a.label,placedRole(a));
    const id=created.lastInsertRowId;
    await tx.runAsync('UPDATE portal_orders SET order_ref=? WHERE id=?',`RE-ORD-${String(id).padStart(6,'0')}`,id);
    await tx.runAsync('INSERT INTO portal_order_items(order_id,item,ea,vol,foc,paid) VALUES(?,?,?,?,?,?)',id,product.name,total,total*20,Number(foc?.foc_qty||0),paid);
    await tx.runAsync("INSERT INTO portal_order_events(order_id,action,to_status,username,user_label,org,comment,created_at) VALUES(?,'save','draft',?,?,?,'',datetime('now'))",id,a.username,a.label,a.org);
    await tx.runAsync("INSERT INTO app_history(actor,action,detail,at) VALUES(?,?,?,datetime('now'))",a.username,'order_draft',String(id));
  });
}
export async function submitOrder(db:SQLiteDatabase,a:Actor,id:number){
  await db.withExclusiveTransactionAsync(async tx=>{
    const order=await tx.getFirstAsync<Order>("SELECT id,order_ref,status,order_date,outlet,zone,state,ro,sales_area,total_ea,created_by,placed_role,updated_at,delivery_stage,COALESCE((SELECT sap FROM app_order_sap WHERE order_id=portal_orders.id),(SELECT sap_code FROM portal_outlets WHERE outlet_name=portal_orders.outlet LIMIT 1),'') AS sap FROM portal_orders WHERE id=?",id);
    if(!order||!inScope(a,order)||order.created_by!==a.username||!['draft','rejected'].includes(order.status))throw new Error('Only your draft or rejected order can be submitted.');
    if(a.org!=='rohan'){
      const admins=await tx.getAllAsync<{data_json:string}>('SELECT data_json FROM officer_accounts');
      const covered=admins.some(account=>{
        try {
          const data=JSON.parse(account.data_json);
          return data.role==='superadmin' && (data.org===null || data.org==='rohan') &&
            (!Array.isArray(data.states) || !data.states.length || data.states.includes(order.state));
        } catch { return false; }
      });
      if(!covered)throw new Error('No Rohan Super Admin covers this order state.');
    }
    const minimum=await tx.getFirstAsync<{svalue:string}>("SELECT svalue FROM portal_settings WHERE skey='min_order_ea'");
    const items=await tx.getAllAsync<{item:string;paid:number;ea:number}>('SELECT item,paid,ea FROM portal_order_items WHERE order_id=?',id);
    if(!items.length)throw new Error('Order has no items.');
    if(items.reduce((sum,line)=>sum+Number(line.ea),0)<Number(minimum?.svalue||0))throw new Error('Order is below the configured minimum.');
    const enabled=await isStockEnabled(tx);
    for(const line of items){
      const product=await tx.getFirstAsync<{pid:number}>('SELECT pid FROM portal_products WHERE name=?',line.item);
      if(!product)throw new Error('Order item is no longer available.');
      if(enabled){
        const stock=await stockAvailable(tx,product.pid,line.item);
        if(stock && stock.available<Number(line.ea))throw new Error(`Insufficient stock for ${line.item}.`);
      }
      const price=await tx.getFirstAsync<{svalue:string}>('SELECT svalue FROM portal_settings WHERE skey=?',`rate_${product.pid}`);
      const gst=await tx.getFirstAsync<{svalue:string}>('SELECT svalue FROM portal_settings WHERE skey=?',`gst_${product.pid}`);
      if(!price||!gst||Number(price.svalue)<=0||Number(gst.svalue)<0||!Number.isFinite(Number(price.svalue))||!Number.isFinite(Number(gst.svalue)))throw new Error('Product price and GST must be configured.');
    }
    const result=await tx.runAsync("UPDATE portal_orders SET status='pending',submitted_at=datetime('now'),updated_at=datetime('now'),decided_by=NULL,decided_by_name=NULL,decided_at=NULL,review_comment=NULL,delivery_stage='' WHERE id=? AND status=?",id,order.status);
    if(result.changes!==1)throw new Error('Order status changed. Refresh and try again.');
    await tx.runAsync("INSERT INTO portal_order_events(order_id,action,from_status,to_status,username,user_label,org,comment,created_at) VALUES(?,'submit',?,'pending',?,?,?,'',datetime('now'))",id,order.status,a.username,a.label,a.org);
    await tx.runAsync("INSERT INTO app_history(actor,action,detail,at) VALUES(?,?,?,datetime('now'))",a.username,'order_submit',order.order_ref);
  });
}
export type Pending = { id: number; d: string; sap: string; outlet: string; item: string; ea: number; status: string; submitted_by: string; reason: string | null; zone: string; ro: string; state: string; sales_area: string };
export async function listPending(db: SQLiteDatabase, a: Actor): Promise<Pending[]> {
  const rows = await db.getAllAsync<Pending>('SELECT * FROM app_pending ORDER BY id DESC LIMIT 500');
  return rows.filter(r => canDecidePending(a) || r.submitted_by === a.username);
}
export async function addMis(db: SQLiteDatabase, a: Actor, d: string, sap: string, item: string, eaText: string) {
  if (!canEditMis(a)) throw new Error('MIS editing is not permitted.');
  if (!validDate(d)) throw new Error('Use a valid YYYY-MM-DD date.');
  const ea = Number(eaText);
  if (!Number.isFinite(ea) || ea <= 0 || ea > 1e9 || !item.trim()) throw new Error('Enter a valid item and positive EA.');
  const outlet = await db.getFirstAsync<any>('SELECT * FROM portal_outlets WHERE sap_code=?', sap.trim());
  if (!outlet || !inScope(a, { ...outlet, sap: outlet.sap_code })) throw new Error('Outlet is outside your permitted area.');
  await db.withExclusiveTransactionAsync(async tx => {
    const created = await tx.runAsync("INSERT INTO portal_mis_rows(d,sale_type,outlet,sap,location,district,state,sales_area,ro,zone,item,ea,litres,xs,src,gone,ver,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'sheet',0,1,?,datetime('now'))", d,'HPCL Retail Outlet',outlet.outlet_name,sap,outlet.sales_area,outlet.district,outlet.state,outlet.sales_area,outlet.ro,outlet.zone,item.trim(),ea.toFixed(2),(ea*20).toFixed(2),'',a.username);
    await recordMisHistory(tx,a,'created',{id:Number(created.lastInsertRowId),src:'sheet',sap:outlet.sap_code,zone:outlet.zone,ro:outlet.ro,state:outlet.state,sales_area:outlet.sales_area},`date=${d}; item=${item.trim()}; EA=${ea.toFixed(2)}`);
    await tx.runAsync("INSERT INTO app_history(actor,action,detail,at) VALUES(?,?,?,datetime('now'))",a.username,'mis_add',`${sap} ${item.trim()} ${ea}`);
  });
}
export async function updateMis(db: SQLiteDatabase, a: Actor, row: MisRow, d: string, eaText: string) {
  if (!canEditMis(a) || !inScope(a,row)) throw new Error('MIS editing is not permitted.');
  if (!validDate(d)) throw new Error('Use a valid date.');
  const ea = Number(eaText);
  if (!Number.isFinite(ea) || ea <= 0 || ea > 1e9) throw new Error('Enter a valid positive EA.');
  await db.withExclusiveTransactionAsync(async tx => {
    const current = await tx.getFirstAsync<MisRow & {gone:number}>('SELECT * FROM portal_mis_rows WHERE id=?',row.id);
    if (!current || current.gone || !inScope(a,current)) throw new Error('MIS row is no longer available.');
    const result = await tx.runAsync("UPDATE portal_mis_rows SET d=?,ea=?,litres=?,ver=ver+1,updated_by=?,updated_at=datetime('now') WHERE id=? AND ver=? AND gone=0",d,ea.toFixed(2),(ea*20).toFixed(2),a.username,row.id,row.ver);
    if (result.changes!==1) throw new Error('MIS row changed. Refresh and try again.');
    await recordMisHistory(tx,a,'edited',current,`date: ${current.d} → ${d}; EA: ${current.ea} → ${ea.toFixed(2)}`);
    await tx.runAsync("INSERT INTO app_history(actor,action,detail,at) VALUES(?,?,?,datetime('now'))",a.username,'mis_edit',String(row.id));
  });
}
export async function deleteMis(db: SQLiteDatabase, a: Actor, row: MisRow) {
  if (!canEditMis(a) || !inScope(a,row)) throw new Error('MIS deletion is not permitted.');
  await db.withExclusiveTransactionAsync(async tx => {
    const current = await tx.getFirstAsync<MisRow & {gone:number}>('SELECT * FROM portal_mis_rows WHERE id=?',row.id);
    if (!current || current.gone || !inScope(a,current)) throw new Error('MIS row is no longer available.');
    const result = current.src==='order'
      ? await tx.runAsync("UPDATE portal_mis_rows SET gone=1,ver=ver+1,updated_by=?,updated_at=datetime('now') WHERE id=? AND ver=? AND gone=0",a.username,row.id,row.ver)
      : await tx.runAsync('DELETE FROM portal_mis_rows WHERE id=? AND ver=? AND gone=0',row.id,row.ver);
    if (result.changes!==1) throw new Error('MIS row changed. Refresh and try again.');
    await recordMisHistory(tx,a,'deleted',current,`date=${current.d}; item=${current.item}; EA=${current.ea}; ${current.src==='order'?'projection hidden':'sheet row removed'}`);
    await tx.runAsync("INSERT INTO app_history(actor,action,detail,at) VALUES(?,?,?,datetime('now'))",a.username,'mis_delete',String(row.id));
  });
}
export type ImportLine = { d:string; sap:string; item:string; ea:string };
export async function importMis(db: SQLiteDatabase, a: Actor, lines: ImportLine[]) {
  if (!canEditMis(a)) throw new Error('MIS importing is not permitted.');
  if (!lines.length || lines.length>30000) throw new Error('Import must contain 1–30,000 rows.');
  const outlets = await db.getAllAsync<any>('SELECT * FROM portal_outlets');
  const bySap = new Map<string,any>(outlets.map(o=>[o.sap_code,o]));
  const prepared = lines.map((line,index)=>{
    const outlet=bySap.get(line.sap.trim());const ea=Number(line.ea);
    if (!validDate(line.d) || !outlet || !inScope(a,{...outlet,sap:outlet.sap_code}) || !line.item.trim() || !Number.isFinite(ea) || ea<=0 || ea>1e9) throw new Error(`Invalid or out-of-scope row ${index+2}.`);
    return {line,outlet,ea};
  });
  await db.withExclusiveTransactionAsync(async tx=>{
    for(const {line,outlet,ea} of prepared) {
      const created=await tx.runAsync("INSERT INTO portal_mis_rows(d,sale_type,outlet,sap,location,district,state,sales_area,ro,zone,item,ea,litres,xs,src,gone,ver,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'sheet',0,1,?,datetime('now'))",line.d,'HPCL Retail Outlet',outlet.outlet_name,line.sap.trim(),outlet.sales_area,outlet.district,outlet.state,outlet.sales_area,outlet.ro,outlet.zone,line.item.trim(),ea.toFixed(2),(ea*20).toFixed(2),'',a.username);
      await recordMisHistory(tx,a,'imported',{id:Number(created.lastInsertRowId),src:'sheet',sap:outlet.sap_code,zone:outlet.zone,ro:outlet.ro,state:outlet.state,sales_area:outlet.sales_area},`date=${line.d}; item=${line.item.trim()}; EA=${ea.toFixed(2)}`);
    }
    await tx.runAsync("INSERT INTO app_history(actor,action,detail,at) VALUES(?,?,?,datetime('now'))",a.username,'mis_import',String(prepared.length));
  });
  return prepared.length;
}
export async function submitPending(db: SQLiteDatabase, a: Actor, d: string, sap: string, item: string, eaText: string) {
  const ea = Number(eaText);
  if (!validDate(d) || !Number.isFinite(ea) || ea <= 0 || ea > 1e9 || !item.trim()) throw new Error('Enter a valid date, item and positive EA.');
  const o = await db.getFirstAsync<any>('SELECT * FROM portal_outlets WHERE sap_code=?',sap.trim());
  if (!o || !inScope(a,{...o,sap:o.sap_code})) throw new Error('Outlet is outside your permitted area.');
  await db.withExclusiveTransactionAsync(async tx => {
    await tx.runAsync("INSERT INTO app_pending(d,sap,outlet,item,ea,status,submitted_by,zone,ro,state,sales_area) VALUES(?,?,?,?,?,'pending',?,?,?,?,?)",d,sap,o.outlet_name,item.trim(),ea,a.username,o.zone,o.ro,o.state,o.sales_area);
    await tx.runAsync("INSERT INTO app_history(actor,action,detail,at) VALUES(?,?,?,datetime('now'))",a.username,'pending_submit',`${sap} ${item.trim()} ${ea}`);
  });
}
export async function decidePending(db: SQLiteDatabase, a: Actor, id: number, approve: boolean, reason = '') {
  if (!canDecidePending(a)) throw new Error('Approval is not permitted.');
  if (!approve && !reason.trim()) throw new Error('Enter a rejection reason.');
  await db.withExclusiveTransactionAsync(async tx => {
    const p = await tx.getFirstAsync<Pending>('SELECT * FROM app_pending WHERE id=?',id);
    if (!p || p.status !== 'pending') throw new Error('Entry has already been decided.');
    if (approve) {
      const o = await tx.getFirstAsync<any>('SELECT * FROM portal_outlets WHERE sap_code=?',p.sap);
      if (!o) throw new Error('Outlet no longer exists.');
      await tx.runAsync("INSERT INTO portal_mis_rows(d,sale_type,outlet,sap,location,district,state,sales_area,ro,zone,item,ea,litres,xs,src,gone,ver,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'sheet',0,1,?,datetime('now'))",p.d,'HPCL Retail Outlet',p.outlet,p.sap,o.sales_area,o.district,p.state,p.sales_area,p.ro,p.zone,p.item,p.ea.toFixed(2),(p.ea*20).toFixed(2),'',a.username);
    }
    const result = await tx.runAsync("UPDATE app_pending SET status=?,reason=?,decided_by=?,decided_at=datetime('now') WHERE id=? AND status='pending'",approve?'approved':'rejected',reason.trim()||null,a.username,id);
    if (result.changes !== 1) throw new Error('Entry has already been decided.');
    await tx.runAsync("INSERT INTO app_history(actor,action,detail,at) VALUES(?,?,?,datetime('now'))",a.username,approve?'pending_approve':'pending_reject',String(id));
  });
}
export async function decideOrder(db: SQLiteDatabase, a: Actor, id: number, approve: boolean, reason = '') {
  if (!approve && !reason.trim()) throw new Error('Enter a rejection reason.');
  await db.withExclusiveTransactionAsync(async tx => {
    const row = await tx.getFirstAsync<Order>("SELECT id,order_ref,status,order_date,outlet,zone,state,ro,sales_area,total_ea,created_by,placed_role,updated_at,delivery_stage,doc_type,invoice_mode,COALESCE((SELECT sap FROM app_order_sap WHERE order_id=portal_orders.id),(SELECT sap_code FROM portal_outlets WHERE outlet_name=portal_orders.outlet LIMIT 1),'') AS sap FROM portal_orders WHERE id=?",id);
    if (!row || !(await canDecideOrderWithTeam(tx,a,row))) throw new Error('Order is not eligible for your approval.');
    const items = await tx.getAllAsync<{id:number;item:string;ea:number}>('SELECT id,item,ea FROM portal_order_items WHERE order_id=?',id);
    if (approve) {
      if (!items.length) throw new Error('Order has no items.');
      const enabled = await isStockEnabled(tx);
      for (const line of items) {
        const product = await tx.getFirstAsync<{pid:number}>('SELECT pid FROM portal_products WHERE name=?',line.item);
        if (!product) throw new Error('Order item no longer exists.');
        if (enabled) {
          const stock = await stockAvailable(tx,product.pid,line.item);
          if (stock && stock.available<line.ea) throw new Error(`Insufficient stock for ${line.item}.`);
        }
        const rate=await tx.getFirstAsync<{svalue:string}>('SELECT svalue FROM portal_settings WHERE skey=?',`rate_${product.pid}`);
        const gst=await tx.getFirstAsync<{svalue:string}>('SELECT svalue FROM portal_settings WHERE skey=?',`gst_${product.pid}`);
        if(!rate||!gst||Number(rate.svalue)<=0||Number(gst.svalue)<0)throw new Error('Product price and GST must be configured.');
        await tx.runAsync('UPDATE portal_order_items SET rate=COALESCE(rate,?),gst=COALESCE(gst,?) WHERE id=?',rate.svalue,gst.svalue,line.id);
      }
    }
    const now=new Date();const fyStart=now.getMonth()>=3?now.getFullYear():now.getFullYear()-1;
    const fy=`${String(fyStart).slice(-2)}-${String(fyStart+1).slice(-2)}`;
    const voucher=approve?`RCSO2/${fy}/${id}`:null;
    const auto=approve&&row.doc_type==='invoice'&&row.invoice_mode==='auto'&&(await tx.getFirstAsync<{svalue:string}>("SELECT svalue FROM portal_settings WHERE skey='perm_auto_invoice'"))?.svalue==='1';
    const invoice=auto?`RETI/${fy}/${id}`:null;
    const result = await tx.runAsync("UPDATE portal_orders SET status=?,delivery_stage=?,decided_by=?,decided_by_name=?,decided_at=datetime('now'),review_comment=?,updated_at=datetime('now'),voucher_no=COALESCE(voucher_no,?),invoice_no=COALESCE(invoice_no,?),inv_flag=? WHERE id=? AND status='pending'",approve?'approved':'rejected',approve?'transit':'',a.username,a.label,reason.trim(),voucher,invoice,auto?1:0,id);
    if (result.changes !== 1) throw new Error('Order was already decided.');
    if (approve) {
      const outlet = await tx.getFirstAsync<any>('SELECT * FROM portal_outlets WHERE sap_code=?',row.sap);
      if (!outlet) throw new Error('Order outlet is missing from the master list.');
      for (const line of items) {
        const existing = await tx.getFirstAsync<{id:number}>('SELECT id FROM portal_mis_rows WHERE item_id=?',line.id);
        if (!existing) await tx.runAsync("INSERT INTO portal_mis_rows(d,sale_type,outlet,sap,location,district,state,sales_area,ro,zone,item,ea,litres,xs,src,item_id,gone,ver,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'order',?,0,1,?,datetime('now'))",row.order_date,'HPCL Retail Outlet',row.outlet,row.sap,outlet.sales_area,outlet.district,row.state,row.sales_area,row.ro,row.zone,line.item,String(line.ea),String(line.ea*20),'',line.id,a.username);
      }
    }
    await tx.runAsync("INSERT INTO portal_order_events(order_id,action,from_status,to_status,username,user_label,org,comment,created_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'))",id,approve?'approve':'reject','pending',approve?'approved':'rejected',a.username,a.label,a.org,reason.trim());
    await tx.runAsync("INSERT INTO app_history(actor,action,detail,at) VALUES(?,?,?,datetime('now'))",a.username,approve?'order_approve':'order_reject',row.order_ref);
  });
}
