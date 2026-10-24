import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import pg from 'pg';
import { root, loadEnv } from './env.mjs';

const unitPartyId = '00000000-0000-4000-8000-000000000001';
const preservedTables = new Set([
  '_prisma_migrations',
  'Breed',
  'CertificateTemplate',
  'Party',
  'AuditLog',
  'ServiceHeartbeat',
  'RateLimit',
  'PublicSiteSettings',
]);

export function companyOptions(env) {
  const username = (env.BOOTSTRAP_USERNAME || 'admin').trim().toLowerCase();
  const name = (env.BOOTSTRAP_NAME || 'Administración ORYX K9').trim();
  const password = env.BOOTSTRAP_PASSWORD;
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username))
    throw new Error('BOOTSTRAP_USERNAME debe tener entre 3 y 40 caracteres válidos.');
  if (!name || name.length > 200) throw new Error('BOOTSTRAP_NAME debe tener entre 1 y 200 caracteres.');
  // This explicit one-time installation command does not change the normal password policy.
  if (typeof password !== 'string' || password.length < 4 || password.length > 128)
    throw new Error('Define BOOTSTRAP_PASSWORD por entorno con entre 4 y 128 caracteres.');
  return { username, name, password };
}

export function companyDatabaseUrl(env) {
  const selected = env.MIGRATION_DATABASE_URL || env.DATABASE_URL;
  if (!selected) throw new Error('Define MIGRATION_DATABASE_URL o DATABASE_URL.');
  const destination = (value) => {
    try {
      const url = new URL(value);
      if (
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        !url.hostname ||
        !url.pathname ||
        url.pathname === '/'
      )
        throw new Error();
      return [url.hostname, url.port || '5432', decodeURIComponent(url.pathname)].join('\n');
    } catch {
      throw new Error('La conexión PostgreSQL de instalación no es válida.');
    }
  };
  const target = destination(selected);
  if (env.MIGRATION_DATABASE_URL && env.DATABASE_URL && destination(env.DATABASE_URL) !== target)
    throw new Error(
      'MIGRATION_DATABASE_URL y DATABASE_URL deben señalar al mismo servidor, puerto y base de datos.',
    );
  return selected;
}

export async function companyCatalogs() {
  const directory = path.join(root, 'apps/api/prisma/migrations');
  const migrations = (await readdir(directory, { withFileTypes: true }))
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort();
  const { breeds } = JSON.parse(await readFile(path.join(root, 'assets/catalogs/breeds.json'), 'utf8'));
  const { templates } = JSON.parse(
    await readFile(path.join(root, 'assets/catalogs/company-templates.json'), 'utf8'),
  );
  if (!migrations.length || !Array.isArray(breeds) || !breeds.length)
    throw new Error('No se encontraron las migraciones y el catálogo de razas de la instalación.');
  if (!Array.isArray(templates) || !templates.length)
    throw new Error('No se encontró el catálogo de plantillas de la empresa.');
  const kinds = new Set([
    'TRAINING',
    'BREEDING',
    'CONTRACT',
    'MEDICAL',
    'TALK',
    'MUNICIPAL',
    'EXTRAORDINARY',
    'SERVICE',
  ]);
  const seen = new Set();
  for (const template of templates) {
    if (
      !template ||
      !kinds.has(template.kind) ||
      ['name', 'title', 'issuer', 'body'].some(
        (key) => typeof template[key] !== 'string' || !template[key].trim(),
      ) ||
      !Number.isSafeInteger(template.revision) ||
      template.revision < 1 ||
      (template.archivedAt != null && Number.isNaN(Date.parse(template.archivedAt)))
    )
      throw new Error('El catálogo contiene una plantilla inválida.');
    const key = `${template.kind}:${template.name.trim().toLowerCase()}`;
    if (seen.has(key)) throw new Error('El catálogo contiene plantillas repetidas.');
    seen.add(key);
  }
  return { migrations, breeds, templates };
}

const identifier = (value) => `"${value.replaceAll('"', '""')}"`;

