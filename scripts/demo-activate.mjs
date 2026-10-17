import { isDemoDatabase } from './database-names.mjs';
import { readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import assert from 'node:assert/strict';
import { root, loadEnv } from './env.mjs';
import { onlineBackup } from '../infra/backup/online.mjs';
loadEnv();
process.chdir(root);
process.env.PG_BIN ||= path.join(root, '.local/pg-tools/pgsql/bin');
const runtime = JSON.parse(await readFile('.local/demo-runtime.json', 'utf8'));
assert.ok(isDemoDatabase(`/${runtime.database}`));
assert.equal(new URL(runtime.env.DATABASE_URL).pathname, `/${runtime.database}`);
assert.ok(['localhost', '127.0.0.1'].includes(new URL(runtime.env.DATABASE_URL).hostname));
if (existsSync('.env'))
  throw new Error('Hay un .env prioritario; revisar su configuración antes de activar.');
const evidencePath = path.join(root, '.local/demo-activation.json');
if (process.argv.includes('--backup-current')) {
  const backup = await onlineBackup(path.join(root, `.local/backups/pre-demo-${Date.now()}`));
  await copyFile('.local/local.env', path.join(backup.destination, 'previous-local.env'));
  await copyFile('.local/active-release.json', path.join(backup.destination, 'previous-release.json'));
  await writeFile(
    evidencePath,
    JSON.stringify(
      {
        backup: backup.destination,
        previousDatabase: new URL(process.env.DATABASE_URL).pathname.slice(1),
        demoDatabase: runtime.database,
        backedUpAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`Datos actuales respaldados: ${backup.destination}`);
} else if (process.argv.includes('--activate')) {
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  assert.equal(evidence.demoDatabase, runtime.database);
  assert.ok(Date.now() - Date.parse(evidence.backedUpAt) < 2 * 3600000, 'El respaldo debe ser reciente.');
  await access(path.join(evidence.backup, 'manifest.json'));
  for (const port of [3000, 4000]) {
    let running = false;
    try {
      await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) });
      running = true;
    } catch {}
    if (running) throw new Error('Detener web y API antes de activar la demostración.');
  }
  const release = JSON.parse(await readFile('.local/pending-release.json', 'utf8'));
  assert.match(release.nextDir, /^\.next-release-\d+$/);
  await access(path.join('apps/web', release.nextDir, 'BUILD_ID'));
  const db = new pg.Client({ connectionString: runtime.env.DATABASE_URL });
  await db.connect();
  let appUrl, backupUrl;
  try {
    for (const [table, count] of Object.entries(runtime.counts))
      assert.equal(
        (await db.query(`SELECT COUNT(*)::int n FROM "${table}"`)).rows[0].n,
        count,
        `Datos preparados: ${table}`,
      );
    const stamp = Date.now(),
      appRole = `oryx_app_${stamp}`,
      backupRole = `oryx_backup_${stamp}`;
    const appPassword = randomBytes(32).toString('base64url'),
      backupPassword = randomBytes(32).toString('base64url');
    for (const [name, password] of [
      [appRole, appPassword],
      [backupRole, backupPassword],
    ])
      await db.query(
        `CREATE ROLE ${pg.escapeIdentifier(name)} LOGIN PASSWORD ${pg.escapeLiteral(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
      );
    await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await db.query(
      (await readFile('infra/security/runtime-grants.sql', 'utf8')).replaceAll(
        ':"runtime_role"',
        pg.escapeIdentifier(appRole),
      ),
    );
    await db.query(
      `GRANT USAGE ON SCHEMA public TO ${pg.escapeIdentifier(backupRole)}; GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${pg.escapeIdentifier(backupRole)}; GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ${pg.escapeIdentifier(backupRole)}`,
    );
    appUrl = new URL(runtime.env.DATABASE_URL);
    appUrl.username = appRole;
    appUrl.password = appPassword;
    backupUrl = new URL(runtime.env.DATABASE_URL);
    backupUrl.username = backupRole;
    backupUrl.password = backupPassword;
  } finally {
    await db.end();
  }
  const env = {
    ...runtime.env,
    DATABASE_URL: appUrl.toString(),
    MIGRATION_DATABASE_URL: runtime.env.DATABASE_URL,
    BACKUP_DATABASE_URL: backupUrl.toString(),
    APP_ORIGIN: 'http://localhost:3000',
    API_PORT: '4000',
    API_URL: 'http://127.0.0.1:4000',
    BACKUP_ENABLED: 'true',
    PG_BIN: path.join(root, '.local/pg-tools/pgsql/bin'),
    BACKUP_DIRECTORY: path.join(root, '.local/backups', runtime.database),
    BACKUP_STATUS_PATH: path.join(root, '.local', runtime.database, 'backup-status.json'),
  };
  const keys = [
    'DATABASE_URL',
    'MIGRATION_DATABASE_URL',
    'BACKUP_DATABASE_URL',
    'APP_ORIGIN',
    'API_HOST',
    'API_PORT',
    'API_URL',
    'APP_ENCRYPTION_KEY',
    'STORAGE_DRIVER',
    'STORAGE_PATH',
    'COOKIE_SECURE',
    'SMTP_HOST',
    'NODE_ENV',
    'DEMO_MODE',
    'BACKUP_ENABLED',
    'PG_BIN',
    'BACKUP_DIRECTORY',
    'BACKUP_STATUS_PATH',
  ];
  await writeFile(
    '.local/local.env',
    keys.map((k) => `${k}=${String(env[k] || '').replaceAll('\\', '/')}`).join('\n') + '\n',
    { mode: 0o600 },
  );
  await writeFile('.local/active-release.json', JSON.stringify(release, null, 2));
  await writeFile(
    evidencePath,
    JSON.stringify(
      {
        ...evidence,
        activeRelease: release.nextDir,
        activatedAt: new Date().toISOString(),
        separateRuntimeAndBackupRoles: true,
      },
      null,
      2,
    ),
  );
  console.log(
    `Demostración activada: ${runtime.database}. Configuración anterior conservada en el respaldo.`,
  );
} else throw new Error('Usar --backup-current o --activate.');
