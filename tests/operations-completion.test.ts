import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Api, runtime } from './client';
const require = createRequire(import.meta.url);
const { createDb } = require('../apps/api/dist/db.js');
const { processPush, validatePushEndpoint } = require('../apps/api/dist/push.js');
const { processReminders } = require('../apps/api/dist/worker.js');
const { guardedUpload } = require('../apps/api/dist/upload-policy.js');
import { totp, passwordSchema } from '../apps/api/src/security';

test('Operación local: avisos, cuarentena, cuotas y MFA obligatorio', async (t) => {
  Object.assign(process.env, runtime.env);
  assert.match(new URL(runtime.env.DATABASE_URL).pathname, /^\/oryx_test_\d+$/);
  const db = createDb();
  await db.rateLimit.deleteMany();
  const admin = new Api();
  await admin.login();
  const password = 'OperacionesPrivadas2026!';
  const suffix = Date.now();
  const person = await admin.json(
    '/users',
    'POST',
    {
      username: `ops-admin-${suffix}`,
      name: 'Operador TEST',
      role: 'ADMIN',
      password,
      email: `ops-${suffix}@example.invalid`,
    },
    201,
  );
  const operator = new Api();
  await operator.login(person.username, password);
  const curve = createECDH('prime256v1');
  curve.generateKeys();
  const subscription = {
    endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
    keys: { p256dh: curve.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
  };
  let subscribed: any;
  try {
    await t.test('suscripción voluntaria, aislamiento y rechazo de endpoints privados', async () => {
      assert.equal((await operator.json('/push/config')).configured, true);
      for (const endpoint of [
        'http://127.0.0.1/x',
        'https://127.0.0.1/x',
        'https://fcm.googleapis.com.evil.test/x',
        'https://user@fcm.googleapis.com/x',
      ]) {
        assert.throws(() => validatePushEndpoint(endpoint));
        assert.equal(
          (await operator.call('/push/subscriptions', 'POST', { ...subscription, endpoint })).status,
          400,
        );
      }
      subscribed = await operator.json('/push/subscriptions', 'POST', subscription, 201);
      assert.equal((await operator.json('/preferences')).pushEnabled, true);
      assert.equal((await admin.call('/push/subscriptions', 'POST', subscription)).status, 409);
      assert.equal(
        (await admin.json('/push/subscriptions')).some((s: any) => s.id === subscribed.id),
        false,
      );
    });
    const dog = await db.dog.findFirstOrThrow();
    const appointment = await db.appointment.create({
      data: { dogId: dog.id, title: 'Aviso privado TEST', startsAt: new Date(), createdBy: person.id },
    });
    const make = async () => {
      const reminder = await db.reminder.create({
        data: {
          dedupeKey: randomUUID(),
          sourceType: 'APPOINTMENT',
          sourceId: appointment.id,
          userId: person.id,
          dueAt: new Date(0),
          title: 'Dato privado TEST',
          body: 'Contenido clínico que no debe aparecer en push',
        },
      });
      const notification = await db.notification.create({
        data: { reminderId: reminder.id, userId: person.id, title: reminder.title, body: reminder.body },
      });
      return db.pushDelivery.create({
        data: { subscriptionId: subscribed.id, notificationId: notification.id },
      });
    };
    await t.test('entrega con exclusión concurrente y sin datos privados en el mensaje', async () => {
      const job = await make();
      const payloads: string[] = [];
      const sender = async (_sub: unknown, payload: string) => {
        payloads.push(payload);
      };
      await Promise.all([processPush(db, sender), processPush(db, sender)]);
      assert.equal(payloads.length, 1);
      assert.doesNotMatch(payloads[0], /clínico|Dato privado|TEST/);
      assert.equal((await db.pushDelivery.findUniqueOrThrow({ where: { id: job.id } })).status, 'SENT');
      assert.equal(
        (await admin.json('/push/deliveries')).some((d: any) => d.id === job.id),
        false,
      );
    });
    await t.test('reintentos persistentes, límite de intentos y suscripción caducada', async () => {
      const job = await make();
      for (let attempt = 1; attempt <= 5; attempt++) {
        await db.pushDelivery.update({ where: { id: job.id }, data: { nextAttempt: new Date(0) } });
        await processPush(db, async () => {
          throw Object.assign(new Error('fallo simulado'), { statusCode: 503 });
        });
        const stored = await db.pushDelivery.findUniqueOrThrow({ where: { id: job.id } });
        assert.equal(stored.attempts, attempt);
        assert.equal(stored.status, attempt < 5 ? 'PENDING' : 'FAILED');
      }
      const gone = await make();
      await processPush(db, async () => {
        throw Object.assign(new Error('caducada'), { statusCode: 410 });
      });
      assert.equal((await db.pushDelivery.findUniqueOrThrow({ where: { id: gone.id } })).status, 'CANCELLED');
      assert.equal(
        (await db.pushSubscription.findUniqueOrThrow({ where: { id: subscribed.id } })).active,
        false,
      );
    });
    await t.test('preferencias cancelan el envío y el trabajador no duplica las entregas', async () => {
      await operator.json('/push/subscriptions', 'POST', subscription, 201);
      const job = await make();
      await operator.json('/preferences', 'PATCH', { pushEnabled: false, emailEnabled: false });
      await processPush(db, async () => {
        assert.fail('No debe enviar con opt-out');
      });
      assert.equal((await db.pushDelivery.findUniqueOrThrow({ where: { id: job.id } })).status, 'CANCELLED');
      await operator.json('/preferences', 'PATCH', { pushEnabled: true });
      const queued = await db.reminder.create({
        data: {
          dedupeKey: randomUUID(),
          sourceType: 'APPOINTMENT',
          sourceId: appointment.id,
          userId: person.id,
          dueAt: new Date(0),
          title: 'Nueva cita',
          body: 'Consulta el expediente.',
        },
      });
      let calls = 0;
      const sender = async () => {
        calls++;
      };
      await processReminders(db, 100, sender);
      const first = calls;
      await db.reminder.update({ where: { id: queued.id }, data: { status: 'PENDING', dueAt: new Date(0) } });
      await processReminders(db, 100, sender);
      assert.equal(calls, first);
      assert.ok(first > 0);
      const duplicates = await db.$queryRaw<
        any[]
      >`SELECT "subscriptionId","notificationId" FROM "PushDelivery" GROUP BY 1,2 HAVING COUNT(*)>1`;
      assert.equal(duplicates.length, 0);
      await operator.json('/preferences', 'PATCH', { pushEnabled: false });
    });
    await t.test('correo local respeta preferencias y marca entrega una sola vez', async () => {
      const messages: string[] = [];
      const smtp = createServer((socket) => {
        socket.write('220 local.test ESMTP\r\n');
        let buffer = '',
          dataMode = false,
          body = '';
        socket.on('data', (chunk) => {
          buffer += chunk.toString();
          let i;
          while ((i = buffer.indexOf('\r\n')) >= 0) {
            const line = buffer.slice(0, i);
            buffer = buffer.slice(i + 2);
            if (dataMode) {
              if (line === '.') {
                messages.push(body);
                body = '';
                dataMode = false;
                socket.write('250 accepted\r\n');
              } else body += line + '\r\n';
            } else if (/^EHLO|^HELO/i.test(line)) socket.write('250-local.test\r\n250 SIZE 1048576\r\n');
            else if (/^DATA$/i.test(line)) {
              dataMode = true;
              socket.write('354 Send data\r\n');
            } else if (/^QUIT$/i.test(line)) {
              socket.end('221 Bye\r\n');
            } else socket.write('250 OK\r\n');
          }
        });
      });
      await new Promise<void>((resolve) => smtp.listen(0, '127.0.0.1', resolve));
      process.env.SMTP_HOST = '127.0.0.1';
      process.env.SMTP_PORT = String((smtp.address() as { port: number }).port);
      process.env.SMTP_FROM = 'oryx@example.invalid';
      process.env.SMTP_USER = '';
      process.env.SMTP_SECURE = 'false';
      try {
        const add = () =>
          db.reminder.create({
            data: {
              dedupeKey: randomUUID(),
              sourceType: 'APPOINTMENT',
              sourceId: appointment.id,
              userId: person.id,
              dueAt: new Date(0),
              title: 'Control programado',
              body: 'Consulta el expediente.',
            },
          });
        const off = await add();
        await processReminders(db, 100, async () => {});
        assert.equal(messages.length, 0);
        assert.equal((await db.reminder.findUniqueOrThrow({ where: { id: off.id } })).emailSentAt, null);
        await operator.json('/preferences', 'PATCH', { emailEnabled: true });
        const on = await add();
        await processReminders(db, 100, async () => {});
        await processReminders(db, 100, async () => {});
        assert.equal(messages.length, 1);
        assert.ok(messages[0].includes(person.email));
        assert.ok((await db.reminder.findUniqueOrThrow({ where: { id: on.id } })).emailSentAt);
      } finally {
        process.env.SMTP_HOST = '';
        await new Promise<void>((resolve, reject) => smtp.close((e) => (e ? reject(e) : resolve())));
      }
    });
    await t.test('cuota concurrente, archivo retenido y fallo de analizador cierran el acceso', async () => {
      const base = await mkdtemp(path.resolve('.local/upload-policy-'));
      const store = path.join(base, 'files'),
        quarantine = path.join(base, 'quarantine');
      await mkdir(store);
      const saved = {
        STORAGE_PATH: process.env.STORAGE_PATH,
        STORAGE_QUOTA_MIB: process.env.STORAGE_QUOTA_MIB,
        UPLOAD_QUARANTINE_PATH: process.env.UPLOAD_QUARANTINE_PATH,
        UPLOAD_SCANNER_PATH: process.env.UPLOAD_SCANNER_PATH,
      };
      Object.assign(process.env, {
        STORAGE_PATH: store,
        STORAGE_QUOTA_MIB: String(10 / 1048576),
        UPLOAD_QUARANTINE_PATH: quarantine,
        UPLOAD_SCANNER_PATH: '',
      });
      try {
        const upload = () =>
          guardedUpload(Buffer.from('123456'), () =>
            writeFile(path.join(store, randomUUID()), '123456', { flag: 'wx' }),
          );
        const results = await Promise.allSettled([upload(), upload()]);
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
        assert.equal((await readdir(store)).length, 1);
        process.env.STORAGE_QUOTA_MIB = '1';
        await assert.rejects(
          guardedUpload(Buffer.from('%PDF-1.4 EICAR-STANDARD-ANTIVIRUS-TEST-FILE'), async () =>
            assert.fail('No publicar archivo rechazado'),
          ),
        );
        assert.equal((await readdir(quarantine)).length, 1);
        process.env.UPLOAD_SCANNER_PATH = path.join(base, 'scanner-does-not-exist.exe');
        await assert.rejects(
          guardedUpload(Buffer.from('clean'), async () =>
            assert.fail('Fallo de analizador no debe publicar'),
          ),
        );
        assert.equal((await readdir(quarantine)).length, 2);
      } finally {
        for (const [k, v] of Object.entries(saved)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
      }
    });
    await t.test('MFA obligatorio limita rutas hasta habilitar y no permite desactivación', async () => {
      const user = await admin.json(
        '/users',
        'POST',
        { username: `required-mfa-${suffix}`, name: 'MFA obligatorio TEST', role: 'ADMIN', password },
        201,
      );
      const child = spawn(process.execPath, ['apps/api/dist/main.js'], {
        env: { ...process.env, ...runtime.env, ADMIN_MFA_REQUIRED: 'true', API_PORT: '4003' },
        windowsHide: true,
        stdio: 'ignore',
      });
      const previous = runtime.api;
      runtime.api = 'http://127.0.0.1:4003/api/v1';
      try {
        let ready = false;
        for (let i = 0; i < 100; i++) {
          try {
            if ((await fetch(runtime.api + '/health')).ok) {
              ready = true;
              break;
            }
          } catch {}
          await new Promise((r) => setTimeout(r, 100));
        }
        assert.ok(ready);
        const locked = new Api();
        await locked.login(user.username, password);
        assert.equal((await locked.json('/auth/me')).mfaRequired, true);
        for (const route of ['/dogs', '/templates', '/system/status', '/users'])
          assert.equal((await locked.call(route)).status, 403, route);
        const setup = await locked.json('/auth/mfa/setup', 'POST', {}, 201);
        const codes = await Promise.all([
          locked.call('/auth/mfa/enable', 'POST', { code: totp(setup.secret) }),
          locked.call('/auth/mfa/enable', 'POST', { code: totp(setup.secret) }),
        ]);
        assert.deepEqual(codes.map((r) => r.status).sort(), [201, 400]);
        assert.equal((await locked.call('/dogs')).status, 200);
        assert.equal(
          (await locked.call('/auth/mfa/disable', 'POST', { password, code: totp(setup.secret) })).status,
          400,
        );
      } finally {
        runtime.api = previous;
        child.kill('SIGTERM');
      }
    });
    await t.test('1234 se permite únicamente con la configuración de prueba', () => {
      process.env.DEMO_MODE = 'false';
      assert.equal(passwordSchema.safeParse('1234').success, false);
      process.env.DEMO_MODE = 'true';
      assert.equal(passwordSchema.safeParse('1234').success, true);
      assert.equal(passwordSchema.safeParse('123').success, false);
      process.env.DEMO_MODE = 'false';
    });
  } finally {
    await db.$disconnect();
  }
});
