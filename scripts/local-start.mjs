import { spawn } from 'node:child_process';
import { existsSync, createWriteStream, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { root, loadEnv } from './env.mjs';

process.chdir(root);
const children = [];
let ownedDb = false,
  closing = false;
let databaseChild;
await mkdir(path.join(root, '.local'), { recursive: true });
loadEnv();
const releaseFile = path.join(root, '.local/active-release.json');
const nextDir =
  process.env.VALKYR_NEXT_DIR ||
  (existsSync(releaseFile) ? JSON.parse(readFileSync(releaseFile, 'utf8')).nextDir : '.next');
if (typeof nextDir !== 'string' || !/^\.next(?:-[a-zA-Z0-9-]+)?$/.test(nextDir))
  throw new Error('Directorio de compilación no válido.');
process.env.VALKYR_NEXT_DIR = nextDir;
async function databaseReady() {
  if (!process.env.DATABASE_URL) return false;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}
function run(args, { cwd = root, interactive = false, logName, databaseUrl, backup = false, nodeEnv } = {}) {
  const childEnv = { ...process.env };
  // The API never receives migration or backup credentials.
  delete childEnv.MIGRATION_DATABASE_URL;
  delete childEnv.BACKUP_DATABASE_URL;
  if (!backup) delete childEnv.BACKUP_ENCRYPTION_KEY;
  if (databaseUrl) childEnv.DATABASE_URL = databaseUrl;
  if (nodeEnv) childEnv.NODE_ENV = nodeEnv;
  const child = spawn(process.execPath, args, {
    cwd,
    env: childEnv,
    stdio: logName ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    windowsHide: !interactive,
  });
  if (logName) {
    const log = createWriteStream(path.join(root, '.local', logName));
    child.stdout.pipe(log);
    child.stderr.pipe(log);
  }
  children.push(child);
  return child;
}
async function command(args, options = {}) {
  const child = run(args, options);
  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('El comando no se completó; revisa el mensaje anterior.')),
    );
  });
}
async function close() {
  if (closing) return;
  closing = true;
  for (const child of children) if (child !== databaseChild && child.exitCode === null) child.kill('SIGTERM');
  if (ownedDb) await command(['scripts/db-control.mjs', 'stop']).catch(() => {});
  if (databaseChild?.exitCode === null) databaseChild.kill('SIGTERM');
}
process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());
try {
  if (!existsSync('apps/api/dist/main.js') || !existsSync(path.join('apps/web', nextDir, 'BUILD_ID')))
    throw new Error('Falta la compilación. Ejecuta npm run db:generate y npm run build.');
  if (!(await databaseReady())) {
    if (process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).port !== '55432')
      throw new Error('Inicia tu servicio PostgreSQL configurado antes de abrir VALKYR.');
    databaseChild = run(['scripts/local-db.mjs'], {
      logName: 'postgres-launcher.log',
      databaseUrl: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL,
    });
    ownedDb = true;
    for (let i = 0; i < 240; i++) {
      loadEnv();
      if (await databaseReady()) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!(await databaseReady()))
      throw new Error('No se pudo iniciar PostgreSQL; revisa .local/postgres-launcher.log.');
  }
  await command([path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: path.join(root, 'apps/api'),
    databaseUrl: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL,
  });
  if (process.env.MIGRATION_DATABASE_URL) {
    const runtimeUrl = new URL(process.env.DATABASE_URL),
      ownerUrl = new URL(process.env.MIGRATION_DATABASE_URL);
    if (runtimeUrl.host !== ownerUrl.host || runtimeUrl.pathname !== ownerUrl.pathname)
      throw new Error('La conexión de migración debe apuntar a la misma base.');
    if (runtimeUrl.username !== ownerUrl.username) {
      const owner = new pg.Client({ connectionString: ownerUrl.toString() });
      await owner.connect();
      try {
        await owner.query(
          readFileSync(path.join(root, 'infra/security/runtime-grants.sql'), 'utf8').replaceAll(
            ':"runtime_role"',
            pg.escapeIdentifier(decodeURIComponent(runtimeUrl.username)),
          ),
        );
        if (process.env.BACKUP_DATABASE_URL) {
          const backupUrl = new URL(process.env.BACKUP_DATABASE_URL);
          if (backupUrl.host !== runtimeUrl.host || backupUrl.pathname !== runtimeUrl.pathname)
            throw new Error('La conexión de respaldo debe apuntar a la misma base.');
          const role = pg.escapeIdentifier(decodeURIComponent(backupUrl.username));
          await owner.query(
            `GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role}; GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
          );
        }
      } finally {
        await owner.end();
      }
    }
  }
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const count = (await db.query('SELECT count(*)::int count FROM "User"')).rows[0].count;
  await db.end();
  if (!count && !process.argv.includes('--preview')) {
    console.log('\nPrimera instalación: crea tu cuenta privada. La contraseña no se mostrará.\n');
    await command(['apps/api/dist/bootstrap.js'], { interactive: true });
  }
  run(['apps/api/dist/main.js'], { logName: 'api.log' });
  run(['apps/api/dist/worker.js'], { logName: 'worker.log' });
  if (process.env.BACKUP_ENABLED === 'true')
    run(['scripts/backup-worker.mjs'], {
      logName: 'backup-worker.log',
      backup: true,
      databaseUrl: process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL,
    });
  run(['node_modules/next/dist/bin/next', 'start', 'apps/web', '--hostname', '127.0.0.1'], {
    logName: 'web.log',
    nodeEnv: 'production',
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const [web, api] = await Promise.all([
        fetch('http://localhost:3000', { signal: AbortSignal.timeout(1500) }),
        fetch('http://127.0.0.1:4000/api/v1/health', { signal: AbortSignal.timeout(1500) }),
      ]);
      if (web.ok && api.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready)
    throw new Error('Revisa .local/api.log y .local/web.log; la aplicación no inició correctamente.');
  console.log(
    '\nVALKYR Manager listo: http://localhost:3000\nMantén esta ventana abierta. Ctrl+C detiene la aplicación; los datos se conservan.\n',
  );
} catch (error) {
  console.error(error.message);
  await close();
  process.exitCode = 1;
}
