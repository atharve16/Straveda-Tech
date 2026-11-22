import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { Actor } from './domain';
import { getOrderDetail, recordOrderFile, type OrderFile } from './order-workflows';
import { validateOrderFile, type OrderFileKind } from './order-file-validation';

const directory = () => new Directory(Paths.document, 'order-files');

export async function pickAndSaveOrderFile(db: SQLiteDatabase, actor: Actor, orderId: number, kind: OrderFileKind): Promise<boolean> {
  const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: '*/*' });
  if (picked.canceled) return false;
  const asset = picked.assets[0];
  const source = new File(asset.uri);
  const size = source.size ?? asset.size ?? 0;
  if (size < 1 || size > 10 * 1024 * 1024) throw new Error('Document must be nonempty and at most 10 MB.');
  const bytes = await source.bytes();
  const mime = validateOrderFile(kind, asset.name, size, bytes);
  const ext = asset.name.toLowerCase().split('.').pop();
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 14)}.${ext}`;
  const folder = directory();
  folder.create({ idempotent: true, intermediates: true });
  const target = new File(folder, name);
  let replaced: string | null = null;
  try {
    await source.copy(target);
    replaced = await recordOrderFile(db, actor, orderId, { kind, origName: asset.name, storedName: name, mime, size });
  } catch (error) {
    try { if (target.exists) target.delete(); } catch { /* Startup recovery removes an orphan. */ }
    throw error;
  }
  if (replaced && replaced !== name) {
    const old = new File(folder, replaced);
    try { if (old.exists) old.delete(); } catch { /* Keep the valid new attachment. */ }
  }
  return true;
}

export async function shareOrderFile(db: SQLiteDatabase, actor: Actor, orderId: number, file: OrderFile): Promise<void> {
  const detail = await getOrderDetail(db, actor, orderId);
  if (!detail.files.some(saved => saved.kind === file.kind && saved.stored_name === file.stored_name)) throw new Error('Document is unavailable in your scope.');
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(file.stored_name)) throw new Error('Invalid stored file name.');
  const local = new File(directory(), file.stored_name);
  if (!local.exists) throw new Error('This local document is missing.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Android sharing is unavailable on this device.');
  await Sharing.shareAsync(local.uri, { mimeType: file.mime, dialogTitle: file.orig_name });
}

// A process may stop after the private copy but before SQLite commit.
export async function recoverOrderFiles(db: SQLiteDatabase): Promise<void> {
  const folder = directory();
  if (!folder.exists) return;
  const rows = await db.getAllAsync<{ stored_name: string }>('SELECT stored_name FROM portal_order_files');
  const referenced = new Set(rows.map(row => row.stored_name));
  for (const entry of folder.list()) {
    if (entry instanceof File && /^[a-zA-Z0-9._-]{1,80}$/.test(entry.name) && !referenced.has(entry.name)) {
      entry.delete();
    }
  }
}
