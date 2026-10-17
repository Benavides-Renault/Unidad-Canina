import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { Api, runtime } from './client';
const require = createRequire(import.meta.url);
const { createDb } = require('../apps/api/dist/db.js');

test('notificaciones completas, paginadas y privadas; métricas del inicio consistentes', async (t) => {
  Object.assign(process.env, runtime.env);
  assert.match(new URL(runtime.env.DATABASE_URL).pathname, /^\/valkyr_test_/);
  const db = createDb();
  try {
    await db.rateLimit.deleteMany();
    const root = new Api();
    await root.login();
    const suffix = randomUUID().slice(0, 8);
    const password = `Performance-${suffix}-private`;
    const owner = await root.json(
      '/users',
      'POST',
      { name: 'Avisos de prueba', username: `notices.${suffix}`, role: 'ADMIN', password },
      201,
    );
    const client = await root.json(
      '/users',
      'POST',
      { name: 'Cliente avisos', username: `noticeclient.${suffix}`, role: 'CLIENT', password },
      201,
    );
    const reader = new Api();
    await reader.login(owner.username, password);
    const outsider = new Api();
    await outsider.login(client.username, password);
    const now = new Date();
    const records: any[] = [];
    for (let n = 0; n < 28; n++) {
      const userId = n === 26 ? client.id : owner.id;
      const reminder = await db.reminder.create({
        data: {
          dedupeKey: randomUUID(),
          userId,
          sourceId: randomUUID(),
          sourceType: n === 27 ? 'UNKNOWN' : 'BREEDING',
          dueAt: now,
          title: `Camada ${n}`,
          body: 'Seguimiento de nacimiento',
          status: 'SENT',
        },
      });
      records.push(
        await db.notification.create({
          data: {
            userId,
            reminderId: reminder.id,
            title: reminder.title,
            body: reminder.body,
            createdAt: now,
            readAt: n === 25 ? now : null,
          },
        }),
      );
    }
    await t.test('incluye crianza y cuenta todos los avisos sin leer aunque excedan una página', async () => {
      assert.deepEqual(await reader.json('/notifications/summary'), { unread: 25 });
      const first = await reader.json('/notifications?page=1&pageSize=20');
      const second = await reader.json('/notifications?page=2&pageSize=20');
      assert.equal(first.total, 26);
      assert.equal(first.items.length, 20);
      assert.equal(second.items.length, 6);
      assert.equal(new Set([...first.items, ...second.items].map((n) => n.id)).size, 26);
      assert.ok(first.items.every((n) => n.userId === owner.id));
      await reader.json(`/notifications/${records[0].id}/read`, 'PATCH');
      assert.deepEqual(await reader.json('/notifications/summary'), { unread: 24 });
      await reader.json(`/notifications/${records[0].id}/read`, 'PATCH');
      assert.deepEqual(await reader.json('/notifications/summary'), { unread: 24 });
    });
    await t.test('no revela avisos de otro usuario ni de un módulo fuera del rol', async () => {
      assert.deepEqual(await outsider.json('/notifications/summary'), { unread: 0 });
      assert.equal((await outsider.json('/notifications')).total, 0);
      await outsider.json(`/notifications/${records[0].id}/read`, 'PATCH', undefined, 404);
      await outsider.json(`/notifications/${records[26].id}/read`, 'PATCH', undefined, 404);
      await reader.json(`/notifications/${records[26].id}/read`, 'PATCH', undefined, 404);
      await new Api().json('/notifications/summary', 'GET', undefined, 401);
    });
    await t.test('el resumen del inicio excluye archivados y conserva los conteos por estado', async () => {
      const summary = await root.json('/dashboard');
      const dogs = await db.dog.findMany({
        where: { archivedAt: null },
        select: { workStatus: true, availability: true },
      });
      assert.equal(summary.totalDogs, dogs.length);
      assert.equal(summary.operationalDogs, dogs.filter((d) => d.workStatus === 'OPERATIONAL').length);
      assert.equal(summary.trainingDogs, dogs.filter((d) => d.workStatus === 'TRAINING').length);
      assert.equal(summary.availableDogs, dogs.filter((d) => d.availability === 'AVAILABLE').length);
    });
  } finally {
    await db.$disconnect();
  }
});
