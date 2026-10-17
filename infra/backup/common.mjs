import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.length ? value.join('=') : true];
  }),
);

export function command(binary, parameters, options = {}) {
  const result = spawnSync(binary, parameters, { stdio: 'inherit', ...options });
  if (result.error) throw new Error(`No se pudo iniciar ${binary}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${binary} terminó con código ${result.status}`);
  return result;
}

export function docker(parameters, options = {}) {
  const composeFile = String(args.compose || 'compose.yaml');
  if (!existsSync(composeFile))
    throw new Error('Ejecutar desde la raíz del repositorio o indicar --compose=archivo.');
  return command('docker', ['compose', '-f', composeFile, ...parameters], options);
}

export function pgEnvironment(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('Falta DATABASE_URL. Cargar .env con node --env-file=.env.');
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('DATABASE_URL debe ser PostgreSQL.');
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    ...(url.searchParams.has('sslmode') ? { PGSSLMODE: url.searchParams.get('sslmode') } : {}),
  };
}

export function pgBinary(name) {
  return process.env.PG_BIN
    ? path.join(process.env.PG_BIN, `${name}${process.platform === 'win32' ? '.exe' : ''}`)
    : name;
}

export async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

export function readManifest(directory) {
  const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.format !== 'valkyr-backup-v1' || manifest.storageDriver !== 'local')
    throw new Error('Formato de respaldo no compatible.');
  for (const filename of ['database.dump', 'files.tar']) {
    if (!/^[a-f0-9]{64}$/.test(manifest.sha256?.[filename] || ''))
      throw new Error(`Checksum inválido para ${filename}.`);
  }
  return manifest;
}
