import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import assert from 'node:assert/strict';
import { root } from './env.mjs';
process.chdir(root);
const runtime = JSON.parse(await readFile('.local/test-runtime.json', 'utf8'));
assert.match(new URL(runtime.env.DATABASE_URL).pathname, /^\/oryx_test_\d+$/);
const env = { ...process.env, ...runtime.env };
const log = createWriteStream('.local/api-test.log');
const service = spawn(process.execPath, ['apps/api/dist/main.js'], {
  cwd: root,
  env,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
service.stdout.pipe(log);
service.stderr.pipe(log);
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(runtime.api + '/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready);
  await new Promise((resolve, reject) => {
    const test = spawn(process.execPath, ['--import', 'tsx', '--test', ...process.argv.slice(2)], {
      env,
      cwd: root,
      windowsHide: true,
      stdio: 'inherit',
    });
    test.on('error', reject);
    test.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Prueba aislada: ${code}`))));
  });
} finally {
  service.kill('SIGTERM');
}
