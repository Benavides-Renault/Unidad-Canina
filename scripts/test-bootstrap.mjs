import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import pg from 'pg';
import argon2 from 'argon2';
import { root, loadEnv } from './env.mjs';
loadEnv();
const url = new URL(process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
const database = `valkyr_test_bootstrap_${Date.now()}`;
const control = new pg.Client({ connectionString: url.toString() });
await control.connect();
await control.query(`CREATE DATABASE "${database}"`);
await control.end();
url.pathname = `/${database}`;
const password = randomBytes(32).toString('base64url');
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  BOOTSTRAP_NAME: 'Administrador SINTÉTICO',
  BOOTSTRAP_USERNAME: 'Bootstrap-Test',
  BOOTSTRAP_PASSWORD: password,
};
const migration = spawnSync(
  process.execPath,
  [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
  { cwd: path.join(root, 'apps/api'), env, encoding: 'utf8' },
);
assert.equal(migration.status, 0);
const first = spawnSync(process.execPath, ['apps/api/dist/bootstrap.js'], {
  cwd: root,
  env,
  encoding: 'utf8',
});
assert.equal(first.status, 0, first.stderr);
assert.ok(!first.stdout.includes(password));
const second = spawnSync(process.execPath, ['apps/api/dist/bootstrap.js'], {
  cwd: root,
  env,
  encoding: 'utf8',
});
assert.equal(second.status, 1);
assert.match(second.stderr, /ya existen usuarios/);
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
try {
  const users = (await db.query('SELECT username,email,role,"passwordHash" FROM "User"')).rows;
  assert.equal(users.length, 1);
  assert.equal(users[0].role, 'ADMIN');
  assert.equal(users[0].username, 'bootstrap-test');
  assert.equal(users[0].email, null);
  assert.ok(await argon2.verify(users[0].passwordHash, password));
  assert.match(users[0].passwordHash, /^\$argon2id\$/);
  console.log('Bootstrap PASS: cuenta única, Argon2id, contraseña no impresa y segundo bootstrap denegado.');
} finally {
  await db.end();
}
