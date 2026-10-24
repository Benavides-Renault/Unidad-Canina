import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import argon2 from 'argon2';
import pg from 'pg';
import { root } from '../scripts/env.mjs';
import {
  companyOptions,
  companyDatabaseUrl,
  companyContact,
  companyCatalogs,
  initializeCompany,
} from '../scripts/setup-company.mjs';

test('el contacto institucional valida números, redes sociales y campos públicos', () => {
  const contact = { contactName: 'ORYX K9', phone: '+506 7032 7517', whatsappNumber: '+50670327517' };
  const parsed = companyContact(contact);
  assert.equal(parsed.whatsappNumber, '+50670327517');
  assert.equal(parsed.phone, '+506 7032 7517');
  assert.equal(parsed.email, null);
  assert.equal(companyContact({ ...contact, email: 'CONTACTO@example.com' }).email, 'contacto@example.com');
  assert.equal(
    companyContact({ ...contact, instagramUrl: 'https://www.instagram.com/oryx.k9/' }).instagramUrl,
    'https://www.instagram.com/oryx.k9/',
  );
  for (const changed of [
    { contactName: '' },
    { phone: '123' },
    { whatsappNumber: '+506 7032 7517' },
    { email: 'sin-correo' },
    { instagramUrl: 'https://instagram.com.attacker.invalid/oryx' },
    { facebookUrl: 'http://facebook.com/oryx' },
    { tiktokUrl: 'https://private-user:private-password@tiktok.com/oryx' },
    { tiktokUrl: 'https://tiktok.com:444/oryx' },
    { tiktokUrl: 'not-a-url' },
    { password: 'private-password' },
  ])
    assert.throws(
      () => companyContact({ ...contact, ...changed }),
      (error) => {
        assert.doesNotMatch(error.message, /private-user|private-password|attacker/);
        return /contacto|campo/i.test(error.message);
      },
    );
});

test('el instalador usa el propietario de la misma base y rechaza destinos distintos sin revelar secretos', () => {
  const runtime = 'postgresql://runtime:private-runtime@localhost:5432/oryx?schema=public';
  const owner = 'postgres://owner:private-owner@localhost/oryx';
  assert.equal(companyDatabaseUrl({ DATABASE_URL: runtime }), runtime);
  assert.equal(companyDatabaseUrl({ MIGRATION_DATABASE_URL: owner }), owner);
  assert.equal(companyDatabaseUrl({ DATABASE_URL: runtime, MIGRATION_DATABASE_URL: owner }), owner);
  for (const destination of [
    owner.replace('localhost', 'other-server'),
    owner.replace('localhost/', 'localhost:55432/'),
    owner.replace('/oryx', '/another-database'),
    'invalid-private-value',
    'postgresql://owner:private-owner@localhost',
    'https://owner:private-owner@localhost/oryx',
  ]) {
    assert.throws(
      () => companyDatabaseUrl({ DATABASE_URL: runtime, MIGRATION_DATABASE_URL: destination }),
      (error) => {
        assert.doesNotMatch(error.message, /private-runtime|private-owner|invalid-private-value/);
        return /conexión PostgreSQL|mismo servidor/.test(error.message);
      },
    );
  }
  assert.throws(() => companyDatabaseUrl({}), /MIGRATION_DATABASE_URL o DATABASE_URL/);
});

test('el alta inicial exige contraseña explícita y valida usuario y nombre', () => {
  assert.throws(() => companyOptions({}), /BOOTSTRAP_PASSWORD/);
  const options = companyOptions({ BOOTSTRAP_PASSWORD: '1234', BOOTSTRAP_USERNAME: ' ADMIN ' });
  assert.equal(options.username, 'admin');
  assert.equal(options.password, '1234');
  assert.equal(options.name, 'Administración ORYX K9');
  for (const password of ['', '123', 'x'.repeat(129)])
    assert.throws(() => companyOptions({ BOOTSTRAP_PASSWORD: password }), /BOOTSTRAP_PASSWORD/);
  assert.throws(
    () => companyOptions({ BOOTSTRAP_PASSWORD: '1234', BOOTSTRAP_USERNAME: 'admin;DELETE' }),
    /BOOTSTRAP_USERNAME/,
  );
  assert.throws(() => companyOptions({ BOOTSTRAP_PASSWORD: '1234', BOOTSTRAP_NAME: ' ' }), /BOOTSTRAP_NAME/);
});

