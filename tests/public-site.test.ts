import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Api, runtime, unitOwnership } from './client';
const require = createRequire(import.meta.url);
const { createDb } = require('../apps/api/dist/db.js');

test('catálogo público, solicitudes privadas y aprobación de cuentas', async (t) => {
  Object.assign(process.env, runtime.env);
  assert.match(new URL(runtime.env.DATABASE_URL).pathname, /^\/oryx_test_/);
  const db = createDb();
  const admin = new Api(),
    visitor = new Api(),
    client = new Api(),
    trainer = new Api();
  const password = 'Public-test-password-2026';
  try {
    await db.rateLimit.deleteMany();
    await admin.login();
    for (const [role, username, actor] of [
      ['CLIENT', 'public-client', client],
      ['TRAINER', 'public-trainer', trainer],
    ] as const) {
      await admin.json('/users', 'POST', { name: username, username, password, role }, 201);
      await actor.login(username, password);
    }
    const dog = await admin.json(
      '/dogs',
      'POST',
      {
        name: 'PUBLIC · Atlas',
        breed: 'Pastor alemán',
        sex: 'MALE',
        microchip: 'PUBLIC-CHIP-PRIVATE',
        notes: 'PRIVATE_INTERNAL_NOTES',
      },
      201,
    );
    const hidden = await admin.json(
      '/dogs',
      'POST',
      { name: 'PRIVATE · Hidden', breed: 'Pastor alemán', sex: 'FEMALE' },
      201,
    );
    const pub = {
      availableForSale: true,
      salePublished: true,
      salePrice: '250000',
      saleCurrency: 'CRC',
      saleContact: 'Equipo ORYX K9',
      publicDescription: 'Compañero preparado para una nueva familia.',
      healthSummary: 'Resumen médico aprobado',
      pedigreeSummary: 'Linaje publicado',
    };
    await admin.json(`/catalog/dogs/${dog.id}`, 'PATCH', pub);
    async function upload(id: string, category: string) {
      const f = new FormData();
      f.set(
        'file',
        new Blob([await readFile('assets/branding/oryx-logo.png')], { type: 'image/png' }),
        'public-test.png',
      );
      f.set('category', category);
      return admin.json(`/dogs/${id}/documents`, 'POST', f, 201);
    }
    const photo = await upload(dog.id, 'PHOTO'),
      privatePhoto = await upload(hidden.id, 'PHOTO');
    const dam = await admin.json(
      '/dogs',
      'POST',
      { name: 'PUBLIC · Madre', breed: 'Pastor alemán', sex: 'FEMALE' },
      201,
    );
    const sire = await admin.json(
      '/dogs',
      'POST',
      { name: 'PUBLIC · Padre', breed: 'Pastor alemán', sex: 'MALE' },
      201,
    );
    for (const parent of [dam, sire])
      await admin.json(`/catalog/dogs/${parent.id}`, 'PATCH', {
        availableForBreeding: true,
        salePublished: false,
        saleCurrency: 'CRC',
        healthSummary: 'Salud autorizada del progenitor',
      });
    const cross = await admin.json(
      '/breeding/plans',
      'POST',
      {
        damId: dam.id,
        sireId: sire.id,
        plannedDate: '2026-10-01',
        expectedBirthDate: '2026-12-03',
        expectedDeliveryDate: '2027-02-01',
        status: 'PLANNED',
        published: true,
        publicTitle: 'PUBLIC · Próxima camada',
        publicDescription: 'Camada publicada para consultas.',
        puppyPrice: '300000',
        currency: 'CRC',
        contact: 'Equipo ORYX K9',
      },
      201,
    );
    const parentPhoto = await upload(dam.id, 'PHOTO');
    const settings = {
      contactName: 'Equipo ORYX K9',
      phone: '+506 7032 7517',
      whatsappNumber: '+50670327517',
      email: 'contact@example.invalid',
      instagramUrl: 'https://www.instagram.com/oryx_test',
      facebookUrl: null,
      tiktokUrl: null,
    };
    const request = (extra: Record<string, unknown> = {}) => ({
      requestKey: randomUUID(),
      kind: 'CONTACT',
      name: 'Visitante de pruebas',
      email: 'visitor@example.invalid',
      phone: null,
      preferredContact: 'EMAIL',
      message: 'Quisiera información sobre los servicios.',
      consent: true,
      ...extra,
    });
    await t.test('anónimos ven sólo publicaciones, fotos principales y salud aprobada', async () => {
      const result = await visitor.json(`/public/dogs/${dog.id}`);
      assert.equal(result.healthSummary, pub.healthSummary);
      assert.doesNotMatch(JSON.stringify(result), /PRIVATE_INTERNAL|PUBLIC-CHIP/);
      for (const field of [
        'microchip',
        'ownerPartyId',
        'assignedTrainerId',
        'medicalEntries',
        'documents',
        'notes',
      ])
        assert.equal(field in result, false, field);
      assert.equal((await visitor.call(`/public/dogs/${hidden.id}`)).status, 404);
      assert.equal((await visitor.call(`/public/photos/${privatePhoto.id}`)).status, 404);
      assert.equal((await visitor.call(`/public/photos/${photo.id}`)).status, 200);
      assert.equal((await visitor.call(`/dogs/${dog.id}`)).status, 401);
      assert.equal((await visitor.call('/public/dogs?pageSize=101')).status, 400);
      const list = await visitor.json('/public/dogs?pageSize=100');
      assert.ok(list.items.some((d: any) => d.id === dog.id));
      assert.ok(!list.items.some((d: any) => d.id === hidden.id));
      await admin.json(`/catalog/dogs/${dog.id}`, 'PATCH', { ...pub, salePublished: false });
      assert.equal((await visitor.call(`/public/dogs/${dog.id}`)).status, 404);
      assert.equal((await visitor.call(`/public/photos/${photo.id}`)).status, 404);
      await admin.json(`/catalog/dogs/${dog.id}`, 'PATCH', pub);
    });
    await t.test('camadas enlazables y progenitores no abren el expediente privado', async () => {
      const result = await visitor.json(`/public/crosses/${cross.id}`);
      assert.equal(result.dam.id, dam.id);
      assert.equal(result.sire.id, sire.id);
      assert.equal('ownerPartyId' in result.dam, false);
      assert.equal('notes' in result, false);
      assert.equal((await visitor.call(`/public/dogs/${dam.id}`)).status, 404);
      assert.equal((await visitor.call(`/public/photos/${parentPhoto.id}`)).status, 200);
      await db.breedingPlan.update({ where: { id: cross.id }, data: { published: false } });
      assert.equal((await visitor.call(`/public/crosses/${cross.id}`)).status, 404);
      assert.equal((await visitor.call(`/public/photos/${parentPhoto.id}`)).status, 404);
      await db.breedingPlan.update({ where: { id: cross.id }, data: { published: true } });
    });
    await t.test(
      'camadas nacidas aparecen sólo mientras tienen cachorros publicados disponibles',
      async () => {
        const born = await db.breedingPlan.create({
          data: {
            damId: dam.id,
            sireId: sire.id,
            plannedDate: new Date('2026-08-01'),
            status: 'COMPLETED',
            published: true,
            publicTitle: 'PUBLIC · Camada nacida',
            puppyPrice: '200000',
            contact: 'Equipo',
            currency: 'CRC',
          },
        });
        const litter = await db.litter.create({
          data: {
            code: 'PUBLIC-LITTER',
            damId: dam.id,
            sireId: sire.id,
            planId: born.id,
            birthDate: new Date('2026-10-01'),
            liveBorn: 1,
          },
        });
        assert.equal((await visitor.call(`/public/crosses/${born.id}`)).status, 404);
        const puppy = await admin.json(
          '/dogs',
          'POST',
          {
            ...unitOwnership,
            name: 'PUBLIC · Cachorro',
            breed: 'Pastor alemán',
            sex: 'MALE',
            birthDate: '2026-10-01',
          },
          201,
        );
        await db.dog.update({ where: { id: puppy.id }, data: { litterId: litter.id, isPuppy: true } });
        await admin.json(`/catalog/dogs/${puppy.id}`, 'PATCH', pub);
        const result = await visitor.json(`/public/crosses/${born.id}`);
        assert.equal(result.litter.birthDate, '2026-10-01');
        assert.equal(result.litter.puppies.length, 1);
        assert.equal('notes' in result.litter, false);
        await admin.json(`/catalog/dogs/${puppy.id}`, 'PATCH', { ...pub, salePublished: false });
        assert.equal((await visitor.call(`/public/crosses/${born.id}`)).status, 404);
      },
    );
    await t.test('contactos sólo editables por administración y enlaces sociales seguros', async () => {
      await admin.json('/inquiries/settings', 'PATCH', settings);
      assert.deepEqual(await visitor.json('/public/settings'), settings);
      for (const actor of [visitor, client, trainer])
        assert.equal(
          (await actor.call('/inquiries/settings', 'PATCH', settings)).status,
          actor === visitor ? 401 : 403,
        );
      for (const url of [
        'javascript:alert(1)',
        'https://evil.example/instagram.com',
        'https://instagram.com@evil.example',
        'http://instagram.com/oryx',
      ])
        assert.equal(
          (await admin.call('/inquiries/settings', 'PATCH', { ...settings, instagramUrl: url })).status,
          400,
        );
    });
    await t.test(
      'solicitudes sin cuenta ni WhatsApp, idempotencia y aviso privado al administrador',
      async () => {
        const body = request({
          email: 'purchase@example.invalid',
          kind: 'PURCHASE',
          interestKind: 'DOG',
          interestId: dog.id,
        });
        const before = (await admin.json('/notifications/summary')).unread;
        const receipts = await Promise.all([
          visitor.json('/public/inquiries', 'POST', body, 201),
          visitor.json('/public/inquiries', 'POST', body, 201),
        ]);
        for (const receipt of receipts) {
          assert.equal(receipt.received, true);
          assert.equal('id' in receipt, false);
        }
        assert.equal(await db.customerInquiry.count({ where: { requestKey: body.requestKey } }), 1);
        assert.equal((await admin.json('/notifications/summary')).unread, before + 1);
        const inquiry = await db.customerInquiry.findUniqueOrThrow({
          where: { requestKey: body.requestKey },
        });
        assert.equal(inquiry.interestLabel, dog.name);
        assert.equal(
          (
            await visitor.call('/public/inquiries', 'POST', {
              ...body,
              message: 'Cambio de contenido con la misma clave.',
            })
          ).status,
          409,
        );
        for (const actor of [visitor, client, trainer])
          assert.equal((await actor.call('/inquiries')).status, actor === visitor ? 401 : 403);
        assert.equal((await client.json('/notifications/summary')).unread, 0);
        const result = await admin.json('/inquiries?kind=PURCHASE');
        assert.ok(result.items.some((i: any) => i.id === inquiry.id));
        assert.ok(!('payloadHash' in result.items[0]));
        await admin.json(`/inquiries/${inquiry.id}`, 'PATCH', {
          status: 'IN_PROGRESS',
          adminNotes: 'Contactar por correo.',
        });
      },
    );
    await t.test('rechaza datos inválidos, referencias ocultas, origen externo y spam', async () => {
      for (const extra of [
        { consent: false },
        { email: null },
        { role: 'ADMIN' },
        { interestKind: 'DOG', interestId: hidden.id },
        { preferredContact: 'WHATSAPP', phone: null },
      ]) {
        const res = await visitor.call('/public/inquiries', 'POST', request(extra));
        assert.ok([400, 404].includes(res.status));
      }
      const external = await fetch(runtime.api + '/public/inquiries', {
        method: 'POST',
        headers: { origin: 'https://foreign.example', 'content-type': 'application/json' },
        body: JSON.stringify(request()),
      });
      assert.equal(external.status, 403);
      const bot = request({ website: 'https://bot.example' });
      await visitor.json('/public/inquiries', 'POST', bot, 201);
      assert.equal(await db.customerInquiry.count({ where: { requestKey: bot.requestKey } }), 0);
      for (let n = 0; n < 5; n++)
        await visitor.json('/public/inquiries', 'POST', request({ email: 'rate@example.invalid' }), 201);
      assert.equal(
        (await visitor.call('/public/inquiries', 'POST', request({ email: 'rate@example.invalid' }))).status,
        429,
      );
    });
    await t.test(
      'sólo administración aprueba una cuenta de cliente una vez y sin asignar perros por defecto',
      async () => {
        const body = request({
          kind: 'ACCOUNT',
          name: 'Cuenta solicitada',
          email: 'new-account@example.invalid',
          partyKind: 'MUNICIPALITY',
          organization: 'Municipalidad de prueba',
        });
        const usersBefore = await db.user.count();
        await visitor.json('/public/inquiries', 'POST', body, 201);
        assert.equal(await db.user.count(), usersBefore);
        const inquiry = await db.customerInquiry.findUniqueOrThrow({
          where: { requestKey: body.requestKey },
        });
        const approval = { username: 'public-approved', password };
        for (const actor of [visitor, client, trainer])
          assert.equal(
            (await actor.call(`/inquiries/${inquiry.id}/approve`, 'POST', approval)).status,
            actor === visitor ? 401 : 403,
          );
        assert.equal(
          (await admin.call(`/inquiries/${inquiry.id}/approve`, 'POST', { ...approval, role: 'ADMIN' }))
            .status,
          400,
        );
        assert.equal(
          (
            await admin.call(`/inquiries/${inquiry.id}/approve`, 'POST', {
              ...approval,
              partyId: unitOwnership.ownerPartyId,
            })
          ).status,
          400,
        );
        const user = await admin.json(`/inquiries/${inquiry.id}/approve`, 'POST', approval, 201);
        assert.equal(user.role, 'CLIENT');
        assert.equal('passwordHash' in user, false);
        assert.equal((await admin.call(`/inquiries/${inquiry.id}/approve`, 'POST', approval)).status, 409);
        assert.equal((await admin.call(`/inquiries/${inquiry.id}`, 'PATCH', { status: 'NEW' })).status, 409);
        const approved = new Api();
        await approved.login(approval.username, password);
        assert.equal((await approved.json('/portal/dogs')).total, 0);
        assert.equal(
          (await db.party.findUniqueOrThrow({ where: { id: user.partyId } })).kind,
          'MUNICIPALITY',
        );
      },
    );
    await writeFile(
      '.local/public-test-fixtures.json',
      JSON.stringify({ dogId: dog.id, crossId: cross.id, privateDogId: hidden.id, password }),
    );
  } finally {
    await db.$disconnect();
  }
});
