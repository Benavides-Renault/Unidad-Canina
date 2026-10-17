import { mkdirSync, openSync, closeSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { args, command, docker, pgEnvironment, pgBinary, sha256 } from './common.mjs';

async function main() {
  const mode = args.mode || 'native';
  if (!['native', 'docker'].includes(mode)) throw new Error('--mode debe ser native o docker.');
  if (!args.quiesced)
    throw new Error(
      'Detener web, API y worker antes; después agregar --quiesced para confirmar la pausa de escrituras. PostgreSQL debe seguir activo.',
    );
  if ((process.env.STORAGE_DRIVER || 'local') !== 'local')
    throw new Error(
      'Este script respalda almacenamiento LOCAL. S3 requiere snapshot/export de objetos coordinado por el operador.',
    );
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = path.resolve(String(args.output || `backups/valkyr-${timestamp}`));
  const storage = path.resolve(process.env.STORAGE_PATH || 'storage');
  if (mode === 'native') {
    const relative = path.relative(storage, destination);
    if (
      !relative ||
      (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
    )
      throw new Error('El destino del respaldo no puede estar dentro del directorio de archivos privados.');
  }
  if (existsSync(destination)) throw new Error('El directorio destino ya existe; no se sobrescribe.');
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  const dump = path.join(destination, 'database.dump');
  const archive = path.join(destination, 'files.tar');
  if (mode === 'native') {
    if (!existsSync(storage)) throw new Error(`No existe STORAGE_PATH: ${storage}`);
    command(pgBinary('pg_dump'), ['--format=custom', '--no-owner', '--no-acl', '--file', dump], {
      env: pgEnvironment(process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL),
    });
    command('tar', ['-cf', archive, '-C', storage, '.']);
  } else {
    const descriptors = [openSync(dump, 'wx', 0o600), openSync(archive, 'wx', 0o600)];
    try {
      docker(
        [
          'exec',
          '-T',
          'postgres',
          'pg_dump',
          '-U',
          process.env.POSTGRES_USER || 'valkyr',
          '-d',
          process.env.POSTGRES_DB || 'valkyr',
          '--format=custom',
          '--no-owner',
          '--no-acl',
        ],
        { stdio: ['ignore', descriptors[0], 'inherit'] },
      );
      docker(
        [
          'run',
          '--rm',
          '--no-deps',
          '-T',
          '--entrypoint',
          'tar',
          'api',
          '-cf',
          '-',
          '-C',
          '/data/files',
          '.',
        ],
        { stdio: ['ignore', descriptors[1], 'inherit'] },
      );
    } finally {
      descriptors.forEach(closeSync);
    }
  }
  const manifest = {
    format: 'valkyr-backup-v1',
    createdAt: new Date().toISOString(),
    mode,
    storageDriver: 'local',
    sha256: { 'database.dump': await sha256(dump), 'files.tar': await sha256(archive) },
    note: 'APP_ENCRYPTION_KEY y demás secretos se custodian por separado. Checksums detectan corrupción, no prueban autoría.',
  };
  writeFileSync(path.join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(
    `Respaldo creado: ${destination}\nCifrar y copiar a almacenamiento independiente; ejecutar una restauración aislada para verificarlo.`,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
