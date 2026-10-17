import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { root } from '../scripts/env.mjs';
import { isLocalDatabase, isDemoDatabase } from '../scripts/database-names.mjs';
import { sealBackup, openBackup } from '../infra/backup/encryption.mjs';
import { readManifest } from '../infra/backup/common.mjs';

test('el repositorio usa ORYX y no recupera recursos ni referencias obsoletas', () => {
  const files = [
    ...new Set(
      execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root })
        .toString()
        .split('\0'),
    ),
  ].filter((name) => name && existsSync(path.join(root, name)));
  const compatibility = new Set([
    'infra/backup/formats.mjs',
    'scripts/database-names.mjs',
    'tests/repository.test.mjs',
    'tests/e2e/oryx.spec.ts',
  ]);
  for (const name of files) {
    assert.doesNotMatch(name, /valkyr|velkyr/i, `Nombre antiguo: ${name}`);
    const bytes = readFileSync(path.join(root, name));
    if (bytes.includes(0) || compatibility.has(name) || name.startsWith('apps/api/prisma/migrations/'))
      continue;
    assert.doesNotMatch(
      bytes.toString(),
      /valkyr|velkyr/i,
      `Referencia antigua fuera de compatibilidad: ${name}`,
    );
    if (name.endsWith('.md')) {
      for (const match of bytes.toString().matchAll(/\]\(([^\s)#]+)(?:#[^)]*)?\)/g)) {
        const target = match[1];
        if (/^[a-z]+:|^\//i.test(target)) continue;
        assert.ok(
          existsSync(path.resolve(root, path.dirname(name), target)),
          `Enlace roto: ${name} → ${target}`,
        );
      }
    }
  }
  const logo = readFileSync(path.join(root, 'assets/branding/oryx-logo.png'));
  assert.deepEqual(readFileSync(path.join(root, 'apps/web/public/oryx-logo.png')), logo);
  const manifest = JSON.parse(readFileSync(path.join(root, 'apps/web/public/manifest.webmanifest')));
  for (const icon of manifest.icons) assert.equal(icon.src, '/oryx-logo.png');
  assert.match(readFileSync(path.join(root, 'apps/web/public/sw.js'), 'utf8'), /icon: '\/oryx-logo\.png'/);
});

test('nombres de bases: admite instalaciones existentes sin aceptar rutas ni otros destinos', () => {
  for (const prefix of ['oryx', 'valkyr']) {
    assert.ok(isLocalDatabase(`/${prefix}`));
    assert.ok(isLocalDatabase(`/${prefix}_restore_check`));
    assert.ok(isLocalDatabase(`/${prefix}_demo_123`));
    assert.ok(isDemoDatabase(`/${prefix}_demo_123`));
    assert.equal(isDemoDatabase(`/${prefix}`), false);
  }
  for (const value of [
    '/postgres',
    '/other_demo_123',
    '/oryx/../postgres',
    '/oryx_demo_123;DROP',
    'oryx_demo_123',
  ]) {
    assert.equal(isLocalDatabase(value), false);
    assert.equal(isDemoDatabase(value), false);
  }
});

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function makeSource(directory, format) {
  await mkdir(directory);
  const dump = Buffer.from('Synthetic database fixture');
  const files = Buffer.from('Synthetic private files fixture');
  await writeFile(path.join(directory, 'database.dump'), dump);
  await writeFile(path.join(directory, 'files.tar'), files);
  await writeFile(
    path.join(directory, 'manifest.json'),
    JSON.stringify({
      format,
      storageDriver: 'local',
      verifiedFiles: 0,
      sha256: { 'database.dump': digest(dump), 'files.tar': digest(files) },
    }),
  );
}

test('los respaldos nuevos llevan ORYX y los anteriores siguen siendo recuperables', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'oryx-backup-compat-'));
  const previous = process.env.BACKUP_ENCRYPTION_KEY;
  const secret = randomBytes(32);
  process.env.BACKUP_ENCRYPTION_KEY = secret.toString('hex');
  t.after(async () => {
    if (previous === undefined) delete process.env.BACKUP_ENCRYPTION_KEY;
    else process.env.BACKUP_ENCRYPTION_KEY = previous;
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep + 'oryx-backup-compat-'));
    await rm(directory, { recursive: true, force: true });
  });
  const source = path.join(directory, 'source');
  await makeSource(source, 'oryx-backup-v1');
  const sealed = path.join(directory, 'sealed');
  await sealBackup(source, sealed);
  const envelope = JSON.parse(await readFile(path.join(sealed, 'envelope.json')));
  assert.equal(envelope.format, 'oryx-encrypted-v1');
  assert.equal(
    (await readFile(path.join(sealed, 'database.dump.enc'))).subarray(0, 8).toString(),
    'ORYXK901',
  );
  const opened = path.join(directory, 'opened');
  await openBackup(sealed, opened);
  assert.equal(readManifest(opened).format, 'oryx-backup-v1');

  // Independent fixture of the previous on-disk format, including its authenticated header.
  const legacy = path.join(directory, 'legacy');
  await makeSource(legacy, 'valkyr-backup-v1');
  assert.equal(readManifest(legacy).format, 'valkyr-backup-v1');
  const legacySealed = path.join(directory, 'legacy-sealed');
  await mkdir(legacySealed);
  const checksums = {};
  for (const name of ['database.dump', 'files.tar', 'manifest.json']) {
    const iv = randomBytes(12),
      magic = Buffer.from('VALKYR01');
    const cipher = createCipheriv('aes-256-gcm', secret, iv);
    cipher.setAAD(magic);
    const bytes = Buffer.concat([
      magic,
      iv,
      cipher.update(await readFile(path.join(legacy, name))),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    await writeFile(path.join(legacySealed, `${name}.enc`), bytes);
    checksums[`${name}.enc`] = digest(bytes);
  }
  await writeFile(
    path.join(legacySealed, 'envelope.json'),
    JSON.stringify({ format: 'valkyr-encrypted-v1', algorithm: 'AES-256-GCM', sha256: checksums }),
  );
  const legacyOpened = path.join(directory, 'legacy-opened');
  await openBackup(legacySealed, legacyOpened);
  for (const name of ['database.dump', 'files.tar', 'manifest.json'])
    assert.deepEqual(await readFile(path.join(legacyOpened, name)), await readFile(path.join(legacy, name)));
  await writeFile(
    path.join(legacySealed, 'envelope.json'),
    JSON.stringify({ format: 'oryx-encrypted-v1', algorithm: 'AES-256-GCM', sha256: checksums }),
  );
  await assert.rejects(
    openBackup(legacySealed, path.join(directory, 'mismatched')),
    /Formato cifrado inválido/,
  );
  process.env.BACKUP_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  await assert.rejects(openBackup(sealed, path.join(directory, 'wrong-key')));
});
