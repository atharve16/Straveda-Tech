import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { login, restoreActor } from '../src/domain.ts';
import { changeOwnPassword } from '../src/profile.ts';

const folder = mkdtempSync(join(tmpdir(), 'straveda-profile-'));
const path = join(folder, 'accounts.db');
copyFileSync(fileURLToPath(new URL('../assets/database/rohan_energy_demo.db', import.meta.url)), path);
function open() {
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA foreign_keys=ON');
  const db = {
    raw,
    getFirstAsync: async (sql, ...args) => raw.prepare(sql).get(...args) ?? null,
    getAllAsync: async (sql, ...args) => raw.prepare(sql).all(...args),
    runAsync: async (sql, ...args) => { const result = raw.prepare(sql).run(...args); return { ...result, lastInsertRowId: result.lastInsertRowid }; },
    withExclusiveTransactionAsync: async callback => {
      raw.exec('BEGIN IMMEDIATE');
      try { await callback(db); raw.exec('COMMIT'); }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
  };
  return db;
}
const one = (db, sql, ...args) => db.raw.prepare(sql).get(...args);

test('officer changes only own password with current proof and persists after restart', async () => {
  let db = open();
  const actor = await restoreActor(db, 'demo_super', 'rohan');
  const otherHash = one(db, 'SELECT pass_hash FROM officer_accounts WHERE username=?', 'demo_rohan_ro').pass_hash;
  await assert.rejects(changeOwnPassword(db, actor, 'wrong', 'NewSecret123'), /current password/);
  await assert.rejects(changeOwnPassword(db, actor, 'Demo@12345', 'short'), /8 bytes/);
  await assert.rejects(changeOwnPassword(db, actor, 'Demo@12345', 'Demo@12345'), /differ/);
  await changeOwnPassword(db, actor, 'Demo@12345', 'NewSecret123');
  const saved = one(db, 'SELECT pass_hash,data_json FROM officer_accounts WHERE username=?', actor.username);
  assert.equal(bcrypt.compareSync('NewSecret123', saved.pass_hash), true);
  assert.equal(JSON.parse(saved.data_json).pass_hash, saved.pass_hash);
  assert.equal(saved.data_json.includes('NewSecret123'), false);
  assert.equal(one(db, 'SELECT pass_hash FROM officer_accounts WHERE username=?', 'demo_rohan_ro').pass_hash, otherHash);
  await assert.rejects(login(db, actor.username, 'Demo@12345', 'rohan'), /Invalid/);
  db.raw.close();
  db = open();
  assert.equal((await login(db, actor.username, 'NewSecret123', 'rohan')).username, actor.username);
  db.raw.close();
});

test('outlet password uses the linked local profile and clears stale readable copy', async () => {
  const db = open();
  db.raw.prepare('UPDATE portal_outlet_users SET pass=?,pass_view=? WHERE sap_code=?').run(bcrypt.hashSync('OldOutlet123', 10), 'stale-view', '90000001');
  const actor = await restoreActor(db, '90000001', 'outlet');
  await assert.rejects(changeOwnPassword(db, actor, 'wrong', 'NewOutlet123'), /current password/);
  await changeOwnPassword(db, actor, 'OldOutlet123', 'NewOutlet123');
  const saved = one(db, 'SELECT pass,pass_view,pass_by,pass_at FROM portal_outlet_users WHERE sap_code=?', actor.username);
  assert.equal(bcrypt.compareSync('NewOutlet123', saved.pass), true);
  assert.equal(saved.pass_view, null);
  assert.equal(saved.pass_by, actor.username);
  assert.ok(saved.pass_at);
  assert.equal((await login(db, actor.username, 'NewOutlet123', 'outlet')).sap, actor.sap);
  db.raw.close();
});

test('failed write rolls back hash and disabled accounts cannot change credentials', async () => {
  const db = open();
  const actor = await restoreActor(db, 'demo_rohan_ro', 'rohan');
  const before = one(db, 'SELECT pass_hash FROM officer_accounts WHERE username=?', actor.username).pass_hash;
  const original = db.runAsync;
  db.runAsync = async (sql, ...args) => {
    if (sql.startsWith('UPDATE officer_accounts')) throw new Error('Injected account failure');
    return original(sql, ...args);
  };
  await assert.rejects(changeOwnPassword(db, actor, 'Demo@12345', 'NewSecret456'), /Injected/);
  db.runAsync = original;
  assert.equal(one(db, 'SELECT pass_hash FROM officer_accounts WHERE username=?', actor.username).pass_hash, before);
  const data = JSON.parse(one(db, 'SELECT data_json FROM officer_accounts WHERE username=?', actor.username).data_json);
  data.disabled = true;
  db.raw.prepare('UPDATE officer_accounts SET data_json=? WHERE username=?').run(JSON.stringify(data), actor.username);
  await assert.rejects(changeOwnPassword(db, actor, 'Demo@12345', 'NewSecret456'), /unavailable/);
  db.raw.close();
});

after(() => rmSync(folder, { recursive: true, force: true }));
