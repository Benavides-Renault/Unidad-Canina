import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { root } from './env.mjs';
const runtime = JSON.parse(await readFile(path.join(root, '.local/test-runtime.json'), 'utf8'));
assert.match(new URL(runtime.env.DATABASE_URL).pathname, /^\/oryx_test_\d+$/);
const env = { ...process.env, ...runtime.env };
const children = [];
function service(args, name) {
  const log = createWriteStream(path.join(root, '.local', name));
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  children.push(child);
}
async function ready(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No se inició ${url}`);
}
try {
  service(['apps/api/dist/main.js'], 'api-test.log');
  await ready('http://127.0.0.1:4001/api/v1/health');
  service(
    [
      'node_modules/next/dist/bin/next',
      'dev',
      'apps/web',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3100',
    ],
    'web-test.log',
  );
  await ready(runtime.web);
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
      { cwd: root, env, windowsHide: true, stdio: 'inherit' },
    );
    children.push(child);
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Pruebas UI: ${code}`))));
  });
} finally {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
}
