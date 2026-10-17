import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root, loadEnv } from './env.mjs';
loadEnv();
const nextDir = `.next-release-${Date.now()}`;
const env = { ...process.env, NODE_ENV: 'production', VALKYR_NEXT_DIR: nextDir };
async function run(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('La compilación falló; la versión activa no cambió.')),
    );
  });
}
await run(['node_modules/typescript/bin/tsc', '-p', 'apps/api/tsconfig.json']);
await run(['node_modules/next/dist/bin/next', 'build', 'apps/web', '--webpack']);
await mkdir(path.join(root, '.local'), { recursive: true });
await writeFile(
  path.join(root, '.local/pending-release.json'),
  JSON.stringify({ nextDir, builtAt: new Date().toISOString() }, null, 2),
);
console.log(
  `Versión preparada en ${nextDir}. La compilación web activa se conserva. Respaldar, migrar y activar .local/pending-release.json antes del reinicio.`,
);
