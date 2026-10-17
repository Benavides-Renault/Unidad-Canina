import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
import { Api, runtime } from './client';
test('operación: salud del trabajador y permisos mínimos de PostgreSQL', async (t) => {
  const admin = new Api();
  await admin.login();
  const db = new pg.Client({ connectionString: runtime.env.DATABASE_URL });
  await db.connect();
  try {
    await t.test('monitor privado distingue trabajador activo y detenido', async () => {
      const current = await admin.json('/system/status');
      assert.equal(current.database, 'ok');
      assert.equal(current.workerHealthy, true);
      assert.equal(current.storageWritable, true);
      assert.equal((await new Api().call('/system/status')).status, 401);
      const finance = new Api();
      await finance.login('phase3-trainer', 'AdministracionPrueba2026!');
      assert.equal((await finance.call('/system/status')).status, 403);
      await db.query('UPDATE "ServiceHeartbeat" SET "pulsedAt"=NOW()-INTERVAL \'10 minutes\' WHERE name=$1', [
        'reminder-worker',
      ]);
      assert.equal((await admin.json('/system/status')).workerHealthy, false);
      await promisify(execFile)(process.execPath, ['apps/api/dist/worker.js', '--once'], {
        env: { ...process.env, ...runtime.env },
      });
      assert.equal((await admin.json('/system/status')).workerHealthy, true);
    });
    await t.test('rol de aplicación puede operar pero no alterar historiales ni estructura', async () => {
      const role = `oryx_test_app_${Date.now()}`,
        quoted = pg.escapeIdentifier(role);
      await db.query(`CREATE ROLE ${quoted} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
      try {
        const grants = (await readFile('infra/security/runtime-grants.sql', 'utf8')).replaceAll(
          ':"runtime_role"',
          quoted,
        );
        await db.query(grants);
        await db.query(`SET ROLE ${quoted}`);
        assert.ok((await db.query('SELECT id FROM "Dog" LIMIT 1')).rowCount);
        await db.query('INSERT INTO "ServiceHeartbeat" (name,"pulsedAt") VALUES ($1,NOW())', [
          'permission-test',
        ]);
        await db.query('UPDATE "ServiceHeartbeat" SET "pulsedAt"=NOW() WHERE name=$1', ['permission-test']);
        await db.query('DELETE FROM "ServiceHeartbeat" WHERE name=$1', ['permission-test']);
        for (const sql of [
          'UPDATE "AuditLog" SET summary=\'changed\'',
          'DELETE FROM "Payment"',
          'TRUNCATE "StockMovement"',
          'ALTER TABLE "AuditLog" DISABLE TRIGGER USER',
          'SELECT * FROM "_prisma_migrations"',
        ])
          await assert.rejects(db.query(sql));
      } finally {
        await db.query('RESET ROLE');
        await db.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${quoted}`);
        await db.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${quoted}`);
        await db.query(`REVOKE ALL ON SCHEMA public FROM ${quoted}`);
        await db.query(`DROP ROLE ${quoted}`);
      }
    });
  } finally {
    await db.end();
  }
});
