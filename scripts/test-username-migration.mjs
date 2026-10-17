import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { root, loadEnv } from './env.mjs';

loadEnv();
const url = new URL(process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
const database = `oryx_test_migration_${Date.now()}`;
const control = new pg.Client({ connectionString: url.toString() });
await control.connect();
await control.query(`CREATE DATABASE "${database}"`);
await control.end();
url.pathname = `/${database}`;
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
try {
  for (const migration of ['202610150001_initial', '202610150002_reference_integrity'])
    await db.query(
      await readFile(path.join(root, 'apps/api/prisma/migrations', migration, 'migration.sql'), 'utf8'),
    );
  const id = randomUUID();
  await db.query(
    'INSERT INTO "User" (id,name,email,"passwordHash",role,"updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',
    [id, 'Socio anterior', 'legacy@example.invalid', 'synthetic-hash-preserved', 'SUPERADMIN'],
  );
  await db.query(
    await readFile(
      path.join(root, 'apps/api/prisma/migrations/202610150003_username_login/migration.sql'),
      'utf8',
    ),
  );
  const old = (await db.query('SELECT * FROM "User" WHERE id=$1', [id])).rows[0];
  assert.equal(old.username, `usuario_${id.replaceAll('-', '')}`);
  assert.equal(old.email, 'legacy@example.invalid');
  assert.equal(old.passwordHash, 'synthetic-hash-preserved');
  assert.equal(old.role, 'SUPERADMIN');
  for (const username of ['socio-uno', 'socio-dos'])
    await db.query(
      'INSERT INTO "User" (id,name,username,"passwordHash",role,"updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',
      [randomUUID(), 'Sin correo', username, 'synthetic-only', 'VIEWER'],
    );
  assert.equal(
    (await db.query('SELECT count(*)::int count FROM "User" WHERE email IS NULL')).rows[0].count,
    2,
  );
  await assert.rejects(db.query('UPDATE "User" SET username=$1 WHERE id=$2', ['socio-uno', id]));
  await assert.rejects(db.query('UPDATE "User" SET username=$1 WHERE id=$2', ['Socio', id]));
  console.log('Migración PASS: cuenta previa conservada, usuarios únicos y varias cuentas sin correo.');
} finally {
  await db.end();
}
