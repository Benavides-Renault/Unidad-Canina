import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import pg from 'pg';
import { root } from './env.mjs';

const runtime = JSON.parse(await readFile(path.join(root, '.local/test-runtime.json'), 'utf8'));
const sourceUrl = new URL(runtime.env.DATABASE_URL);
assert.match(sourceUrl.pathname, /^\/valkyr_test_\d+$/, 'Sólo bases de prueba aisladas.');
const stamp = Date.now();
const backup = path.join(root, `.local/backup-${stamp}`);
const files = path.join(root, `.local/restored-${stamp}`);
const database = `valkyr_restore_${stamp}`;
const localBin = path.join(root, '.local/pg-tools/pgsql/bin');
const env = {
  ...process.env,
  ...runtime.env,
  MIGRATION_DATABASE_URL: runtime.env.DATABASE_URL,
  BACKUP_DATABASE_URL: runtime.env.DATABASE_URL,
  PG_BIN: process.env.PG_BIN || (existsSync(localBin) ? localBin : ''),
};
const run = (script, args) => {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, script);
};
run('infra/backup/backup.mjs', ['--mode=native', '--quiesced', `--output=${backup}`]);
run('infra/backup/restore.mjs', [
  '--mode=native',
  `--source=${backup}`,
  `--database=${database}`,
  `--files=${files}`,
]);
const source = new pg.Client({ connectionString: sourceUrl.toString() });
sourceUrl.pathname = `/${database}`;
const restored = new pg.Client({ connectionString: sourceUrl.toString() });
await source.connect();
await restored.connect();
const counts = {};
try {
  for (const table of [
    'User',
    'Party',
    'MedicalEntry',
    'TrainingPlan',
    'TrainingGoal',
    'GoalEvaluation',
    'Certification',
    'Dog',
    'Vaccination',
    'TrainingSession',
    'Document',
    'AuditLog',
    'Reminder',
    'Notification',
    'Movement',
    'Weight',
    'Appointment',
    'Institution',
    'Contact',
    'Contract',
    'ContractVersion',
    'ContractFile',
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
    'ServiceHeartbeat',
  ]) {
    const sql = `SELECT COUNT(*)::int AS count FROM "${table}"`;
    const a = (await source.query(sql)).rows[0].count,
      b = (await restored.query(sql)).rows[0].count;
    assert.equal(a, b, `${table}: recuentos deben coincidir`);
    counts[table] = b;
  }
  const documents = (
    await restored.query(
      'SELECT "storageKey",checksum FROM "Document" UNION ALL SELECT "storageKey",checksum FROM "ContractFile" UNION ALL SELECT "storageKey",checksum FROM "AccountFile"',
    )
  ).rows;
  for (const document of documents) {
    const content = await readFile(path.join(files, document.storageKey));
    assert.equal(createHash('sha256').update(content).digest('hex'), document.checksum);
  }
  await assert.rejects(
    restored.query('UPDATE "AuditLog" SET summary=\'PRUEBA\' WHERE id=(SELECT id FROM "AuditLog" LIMIT 1)'),
  );
  await assert.rejects(restored.query('DELETE FROM "Payment"'));
  await assert.rejects(restored.query('DELETE FROM "StockMovement"'));
  await assert.rejects(restored.query('DELETE FROM "GoalEvaluation"'));
  await assert.rejects(restored.query('UPDATE "ContractVersion" SET revision=99'));
  const balances = await restored.query(
    `SELECT a.id,a.amount::text,COALESCE(SUM(CASE WHEN p.kind='PAYMENT' THEN p.amount ELSE -p.amount END),0)::text paid FROM "Account" a LEFT JOIN "Payment" p ON p."accountId"=a.id GROUP BY a.id ORDER BY a.id`,
  );
  const sourceBalances = await source.query(
    `SELECT a.id,a.amount::text,COALESCE(SUM(CASE WHEN p.kind='PAYMENT' THEN p.amount ELSE -p.amount END),0)::text paid FROM "Account" a LEFT JOIN "Payment" p ON p."accountId"=a.id GROUP BY a.id ORDER BY a.id`,
  );
  assert.deepEqual(balances.rows, sourceBalances.rows);
  const stock = await restored.query(
    `SELECT l.id,l.quantity=COALESCE(SUM(CASE WHEN m.kind='IN' THEN m.quantity ELSE -m.quantity END),0) AS matches FROM "StockLot" l LEFT JOIN "StockMovement" m ON m."lotId"=l.id GROUP BY l.id`,
  );
  for (const row of stock.rows)
    assert.equal(row.matches, true, 'Stock restaurado coincide exactamente con movimientos');
  const tampered = path.join(root, `.local/backup-corrupt-${stamp}`);
  await mkdir(tampered);
  for (const name of ['database.dump', 'files.tar', 'manifest.json'])
    await cp(path.join(backup, name), path.join(tampered, name));
  await writeFile(path.join(tampered, 'database.dump'), Buffer.from('intentionally corrupted test fixture'));
  const blocked = spawnSync(
    process.execPath,
    [
      'infra/backup/restore.mjs',
      `--source=${tampered}`,
      `--database=valkyr_restore_rejected_${stamp}`,
      `--files=${files}-rejected`,
    ],
    { cwd: root, env, encoding: 'utf8' },
  );
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /Checksum incorrecto/);
  const absent = await source.query('SELECT 1 FROM pg_database WHERE datname=$1', [
    `valkyr_restore_rejected_${stamp}`,
  ]);
  assert.equal(absent.rowCount, 0);
  const result = {
    passed: true,
    createdAt: new Date().toISOString(),
    source: runtime.database,
    restored: database,
    counts,
    verifiedFiles: documents.length,
    auditTriggerPreserved: true,
    financialAndStockHistoryPreserved: true,
    corruptBackupRejectedBeforeChanges: true,
    backup,
    files,
  };
  await writeFile(path.join(root, '.local/backup-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await source.end();
  await restored.end();
}
