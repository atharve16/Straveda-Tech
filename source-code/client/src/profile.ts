import type { SQLiteDatabase } from 'expo-sqlite';
import bcrypt from 'bcryptjs';
import { restoreActor, type Actor } from './domain.ts';

const utf8Length = (value: string) => [...value].reduce((size, character) => {
  const point = character.codePointAt(0)!;
  return size + (point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4);
}, 0);

// The account key comes from the authenticated session. A password change can
// only affect that same local account, after proving its current password.
export async function changeOwnPassword(db: SQLiteDatabase, actor: Actor, current: string, nextInput: string): Promise<void> {
  const next = nextInput.trim();
  if (!current) throw new Error('Enter your current password.');
  if (utf8Length(next) < 8) throw new Error('The new password must be at least 8 bytes.');
  if (next === current) throw new Error('The new password must differ from the current password.');
  const hash = bcrypt.hashSync(next, 10);
  await db.withExclusiveTransactionAsync(async tx => {
    const active = await restoreActor(tx, actor.username, actor.org);
    if (!active) throw new Error('This local account is unavailable. Sign in again.');
    if (actor.org === 'outlet') {
      const account = await tx.getFirstAsync<{ pass: string }>('SELECT pass FROM portal_outlet_users WHERE sap_code=?', actor.username);
      if (!account || !bcrypt.compareSync(current, account.pass.replace(/^\$2y\$/, '$2a$'))) throw new Error('Your current password is not correct.');
      const result = await tx.runAsync("UPDATE portal_outlet_users SET pass=?,pass_view=NULL,pass_by=?,pass_at=datetime('now') WHERE sap_code=? AND pass=?", hash, actor.username, actor.username, account.pass);
      if (result.changes !== 1) throw new Error('Account changed. Retry the password update.');
      return;
    }
    const rows = await tx.getAllAsync<{ username: string; data_json: string; pass_hash: string }>('SELECT username,data_json,pass_hash FROM officer_accounts WHERE lower(username)=lower(?)', actor.username);
    if (rows.length !== 1 || !bcrypt.compareSync(current, rows[0].pass_hash.replace(/^\$2y\$/, '$2a$'))) throw new Error('Your current password is not correct.');
    const data = JSON.parse(rows[0].data_json) as Record<string, unknown>;
    data.pass_hash = hash;
    delete data.pass_view;
    data.pass_by = actor.username;
    data.pass_at = new Date().toISOString();
    const result = await tx.runAsync('UPDATE officer_accounts SET pass_hash=?,data_json=? WHERE username=? AND pass_hash=?', hash, JSON.stringify(data), rows[0].username, rows[0].pass_hash);
    if (result.changes !== 1) throw new Error('Account changed. Retry the password update.');
  });
}
