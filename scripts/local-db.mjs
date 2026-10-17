import EmbeddedPostgres from 'embedded-postgres';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { root, loadEnv } from './env.mjs';
import { isLocalDatabase } from './database-names.mjs';

const local = path.join(root, '.local');
await mkdir(local, { recursive: true });
const envPath = path.join(local, 'local.env');
if (!existsSync(envPath)) {
  const password = randomBytes(32).toString('hex');
  const text = [
    `DATABASE_URL=postgresql://oryx:${password}@127.0.0.1:55432/oryx`,
    `APP_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`,
    'APP_ORIGIN=http://localhost:3000',
    'API_URL=http://127.0.0.1:4000',
    'API_PORT=4000',
    'COOKIE_SECURE=false',
    'STORAGE_DRIVER=local',
    `STORAGE_PATH=${path.join(local, 'files').replaceAll('\\', '/')}`,
  ].join('\n');
  await writeFile(envPath, text + '\n', { mode: 0o600 });
}
loadEnv();
await mkdir(path.join(local, 'files'), { recursive: true });
const url = new URL(process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL);
if (url.hostname !== '127.0.0.1' || url.port !== '55432' || !isLocalDatabase(url.pathname)) {
  throw new Error(
    'La base portátil requiere 127.0.0.1:55432 y una base ORYX o una instalación anterior reconocida. Para otro servidor, inícielo por separado.',
  );
}
const pg = new EmbeddedPostgres({
  databaseDir: path.join(local, 'postgres'),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: 55432,
  persistent: true,
  authMethod: 'scram-sha-256',
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: (message) => {
    for (const line of String(message).split(/\r?\n/))
      if (/starting|ready to accept|redo|recovery|checkpoint|FATAL|PANIC|shut down/.test(line))
        console.log(line);
  },
  onError: (error) => console.error('PostgreSQL:', error instanceof Error ? error.message : String(error)),
});
if (!existsSync(path.join(local, 'postgres', 'PG_VERSION'))) {
  if (url.pathname !== '/oryx')
    throw new Error(
      'Falta el clúster de la demostración o restauración. Recupere sus datos antes de iniciar.',
    );
  await pg.initialise();
}
await pg.start();
const client = pg.getPgClient('postgres', '127.0.0.1');
await client.connect();
const database = decodeURIComponent(url.pathname.slice(1));
const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
if (!found.rowCount) {
  if (database !== 'oryx') {
    await client.end();
    throw new Error(
      'La base seleccionada no existe. Restaure su respaldo; no se crea una demostración vacía.',
    );
  }
  await client.query('CREATE DATABASE oryx');
}
await client.end();
const version = (await readFile(path.join(local, 'postgres', 'PG_VERSION'), 'utf8')).trim();
console.log(
  `PostgreSQL ${version} listo en 127.0.0.1:55432. Datos persistentes: .local/postgres. Ctrl+C detiene sin borrar.`,
);
let closing = false;
pg.process?.on('exit', () => {
  pg.process = undefined;
  if (!closing) process.exit(0);
});
async function close() {
  if (closing) return;
  closing = true;
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const { pg_ctl } = await import(`@embedded-postgres/${platform}-${process.arch}`);
  await promisify(execFile)(
    pg_ctl,
    ['-D', path.join(local, 'postgres'), 'stop', '-m', 'fast', '-w', '-t', '20'],
    { windowsHide: true },
  );
  pg.process = undefined;
  process.exit(0);
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
setInterval(() => {}, 60_000);
