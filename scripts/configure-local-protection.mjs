import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { root, loadEnv } from './env.mjs';
loadEnv();
process.chdir(root);
const db = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(db.hostname))
  throw new Error('Este asistente configura únicamente la instalación local.');
const values = {
  BACKUP_ENCRYPTION_KEY: process.env.BACKUP_ENCRYPTION_KEY || randomBytes(32).toString('hex'),
  UPLOAD_QUARANTINE_PATH:
    process.env.UPLOAD_QUARANTINE_PATH ||
    path.join(root, '.local', db.pathname.slice(1), 'quarantine').replaceAll('\\', '/'),
  STORAGE_QUOTA_MIB: process.env.STORAGE_QUOTA_MIB || '10240',
};
let contents = await readFile('.local/local.env', 'utf8');
for (const [name, value] of Object.entries(values)) {
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  contents = pattern.test(contents)
    ? contents.replace(pattern, `${name}=${value}`)
    : contents.trimEnd() + `\n${name}=${value}\n`;
}
await writeFile('.local/local.env', contents, { mode: 0o600 });
console.log(
  'Cifrado de respaldos y política de archivos configurados. Las claves se conservan en .local/local.env.',
);
