import { readFile, writeFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
import path from 'node:path';
import { root } from './env.mjs';
import { onlineBackup } from '../infra/backup/online.mjs';
const runtime = JSON.parse(await readFile(path.join(root, '.local/test-runtime.json'), 'utf8'));
assert.match(new URL(runtime.env.DATABASE_URL).pathname, /^\/valkyr_test_\d+$/);
const stamp = Date.now(),
  backup = path.join(root, `.local/online-backup-${stamp}`),
  files = path.join(root, `.local/online-restored-${stamp}`),
  database = `valkyr_restore_online_${stamp}`;
const env = {
  ...process.env,
  ...runtime.env,
  MIGRATION_DATABASE_URL: runtime.env.DATABASE_URL,
  BACKUP_DATABASE_URL: runtime.env.DATABASE_URL,
  PG_BIN: process.env.PG_BIN || path.join(root, '.local/pg-tools/pgsql/bin'),
};
function run(script, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [script, ...args], {
      cwd: root,
      env,
      windowsHide: true,
      stdio: 'inherit',
    });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${script}: ${code}`))));
  });
}
const source = new pg.Client({ connectionString: env.DATABASE_URL });
const originalEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  BACKUP_DATABASE_URL: process.env.BACKUP_DATABASE_URL,
  STORAGE_DRIVER: process.env.STORAGE_DRIVER,
};
process.env.DATABASE_URL = env.DATABASE_URL;
process.env.BACKUP_DATABASE_URL = env.DATABASE_URL.replace(
  new URL(env.DATABASE_URL).pathname,
  '/wrong_backup_database',
);
process.env.STORAGE_DRIVER = 'local';
await assert.rejects(onlineBackup(`${backup}-wrong-database`), /mismo servidor y base/);
assert.equal(existsSync(`${backup}-wrong-database`), false);
for (const [key, value] of Object.entries(originalEnv)) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
await source.connect();
let restored;
try {
  const originalCount = (await source.query('SELECT COUNT(*)::int n FROM "Document"')).rows[0].n;
  const result = run('infra/backup/online.mjs', [`--output=${backup}`]);
  // The staging directory is created only after export and document selection.
  for (let i = 0; i < 2000 && !existsSync(path.join(backup, 'snapshot-files')); i++)
    await new Promise((r) => setTimeout(r, 5));
  assert.ok(
    existsSync(path.join(backup, 'snapshot-files')),
    'Snapshot exportado antes de la escritura concurrente',
  );
  const dog = (await source.query('SELECT id FROM "Dog" LIMIT 1')).rows[0].id,
    user = (await source.query('SELECT id FROM "User" WHERE role=\'ADMIN\' LIMIT 1')).rows[0].id;
  const id = randomUUID(),
    key = randomUUID(),
    bytes = Buffer.from('%PDF-1.4\n% Documento sintético concurrente\n%%EOF');
  await writeFile(path.join(env.STORAGE_PATH, key), bytes, { flag: 'wx' });
  await source.query(
    'INSERT INTO "Document" (id,"dogId",name,"storageKey","mimeType",size,checksum,category,"uploadedBy") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      id,
      dog,
      'Concurrente TEST',
      key,
      'application/pdf',
      bytes.length,
      createHash('sha256').update(bytes).digest('hex'),
      'DOCUMENT',
      user,
    ],
  );
  await result;
  await run('infra/backup/restore.mjs', [`--source=${backup}`, `--database=${database}`, `--files=${files}`]);
  const url = new URL(env.DATABASE_URL);
  url.pathname = `/${database}`;
  restored = new pg.Client({ connectionString: url.toString() });
  await restored.connect();
  assert.equal((await restored.query('SELECT COUNT(*)::int n FROM "Document"')).rows[0].n, originalCount);
  assert.equal((await restored.query('SELECT 1 FROM "Document" WHERE id=$1', [id])).rowCount, 0);
  await assert.rejects(access(path.join(files, key)));
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
  await assert.rejects(restored.query('DELETE FROM "GoalEvaluation"'));
  await assert.rejects(restored.query('DELETE FROM "Payment"'));
  const manifest = JSON.parse(await readFile(path.join(backup, 'manifest.json'), 'utf8'));
  assert.equal(manifest.verifiedFiles, docs.length);
  await writeFile(
    path.join(root, '.local/online-backup-result.json'),
    JSON.stringify(
      {
        passed: true,
        backup,
        database,
        files,
        verifiedFiles: docs.length,
        snapshotExcludesConcurrentUpload: true,
        immutableHistoryPreserved: true,
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS: respaldo y restauración en línea; ${docs.length} archivos verificados; escritura concurrente excluida coherentemente.`,
  );
} finally {
  await source.end();
  await restored?.end();
}
