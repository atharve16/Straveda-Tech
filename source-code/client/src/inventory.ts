import type { SQLiteDatabase } from 'expo-sqlite';
import { inScope, type Actor } from './domain.ts';
import { isStockEnabled, stockAvailable } from './stock.ts';

export type InventoryProduct = {
  pid: number; name: string; brand: string; rate: string | null; gst: string | null;
  baseline: number | null; settingAt: string | null; used: number; available: number | null;
};
export type FocTier = { pid: number; item: string; min_qty: number; foc_qty: number };
export type InventoryOutlet = { sap_code: string; outlet_name: string; zone: string; ro: string; state: string; sales_area: string };
export type InventorySnapshot = { actor: string; products: InventoryProduct[]; foc: FocTier[]; outlets: InventoryOutlet[]; stockEnabled: boolean };

export async function listInventory(db: SQLiteDatabase, actor: Actor): Promise<InventorySnapshot> {
  let snapshot: InventorySnapshot | null = null;
  await db.withExclusiveTransactionAsync(async tx => {
  const products = await tx.getAllAsync<{ pid: number; name: string; brand: string }>('SELECT pid,name,brand FROM portal_products ORDER BY pid');
  const settings = await tx.getAllAsync<{ skey: string; svalue: string; updated_at: string }>("SELECT skey,svalue,updated_at FROM portal_settings WHERE skey LIKE 'rate_%' OR skey LIKE 'gst_%'");
  const tiers = await tx.getAllAsync<FocTier>('SELECT f.pid,p.name AS item,f.min_qty,f.foc_qty FROM portal_foc f JOIN portal_products p ON p.pid=f.pid ORDER BY p.pid,f.min_qty');
  const outlets = await tx.getAllAsync<InventoryOutlet>('SELECT sap_code,outlet_name,zone,ro,state,sales_area FROM portal_outlets ORDER BY sap_code');
  const stockEnabled = await isStockEnabled(tx);
  const byKey = new Map(settings.map(setting => [setting.skey, setting]));
  const result: InventoryProduct[] = [];
  for (const product of products) {
    const stock = await stockAvailable(tx, product.pid, product.name);
    result.push({ ...product, rate: byKey.get(`rate_${product.pid}`)?.svalue ?? null,
      gst: byKey.get(`gst_${product.pid}`)?.svalue ?? null, baseline: stock?.baseline ?? null,
      settingAt: stock?.settingAt ?? null, used: stock?.used ?? 0, available: stock?.available ?? null });
  }
  snapshot = { actor: actor.username, products: result, foc: tiers, outlets: outlets.filter(outlet => inScope(actor, { ...outlet, sap: outlet.sap_code })), stockEnabled };
  });
  if (!snapshot) throw new Error('Inventory read did not complete.');
  return snapshot;
}
