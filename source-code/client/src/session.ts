import type { SQLiteDatabase } from 'expo-sqlite';
import { login, restoreActor, type Actor } from './domain.ts';

// A single row stores only the account key. Identity and scope always come from
// the current local account tables when the app starts.
export async function initializeSession(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`CREATE TABLE IF NOT EXISTS app_session (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    username TEXT NOT NULL,
    org TEXT NOT NULL CHECK (org IN ('rohan', 'hpcl', 'outlet'))
  )`);
}

export async function loginAndSaveSession(
  db: SQLiteDatabase, username: string, password: string, organization: string
): Promise<Actor> {
  const actor = await login(db, username, password, organization);
  await db.runAsync(
    'INSERT INTO app_session(id,username,org) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,org=excluded.org',
    actor.username, actor.org
  );
  return actor;
}

export async function restoreSession(db: SQLiteDatabase): Promise<Actor | null> {
  const saved = await db.getFirstAsync<{ username: unknown; org: unknown }>(
    'SELECT username,org FROM app_session WHERE id=1'
  );
  if (!saved) return null;
  if (typeof saved.username !== 'string' || typeof saved.org !== 'string' || !saved.username ||
      !['rohan', 'hpcl', 'outlet'].includes(saved.org)) {
    await clearSession(db);
    return null;
  }
  const actor = await restoreActor(db, saved.username, saved.org);
  if (!actor) await clearSession(db);
  return actor;
}

export async function clearSession(db: SQLiteDatabase): Promise<void> {
  await db.runAsync('DELETE FROM app_session WHERE id=1');
}
