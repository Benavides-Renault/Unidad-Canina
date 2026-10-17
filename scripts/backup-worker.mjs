import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { root, loadEnv } from './env.mjs';
import { onlineBackup } from '../infra/backup/online.mjs';
import { sealBackup } from '../infra/backup/encryption.mjs';
loadEnv();
process.chdir(root);
if (process.env.BACKUP_ENABLED !== 'true')
  throw new Error('Habilita BACKUP_ENABLED=true para activar el respaldo local diario.');
const directory = path.resolve(process.env.BACKUP_DIRECTORY || '.local/backups');
const statusPath = path.resolve(process.env.BACKUP_STATUS_PATH || '.local/backup-status.json');
const url = new URL(process.env.DATABASE_URL);
const databaseKey = createHash('sha256').update(`${url.hostname}:${url.port}${url.pathname}`).digest('hex');
await mkdir(directory, { recursive: true });
await mkdir(path.dirname(statusPath), { recursive: true });
let state = await readFile(statusPath, 'utf8')
  .then(JSON.parse)
  .catch(() => ({}));
if (state.databaseKey !== databaseKey) state = { databaseKey };
let running = false;
async function tick() {
  if (running) return;
  if (
    state.ok === true &&
    state.lastSuccess &&
    Date.now() - new Date(state.lastSuccess).valueOf() < 24 * 3600000 &&
    !process.argv.includes('--once')
  )
    return;
  running = true;
  try {
    try {
      const stamp = Date.now(),
        encrypted = Boolean(process.env.BACKUP_ENCRYPTION_KEY);
      const staging = path.join(directory, `${encrypted ? '.pending' : 'daily'}-${stamp}`);
      const backup = await onlineBackup(staging);
      if (encrypted) {
        const sealed = await sealBackup(staging, path.join(directory, `encrypted-${stamp}`));
        if (
          path.dirname(path.resolve(staging)) !== directory ||
          !path.basename(staging).startsWith('.pending-')
        )
          throw new Error('Directorio temporal inválido.');
        await rm(staging, { recursive: true });
        backup.destination = sealed.destination;
      }
      state = {
        databaseKey,
        lastSuccess: backup.createdAt,
        lastAttempt: new Date().toISOString(),
        ok: true,
        verifiedFiles: backup.verifiedFiles,
        destination: backup.destination,
        encrypted,
      };
      console.log(`Respaldo diario correcto: ${backup.verifiedFiles} archivos.`);
    } catch (error) {
      state = { ...state, lastAttempt: new Date().toISOString(), ok: false };
      console.error(error.message);
    }
    const temporary = `${statusPath}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    await rename(temporary, statusPath);
  } finally {
    running = false;
  }
}
await tick();
if (!process.argv.includes('--once'))
  setInterval(() => void tick().catch((error) => console.error(error.message)), 3600000);
else if (!state.ok) process.exitCode = 1;
