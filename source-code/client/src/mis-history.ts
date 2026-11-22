import type { SQLiteDatabase } from 'expo-sqlite';
import type { Actor, MisRow } from './domain';

export type MisHistory = {
  id: number; row_id: number | null; actor: string; action: string; source: string;
  summary: string; at: string; sap: string; zone: string; ro: string; state: string; sales_area: string;
};

export async function initializeMisHistory(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`CREATE TABLE IF NOT EXISTS app_mis_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    row_id INTEGER,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    source TEXT NOT NULL,
    summary TEXT NOT NULL,
    at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sap TEXT NOT NULL DEFAULT '',
    zone TEXT NOT NULL DEFAULT '',
    ro TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    sales_area TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS app_mis_history_at ON app_mis_history(id DESC);
  CREATE INDEX IF NOT EXISTS app_mis_history_sap ON app_mis_history(sap);
  CREATE TABLE IF NOT EXISTS app_mis_import_batches (
    token TEXT PRIMARY KEY,
    actor TEXT NOT NULL,
    inserted INTEGER NOT NULL,
    at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);
}

export async function recordMisHistory(
  db: SQLiteDatabase, actor: Actor, action: string,
  row: Pick<MisRow, 'id' | 'src' | 'sap' | 'zone' | 'ro' | 'state' | 'sales_area'>,
  summary: string
): Promise<void> {
  await db.runAsync(
    'INSERT INTO app_mis_history(row_id,actor,action,source,summary,sap,zone,ro,state,sales_area) VALUES(?,?,?,?,?,?,?,?,?,?)',
    row.id, actor.username, action, row.src, summary, row.sap || '', row.zone || '', row.ro || '', row.state || '', row.sales_area || ''
  );
}
