import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { root, loadEnv } from './env.mjs';
import path from 'node:path';
loadEnv();
if (!process.env.DATABASE_URL) throw new Error('Inicie npm run db:local o configure .env antes de ejecutar.');
if (!existsSync(path.join(root, 'apps/api/dist/main.js'))) throw new Error('Ejecute npm run build primero.');
const children = [];
const run = (args) => {
  const child = spawn(process.execPath, args, { cwd: root, env: process.env, stdio: 'inherit' });
  children.push(child);
  child.on('error', (err) => {
    console.error(err.message);
    close();
  });
  child.on('exit', (code) => {
    if (code && !closing) close();
  });
};
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill('SIGTERM');
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
run(['apps/api/dist/main.js']);
run(['apps/api/dist/worker.js']);
run(['node_modules/next/dist/bin/next', 'dev', 'apps/web', '--webpack', '--hostname', '127.0.0.1']);
