import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import path from 'node:path';
import { root } from './env.mjs';
import { createShareGateway } from './share-gateway.mjs';

process.chdir(root);
const health = await fetch('http://127.0.0.1:4000/api/v1/health').then((r) => r.json());
if (health.status !== 'ok' || health.demoMode !== true)
  throw new Error('Inicia primero la instalación de prueba de ORYX K9.');
if (!(await fetch('http://localhost:3000/')).ok) throw new Error('La web local no está disponible.');
await mkdir('.local/tools', { recursive: true });
const binary = path.join(root, '.local/tools/cloudflared.exe');
const download =
  'https://github.com/cloudflare/cloudflared/releases/download/2026.10.1/cloudflared-windows-amd64.exe';
const checksum = '4d2490e74082c5d48dbfedaf92576fa5bd1702379ab88eb7faa0cfbe8dc891b6';
if (process.platform !== 'win32' || process.arch !== 'x64')
  throw new Error('Este iniciador está preparado para Windows x64.');
let bytes;
try {
  bytes = await readFile(binary);
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
if (!bytes) {
  const response = await fetch(download);
  if (!response.ok) throw new Error('No se pudo descargar Cloudflare Tunnel.');
  bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== checksum) throw new Error('Checksum incorrecto.');
  await writeFile(binary, bytes, { flag: 'wx' });
}
if (createHash('sha256').update(bytes).digest('hex') !== checksum)
  throw new Error('El ejecutable no coincide con la versión verificada.');
const startedAt = new Date(),
  expiresAt = new Date(Date.now() + 24 * 3600_000);
let origin,
  tunnel,
  stopping = false;
const gateway = createShareGateway({ publicOrigin: () => origin }).listen(3002, '127.0.0.1');
await once(gateway, 'listening');
const log = createWriteStream('.local/share-tunnel.log', { flags: 'w' });
tunnel = spawn(
  binary,
  [
    'tunnel',
    '--no-autoupdate',
    '--url',
    'http://127.0.0.1:3002',
    '--protocol',
    'auto',
    '--metrics',
    '127.0.0.1:0',
  ],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
let combined = '';
async function acceptOutput(chunk) {
  log.write(chunk);
  combined = (combined + String(chunk)).slice(-16000);
  if (origin) return;
  const found = combined.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/);
  if (!found) return;
  origin = found[0];
  const shareUrl = `${origin}/`;
  await writeFile(
    '.local/share-runtime.json',
    JSON.stringify(
      {
        pid: process.pid,
        tunnelPid: tunnel.pid,
        origin,
        shareUrl,
        publicUrl: shareUrl,
        loginUrl: `${origin}/acceso`,
        startedAt,
        expiresAt,
      },
      null,
      2,
    ),
  );
  console.log(
    'La página pública y el inicio de sesión están listos en .local/share-runtime.json. El enlace caduca en 24 horas o al detenerlo.',
  );
}
tunnel.stdout.on('data', (chunk) => void acceptOutput(chunk).catch(() => void stop(1)));
tunnel.stderr.on('data', (chunk) => void acceptOutput(chunk).catch(() => void stop(1)));
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (tunnel.exitCode === null) tunnel.kill();
  gateway.closeAllConnections();
  gateway.close();
  log.end();
  const state = await readFile('.local/share-runtime.json', 'utf8')
    .then(JSON.parse)
    .catch(() => null);
  if (state?.pid === process.pid)
    await writeFile(
      '.local/share-runtime.json',
      JSON.stringify({ ...state, stoppedAt: new Date().toISOString() }, null, 2),
    );
  process.exitCode = code;
}
tunnel.on('error', () => void stop(1));
tunnel.on('exit', (code) => void stop(code || 0));
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
setTimeout(() => void stop(), 24 * 3600_000).unref();
setTimeout(() => {
  if (!origin) {
    console.error('No se obtuvo una dirección. Revisa .local/share-tunnel.log.');
    void stop(1);
  }
}, 90_000).unref();
