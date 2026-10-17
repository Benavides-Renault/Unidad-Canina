import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { root, loadEnv } from './env.mjs';
loadEnv();
const url = new URL(process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
const database = `oryx_test_portal_migration_${Date.now()}`;
const control = new pg.Client({ connectionString: url.toString() });
await control.connect();
await control.query(`CREATE DATABASE "${database}"`);
await control.end();
url.pathname = `/${database}`;
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
const migrations = path.join(root, 'apps/api/prisma/migrations');
try {
  for (const name of (await readdir(migrations)).filter((n) => /^20261015/.test(n)).sort())
    await db.query(await readFile(path.join(migrations, name, 'migration.sql'), 'utf8'));
  const roles = ['SUPERADMIN', 'ADMIN', 'TRAINER', 'VET', 'FINANCE', 'VIEWER'];
  for (const role of roles)
    await db.query(
      'INSERT INTO "User" (id,name,username,"passwordHash",role,"updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',
      [randomUUID(), 'Propietario previo', `legacy-${role.toLowerCase()}`, 'HASH_SINTETICO_CONSERVADO', role],
    );
  const dogId = randomUUID();
  await db.query(
    'INSERT INTO "Dog" (id,code,name,sex,breed,owner,custodian,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())',
    [dogId, 'LEGACY-PORTAL', 'Perro previo TEST', 'MALE', 'Prueba', 'Propietario previo', 'Custodio previo'],
  );
  const before = (await db.query('SELECT id,username,"passwordHash" FROM "User" ORDER BY id')).rows;
  await db.query(await readFile(path.join(migrations, '202610160007_portals/migration.sql'), 'utf8'));
  assert.deepEqual(
    (await db.query('SELECT id,username,"passwordHash" FROM "User" ORDER BY id')).rows,
    before,
  );
  const after = (await db.query('SELECT username,role,"partyId" FROM "User"')).rows;
  const expected = ['ADMIN', 'ADMIN', 'TRAINER', 'TRAINER', 'CLIENT', 'CLIENT'];
  roles.forEach((role, i) =>
    assert.equal(after.find((u) => u.username === `legacy-${role.toLowerCase()}`).role, expected[i]),
  );
  const dog = (await db.query('SELECT * FROM "Dog" WHERE id=$1', [dogId])).rows[0];
  assert.equal(dog.owner, 'Propietario previo');
  assert.equal(dog.custodian, 'Custodio previo');
  assert.notEqual(dog.ownerPartyId, dog.custodianPartyId);
  assert.equal(dog.salePublished, false);
  assert.equal(dog.assignedTrainerId, null);
  for (const user of after.filter((u) => u.role === 'CLIENT'))
    assert.notEqual(user.partyId, dog.ownerPartyId);
  await assert.rejects(db.query('UPDATE "User" SET "partyId"=NULL WHERE role=\'CLIENT\''));
  await assert.rejects(db.query('UPDATE "Dog" SET "salePublished"=true WHERE id=$1', [dogId]));
  console.log(
    'PASS: seis roles migrados a tres, credenciales e identidades conservadas, sin acceso por coincidencia de nombre, sin publicaciones automáticas.',
  );
} finally {
  await db.end();
}