test('el paquete de instalación contiene las razas y plantillas sin duplicados', async () => {
  const catalogs = await companyCatalogs();
  assert.ok(catalogs.migrations.includes('202610180001_public_catalog_inquiries'));
  assert.equal(catalogs.breeds.length, 369);
  assert.equal(catalogs.templates.length, 18);
  assert.equal(new Set(catalogs.templates.map((item) => `${item.kind}:${item.name.toLowerCase()}`)).size, 18);
  assert.ok(catalogs.templates.some((item) => item.kind === 'MEDICAL'));
  assert.ok(catalogs.templates.some((item) => item.kind === 'CONTRACT'));
  assert.equal(catalogs.contact.contactName, 'ORYX K9');
  assert.equal(catalogs.contact.phone, '+506 7032 7517');
  assert.equal(catalogs.contact.whatsappNumber, '+50670327517');
});

function migrate(url) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
      {
        cwd: path.join(root, 'apps/api'),
        env: { ...process.env, DATABASE_URL: url },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`No se pudo migrar la base aislada (${code}): ${output}`)),
    );
  });
}

const controlUrl = process.env.COMPANY_SETUP_TEST_DATABASE_URL;
test(
  'PostgreSQL aislado: instalación limpia, rollback y segundo intento denegado',
  {
    skip: !controlUrl && 'Define COMPANY_SETUP_TEST_DATABASE_URL para verificar una base efímera aislada.',
    timeout: 120_000,
  },
  async (t) => {
    const base = new URL(controlUrl);
    assert.ok(
      ['localhost', '127.0.0.1'].includes(base.hostname) || process.env.ALLOW_ISOLATED_TEST_DB === 'true',
      'Las pruebas requieren PostgreSQL local o CI aislado autorizado.',
    );
    const database = `oryx_test_company_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const control = new pg.Client({ connectionString: base.toString() });
    await control.connect();
    await control.query(`CREATE DATABASE "${database}"`);
    const databases = [database];
    base.pathname = `/${database}`;
    const url = base.toString();
    const clients = [];
    t.after(async () => {
      for (const client of clients) await client.end();
      for (const name of databases) {
        assert.match(name, /^oryx_test_company_\d+_[a-f0-9]{8}$/);
        await control.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      }
      await control.end();
    });
    await migrate(url);
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    clients.push(client);
    const count = async (table) =>
      Number((await client.query(`SELECT count(*) FROM public."${table}"`)).rows[0].count);
    const initialBreeds = await count('Breed');
    const initialTemplates = await count('CertificateTemplate');
    await migrate(url);
    assert.equal(await count('Breed'), initialBreeds, 'Reaplicar migraciones no duplica razas.');
    assert.equal(
      await count('CertificateTemplate'),
      initialTemplates,
      'Reaplicar migraciones no duplica plantillas.',
    );
    assert.equal(initialBreeds, 369);
    assert.equal(initialTemplates, 15);
    const options = companyOptions({ BOOTSTRAP_PASSWORD: '1234' });
    const catalogs = await companyCatalogs();

    const supplierId = randomUUID();
    await client.query('INSERT INTO public."Supplier" (id,name) VALUES ($1,\'Proveedor aislado\')', [
      supplierId,
    ]);
    await assert.rejects(initializeCompany(client, options, catalogs), /Supplier ya contiene registros/);
    assert.equal(await count('User'), 0);
    assert.equal(await count('Supplier'), 1, 'El instalador no borra el dato que provoca el rechazo.');
    await client.query('DELETE FROM public."Supplier" WHERE id=$1', [supplierId]);

    // Deliberate failure after template changes proves that the entire setup rolls back.
    await client.query(
      "CREATE FUNCTION oryx_test_company_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo aislado de auditoría'; END; $$",
    );
    await client.query(
      'CREATE TRIGGER oryx_test_company_failure BEFORE INSERT ON public."AuditLog" FOR EACH ROW EXECUTE FUNCTION oryx_test_company_failure()',
    );
    await assert.rejects(initializeCompany(client, options, catalogs), /Fallo aislado de auditoría/);
    assert.equal(await count('User'), 0);
    assert.equal(await count('CertificateTemplate'), initialTemplates);
    assert.equal(
      await count('PublicSiteSettings'),
      0,
      'El contacto también se revierte si falla la instalación.',
    );
    await client.query('DROP TRIGGER oryx_test_company_failure ON public."AuditLog"');
    await client.query('DROP FUNCTION oryx_test_company_failure()');

    const secondClient = new pg.Client({ connectionString: url });
    await secondClient.connect();
    clients.push(secondClient);
    const attempts = await Promise.allSettled([
      initializeCompany(client, options, catalogs),
      initializeCompany(secondClient, options, catalogs),
    ]);
    assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter((attempt) => attempt.status === 'rejected').length, 1);
    const users = (
      await client.query('SELECT username,role,email,active,"partyId","passwordHash" FROM public."User"')
    ).rows;
    assert.equal(users.length, 1);
    assert.equal(users[0].username, 'admin');
    assert.equal(users[0].role, 'ADMIN');
    assert.equal(users[0].email, null);
    assert.equal(users[0].active, true);
    assert.equal(users[0].partyId, '00000000-0000-4000-8000-000000000001');
    assert.ok(await argon2.verify(users[0].passwordHash, '1234'));
    assert.match(users[0].passwordHash, /^\$argon2id\$/);
    assert.equal(await count('Breed'), 369);
    assert.equal(await count('CertificateTemplate'), 18);
    assert.equal(await count('PublicSiteSettings'), 1);
    const publicContact = (
      await client.query(
        'SELECT "contactName",phone,"whatsappNumber" FROM public."PublicSiteSettings" WHERE id=\'main\'',
      )
    ).rows[0];
    assert.deepEqual(publicContact, {
      contactName: 'ORYX K9',
      phone: '+506 7032 7517',
      whatsappNumber: '+50670327517',
    });
    assert.equal(
      await count('AuditLog'),
      3,
      'Se conservan las dos auditorías de migración y se registra el alta.',
    );
    const remaining = (
      await client.query(
        "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows;
    const retained = new Set([
      '_prisma_migrations',
      'User',
      'Breed',
      'CertificateTemplate',
      'Party',
      'AuditLog',
      'PublicSiteSettings',
    ]);
    for (const { tablename } of remaining)
      if (!retained.has(tablename))
        assert.equal(await count(tablename), 0, `${tablename} debe comenzar en cero.`);
    await assert.rejects(initializeCompany(client, options, catalogs), /User ya contiene registros/);
    assert.equal(await count('User'), 1);
    assert.equal(await count('CertificateTemplate'), 18);

    const operatorDatabase = `oryx_test_company_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await control.query(`CREATE DATABASE "${operatorDatabase}"`);
    databases.push(operatorDatabase);
    const operatorUrl = new URL(url);
    operatorUrl.pathname = `/${operatorDatabase}`;
    await migrate(operatorUrl.toString());
    const operator = new pg.Client({ connectionString: operatorUrl.toString() });
    await operator.connect();
    clients.push(operator);
    await operator.query(
      'INSERT INTO public."PublicSiteSettings" (id,"contactName",phone,"whatsappNumber","updatedAt") VALUES (\'main\',\'Contacto configurado por la empresa\',\'+506 8000 0000\',\'+50680000000\',NOW())',
    );
    const originalContact = (await operator.query('SELECT * FROM public."PublicSiteSettings"')).rows;
    await initializeCompany(operator, options, catalogs);
    assert.deepEqual(
      (await operator.query('SELECT * FROM public."PublicSiteSettings"')).rows,
      originalContact,
      'Se respeta el contacto configurado por un operador, incluida su fecha de actualización.',
    );
  },
);
