import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import argon2 from 'argon2';
import webpush from 'web-push';
import { root, loadEnv } from './env.mjs';
loadEnv();
if (!process.env.DATABASE_URL) throw new Error('Inicie PostgreSQL y configure DATABASE_URL primero.');
const base = new URL(process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(base.hostname) && process.env.ALLOW_ISOLATED_TEST_DB !== 'true')
  throw new Error(
    'Pruebas sólo sobre PostgreSQL local; para CI aislado configure ALLOW_ISOLATED_TEST_DB=true.',
  );
const database = `valkyr_test_${Date.now()}`;
const admin = new pg.Client({ connectionString: base.toString() });
await admin.connect();
await admin.query(`CREATE DATABASE "${database}"`);
await admin.end();
base.pathname = `/${database}`;
const storage = path.join(root, '.local', database, 'files');
await mkdir(storage, { recursive: true });
const username = 'admin-test';
const password = randomBytes(24).toString('base64url');
const vapid = webpush.generateVAPIDKeys();
const env = {
  ...process.env,
  DATABASE_URL: base.toString(),
  APP_ORIGIN: 'http://127.0.0.1:3100',
  API_HOST: '127.0.0.1',
  API_PORT: '4001',
  API_URL: 'http://127.0.0.1:4001',
  STORAGE_DRIVER: 'local',
  STORAGE_PATH: storage,
  UPLOAD_QUARANTINE_PATH: path.join(root, '.local', database, 'quarantine'),
  UPLOAD_SCANNER_PATH: '',
  STORAGE_QUOTA_MIB: '10240',
  COOKIE_SECURE: 'false',
  SMTP_HOST: '',
  NODE_ENV: 'test',
  VALKYR_NEXT_DIR: '.next-test',
  BACKUP_ENABLED: 'false',
  DEMO_MODE: 'false',
  ADMIN_MFA_REQUIRED: 'false',
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
  VAPID_SUBJECT: 'mailto:testing@example.invalid',
};
delete env.MIGRATION_DATABASE_URL;
delete env.BACKUP_DATABASE_URL;
delete env.BACKUP_ENCRYPTION_KEY;
const children = [];
async function command(args, cwd = root) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Comando de pruebas falló (${code}).`)),
    );
  });
}
function service(args) {
  const log = createWriteStream(
    path.join(root, '.local', args[0].includes('api') ? 'api-test.log' : 'web-test.log'),
  );
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  children.push(child);
  return child;
}
async function ready(url) {
  const until = Date.now() + 120_000;
  while (Date.now() < until) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Servicio no disponible: ${url}`);
}
try {
  // Always test the current source, never a stale API build from an earlier release.
  await command([path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'apps/api/tsconfig.json']);
  await command(
    [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    path.join(root, 'apps/api'),
  );
  const db = new pg.Client({ connectionString: base.toString() });
  await db.connect();
  await db.query(
    'INSERT INTO "User" (id,name,username,"passwordHash",role,"updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',
    [
      randomUUID(),
      'Administrador de PRUEBAS',
      username,
      await argon2.hash(password, { type: argon2.argon2id }),
      'ADMIN',
    ],
  );
  await db.end();
  await writeFile(
    path.join(root, '.local/test-runtime.json'),
    JSON.stringify({
      username,
      password,
      database,
      env: Object.fromEntries(
        [
          'DATABASE_URL',
          'APP_ENCRYPTION_KEY',
          'APP_ORIGIN',
          'API_HOST',
          'API_PORT',
          'API_URL',
          'STORAGE_DRIVER',
          'STORAGE_PATH',
          'COOKIE_SECURE',
          'SMTP_HOST',
          'NODE_ENV',
          'VALKYR_NEXT_DIR',
          'VAPID_PUBLIC_KEY',
          'VAPID_PRIVATE_KEY',
          'VAPID_SUBJECT',
          'UPLOAD_QUARANTINE_PATH',
          'ADMIN_MFA_REQUIRED',
          'DEMO_MODE',
        ].map((key) => [key, env[key]]),
      ),
      api: 'http://127.0.0.1:4001/api/v1',
      web: 'http://127.0.0.1:3100',
    }),
    { mode: 0o600 },
  );
  service(['apps/api/dist/main.js']);
  await ready('http://127.0.0.1:4001/api/v1/health');
  await command([
    '--import',
    'tsx',
    '--test',
    '--test-concurrency=1',
    'tests/integration.test.ts',
    'tests/contracts.test.ts',
    'tests/administration.test.ts',
    'tests/hardening.test.ts',
    'tests/portals.test.ts',
    'tests/follow-up.test.ts',
    'tests/completion.test.ts',
    'tests/operations-completion.test.ts',
    'tests/oryx.test.ts',
    'tests/performance.test.ts',
  ]);
  if (!process.argv.includes('--api-only')) {
    // A new isolated browser phase must not inherit intentional login-abuse tests.
    const limits = new pg.Client({ connectionString: base.toString() });
    await limits.connect();
    await limits.query('DELETE FROM "RateLimit"');
    await limits.end();
    service([
      'node_modules/next/dist/bin/next',
      'dev',
      'apps/web',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3100',
    ]);
    await ready('http://127.0.0.1:3100');
    await command(['node_modules/@playwright/test/cli.js', 'test']);
  }
  console.log(`Pruebas completas sobre ${database}. La base de uso no recibió datos de prueba.`);
} finally {
  for (const child of children) child.kill('SIGTERM');
}
