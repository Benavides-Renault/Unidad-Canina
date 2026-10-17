import { mkdir, copyFile, writeFile, lstat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { args, pgEnvironment, pgBinary, sha256 } from './common.mjs';

function run(binary, parameters, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, parameters, { env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', (chunk) => {
      error = (error + chunk).slice(-4000);
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Respaldo falló (${path.basename(binary)}): ${error}`)),
    );
  });
}

// pg_dump and the document list use the same exported PostgreSQL snapshot.
// Storage.put creates immutable random keys; archived files are retained.
// Do not use this mode with a storage implementation that overwrites or removes keys.
export async function onlineBackup(destination, objectClient) {
  const sourceDriver = process.env.STORAGE_DRIVER || 'local';
  if (!['local', 's3'].includes(sourceDriver)) throw new Error('Almacenamiento no compatible.');
  const s3 =
    sourceDriver === 's3'
      ? objectClient ||
        new S3Client({
          endpoint: process.env.S3_ENDPOINT,
          region: process.env.S3_REGION || 'us-east-1',
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY || '',
            secretAccessKey: process.env.S3_SECRET_KEY || '',
          },
        })
      : null;
  if (s3 && !process.env.S3_BUCKET) throw new Error('S3_BUCKET es obligatorio.');
  const storage = path.resolve(process.env.STORAGE_PATH || 'storage');
  destination = path.resolve(destination);
  const relative = path.relative(storage, destination);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)))
    throw new Error('El respaldo debe estar fuera de los archivos privados.');
  if (existsSync(destination)) throw new Error('El destino ya existe; no se sobrescribe.');
  const connectionString = process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL;
  const appDatabase = new URL(process.env.DATABASE_URL),
    backupDatabase = new URL(connectionString);
  if (
    appDatabase.hostname !== backupDatabase.hostname ||
    appDatabase.port !== backupDatabase.port ||
    appDatabase.pathname !== backupDatabase.pathname
  )
    throw new Error('BACKUP_DATABASE_URL debe apuntar al mismo servidor y base que DATABASE_URL.');
  const db = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
  await db.connect();
  let committed = false;
  try {
    const { locked } = (
      await db.query("SELECT pg_try_advisory_lock(hashtextextended('valkyr-online-backup',0)) AS locked")
    ).rows[0];
    if (!locked) throw new Error('Ya hay un respaldo en curso.');
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshot = (await db.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
    const files = (
      await db.query(
        'SELECT "storageKey", checksum FROM "Document" UNION SELECT "storageKey", checksum FROM "ContractFile" UNION SELECT "storageKey", checksum FROM "AccountFile"',
      )
    ).rows;
    await mkdir(destination, { recursive: true, mode: 0o700 });
    const stage = path.join(destination, 'snapshot-files');
    await mkdir(stage, { mode: 0o700 });
    const dump = path.join(destination, 'database.dump'),
      archive = path.join(destination, 'files.tar');
    await run(
      pgBinary('pg_dump'),
      ['--format=custom', '--no-owner', '--no-acl', `--snapshot=${snapshot}`, '--file', dump],
      pgEnvironment(connectionString),
    );
    for (const file of files) {
      if (!/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]+)?$/.test(file.storageKey))
        throw new Error('Clave de archivo no válida.');
      const source = path.join(storage, file.storageKey),
        target = path.join(stage, file.storageKey);
      if (s3) {
        const response = await s3.send(
          new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: file.storageKey }),
        );
        if (!response.Body) throw new Error('Objeto ausente en el respaldo.');
        await writeFile(target, Buffer.from(await response.Body.transformToByteArray()), {
          flag: 'wx',
          mode: 0o600,
        });
      } else {
        const stat = await lstat(source);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Sólo se respaldan archivos regulares.');
        await copyFile(source, target);
      }
      if ((await sha256(target)) !== file.checksum)
        throw new Error(`Checksum no coincide: ${file.storageKey}`);
    }
    await db.query('COMMIT');
    committed = true;
    await run('tar', ['-cf', archive, '-C', stage, '.']);
    if (path.dirname(path.resolve(stage)) !== destination)
      throw new Error('Directorio temporal fuera del respaldo.');
    await rm(stage, { recursive: true });
    const manifest = {
      format: 'valkyr-backup-v1',
      mode: 'native-online',
      storageDriver: 'local',
      sourceStorageDriver: sourceDriver,
      createdAt: new Date().toISOString(),
      verifiedFiles: files.length,
      sha256: { 'database.dump': await sha256(dump), 'files.tar': await sha256(archive) },
      note: 'Snapshot consistente de base y archivos inmutables. APP_ENCRYPTION_KEY se custodia por separado. Copia local sin cifrado; no sustituye una copia externa protegida.',
    };
    // The manifest is written last: incomplete backups are never advertised as valid.
    await writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
    return { destination, ...manifest };
  } finally {
    if (!committed) await db.query('ROLLBACK').catch(() => {});
    await db.end();
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  onlineBackup(String(args.output || `backups/valkyr-online-${Date.now()}`))
    .then((result) =>
      console.log(`Respaldo en línea verificado: ${result.destination} (${result.verifiedFiles} archivos).`),
    )
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
