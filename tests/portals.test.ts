import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { Api, unitOwnership } from './client';

test('Portales: propiedad, asignación, historial privado y publicación controlada', async (t) => {
  const admin = new Api(),
    clientA = new Api(),
    clientB = new Api(),
    trainerA = new Api(),
    trainerB = new Api(),
    municipal = new Api();
  await admin.login();
  const password = 'PortalesSinteticos2026!';
  const users: Record<string, any> = {};
  for (const [name, role, actor] of [
    ['cliente-a', 'CLIENT', clientA],
    ['cliente-b', 'CLIENT', clientB],
    ['entrenador-a', 'TRAINER', trainerA],
    ['entrenador-b', 'TRAINER', trainerB],
  ] as const) {
    users[name] = await admin.json(
      '/users',
      'POST',
      {
        name: `TEST ${name}`,
        username: `portal-${name}`,
        role,
        password,
        ...(name === 'cliente-b' ? { partyKind: 'MUNICIPALITY', partyName: 'Municipalidad TEST' } : {}),
      },
      201,
    );
    await actor.login(`portal-${name}`, password);
  }
  await admin.json(
    '/users',
    'POST',
    {
      name: 'Segundo acceso municipal TEST',
      username: 'portal-municipal',
      role: 'CLIENT',
      partyId: users['cliente-b'].partyId,
      password,
    },
    201,
  );
  await municipal.login('portal-municipal', password);
  const a = await admin.json(
    '/dogs',
    'POST',
    {
      name: 'Propio A TEST',
      breed: 'Prueba',
      sex: 'MALE',
      ownerPartyId: users['cliente-a'].partyId,
      assignedTrainerId: users['entrenador-a'].id,
      notes: 'NOTA_INTERNA_A',
    },
    201,
  );
  const b = await admin.json(
    '/dogs',
    'POST',
    {
      name: 'Municipal B TEST',
      breed: 'Prueba',
      sex: 'FEMALE',
      ownerPartyId: users['cliente-b'].partyId,
      custodianPartyId: users['cliente-a'].partyId,
      assignedTrainerId: users['entrenador-b'].id,
    },
    201,
  );
  const sale = await admin.json(
    '/dogs',
    'POST',
    { name: 'Venta TEST', breed: 'Prueba', sex: 'MALE', notes: 'SECRETO_INTERNO_VENTA' },
    201,
  );
  const training = {
    occurredAt: new Date().toISOString(),
    discipline: 'Obediencia TEST',
    objective: 'Objetivo privado',
    durationMinutes: 20,
    notes: 'DETALLE_ENTRENAMIENTO_COMPLETO',
  };
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const medical = {
    eventDate: day,
    kind: 'CONSULTATION',
    title: 'Consulta TEST',
    notes: 'DETALLE_MEDICO_COMPLETO',
    professional: 'Profesional TEST',
  };
  const publication = {
    commercialCategory: 'FOR_SALE',
    salePublished: true,
    salePrice: '50000.25',
    saleCurrency: 'CRC',
    saleContact: 'Contacto TEST 0000-0000',
    publicDescription: 'Descripción autorizada',
    healthSummary: 'SALUD_PUBLICA_AUTORIZADA',
    achievements: 'Logro autorizado',
    pedigreeSummary: 'Pedigrí autorizado',
  };
  let clinical: any, photo: any, cross: any, dam: any, sire: any;
  const photoBytes = await readFile('assets/branding/oryx-logo.png');
  async function upload(dogId: string, category: string) {
    const form = new FormData();
    form.set('file', new Blob([photoBytes], { type: 'image/png' }), 'prueba.png');
    form.set('category', category);
    return admin.json(`/dogs/${dogId}/documents`, 'POST', form, 201);
  }
  await t.test('sólo tres roles; administración y propiedad obligatoria protegidas', async () => {
    for (const role of ['SUPERADMIN', 'VET', 'FINANCE', 'VIEWER'])
      assert.equal(
        (
          await admin.call('/users', 'POST', {
            name: 'Inválido',
            username: `invalid-${role.toLowerCase()}`,
            role,
            password,
          })
        ).status,
        400,
      );
    assert.equal(
      (await admin.call('/dogs', 'POST', { name: 'Sin propietario', breed: 'Prueba', sex: 'MALE' })).status,
      400,
    );
    for (const actor of [clientA, trainerA])
      for (const path of [
        '/dogs',
        '/dogs/export.csv',
        '/dashboard',
        '/users',
        '/parties',
        '/contracts',
        '/breeding/plans',
        '/finance/accounts',
        '/inventory/products',
        '/audit',
        '/system/status',
      ])
        assert.equal((await actor.call(path)).status, 403, path);
    assert.equal((await new Api().call('/portal/gallery/dogs')).status, 401);
    assert.equal((await clientA.call('/trainer/dogs')).status, 403);
    assert.equal((await trainerA.call('/portal/dogs')).status, 403);
  });
  await t.test('propiedad limita clientes y municipios; la custodia no concede acceso', async () => {
    assert.deepEqual(
      (await clientA.json('/portal/dogs')).items.map((d: any) => d.id),
      [a.id],
    );
    assert.deepEqual(
      (await clientB.json('/portal/dogs')).items.map((d: any) => d.id),
      [b.id],
    );
    assert.deepEqual(
      (await municipal.json('/portal/dogs')).items.map((d: any) => d.id),
      [b.id],
    );
    assert.equal((await clientA.call(`/portal/dogs/${b.id}`)).status, 404);
    assert.equal((await clientB.call(`/portal/dogs/${a.id}`)).status, 404);
    assert.equal((await clientA.call(`/dogs/${a.id}`, 'PATCH', { name: 'No permitido' })).status, 403);
  });
  await t.test('entrenador añade sólo a asignados y no modifica ni elimina', async () => {
    assert.deepEqual(
      (await trainerA.json('/trainer/dogs')).items.map((d: any) => d.id),
      [a.id],
    );
    assert.equal((await trainerA.call(`/trainer/dogs/${b.id}`)).status, 404);
    for (const [suffix, body] of [
      ['training', training],
      ['medical', medical],
      ['vaccinations', { product: 'Vacuna TEST', appliedDate: day, notes: 'VACUNA_COMPLETA' }],
      ['weights', { date: day, kg: 22.5 }],
    ] as const) {
      assert.equal((await trainerA.call(`/trainer/dogs/${b.id}/${suffix}`, 'POST', body)).status, 404);
      await trainerA.json(`/trainer/dogs/${a.id}/${suffix}`, 'POST', body, 201);
    }
    const detail = await trainerA.json(`/trainer/dogs/${a.id}`);
    const record = detail.medicalEntries[0];
    assert.equal((await trainerA.call(`/trainer/medical/${record.id}`, 'PATCH', medical)).status, 403);
    assert.equal((await trainerA.call(`/trainer/medical/${record.id}`, 'DELETE')).status, 403);
    assert.equal((await trainerA.call(`/dogs/${a.id}`, 'DELETE')).status, 403);
    assert.equal((await trainerA.call(`/catalog/dogs/${a.id}`, 'PATCH', publication)).status, 403);
    assert.equal('movements' in detail, false);
    const form = new FormData();
    form.set('file', new Blob(['%PDF-1.7\nMEDICAL TEST'], { type: 'application/pdf' }), 'medico.pdf');
    assert.equal((await trainerA.call(`/trainer/dogs/${b.id}/documents`, 'POST', form)).status, 404);
    clinical = await trainerA.json(`/trainer/dogs/${a.id}/documents`, 'POST', form, 201);
    const other = await upload(a.id, 'DOCUMENT');
    assert.equal((await trainerA.call(`/trainer/documents/${other.id}/download`)).status, 404);
    assert.equal((await clientA.call(`/portal/documents/${other.id}/download`)).status, 200);
  });
  await t.test('el propietario consulta todo el historial médico y sus archivos', async () => {
    const detail = await clientA.json(`/portal/dogs/${a.id}`);
    assert.equal(detail.medicalEntries[0].notes, medical.notes);
    assert.equal(detail.trainingSessions[0].notes, training.notes);
    assert.equal(detail.vaccinations[0].notes, 'VACUNA_COMPLETA');
    assert.equal(detail.weights[0].kg, 22.5);
    assert.ok(detail.documents.some((d: any) => d.id === clinical.id));
    assert.equal((await clientA.call(`/portal/documents/${clinical.id}/download`)).status, 200);
    assert.equal((await clientB.call(`/portal/documents/${clinical.id}/download`)).status, 404);
    assert.equal((await trainerB.call(`/trainer/documents/${clinical.id}/download`)).status, 404);
  });
  await t.test('venta exige publicación completa y expone sólo contenido autorizado', async () => {
    photo = await upload(sale.id, 'PHOTO');
    await admin.json(
      `/trainer/dogs/${sale.id}/medical`,
      'POST',
      { ...medical, notes: 'SECRETO_MEDICO_VENTA' },
      201,
    );
    assert.equal((await clientA.call(`/portal/gallery/photos/${photo.id}`)).status, 404);
    assert.equal(
      (await admin.call(`/catalog/dogs/${sale.id}`, 'PATCH', { ...publication, salePrice: null })).status,
      400,
    );
    assert.equal(
      (await admin.call(`/catalog/dogs/${sale.id}`, 'PATCH', { ...publication, saleContact: '' })).status,
      400,
    );
    await admin.json(`/catalog/dogs/${sale.id}`, 'PATCH', publication);
    const result = await clientA.json(`/portal/gallery/dogs/${sale.id}`);
    assert.equal(result.healthSummary, publication.healthSummary);
    assert.equal(result.salePrice, '50000.25');
    assert.equal(result.pedigreeSummary, 'Pedigrí autorizado');
    for (const field of [
      'medicalEntries',
      'vaccinations',
      'notes',
      'ownerParty',
      'custodianParty',
      'ownerPartyId',
      'documents',
      'trainingSessions',
    ])
      assert.equal(field in result, false, field);
    assert.doesNotMatch(JSON.stringify(result), /SECRETO_/);
    assert.equal((await clientA.call(`/portal/gallery/photos/${photo.id}`)).status, 200);
    await admin.json(`/catalog/dogs/${sale.id}`, 'PATCH', { ...publication, salePublished: false });
    assert.equal((await clientA.call(`/portal/gallery/dogs/${sale.id}`)).status, 404);
    assert.equal((await clientA.call(`/portal/gallery/photos/${photo.id}`)).status, 404);
    await admin.json(`/catalog/dogs/${sale.id}`, 'PATCH', publication);
    await admin.json(`/dogs/${sale.id}`, 'PATCH', { availability: 'UNAVAILABLE' });
    assert.equal((await clientA.call(`/portal/gallery/dogs/${sale.id}`)).status, 404);
    await admin.json(`/dogs/${sale.id}`, 'PATCH', { availability: 'AVAILABLE' });
  });
  await t.test('preventa sólo para cruces administrados entre padres disponibles', async () => {
    dam = await admin.json(
      '/dogs',
      'POST',
      { name: 'Madre portal TEST', breed: 'Prueba', sex: 'FEMALE' },
      201,
    );
    sire = await admin.json(
      '/dogs',
      'POST',
      { name: 'Padre portal TEST', breed: 'Prueba', sex: 'MALE' },
      201,
    );
    const data = {
      damId: dam.id,
      sireId: sire.id,
      plannedDate: day,
      status: 'PLANNED',
      published: true,
      publicTitle: 'Camada futura TEST',
      publicDescription: 'Preventa autorizada',
      puppyPrice: '100000',
      currency: 'CRC',
      contact: 'Contacto TEST',
    };
    assert.equal((await trainerA.call('/breeding/plans', 'POST', data)).status, 403);
    assert.equal((await admin.call('/breeding/plans', 'POST', data)).status, 400);
    for (const parent of [dam, sire])
      await admin.json(`/catalog/dogs/${parent.id}`, 'PATCH', {
        commercialCategory: 'FOR_BREEDING',
        salePublished: false,
        saleCurrency: 'CRC',
        healthSummary: 'Padre autorizado',
        pedigreeSummary: 'Linaje autorizado',
      });
    cross = await admin.json('/breeding/plans', 'POST', data, 201);
    const parentPhoto = await upload(dam.id, 'PHOTO');
    const list = await clientA.json('/portal/gallery/crosses');
    const item = list.items.find((c: any) => c.id === cross.id);
    assert.ok(item);
    assert.equal(item.dam.id, dam.id);
    assert.equal(item.sire.id, sire.id);
    assert.equal(item.puppyPrice, '100000');
    assert.equal('notes' in item.dam, false);
    assert.equal((await clientA.call(`/portal/gallery/photos/${parentPhoto.id}`)).status, 200);
    assert.equal((await clientA.call(`/portal/gallery/dogs/${dam.id}`)).status, 404);
    await admin.json(`/catalog/dogs/${dam.id}`, 'PATCH', {
      commercialCategory: 'NOT_LISTED',
      salePublished: false,
      saleCurrency: 'CRC',
    });
    assert.ok(!(await clientA.json('/portal/gallery/crosses')).items.some((c: any) => c.id === cross.id));
    assert.equal((await clientA.call(`/portal/gallery/photos/${parentPhoto.id}`)).status, 404);
    await admin.json(`/catalog/dogs/${dam.id}`, 'PATCH', {
      commercialCategory: 'FOR_BREEDING',
      salePublished: false,
      saleCurrency: 'CRC',
      healthSummary: 'Padre autorizado',
    });
  });
  await t.test('reasignación, cambio de propietario y custodia aplican de inmediato', async () => {
    await admin.json(
      `/dogs/${a.id}/movements`,
      'POST',
      {
        date: new Date().toISOString(),
        location: 'Custodia municipal TEST',
        custodianPartyId: users['cliente-b'].partyId,
      },
      201,
    );
    const moved = await admin.json(`/dogs/${a.id}`);
    assert.equal(moved.custodianPartyId, users['cliente-b'].partyId);
    assert.equal(moved.ownerPartyId, users['cliente-a'].partyId);
    assert.equal((await clientB.call(`/portal/dogs/${a.id}`)).status, 404);
    await admin.json(`/dogs/${a.id}`, 'PATCH', {
      assignedTrainerId: users['entrenador-b'].id,
      ownerPartyId: users['cliente-b'].partyId,
    });
    assert.equal((await trainerA.call(`/trainer/dogs/${a.id}/training`, 'POST', training)).status, 404);
    assert.equal((await trainerA.call(`/trainer/documents/${clinical.id}/download`)).status, 404);
    assert.equal((await clientA.call(`/portal/dogs/${a.id}`)).status, 404);
    assert.equal((await clientA.call(`/portal/documents/${clinical.id}/download`)).status, 404);
    assert.equal((await clientB.json(`/portal/dogs/${a.id}`)).medicalEntries[0].notes, medical.notes);
    await trainerB.json(`/trainer/dogs/${a.id}/training`, 'POST', training, 201);
    // Restore fixture for browser tests while exercising immediate revocation.
    await admin.json(`/dogs/${a.id}`, 'PATCH', {
      assignedTrainerId: users['entrenador-a'].id,
      ownerPartyId: users['cliente-a'].partyId,
      custodianPartyId: unitOwnership.custodianPartyId,
    });
    await admin.json(`/users/${users['entrenador-b'].id}`, 'PATCH', { active: false });
    assert.equal((await trainerB.call('/auth/me')).status, 401);
    assert.equal((await admin.json(`/dogs/${b.id}`)).assignedTrainerId, null);
  });
  await writeFile(
    '.local/portal-test-fixtures.json',
    JSON.stringify({ password, users, a, b, sale, cross, dam, sire }),
  );
});
