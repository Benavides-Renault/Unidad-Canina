import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';
import assert from 'node:assert/strict';
import { root, loadEnv } from './env.mjs';
loadEnv();
process.chdir(root);
const database = new URL(process.env.DATABASE_URL).pathname;
assert.match(database, /^\/valkyr_demo_\d+$/);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const hashes = {};
try {
  for (const table of [
    'User',
    'Party',
    'Dog',
    'MedicalEntry',
    'TrainingSession',
    'TrainingPlan',
    'TrainingGoal',
    'GoalEvaluation',
    'Certification',
    'Vaccination',
    'Weight',
    'Movement',
    'Appointment',
    'Document',
    'Contract',
    'ContractVersion',
    'ContractFile',
    'Institution',
    'Contact',
    'Assignment',
    'ServiceLog',
    'BreedingProfile',
    'BreedingEvent',
    'BreedingPlan',
    'Litter',
    'Reservation',
    'Account',
    'Payment',
    'AccountFile',
    'Product',
    'StockLot',
    'StockMovement',
    'MedicalRevision',
    'RecordAttachment',
    'CertificateTemplate',
    'UserPreference',
    'Supplier',
    'PaymentReconciliation',
    'FinancialClose',
    'PushSubscription',
  ])
    hashes[table] = (
      await db.query(
        `SELECT md5(COALESCE(string_agg(row_to_json(t)::text,E'\n' ORDER BY row_to_json(t)::text),'')) hash FROM "${table}" t`,
      )
    ).rows[0].hash;
} finally {
  await db.end();
}
if (process.argv.includes('--before')) {
  await writeFile('.local/demo-restart-before.json', JSON.stringify({ database, hashes }));
  console.log(`Estado de ${Object.keys(hashes).length} tablas capturado antes del reinicio.`);
} else if (process.argv.includes('--after')) {
  const before = JSON.parse(await readFile('.local/demo-restart-before.json', 'utf8'));
  assert.equal(database, before.database);
  assert.deepEqual(hashes, before.hashes);
  const login = await fetch('http://127.0.0.1:4000/api/v1/auth/login', {
    method: 'POST',
    headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '1234' }),
  });
  assert.equal(login.status, 201);
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const status = await fetch('http://127.0.0.1:4000/api/v1/system/status', { headers: { cookie } }).then(
    (r) => r.json(),
  );
  assert.equal(status.workerHealthy, true);
  assert.equal(status.backupHealthy, true);
  const dogs = await fetch('http://127.0.0.1:4000/api/v1/dogs?includePuppies=true&pageSize=100', {
    headers: { cookie },
  }).then((r) => r.json());
  assert.equal(dogs.total, 30);
  assert.equal((await fetch('http://localhost:3000')).status, 200);
  const result = {
    passed: true,
    database,
    exactTables: Object.keys(hashes).length,
    dogs: dogs.total,
    login: true,
    workerHealthy: true,
    backupHealthy: true,
    checkedAt: new Date().toISOString(),
  };
  await writeFile('.local/demo-restart-result.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} else throw new Error('Indicar --before o --after.');
