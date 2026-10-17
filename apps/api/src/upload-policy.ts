import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdir, readdir, stat, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const run = promisify(execFile);
let queue = Promise.resolve();
export const quarantineDirectory = () =>
  path.resolve(process.env.UPLOAD_QUARANTINE_PATH || '.private-quarantine');
export async function directoryBytes(directory: string) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    },
  )) {
    if (entry.isFile()) total += (await stat(path.join(directory, entry.name))).size;
  }
  return total;
}
// One local writer at a time prevents concurrent uploads from exceeding the configured quota.
export async function guardedUpload(data: Buffer, publish: () => Promise<void>) {
  const previous = queue;
  let release!: () => void;
  queue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    const quotaMiB = Number(process.env.STORAGE_QUOTA_MIB || 10240);
    if (!Number.isFinite(quotaMiB) || quotaMiB <= 0)
      throw new ServiceUnavailableException('Cuota de archivos inválida.');
    if (
      (process.env.STORAGE_DRIVER || 'local') === 'local' &&
      (await directoryBytes(path.resolve(process.env.STORAGE_PATH || '.private-files'))) + data.length >
        quotaMiB * 1048576
    )
      throw new BadRequestException('Se alcanzó la cuota de archivos. Contacta al administrador.');
    const quarantine = quarantineDirectory();
    await mkdir(quarantine, { recursive: true, mode: 0o700 });
    if ((await directoryBytes(quarantine)) + data.length > 256 * 1048576)
      throw new ServiceUnavailableException('Revisar los archivos retenidos antes de continuar.');
    const filename = path.join(quarantine, randomUUID());
    await writeFile(filename, data, { flag: 'wx', mode: 0o600 });
    // A deterministic canary is always rejected; full malware scanning is supplied by ClamAV when configured.
    if (data.includes(Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')))
      throw new BadRequestException('Archivo rechazado y retenido para revisión.');
    if (process.env.UPLOAD_SCANNER_PATH) {
      try {
        await run(process.env.UPLOAD_SCANNER_PATH, ['--no-summary', filename], {
          timeout: 30000,
          windowsHide: true,
          maxBuffer: 65536,
        });
      } catch {
        throw new BadRequestException('El analizador no aprobó el archivo; permanece retenido.');
      }
    }
    await publish();
    await unlink(filename);
  } finally {
    release();
  }
}
