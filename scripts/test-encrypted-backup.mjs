import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import assert from 'node:assert/strict';
import { root } from './env.mjs';
import { onlineBackup } from '../infra/backup/online.mjs';
import { sealBackup, openBackup } from '../infra/backup/encryption.mjs';
import { sha256 } from '../infra/backup/common.mjs';
process.chdir(root);
const runtime = JSON.parse(await readFile('.local/test-runtime.json', 'utf8'));
assert.match(new URL(runtime.env.DATABASE_URL).pathname, /^\/valkyr_test_\d+$/);
Object.assign(process.env, runtime.env, {
  PG_BIN: path.join(root, '.local/pg-tools/pgsql/bin'),
  BACKUP_DATABASE_URL: runtime.env.DATABASE_URL,
  MIGRATION_DATABASE_URL: runtime.env.DATABASE_URL,
});
const stamp = Date.now(),
  base = path.join(root, `.local/encryption-check-${stamp}`);
const plain = await onlineBackup(`${base}-source`);
const key = randomBytes(32).toString('hex');
process.env.BACKUP_ENCRYPTION_KEY = key;
const encrypted = await sealBackup(plain.destination, `${base}-sealed`);
const decrypted = await openBackup(encrypted.destination, `${base}-open`);
for (const name of ['database.dump', 'files.tar', 'manifest.json'])
  assert.equal(
    await sha256(path.join(plain.destination, name)),
    await sha256(path.join(decrypted.destination, name)),
  );
process.env.BACKUP_ENCRYPTION_KEY = randomBytes(32).toString('hex');
await assert.rejects(openBackup(encrypted.destination, `${base}-wrong-key`));
process.env.BACKUP_ENCRYPTION_KEY = key;
// Recompute the public checksum after tampering: the authenticated cipher must still reject it.
const encryptedDump = path.join(encrypted.destination, 'database.dump.enc');
await copyFile(encryptedDump, `${encryptedDump}.original`);
const bytes = await readFile(encryptedDump);
bytes[25] ^= 1;
await writeFile(encryptedDump, bytes);
const envelopePath = path.join(encrypted.destination, 'envelope.json'),
  originalEnvelope = await readFile(envelopePath);
const envelope = JSON.parse(originalEnvelope);
envelope.sha256['database.dump.enc'] = await sha256(encryptedDump);
await writeFile(envelopePath, JSON.stringify(envelope));
await assert.rejects(openBackup(encrypted.destination, `${base}-tampered`));
await copyFile(`${encryptedDump}.original`, encryptedDump);
await writeFile(envelopePath, originalEnvelope);
const database = `valkyr_restore_crypto_${stamp}`,
  files = `${base}-restored-files`;
await new Promise((resolve, reject) => {
  const p = spawn(
    process.execPath,
    [
      'infra/backup/restore.mjs',
      `--source=${decrypted.destination}`,
      `--database=${database}`,
      `--files=${files}`,
    ],
    { env: process.env, cwd: root, windowsHide: true, stdio: 'inherit' },
  );
  p.on('error', reject);
  p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`restore ${code}`))));
});
const source = new pg.Client({ connectionString: runtime.env.DATABASE_URL }),
  url = new URL(runtime.env.DATABASE_URL);
url.pathname = `/${database}`;
const restored = new pg.Client({ connectionString: url.toString() });
await source.connect();
await restored.connect();
let count = 0,
  checkedFiles = 0;
try {
  const tables = (
    await source.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('_prisma_migrations','RateLimit','Session','ServiceHeartbeat') ORDER BY tablename",
    )
  ).rows;
  for (const { tablename } of tables) {
    const sql = `SELECT md5(COALESCE(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text),'')) hash FROM ${pg.escapeIdentifier(tablename)} t`;
    assert.deepEqual((await source.query(sql)).rows, (await restored.query(sql)).rows, tablename);
    count++;
  }
  const records = (
    await restored.query(
      'SELECT "storageKey",checksum FROM "Document" UNION SELECT "storageKey",checksum FROM "ContractFile" UNION SELECT "storageKey",checksum FROM "AccountFile"',
    )
  ).rows;
  for (const file of records) {
    assert.equal(await sha256(path.join(files, file.storageKey)), file.checksum);
    checkedFiles++;
  }
  process.env.STORAGE_DRIVER = 's3';
  process.env.S3_BUCKET = 'isolated-fixture';
  let requests = 0;
  const mock = {
    send: async (command) => {
      requests++;
      assert.equal(command.input.Bucket, 'isolated-fixture');
      return {
        Body: {
          transformToByteArray: () => readFile(path.join(runtime.env.STORAGE_PATH, command.input.Key)),
        },
      };
    },
  };
  const s3 = await onlineBackup(`${base}-s3`, mock);
  assert.equal(s3.sourceStorageDriver, 's3');
  assert.equal(requests, records.length);
  assert.equal(s3.verifiedFiles, records.length);
  const evidence = {
    passed: true,
    encryptedRoundtrip: true,
    wrongKeyRejected: true,
    tamperedCiphertextRejected: true,
    restoredDatabase: database,
    exactTables: count,
    verifiedFiles: checkedFiles,
    s3SnapshotAdapter: 'passed with injected object client',
    checkedAt: new Date().toISOString(),
  };
  await writeFile('.local/encrypted-backup-result.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await source.end();
  await restored.end();
}
