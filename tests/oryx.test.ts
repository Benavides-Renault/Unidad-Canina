import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Api, runtime, unitOwnership } from './client';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createDb } = require('../apps/api/dist/db.js');
const { processReminders } = require('../apps/api/dist/worker.js');
const day = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

test('ORYX: identificadores, catálogos, usos simultáneos y seguimiento de camadas', async (t) => {
  Object.assign(process.env, runtime.env);
  const db = createDb();
  await db.rateLimit.deleteMany();
  const admin = new Api();
  await admin.login();
  const suffix = randomUUID().slice(0, 8);
  const dogBody = {
    name: 'Orion ORYX TEST',
    breed: 'Pastor belga malinois',
    sex: 'MALE',
    birthDate: '2021-05-01',
    ...unitOwnership,
  };
  const dog = await admin.json(
    '/dogs',
    'POST',
    {
      ...dogBody,
      code: `ORYX-${suffix}`,
      microchip: `CR-${suffix}`,
      pedigreeNumber: `PEDI-${suffix}`,
      specialties: ['Obediencia básica', 'Búsqueda y rescate'],
    },
    201,
  );
  let plan: any;
  try {
    await t.test('código, chip y pedigrí se verifican normalizados y no admiten duplicados', async () => {
      for (const [field, value] of [
        ['code', dog.code.toLowerCase()],
        ['microchip', ` cr ${suffix} `],
        ['pedigreeNumber', `pedi ${suffix}`],
      ]) {
        assert.equal(
          (await admin.json(`/dogs/identifiers/check?${new URLSearchParams({ field, value })}`)).available,
          false,
        );
        assert.equal(
          (
            await admin.json(
              `/dogs/identifiers/check?${new URLSearchParams({ field, value, excludeId: dog.id })}`,
            )
          ).available,
          true,
        );
        const failed = await admin.json('/dogs', 'POST', { ...dogBody, [field]: value }, 409);
        assert.match(failed.message, /ya está registrado/);
      }
      const other = await admin.json('/dogs', 'POST', dogBody, 201);
      await admin.json(`/dogs/${other.id}`, 'PATCH', { pedigreeNumber: `pedi${suffix}` }, 409);
      const raced = await Promise.all(
        [1, 2].map(() => admin.call('/dogs', 'POST', { ...dogBody, pedigreeNumber: `RACE-${suffix}` })),
      );
      assert.deepEqual(raced.map((r) => r.status).sort(), [201, 409]);
    });
    await t.test('catálogo FCI, variedades personalizadas y persistencia desde expedientes', async () => {
      const breeds = await admin.json('/breeds');
      assert.ok(breeds.length >= 369);
      assert.ok(breeds.some((b: any) => b.name === 'Pastor belga malinois' && b.standardNumber === 15));
      const custom = await admin.json(
        '/breeds',
        'POST',
        { name: `Variedad ${suffix}`, notes: 'Registro de la unidad' },
        201,
      );
      await admin.json('/breeds', 'POST', { name: `variedad ${suffix}` }, 409);
      await admin.json(`/breeds/${custom.id}`, 'PATCH', { notes: 'Información ampliada' });
      await admin.json(`/dogs/${dog.id}`, 'PATCH', { breed: `Cruce propio ${suffix}` });
      assert.ok((await admin.json('/breeds')).some((b: any) => b.name === `Cruce propio ${suffix}`));
      await admin.json(`/breeds/${custom.id}`, 'PATCH', { archived: true });
      assert.ok(!(await admin.json('/breeds')).some((b: any) => b.id === custom.id));
    });
    await t.test('venta, cruza y entrenamiento coexisten y la galería mantiene la privacidad', async () => {
      const publication = {
        availableForSale: true,
        availableForBreeding: true,
        salePublished: true,
        saleCurrency: 'CRC',
        salePrice: '450000',
        saleContact: 'María Vargas · +123456789',
      };
      const sale = await admin.json(`/catalog/dogs/${dog.id}`, 'PATCH', publication);
      assert.equal(sale.availableForSale, true);
      assert.equal(sale.availableForBreeding, true);
      assert.equal(sale.workStatus, 'TRAINING');
      const gallery = await admin.json('/portal/gallery/dogs?pageSize=100');
      assert.ok(gallery.items.some((d: any) => d.id === dog.id));
      assert.ok(!('microchip' in gallery.items.find((d: any) => d.id === dog.id)));
      const dam = await admin.json(
        '/dogs',
        'POST',
        { ...dogBody, name: 'Maya ORYX TEST', sex: 'FEMALE' },
        201,
      );
      await admin.json(`/catalog/dogs/${dam.id}`, 'PATCH', publication);
      plan = await admin.json(
        '/breeding/plans',
        'POST',
        {
          damId: dam.id,
          sireId: dog.id,
          plannedDate: day(-63),
          matingDate: day(-63),
          expectedBirthDate: day(1),
          expectedDeliveryDate: day(50),
          status: 'MATED',
        },
        201,
      );
      const calendar = await admin.json(`/calendar/events?from=${day()}&to=${day(61)}&type=BREEDING`);
      assert.ok(calendar.items.some((e: any) => e.id === `BREEDING:${plan.id}:birth`));
      assert.ok(calendar.items.some((e: any) => e.id === `BREEDING:${plan.id}:delivery`));
      assert.equal(
        (await db.reminder.count({
          where: { sourceType: 'BREEDING', sourceId: plan.id, status: 'PENDING' },
        })) > 0,
        true,
      );
      await admin.json(`/catalog/dogs/${dog.id}`, 'PATCH', {
        ...publication,
        availableForSale: false,
        salePublished: false,
      });
      assert.equal((await admin.json(`/dogs/${dog.id}`)).availableForBreeding, true);
    });
    await t.test(
      'fechas inválidas se rechazan y el nacimiento real cierra el plan y sus avisos',
      async () => {
        await admin.json(
          `/breeding/plans/${plan.id}`,
          'PATCH',
          { expectedRevision: plan.revision, expectedDeliveryDate: day(-80) },
          400,
        );
        const litter = await admin.json(
          '/breeding/litters',
          'POST',
          {
            code: `ORYX-CAM-${suffix}`,
            damId: plan.damId,
            sireId: plan.sireId,
            planId: plan.id,
            birthDate: day(-1),
            liveBorn: 2,
          },
          201,
        );
        const current = (await admin.json('/breeding/plans?pageSize=100')).items.find(
          (p: any) => p.id === plan.id,
        );
        assert.equal(current.status, 'COMPLETED');
        assert.equal(current.litter.birthDate, day(-1));
        assert.equal(current.litter.id, litter.id);
        const birthReminders = await db.reminder.findMany({
          where: { sourceType: 'BREEDING', sourceId: plan.id, title: 'Nacimiento previsto' },
        });
        assert.ok(birthReminders.every((r: any) => r.status === 'CANCELLED'));
        const reminder = await db.reminder.findFirst({
          where: { sourceType: 'BREEDING', sourceId: plan.id, status: 'PENDING' },
        });
        await db.reminder.update({
          where: { id: reminder.id },
          data: { dueAt: new Date(Date.now() - 1000) },
        });
        await processReminders(db, 500);
        assert.equal((await db.reminder.findUnique({ where: { id: reminder.id } })).status, 'SENT');
      },
    );
    await t.test(
      'plantillas ampliadas descargan una planilla PDF y controles internos responden',
      async () => {
        const templates = await admin.json('/templates');
        for (const kind of ['MEDICAL', 'TALK', 'MUNICIPAL', 'EXTRAORDINARY', 'SERVICE']) {
          const template = templates.find((r: any) => r.kind === kind);
          assert.ok(template, kind);
          const pdf = await admin.call(`/templates/${template.id}/pdf`);
          assert.equal(pdf.status, 200);
          assert.match(pdf.headers.get('content-type') || '', /pdf/);
          assert.ok((await pdf.arrayBuffer()).byteLength > 1000);
        }
        const report = await admin.json('/system/audit');
        assert.equal(report.checks.length, 7);
        assert.ok(report.checkedAt);
        assert.ok(
          report.checks.filter((c: any) => c.name.includes('únic')).every((c: any) => c.issues === 0),
        );
      },
    );
    await t.test(
      'entrenadores y clientes no pueden gestionar catálogos ni controles de administración',
      async () => {
        for (const role of ['TRAINER', 'CLIENT']) {
          const actor = new Api(),
            username = `oryx-${role.toLowerCase()}-${suffix}`,
            password = 'PruebasDeAccesoORYX2026!';
          await admin.json('/users', 'POST', { name: `Acceso ${role}`, username, password, role }, 201);
          await actor.login(username, password);
          await actor.json('/breeds', 'POST', { name: 'Sin permiso' }, 403);
          await actor.json('/system/audit', 'GET', undefined, 403);
          await actor.json(`/catalog/dogs/${dog.id}`, 'PATCH', { availableForSale: true }, 403);
          if (role === 'CLIENT') await actor.json('/breeds', 'GET', undefined, 403);
        }
      },
    );
    await writeFile(
      '.local/oryx-fixtures.json',
      JSON.stringify({ dogId: dog.id, code: dog.code, pedigree: dog.pedigreeNumber, chip: dog.microchip }),
    );
  } finally {
    await db.$disconnect();
  }
});
