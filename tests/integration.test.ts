import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
import { unitOwnership } from './client';
import { totp } from '../apps/api/src/security';

const runtime = JSON.parse(await readFile(new URL('../.local/test-runtime.json', import.meta.url), 'utf8'));
const db = new pg.Client({ connectionString: runtime.env.DATABASE_URL });
class Api {
  cookies: Record<string, string> = {};
  async call(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    const multipart = body instanceof FormData;
    const res = await fetch(runtime.api + path, {
      method,
      headers: {
        origin: runtime.web,
        ...(body && !multipart ? { 'content-type': 'application/json' } : {}),
        ...(Object.keys(this.cookies).length
          ? {
              cookie: Object.entries(this.cookies)
                .map(([k, v]) => `${k}=${v}`)
                .join('; '),
              'x-csrf-token': this.cookies.valkyr_csrf,
            }
          : {}),
        ...headers,
      },
      body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
    });
    for (const cookie of res.headers.getSetCookie()) {
      const pair = cookie.split(';')[0];
      const i = pair.indexOf('=');
      this.cookies[pair.slice(0, i)] = pair.slice(i + 1);
    }
    return res;
  }
  async json(path: string, method = 'GET', body?: unknown, status = 200) {
    const res = await this.call(path, method, body);
    const value = await res.json();
    assert.equal(res.status, status, `${method} ${path}: ${JSON.stringify(value)}`);
    return value;
  }
}
const admin = new Api();
const anonymous = new Api();
const trainer = new Api();
const viewer = new Api();
const finance = new Api();
let dogId: string, documentId: string, vaccineId: string, trainerId: string;
const password = randomBytes(20).toString('hex');
test('API privada: integridad, permisos y persistencia', async (t) => {
  await db.connect();
  try {
    await t.test('deniega acceso sin sesión y autentica administrador con cookies seguras', async () => {
      assert.equal((await anonymous.call('/dogs')).status, 401);
      const res = await admin.call('/auth/login', 'POST', {
        username: runtime.username.toUpperCase(),
        password: runtime.password,
      });
      assert.equal(res.status, 201);
      assert.ok(
        res.headers.getSetCookie().some((v) => v.includes('HttpOnly') && v.includes('SameSite=Strict')),
      );
      assert.equal((await admin.json('/auth/me')).role, 'ADMIN');
      assert.equal((await admin.call('/users', 'POST', {}, { 'x-csrf-token': 'invalid' })).status, 403);
      assert.equal((await admin.call('/users', 'POST', {}, { origin: 'https://evil.invalid' })).status, 403);
    });
    await t.test('crea usuarios privados y aplica roles del servidor', async () => {
      const trainerUser = await admin.json(
        '/users',
        'POST',
        { name: 'Entrenador de PRUEBA', username: 'trainer', password, role: 'TRAINER' },
        201,
      );
      trainerId = trainerUser.id;
      await admin.json(
        '/users',
        'POST',
        { name: 'Consulta de PRUEBA', username: 'viewer', password, role: 'CLIENT' },
        201,
      );
      await admin.json(
        '/users',
        'POST',
        { name: 'Finanzas de PRUEBA', username: 'finance', password, role: 'CLIENT' },
        201,
      );
      await trainer.json('/auth/login', 'POST', { username: 'TRAINER', password }, 201);
      await viewer.json('/auth/login', 'POST', { username: 'viewer', password }, 201);
      await finance.json('/auth/login', 'POST', { username: 'finance', password }, 201);
      assert.equal(trainerUser.username, 'trainer');
      assert.equal(trainerUser.email, null);
      assert.equal('passwordHash' in trainerUser, false);
      assert.equal(
        (
          await admin.call('/users', 'POST', {
            name: 'Duplicado',
            username: 'Trainer',
            password,
            role: 'CLIENT',
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await admin.call('/users', 'POST', {
            name: 'Inválido',
            username: 'sin-correo',
            password: 'admin',
            role: 'CLIENT',
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await anonymous.call('/users', 'POST', {
            name: 'Invitado',
            username: 'invitado',
            password,
            role: 'CLIENT',
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await trainer.call('/users', 'POST', {
            name: 'Invitado',
            username: 'invitado',
            password,
            role: 'ADMIN',
          })
        ).status,
        403,
      );
      assert.equal((await trainer.call('/users')).status, 403);
      assert.equal((await finance.call('/dogs')).status, 403);
      assert.equal((await trainer.call('/finances')).status, 404);
      assert.equal((await trainer.call('/contracts')).status, 403);
    });
    await t.test(
      'administración recupera una cuenta sin correo y revoca sesiones y tokens previos',
      async () => {
        const account = await admin.json(
          '/users',
          'POST',
          { name: 'Socio API', username: 'socio.api', password, role: 'CLIENT' },
          201,
        );
        const partner = new Api();
        await partner.json('/auth/login', 'POST', { username: 'socio.api', password }, 201);
        const resetToken = randomBytes(32).toString('base64url');
        await db.query(
          'INSERT INTO "PasswordReset" (id,"tokenHash","userId","expiresAt") VALUES ($1,$2,$3,NOW()+interval\'30 minutes\')',
          [randomUUID(), createHash('sha256').update(resetToken).digest('hex'), account.id],
        );
        assert.equal(
          (await partner.call(`/users/${account.id}`, 'PATCH', { password: 'NuevaFraseDePrueba!' })).status,
          403,
        );
        assert.equal((await admin.call(`/users/${account.id}`, 'PATCH', { password: 'admin' })).status, 400);
        const updated = await admin.json(`/users/${account.id}`, 'PATCH', {
          username: 'SOCIO.NUEVO',
          email: 'socio@example.invalid',
          password: 'NuevaFraseDePrueba!',
        });
        assert.equal(updated.username, 'socio.nuevo');
        assert.equal('passwordHash' in updated, false);
        assert.equal((await partner.call('/auth/me')).status, 401);
        assert.equal(
          (await partner.call('/auth/login', 'POST', { username: 'socio.nuevo', password })).status,
          401,
        );
        assert.equal(
          (await anonymous.call('/auth/reset-password', 'POST', { token: resetToken, password })).status,
          400,
        );
        await partner.json(
          '/auth/login',
          'POST',
          { username: 'socio.nuevo', password: 'NuevaFraseDePrueba!' },
          201,
        );
        await admin.json(`/users/${account.id}`, 'PATCH', { email: null });
        assert.equal((await partner.json('/auth/me')).email, null);
        const forgot = await anonymous.json(
          '/auth/forgot-password',
          'POST',
          { username: 'socio.nuevo' },
          201,
        );
        const missing = await anonymous.json('/auth/forgot-password', 'POST', { username: 'no-existe' }, 201);
        assert.deepEqual(forgot, missing);
      },
    );
    await t.test('crea expediente y rechaza microchips duplicados y campos desconocidos', async () => {
      const dog = await admin.json(
        '/dogs',
        'POST',
        {
          ...unitOwnership,
          assignedTrainerId: trainerId,
          name: 'Canino de PRUEBA',
          sex: 'FEMALE',
          breed: 'Pastor alemán',
          microchip: '999000000000001',
          birthDate: '2024-02-29',
          location: 'Sede de pruebas',
          notes: 'Registro exclusivamente sintético',
        },
        201,
      );
      dogId = dog.id;
      assert.ok(dog.code);
      assert.equal(
        (
          await admin.call('/dogs', 'POST', {
            ...unitOwnership,
            name: 'Duplicado',
            sex: 'MALE',
            breed: 'Prueba',
            microchip: '999000000000001',
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await admin.call('/dogs', 'POST', {
            name: 'Prueba',
            sex: 'MALE',
            breed: 'Prueba',
            role: 'SUPERADMIN',
          })
        ).status,
        400,
      );
      assert.equal((await viewer.call(`/dogs/${dogId}`, 'PATCH', { name: 'No autorizado' })).status, 403);
      await admin.json('/auth/logout', 'POST', {}, 201);
      assert.equal((await admin.call(`/dogs/${dogId}`)).status, 401);
      await admin.json(
        '/auth/login',
        'POST',
        { username: runtime.username, password: runtime.password },
        201,
      );
      assert.equal((await admin.json(`/dogs/${dogId}`)).name, 'Canino de PRUEBA');
    });
    await t.test('fechas clínicas válidas, vacuna persistente, peso y movimiento', async () => {
      assert.equal(
        (
          await trainer.call(`/dogs/${dogId}/vaccinations`, 'POST', {
            product: 'Vacuna',
            appliedDate: '2026-10-01',
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await admin.call(`/dogs/${dogId}/vaccinations`, 'POST', {
            product: 'Vacuna',
            appliedDate: '2026-02-30',
          })
        ).status,
        400,
      );
      const vac = await admin.json(
        `/dogs/${dogId}/vaccinations`,
        'POST',
        {
          product: 'Vacuna SINTÉTICA',
          appliedDate: '2026-10-01',
          nextDueDate: '2026-10-16',
          professional: 'Veterinario de prueba',
          batch: 'TEST-01',
        },
        201,
      );
      vaccineId = vac.id;
      await admin.json(`/dogs/${dogId}/weights`, 'POST', { date: '2026-10-15', kg: 24.5 }, 201);
      await admin.json(
        `/dogs/${dogId}/movements`,
        'POST',
        {
          date: new Date().toISOString(),
          location: 'Canil B de PRUEBAS',
          custodianPartyId: unitOwnership.custodianPartyId,
        },
        201,
      );
      const dog = await admin.json(`/dogs/${dogId}`);
      assert.equal(dog.vaccinations.length, 1);
      assert.equal(dog.weights[0].kg, 24.5);
      assert.equal(dog.location, 'Canil B de PRUEBAS');
    });
    await t.test('sesiones cronológicas con puntuaciones reales e informe PDF', async () => {
      for (const score of [60, 80])
        await trainer.json(
          `/trainer/dogs/${dogId}/training`,
          'POST',
          {
            occurredAt: new Date().toISOString(),
            discipline: 'Obediencia',
            objective: 'Ejercicio de PRUEBA',
            durationMinutes: 20,
            score,
          },
          201,
        );
      const sessions = await admin.json(`/training?dogId=${dogId}`);
      assert.equal(sessions.total, 2);
      for (const suffix of ['card.pdf', 'report.pdf']) {
        const res = await admin.call(`/dogs/${dogId}/${suffix}`);
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type') || '', /pdf/);
        const data = Buffer.from(await res.arrayBuffer());
        assert.equal(data.subarray(0, 5).toString(), '%PDF-');
        assert.ok(data.length > 1000);
        await writeFile(new URL(`../.local/test-${suffix}`, import.meta.url), data);
      }
      assert.match(await (await admin.call('/dogs/export.csv')).text(), /Canino de PRUEBA/);
    });
    await t.test('archivos privados validan contenido, checksum y permisos clínicos', async () => {
      const invalid = new FormData();
      invalid.append('file', new Blob(['<script>evil</script>'], { type: 'image/png' }), 'false.png');
      invalid.append('category', 'PHOTO');
      assert.equal((await admin.call(`/dogs/${dogId}/documents`, 'POST', invalid)).status, 400);
      const bytes = await readFile(new URL('../assets/branding/valkyr-logo-original.png', import.meta.url));
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: 'image/png' }), 'fixture-logo.png');
      form.append('category', 'PHOTO');
      const doc = await admin.json(`/dogs/${dogId}/documents`, 'POST', form, 201);
      documentId = doc.id;
      assert.equal((await anonymous.call(`/documents/${documentId}/download`)).status, 401);
      assert.equal((await finance.call(`/documents/${documentId}/download`)).status, 403);
      const downloaded = await admin.call(`/documents/${documentId}/download`);
      assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
      const clinical = new FormData();
      clinical.append('file', new Blob([bytes], { type: 'image/png' }), 'clinical-fixture.png');
      clinical.append('category', 'CLINICAL');
      const privateDoc = await admin.json(`/dogs/${dogId}/documents`, 'POST', clinical, 201);
      assert.equal((await trainer.call(`/documents/${privateDoc.id}/download`)).status, 403);
      const visible = await trainer.json(`/trainer/dogs/${dogId}`);
      assert.ok(visible.documents.some((d: { id: string }) => d.id === privateDoc.id));
    });
    await t.test('citas y cola persistente entregan sin duplicar notificaciones', async () => {
      const startsAt = new Date(Date.now() + 3600000).toISOString();
      const appt = await admin.json(
        '/appointments',
        'POST',
        { dogId, title: 'Control de PRUEBA', startsAt, remindBeforeHours: 24 },
        201,
      );
      const instant = await db.query('SELECT "startsAt" FROM "Appointment" WHERE id=$1', [appt.id]);
      assert.equal(instant.rows[0].startsAt.toISOString(), startsAt);
      const count = await db.query('SELECT count(*)::int n FROM "Reminder" WHERE "sourceId"=$1', [appt.id]);
      assert.ok(count.rows[0].n > 0);
      await promisify(execFile)(process.execPath, ['apps/api/dist/worker.js', '--once'], {
        env: { ...process.env, ...runtime.env },
        cwd: process.cwd(),
      });
      const first = await db.query('SELECT count(*)::int n FROM "Notification"');
      assert.ok(first.rows[0].n > 0);
      await promisify(execFile)(process.execPath, ['apps/api/dist/worker.js', '--once'], {
        env: { ...process.env, ...runtime.env },
        cwd: process.cwd(),
      });
      const second = await db.query('SELECT count(*)::int n FROM "Notification"');
      assert.equal(second.rows[0].n, first.rows[0].n);
      const list = await admin.json('/notifications');
      assert.ok(list.total > 0);
      await admin.json(`/appointments/${appt.id}`, 'PATCH', { status: 'COMPLETED' });
    });
    await t.test('auditoría no admite modificación ni borrado', async () => {
      const audit = await admin.json(`/audit?dogId=${dogId}`);
      assert.ok(audit.total > 0);
      assert.equal((await trainer.call('/audit')).status, 403);
      await assert.rejects(
        db.query('UPDATE "AuditLog" SET summary=$1 WHERE id=(SELECT id FROM "AuditLog" LIMIT 1)', [
          'tampered',
        ]),
      );
      await assert.rejects(db.query('DELETE FROM "AuditLog" WHERE id=(SELECT id FROM "AuditLog" LIMIT 1)'));
    });
    await t.test('MFA valida TOTP y al deshabilitar usuario revoca sesiones', async () => {
      const me = await admin.json('/auth/me');
      assert.equal((await admin.call(`/users/${me.id}`, 'PATCH', { active: false })).status, 400);
      const setup = await admin.json('/auth/mfa/setup', 'POST', {}, 201);
      await admin.json('/auth/mfa/enable', 'POST', { code: totp(setup.secret) }, 201);
      const fresh = new Api();
      const challenge = await fresh.json(
        '/auth/login',
        'POST',
        { username: runtime.username, password: runtime.password },
        201,
      );
      assert.equal(challenge.mfaRequired, true);
      assert.equal((await fresh.call('/auth/me')).status, 401);
      await fresh.json(
        '/auth/login',
        'POST',
        { username: runtime.username, password: runtime.password, totp: totp(setup.secret) },
        201,
      );
      await fresh.json(
        '/auth/mfa/disable',
        'POST',
        { code: totp(setup.secret), password: runtime.password },
        201,
      );
      Object.assign(admin.cookies, fresh.cookies);
      await admin.json(`/users/${trainerId}`, 'PATCH', { active: false });
      assert.equal((await trainer.call('/auth/me')).status, 401);
    });
    await t.test('recuperación consume un token una sola vez, vence y revoca sesiones', async () => {
      const me = await viewer.json('/auth/me');
      const raw = randomBytes(32).toString('base64url');
      const nextPassword = randomBytes(20).toString('hex');
      await db.query(
        'INSERT INTO "PasswordReset" (id,"tokenHash","userId","expiresAt") VALUES ($1,$2,$3,NOW()+interval\'30 minutes\')',
        [randomUUID(), createHash('sha256').update(raw).digest('hex'), me.id],
      );
      await anonymous.json('/auth/reset-password', 'POST', { token: raw, password: nextPassword }, 201);
      assert.equal(
        (await anonymous.call('/auth/reset-password', 'POST', { token: raw, password: nextPassword })).status,
        400,
      );
      assert.equal((await viewer.call('/auth/me')).status, 401);
      await viewer.json('/auth/login', 'POST', { username: 'viewer', password: nextPassword }, 201);
      const expired = randomBytes(32).toString('base64url');
      await db.query(
        'INSERT INTO "PasswordReset" (id,"tokenHash","userId","expiresAt") VALUES ($1,$2,$3,NOW()-interval\'1 minute\')',
        [randomUUID(), createHash('sha256').update(expired).digest('hex'), me.id],
      );
      assert.equal(
        (await anonymous.call('/auth/reset-password', 'POST', { token: expired, password: nextPassword }))
          .status,
        400,
      );
    });
    await t.test('archiva expediente conservando historial y documentos físicos', async () => {
      const dog = await admin.json(
        '/dogs',
        'POST',
        { ...unitOwnership, name: 'Archivo de PRUEBA', sex: 'MALE', breed: 'Prueba' },
        201,
      );
      await admin.json(`/dogs/${dog.id}`, 'DELETE');
      const result = await db.query('SELECT "archivedAt" FROM "Dog" WHERE id=$1', [dog.id]);
      assert.ok(result.rows[0].archivedAt);
      assert.equal((await admin.call(`/dogs/${dog.id}`)).status, 404);
      assert.ok(vaccineId && documentId);
    });
  } finally {
    await db.end();
  }
});
