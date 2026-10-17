import { mkdirSync, openSync, closeSync, existsSync } from 'node:fs';
import path from 'node:path';
import { args, command, docker, pgEnvironment, pgBinary, sha256, readManifest } from './common.mjs';

async function main() {
  const mode = args.mode || 'native';
  if (!['native', 'docker'].includes(mode)) throw new Error('--mode debe ser native o docker.');
  if (!args.source || !args.database || !args.files)
    throw new Error(
      'Usar --source=carpeta --database=valkyr_restore_nombre --files=directorio_nuevo [--mode=native|docker].',
    );
  const database = String(args.database);
  if (!/^valkyr_restore_[a-z0-9_]{1,40}$/.test(database))
    throw new Error(
      'Sólo se permiten bases aisladas con prefijo valkyr_restore_ y letras minúsculas/números/guion bajo.',
    );
  const source = path.resolve(String(args.source));
  const files = path.resolve(String(args.files));
  if (existsSync(files))
    throw new Error(
      'El destino de archivos ya existe. Usar un directorio nuevo; nunca se sobrescriben datos.',
    );
  const manifest = readManifest(source);
  for (const filename of ['database.dump', 'files.tar']) {
    if ((await sha256(path.join(source, filename))) !== manifest.sha256[filename])
      throw new Error(`Checksum incorrecto: ${filename}. Restauración cancelada.`);
  }
  const archive = path.join(source, 'files.tar');
  const listing = command('tar', ['-tf', archive], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  }).stdout;
  for (const entry of listing.split(/\r?\n/).filter(Boolean)) {
    const normalized = entry.replaceAll('\\', '/');
    if (normalized.startsWith('/') || normalized.includes(':') || normalized.split('/').includes('..'))
      throw new Error('Archivo inseguro: ruta fuera del destino.');
  }
  const verbose = command('tar', ['-tvf', archive], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  }).stdout;
  if (verbose.split(/\r?\n/).some((line) => line && !['-', 'd'].includes(line[0])))
    throw new Error('No se restauran enlaces ni archivos especiales.');
  const dump = path.join(source, 'database.dump');
  if (mode === 'native') {
    const env = pgEnvironment(process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL);
    command(pgBinary('createdb'), ['--', database], { env });
    command(
      pgBinary('pg_restore'),
      [
        '--single-transaction',
        '--exit-on-error',
        '--no-owner',
        '--no-privileges',
        '--dbname',
        database,
        dump,
      ],
      { env },
    );
  } else {
    const username = process.env.POSTGRES_USER || 'valkyr';
    docker(['exec', '-T', 'postgres', 'createdb', '-U', username, '--', database]);
    const descriptor = openSync(dump, 'r');
    try {
      docker(
        [
          'exec',
          '-T',
          'postgres',
          'pg_restore',
          '-U',
          username,
          '--single-transaction',
          '--exit-on-error',
          '--no-owner',
          '--no-privileges',
          '--dbname',
          database,
        ],
        { stdio: [descriptor, 'inherit', 'inherit'] },
      );
    } finally {
      closeSync(descriptor);
    }
  }
  mkdirSync(files, { recursive: true, mode: 0o700 });
  command('tar', ['-xf', archive, '-C', files]);
  console.log(
    `Restauración aislada finalizada: ${database}\nArchivos: ${files}\nValidar recuentos, descargas y sesión antes de planificar el cambio de la instalación activa.`,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
