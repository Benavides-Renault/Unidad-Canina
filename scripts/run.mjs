import { spawn } from 'node:child_process';
import { root, loadEnv } from './env.mjs';
loadEnv();
const [task, ...args] = process.argv.slice(2);
const allowed = new Set(['db:generate', 'db:deploy', 'bootstrap', 'worker', 'dev', 'start']);
if (!allowed.has(task)) throw new Error('Comando de API no permitido.');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Ejecute mediante npm run.');
const env = { ...process.env };
if (task === 'db:deploy') env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
delete env.MIGRATION_DATABASE_URL;
delete env.BACKUP_DATABASE_URL;
const child = spawn(process.execPath, [npmCli, 'run', task, '--workspace', '@oryx/api', '--', ...args], {
  cwd: root,
  env,
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 1));
