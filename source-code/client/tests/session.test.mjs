import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { initializeSession, loginAndSaveSession, restoreSession, clearSession } from '../src/session.ts';

const folder = mkdtempSync(join(tmpdir(), 'straveda-session-'));
const path = join(folder, 'app.db');
const hash = bcrypt.hashSync('test-password', 4);

function open() {
  const raw = new DatabaseSync(path);
  return {
    raw,
    execAsync: async sql => raw.exec(sql),
    runAsync: async (sql, ...params) => raw.prepare(sql).run(...params),
    getFirstAsync: async (sql, ...params) => raw.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql, ...params) => raw.prepare(sql).all(...params),
  };
}

test('login persists only account key and restores live identity and scope after reopening SQLite', async () => {
  let db = open();
  db.raw.exec(`CREATE TABLE officer_accounts(username TEXT PRIMARY KEY,data_json TEXT NOT NULL,pass_hash TEXT NOT NULL);
    CREATE TABLE portal_outlets(sap_code TEXT PRIMARY KEY,zone TEXT,ro TEXT);
    CREATE TABLE portal_outlet_users(sap_code TEXT PRIMARY KEY,label TEXT,pass TEXT);`);
  db.raw.prepare('INSERT INTO officer_accounts VALUES(?,?,?)').run('admin', JSON.stringify({ role: 'superadmin', org: 'rohan', label: 'Admin', states: ['State A'] }), hash);
  db.raw.prepare('INSERT INTO officer_accounts VALUES(?,?,?)').run('regional', JSON.stringify({ role: 'zone', level: 'regional', org: 'hpcl', label: 'Regional', filter: { zone: 'Zone A' }, ros: ['RO A'], sales_areas: ['SA A'] }), hash);
  db.raw.prepare('INSERT INTO portal_outlets VALUES(?,?,?)').run('900001', 'Zone B', 'RO B');
  db.raw.prepare('INSERT INTO portal_outlet_users VALUES(?,?,?)').run('900001', 'Outlet', hash);
  await initializeSession(db);
  const actor = await loginAndSaveSession(db, 'admin', 'test-password', 'rohan');
  assert.equal(actor.role, 'superadmin');
  assert.deepEqual({ ...db.raw.prepare('SELECT username,org FROM app_session').get() }, { username: 'admin', org: 'rohan' });
  db.raw.close();

  db = open();
  await initializeSession(db);
  assert.deepEqual((await restoreSession(db))?.states, ['State A']);
  await loginAndSaveSession(db, 'regional', 'test-password', 'hpcl');
  const regional = await restoreSession(db);
  assert.equal(regional?.org, 'hpcl');
  assert.equal(regional?.level, 'regional');
  assert.equal(regional?.zone, 'Zone A');
  assert.deepEqual(regional?.ros, ['RO A']);
  assert.deepEqual(regional?.salesAreas, ['SA A']);
  await loginAndSaveSession(db, '900001', 'test-password', 'outlet');
  const outlet = await restoreSession(db);
  assert.equal(outlet?.role, 'outlet');
  assert.equal(outlet?.sap, '900001');
  assert.deepEqual(outlet?.ros, ['RO B']);
  await clearSession(db);
  assert.equal(await restoreSession(db), null);
  db.raw.close();
});

test('invalid, missing, and disabled accounts are discarded', async () => {
  const db = open();
  await initializeSession(db);
  assert.equal(await restoreSession(db), null);
  db.raw.exec("INSERT INTO app_session VALUES(1,'missing','rohan')");
  assert.equal(await restoreSession(db), null);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM app_session').get().n, 0);
  db.raw.exec("INSERT INTO app_session VALUES(1,'admin','rohan')");
  db.raw.exec("UPDATE app_session SET username=''");
  assert.equal(await restoreSession(db), null);
  db.raw.exec("INSERT INTO app_session VALUES(1,'admin','rohan')");
  db.raw.prepare('UPDATE officer_accounts SET data_json=? WHERE username=?').run(JSON.stringify({ role: 'superadmin', org: 'rohan', disabled: true }), 'admin');
  assert.equal(await restoreSession(db), null);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM app_session').get().n, 0);
  db.raw.exec("INSERT INTO app_session VALUES(1,'admin','rohan')");
  db.raw.prepare('UPDATE officer_accounts SET data_json=? WHERE username=?').run('{invalid-json', 'admin');
  assert.equal(await restoreSession(db), null);
  db.raw.close();
});

after(() => rmSync(folder, { recursive: true, force: true }));