export async function initializeCompany(client, options, catalogs) {
  const passwordHash = await argon2.hash(options.password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query('SELECT pg_advisory_xact_lock(71499534)');
    const tables = (
      await client.query(
        "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename",
      )
    ).rows.map((row) => row.tablename);
    const required = ['_prisma_migrations', 'User', 'Breed', 'CertificateTemplate', 'Party', 'AuditLog'];
    if (required.some((table) => !tables.includes(table)))
      throw new Error('La base no está preparada. Ejecuta npm run db:migrate antes de setup:company.');
    await client.query(
      `LOCK TABLE ${tables.map((table) => `public.${identifier(table)}`).join(', ')} IN SHARE ROW EXCLUSIVE MODE`,
    );
    const applied = (
      await client.query(
        'SELECT migration_name FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
      )
    ).rows.map((row) => row.migration_name);
    const failed = (
      await client.query(
        'SELECT 1 FROM public."_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL LIMIT 1',
      )
    ).rowCount;
    if (
      failed ||
      applied.length !== catalogs.migrations.length ||
      catalogs.migrations.some((name) => !applied.includes(name))
    )
      throw new Error('Hay migraciones pendientes, fallidas o de otra versión. Ejecuta npm run db:migrate.');
    for (const table of tables.filter((name) => !preservedTables.has(name))) {
      if ((await client.query(`SELECT 1 FROM public.${identifier(table)} LIMIT 1`)).rowCount)
        throw new Error(
          `Instalación denegada: ${table} ya contiene registros. Este comando no borra ni reinicia datos.`,
        );
    }
    if (
      (
        await client.query('SELECT 1 FROM public."Party" WHERE id <> $1 OR kind <> \'UNIT\' LIMIT 1', [
          unitPartyId,
        ])
      ).rowCount
    )
      throw new Error(
        'Instalación denegada: ya existen personas o entidades. Este comando no reinicia datos.',
      );
    if (
      (
        await client.query(
          'SELECT 1 FROM public."AuditLog" WHERE "actorId" IS NOT NULL OR entity <> \'System\' OR action <> \'BRAND_UPDATE\' LIMIT 1',
        )
      ).rowCount
    )
      throw new Error(
        'Instalación denegada: ya existe actividad registrada. Este comando no reinicia datos.',
      );
    const breedNames = new Set(
      (await client.query('SELECT name FROM public."Breed" WHERE "archivedAt" IS NULL')).rows.map(
        (row) => row.name,
      ),
    );
    if (catalogs.breeds.some((breed) => !breedNames.has(breed.name)))
      throw new Error('El catálogo de razas está incompleto. Revisa las migraciones de la instalación.');
    for (const template of catalogs.templates) {
      const existing = await client.query(
        'SELECT id FROM public."CertificateTemplate" WHERE name = $1 AND kind = $2',
        [template.name, template.kind],
      );
      if (existing.rowCount > 1)
        throw new Error('Hay plantillas repetidas; revisa el catálogo antes de continuar.');
      const values = [
        template.name,
        template.kind,
        template.title,
        template.issuer,
        template.body,
        template.revision,
        template.archivedAt || null,
      ];
      if (existing.rowCount)
        await client.query(
          'UPDATE public."CertificateTemplate" SET name=$1, kind=$2, title=$3, issuer=$4, body=$5, revision=$6, "archivedAt"=$7 WHERE id=$8',
          [...values, existing.rows[0].id],
        );
      else
        await client.query(
          'INSERT INTO public."CertificateTemplate" (name,kind,title,issuer,body,revision,"archivedAt",id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [...values, randomUUID()],
        );
    }
    const id = randomUUID();
    await client.query(
      'INSERT INTO public."User" (id,name,username,"passwordHash",role,"partyId","updatedAt") VALUES ($1,$2,$3,$4,\'ADMIN\',$5,NOW())',
      [id, options.name, options.username, passwordHash, unitPartyId],
    );
    await client.query(
      'INSERT INTO public."AuditLog" (id,"actorId","actorName",entity,"entityId",action,summary) VALUES ($1,$2,$3,\'User\',$4,\'BOOTSTRAP\',\'Administrador inicial de la empresa creado sin datos de prueba.\')',
      [randomUUID(), id, options.name, id],
    );
    await client.query('COMMIT');
    return { username: options.username, breeds: breedNames.size, templates: catalogs.templates.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  loadEnv();
  const options = companyOptions(process.env);
  delete process.env.BOOTSTRAP_PASSWORD;
  const connectionString = companyDatabaseUrl(process.env);
  const catalogs = await companyCatalogs();
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const result = await initializeCompany(client, options, catalogs);
    console.log(
      `Empresa inicializada: usuario ${result.username}; ${result.breeds} razas y ${result.templates} plantillas. Sin datos de prueba.`,
    );
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'No se pudo inicializar la empresa.');
    process.exitCode = 1;
  });
