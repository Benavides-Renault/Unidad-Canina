import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, appendFile, stat, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { sha256, readManifest } from './common.mjs';
const magic = Buffer.from('VALKYR01');
function key() {
  const value = process.env.BACKUP_ENCRYPTION_KEY;
  if (!/^[a-fA-F0-9]{64}$/.test(value || ''))
    throw new Error(
      'BACKUP_ENCRYPTION_KEY debe tener 32 bytes hexadecimales y custodiarse fuera del respaldo.',
    );
  return Buffer.from(value, 'hex');
}
async function encrypt(source, target, secret) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', secret, iv);
  cipher.setAAD(magic);
  await writeFile(target, Buffer.concat([magic, iv]), { flag: 'wx', mode: 0o600 });
  await pipeline(createReadStream(source), cipher, createWriteStream(target, { flags: 'a' }));
  await appendFile(target, cipher.getAuthTag());
}
async function decrypt(source, target, secret) {
  const size = (await stat(source)).size;
  if (size < 36) throw new Error('Archivo cifrado incompleto.');
  const header = await new Promise((resolve, reject) => {
    const chunks = [];
    createReadStream(source, { start: 0, end: 19 })
      .on('data', (c) => chunks.push(c))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject);
  });
  if (!header.subarray(0, 8).equals(magic)) throw new Error('Formato cifrado inválido.');
  const tag = await new Promise((resolve, reject) => {
    const chunks = [];
    createReadStream(source, { start: size - 16 })
      .on('data', (c) => chunks.push(c))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject);
  });
  const decipher = createDecipheriv('aes-256-gcm', secret, header.subarray(8));
  decipher.setAAD(magic);
  decipher.setAuthTag(tag);
  await pipeline(
    createReadStream(source, { start: 20, end: size - 17 }),
    decipher,
    createWriteStream(target, { flags: 'wx', mode: 0o600 }),
  );
}
export async function sealBackup(source, destination) {
  source = path.resolve(source);
  destination = path.resolve(destination);
  const secret = key(),
    manifest = readManifest(source);
  if (existsSync(destination)) throw new Error('El destino cifrado ya existe.');
  for (const name of ['database.dump', 'files.tar'])
    if ((await sha256(path.join(source, name))) !== manifest.sha256[name])
      throw new Error('El respaldo de origen está corrupto.');
  await mkdir(destination, { mode: 0o700 });
  const checksums = {};
  for (const name of ['database.dump', 'files.tar', 'manifest.json']) {
    await encrypt(path.join(source, name), path.join(destination, `${name}.enc`), secret);
    checksums[`${name}.enc`] = await sha256(path.join(destination, `${name}.enc`));
  }
  await writeFile(
    path.join(destination, 'envelope.json'),
    JSON.stringify(
      {
        format: 'valkyr-encrypted-v1',
        algorithm: 'AES-256-GCM',
        createdAt: new Date().toISOString(),
        sha256: checksums,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  return { destination, verifiedFiles: manifest.verifiedFiles };
}
export async function openBackup(source, destination) {
  source = path.resolve(source);
  destination = path.resolve(destination);
  const secret = key();
  if (existsSync(destination)) throw new Error('El destino descifrado ya existe.');
  const envelope = JSON.parse(await readFile(path.join(source, 'envelope.json'), 'utf8'));
  if (envelope.format !== 'valkyr-encrypted-v1' || envelope.algorithm !== 'AES-256-GCM')
    throw new Error('Formato cifrado no compatible.');
  for (const name of ['database.dump', 'files.tar', 'manifest.json'])
    if ((await sha256(path.join(source, `${name}.enc`))) !== envelope.sha256?.[`${name}.enc`])
      throw new Error('Respaldo cifrado alterado o incompleto.');
  await mkdir(destination, { mode: 0o700 });
  try {
    for (const name of ['database.dump', 'files.tar', 'manifest.json'])
      await decrypt(path.join(source, `${name}.enc`), path.join(destination, name), secret);
    const manifest = readManifest(destination);
    for (const name of ['database.dump', 'files.tar'])
      if ((await sha256(path.join(destination, name))) !== manifest.sha256[name])
        throw new Error('Contenido descifrado inválido.');
    return { destination, verifiedFiles: manifest.verifiedFiles };
  } catch (error) {
    // Only this function's newly-created destination is removed after a failed authentication.
    for (const name of ['database.dump', 'files.tar', 'manifest.json'])
      await rm(path.join(destination, name), { force: true });
    throw error;
  }
}
