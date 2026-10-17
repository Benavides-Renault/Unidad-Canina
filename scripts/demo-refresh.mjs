import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import pg from 'pg';
import argon2 from 'argon2';
import PDFDocument from 'pdfkit';
import { root, loadEnv } from './env.mjs';
import { onlineBackup } from '../infra/backup/online.mjs';
import { cleanValue, salesContact } from './demo-content.mjs';
loadEnv();
process.chdir(root);
const target = new URL(process.env.DATABASE_URL),
  owner = new URL(process.env.MIGRATION_DATABASE_URL);
if (
  !process.argv.includes('--apply') ||
  process.env.DEMO_MODE !== 'true' ||
  !/^\/valkyr_demo_\d+$/.test(target.pathname) ||
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  target.pathname !== owner.pathname ||
  target.host !== owner.host
)
  throw new Error('Sólo se permite --apply sobre la base local de demostración activa.');
process.env.PG_BIN ||= path.join(root, '.local/pg-tools/pgsql/bin');
const backup = await onlineBackup(path.join(root, `.local/backups/pre-content-${Date.now()}`));
const db = new pg.Client({ connectionString: owner.toString() });
await db.connect();
const immutable = ['ContractVersion', 'Payment', 'StockMovement', 'GoalEvaluation', 'MedicalRevision'];
const excluded = new Set([
  'AuditLog',
  'Session',
  'PasswordReset',
  'RateLimit',
  'ServiceHeartbeat',
  '_prisma_migrations',
  'PushSubscription',
  'PushDelivery',
]);
let changed = 0,
  users;
try {
  await db.query('BEGIN');
  // This explicit, backed-up seed maintenance applies only to synthetic rows. Business APIs retain immutable history.
  for (const table of immutable)
    await db.query(`ALTER TABLE ${pg.escapeIdentifier(table)} DISABLE TRIGGER USER`);
  const columns = (
    await db.query(
      "SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND data_type IN ('text','jsonb') ORDER BY table_name,ordinal_position",
    )
  ).rows;
  for (const { table_name: table, column_name: column, data_type: type } of columns) {
    if (
      excluded.has(table) ||
      ['passwordHash', 'totpSecret', 'totpPendingSecret', 'storageKey', 'checksum'].includes(column)
    )
      continue;
    const pk = table === 'UserPreference' ? 'userId' : table === 'BreedingProfile' ? 'dogId' : 'id';
    const rows = (
      await db.query(
        `SELECT ${pg.escapeIdentifier(pk)} AS id,${pg.escapeIdentifier(column)} AS value FROM ${pg.escapeIdentifier(table)} WHERE ${pg.escapeIdentifier(column)} IS NOT NULL`,
      )
    ).rows;
    for (const row of rows) {
      const cleaned = cleanValue(row.value);
      if (JSON.stringify(cleaned) !== JSON.stringify(row.value)) {
        await db.query(
          `UPDATE ${pg.escapeIdentifier(table)} SET ${pg.escapeIdentifier(column)}=$1 WHERE ${pg.escapeIdentifier(pk)}=$2`,
          [type === 'jsonb' ? JSON.stringify(cleaned) : cleaned, row.id],
        );
        changed++;
      }
    }
  }
  await db.query('UPDATE "Dog" SET "saleContact"=$1 WHERE "salePublished"=true', [salesContact]);
  await db.query('UPDATE "BreedingPlan" SET contact=$1 WHERE published=true', [salesContact]);
  await db.query('UPDATE "User" SET "passwordHash"=$1,"updatedAt"=NOW()', [
    await argon2.hash('1234', { type: argon2.argon2id }),
  ]);
  await db.query('DELETE FROM "Session"');
  await db.query('DELETE FROM "RateLimit"');
  for (const table of ['Document', 'ContractFile', 'AccountFile']) {
    const docs = (
      await db.query(`SELECT id,name FROM ${pg.escapeIdentifier(table)} WHERE "mimeType"='application/pdf'`)
    ).rows;
    for (const record of docs) {
      const title =
        table === 'Document'
          ? 'Registro de seguimiento canino'
          : table === 'ContractFile'
            ? 'Contrato de servicios'
            : 'Comprobante de pago';
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks = [];
      const bytes = new Promise((resolve) => {
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
      });
      doc
        .fontSize(24)
        .text('VALKYR · Unidad Canina')
        .moveDown()
        .fontSize(16)
        .text(title)
        .moveDown()
        .fontSize(11)
        .text(`Referencia: ${record.id}`)
        .moveDown()
        .text(
          'Administración: María Vargas\nContacto: +123456789\nConsulta el expediente asociado para conocer las fechas, responsables y condiciones del registro.',
        );
      doc.end();
      const data = await bytes,
        key = randomUUID();
      await writeFile(path.join(process.env.STORAGE_PATH, key), data, { flag: 'wx', mode: 0o600 });
      await db.query(
        `UPDATE ${pg.escapeIdentifier(table)} SET name=$1,"storageKey"=$2,checksum=$3,size=$4 WHERE id=$5`,
        [`${title}.pdf`, key, createHash('sha256').update(data).digest('hex'), data.length, record.id],
      );
    }
  }
  for (const table of immutable)
    await db.query(`ALTER TABLE ${pg.escapeIdentifier(table)} ENABLE TRIGGER USER`);
  users = (await db.query('SELECT id,username,name,role,"partyId" FROM "User" ORDER BY username')).rows;
  const admin = users.find((u) => u.username === 'admin');
  await db.query('INSERT INTO "AuditLog"(id,"actorId",entity,action,summary) VALUES($1,$2,$3,$4,$5)', [
    randomUUID(),
    admin.id,
    'Installation',
    'SEED_REFRESH',
    'Contenido de ejemplo y accesos actualizados por solicitud del administrador; respaldo previo conservado.',
  ]);
  await db.query('COMMIT');
  const runtime = JSON.parse(await readFile('.local/demo-runtime.json', 'utf8'));
  runtime.users = users.map((u) => ({ ...u, password: '1234' }));
  await writeFile('.local/demo-runtime.json', JSON.stringify(runtime, null, 2), { mode: 0o600 });
  await writeFile(
    '.local/demo-content-result.json',
    JSON.stringify(
      {
        changed,
        users: users.length,
        passwordUpdated: true,
        contact: salesContact,
        backup: backup.destination,
        at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ changed, users: users.length, contact: salesContact, backup: backup.destination }),
  );
} catch (error) {
  await db.query('ROLLBACK');
  throw error;
} finally {
  await db.end();
}
