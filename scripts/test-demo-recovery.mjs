import { isDemoDatabase } from './database-names.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import pg from 'pg';
import argon2 from 'argon2';
import assert from 'node:assert/strict';
import path from 'node:path';
import { root, loadEnv } from './env.mjs';
import { openBackup } from '../infra/backup/encryption.mjs';
loadEnv();
process.chdir(root);
assert.ok(isDemoDatabase(new URL(process.env.DATABASE_URL).pathname));
const status = JSON.parse(await readFile(process.env.BACKUP_STATUS_PATH, 'utf8'));
assert.equal(status.ok, true);
const stamp = Date.now(),
  database = `oryx_restore_demo_${stamp}`,
  files = path.join(root, `.local/demo-recovery-${stamp}`);
const sourceDirectory = status.encrypted
  ? (await openBackup(status.destination, path.join(root, `.local/demo-decrypted-${stamp}`))).destination
  : status.destination;
await new Promise((resolve, reject) => {
  const p = spawn(
    process.execPath,
    ['infra/backup/restore.mjs', `--source=${sourceDirectory}`, `--database=${database}`, `--files=${files}`],
    { cwd: root, env: process.env, windowsHide: true, stdio: 'inherit' },
  );
  p.on('error', reject);
  p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Restauración: ${code}`))));
});
const source = new pg.Client({ connectionString: process.env.DATABASE_URL }),
  sourceMetadata = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  url = new URL(process.env.MIGRATION_DATABASE_URL);
url.pathname = `/${database}`;
const restored = new pg.Client({ connectionString: url.toString() });
await source.connect();
await sourceMetadata.connect();
await restored.connect();
try {
  const tables = [
    'User',
    'PublicSiteSettings',
    'CustomerInquiry',
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
  ];
  for (const table of tables) {
    const sql = `SELECT md5(COALESCE(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text),'')) AS hash FROM "${table}" t`;
    assert.deepEqual(
      (await restored.query(sql)).rows,
      (await source.query(sql)).rows,
      `Contenido exacto de ${table}`,
    );
  }
  const docs = (
    await restored.query(
      'SELECT "storageKey",checksum FROM "Document" UNION ALL SELECT "storageKey",checksum FROM "ContractFile" UNION ALL SELECT "storageKey",checksum FROM "AccountFile"',
    )
  ).rows;
  for (const d of docs)
    assert.equal(
      createHash('sha256')
        .update(await readFile(path.join(files, d.storageKey)))
        .digest('hex'),
      d.checksum,
    );
  const user = (await restored.query('SELECT "passwordHash",role FROM "User" WHERE username=\'admin\''))
    .rows[0];
  assert.equal(user.role, 'ADMIN');
  assert.equal(await argon2.verify(user.passwordHash, '1234'), true);
  const migrationSql =
    'SELECT migration_name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name';
  const appliedMigrations = (await sourceMetadata.query(migrationSql)).rows;
  assert.deepEqual((await restored.query(migrationSql)).rows, appliedMigrations);
  await assert.rejects(restored.query('UPDATE "GoalEvaluation" SET score=0'));
  await assert.rejects(restored.query('DELETE FROM "Payment"'));
  const result = {
    passed: true,
    database,
    source: status.destination,
    files,
    exactTables: tables.length,
    verifiedFiles: docs.length,
    adminCredentialPreserved: true,
    migrations: appliedMigrations.length,
    encrypted: status.encrypted === true,
    immutableHistory: true,
    checkedAt: new Date().toISOString(),
  };
  await writeFile('.local/demo-recovery.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await source.end();
  await sourceMetadata.end();
  await restored.end();
}
