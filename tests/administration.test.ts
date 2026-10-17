import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import pg from 'pg';
import { Api, runtime } from './client';
const admin = new Api(),
  finance = new Api(),
  vet = new Api(),
  trainer = new Api();
const day = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Costa_Rica',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const before = new Date(Date.parse(`${day}T00:00:00Z`) - 70 * 86400000).toISOString().slice(0, 10);
const future = new Date(Date.parse(`${day}T00:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10);
test('Fase 3: crianza, apartados, cuentas e inventario persistentes', async (t) => {
  await admin.login();
  const password = 'AdministracionPrueba2026!';
  for (const [client, role, username] of [
    [finance, 'ADMIN', 'phase3-finance'],
    [vet, 'ADMIN', 'phase3-vet'],
    [trainer, 'TRAINER', 'phase3-trainer'],
  ] as const) {
    await admin.json('/users', 'POST', { name: `Fase3 ${role}`, username, password, role }, 201);
    await client.login(username, password);
  }
  let dam: any,
    sire: any,
    plan: any,
    litter: any,
    puppy: any,
    reservation: any,
    account: any,
    lot: any,
    product: any;
  await t.test('roles protegen crianza, datos de compradores y estados financieros', async () => {
    for (const path of ['/finance/accounts', 'finance/summary', '/reservations', '/inventory/products']) {
      assert.equal((await trainer.call(path.startsWith('/') ? path : `/${path}`)).status, 403);
    }
    assert.equal((await trainer.call('/breeding/plans')).status, 403);
    assert.equal((await trainer.call('/breeding/dogs')).status, 403);
    assert.equal((await new Api().call('/finance/accounts')).status, 401);
    dam = await admin.json(
      '/dogs',
      'POST',
      { name: 'Madre CRIANZA PRUEBA', sex: 'FEMALE', breed: 'Prueba', birthDate: '2020-01-01' },
      201,
    );
    sire = await admin.json(
      '/dogs',
      'POST',
      { name: 'Padre CRIANZA PRUEBA', sex: 'MALE', breed: 'Prueba', birthDate: '2020-01-02' },
      201,
    );
  });
  await t.test('pedigrí rechaza ciclos; ventana de gestación exige método y profesional', async () => {
    for (const parent of [dam, sire])
      await admin.json(`/catalog/dogs/${parent.id}`, 'PATCH', {
        commercialCategory: 'FOR_BREEDING',
        salePublished: false,
        saleCurrency: 'CRC',
      });
    await vet.json(`/breeding/dogs/${dam.id}`, 'PATCH', {
      pedigreeQuality: 'UNKNOWN',
      healthNotes: 'Registro SINTÉTICO',
      expectedRevision: 0,
    });
    await vet.json(
      `/breeding/dogs/${dam.id}/events`,
      'POST',
      { kind: 'HEAT', eventDate: before, notes: 'Observación de prueba' },
      201,
    );
    const ancestor = await admin.json(
      '/dogs',
      'POST',
      { name: 'Ancestro SINTÉTICO', sex: 'MALE', breed: 'Prueba' },
      201,
    );
    await vet.json(`/breeding/dogs/${sire.id}`, 'PATCH', {
      sireId: ancestor.id,
      pedigreeQuality: 'REPORTED',
      expectedRevision: 0,
    });
    assert.equal(
      (
        await vet.call(`/breeding/dogs/${ancestor.id}`, 'PATCH', {
          sireId: sire.id,
          pedigreeQuality: 'REPORTED',
          expectedRevision: 0,
        })
      ).status,
      400,
    );
    const payload = {
      damId: dam.id,
      sireId: sire.id,
      plannedDate: before,
      matingDate: before,
      status: 'CONFIRMED',
      windowStart: day,
      windowEnd: future,
    };
    assert.equal((await vet.call('/breeding/plans', 'POST', payload)).status, 400);
    plan = await vet.json(
      '/breeding/plans',
      'POST',
      {
        ...payload,
        estimationMethod: 'Ventana SINTÉTICA ingresada para prueba',
        professional: 'Profesional SINTÉTICO',
      },
      201,
    );
    const ancestry = await vet.json(`/breeding/plans/${plan.id}/ancestry`);
    assert.equal(ancestry.incomplete, true);
    assert.match(ancestry.notice, /no se puede descartar/);
    assert.equal(
      (await vet.call(`/breeding/plans/${plan.id}`, 'PATCH', { notes: 'Stale', expectedRevision: 9 })).status,
      409,
    );
  });
  await t.test('camada mantiene identidad, peso y vacunas del cachorro al incorporarlo', async () => {
    litter = await vet.json(
      '/breeding/litters',
      'POST',
      {
        code: 'CAMADA-TEST',
        damId: dam.id,
        sireId: sire.id,
        planId: plan.id,
        birthDate: day,
        liveBorn: 2,
        stillBorn: 0,
      },
      201,
    );
    puppy = await vet.json(
      `/breeding/litters/${litter.id}/puppies`,
      'POST',
      {
        name: 'Cachorro CRIANZA PRUEBA',
        sex: 'FEMALE',
        breed: 'Prueba',
        coat: 'Prueba',
        microchip: 'PUPPY-TEST-001',
        weightKg: 0.42,
      },
      201,
    );
    await admin.json(
      `/dogs/${puppy.id}/vaccinations`,
      'POST',
      { product: 'Vacuna SINTÉTICA', appliedDate: day },
      201,
    );
    assert.equal(
      (await admin.json('/dogs?pageSize=100')).items.some((d: any) => d.id === puppy.id),
      false,
    );
    const promoted = await admin.json(`/breeding/puppies/${puppy.id}/promote`, 'POST', {}, 201);
    assert.equal(promoted.id, puppy.id);
    assert.equal(promoted.isPuppy, false);
    const detail = await admin.json(`/dogs/${puppy.id}`);
    assert.equal(detail.vaccinations.length, 1);
    assert.equal(detail.weights[0].kg, 0.42);
    assert.equal(detail.litterId, litter.id);
    const second = await vet.json(
      `/breeding/litters/${litter.id}/puppies`,
      'POST',
      { name: 'Segundo cachorro TEST', sex: 'MALE', breed: 'Prueba' },
      201,
    );
    assert.ok(second.id);
    assert.equal(
      (
        await vet.call(`/breeding/litters/${litter.id}/puppies`, 'POST', {
          name: 'Exceso',
          sex: 'MALE',
          breed: 'Prueba',
        })
      ).status,
      409,
    );
  });
  await t.test('dos apartados simultáneos del cachorro generan una reserva y un conflicto', async () => {
    const buyer = await admin.json('/parties', 'POST', { name: 'Comprador SINTÉTICO', kind: 'PERSON' }, 201);
    const data = {
      customerPartyId: buyer.id,
      litterId: litter.id,
      dogId: puppy.id,
      customer: 'Comprador SINTÉTICO',
      reservedDate: day,
      expiresDate: future,
      amount: '100.30',
      currency: 'USD',
    };
    const responses = await Promise.all([
      finance.call('/reservations', 'POST', data),
      admin.call('/reservations', 'POST', data),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
    reservation = await responses.find((r) => r.status === 201)!.json();
    account = reservation.account;
    assert.equal((await admin.json(`/dogs/${puppy.id}`)).availability, 'RESERVED');
    assert.equal((await admin.call(`/dogs/${puppy.id}`, 'PATCH', { availability: 'AVAILABLE' })).status, 409);
    assert.equal(
      (
        await admin.call(`/reservations/${reservation.id}/close`, 'POST', {
          status: 'DELIVERED',
          closedDate: day,
          reason: 'Prueba',
        })
      ).status,
      409,
    );
  });
  await t.test('abonos exactos, idempotencia, concurrencia y entrega pagada', async () => {
    const first = { amount: '0.10', paidDate: day, method: 'Prueba', requestId: randomUUID() };
    const a = await finance.json(`/finance/accounts/${account.id}/payments`, 'POST', first, 201);
    const b = await finance.json(`/finance/accounts/${account.id}/payments`, 'POST', first, 201);
    assert.equal(a.id, b.id);
    assert.equal(
      (await finance.call(`/finance/accounts/${account.id}/payments`, 'POST', { ...first, amount: '0.20' }))
        .status,
      409,
    );
    await finance.json(
      `/finance/accounts/${account.id}/payments`,
      'POST',
      { ...first, amount: '0.20', requestId: randomUUID() },
      201,
    );
    assert.equal((await finance.json(`/finance/accounts/${account.id}`)).balance, '100');
    const results = await Promise.all([
      finance.call(`/finance/accounts/${account.id}/payments`, 'POST', {
        ...first,
        amount: '100',
        requestId: randomUUID(),
      }),
      admin.call(`/finance/accounts/${account.id}/payments`, 'POST', {
        ...first,
        amount: '100',
        requestId: randomUUID(),
      }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    const paid = await finance.json(`/finance/accounts/${account.id}`);
    assert.equal(paid.balance, '0');
    assert.equal(paid.paid, '100.3');
    assert.equal(paid.status, 'PAID');
    await admin.json(
      `/reservations/${reservation.id}/close`,
      'POST',
      { status: 'DELIVERED', closedDate: day, reason: 'Entrega SINTÉTICA' },
      201,
    );
    assert.equal((await admin.json(`/dogs/${puppy.id}`)).administrativeStatus, 'SOLD');
    assert.equal(
      (
        await admin.call('/reservations', 'POST', {
          litterId: litter.id,
          dogId: puppy.id,
          customer: 'Duplicado',
          reservedDate: day,
          expiresDate: future,
          amount: '100',
          currency: 'USD',
        })
      ).status,
      409,
    );
  });
  await t.test('cuentas por pagar, devoluciones, adjuntos privados y resumen por moneda', async () => {
    const payable = await finance.json(
      '/finance/accounts',
      'POST',
      {
        direction: 'PAYABLE',
        party: 'Proveedor SINTÉTICO',
        concept: 'Alimento de prueba',
        category: 'Alimentación',
        amount: '12345.67',
        currency: 'CRC',
        issueDate: day,
        dueDate: future,
      },
      201,
    );
    await finance.json(
      `/finance/accounts/${payable.id}/payments`,
      'POST',
      { amount: '45.67', paidDate: day, method: 'Transferencia TEST', requestId: randomUUID() },
      201,
    );
    assert.equal((await finance.json(`/finance/accounts/${payable.id}`)).balance, '12300');
    assert.equal(
      (await finance.call(`/finance/accounts/${payable.id}/cancel`, 'POST', { reason: 'Prueba' })).status,
      409,
    );
    await finance.json(
      `/finance/accounts/${payable.id}/payments`,
      'POST',
      { kind: 'REFUND', amount: '45.67', paidDate: day, method: 'Reversión TEST', requestId: randomUUID() },
      201,
    );
    const file = new FormData();
    file.set(
      'file',
      new Blob(['%PDF-1.7\nTEST ACCOUNT ONLY'], { type: 'application/pdf' }),
      'comprobante-prueba.pdf',
    );
    const f = await finance.json(`/finance/accounts/${payable.id}/files`, 'POST', file, 201);
    assert.equal((await trainer.call(`/finance/accounts/${payable.id}/files/${f.id}/download`)).status, 403);
    assert.equal((await finance.call(`/finance/accounts/${payable.id}/files/${f.id}/download`)).status, 200);
    const summary = await finance.json('/finance/summary');
    assert.equal(
      summary.totals.find((s: any) => s.currency === 'CRC' && s.direction === 'PAYABLE').balance,
      '12345.67',
    );
    assert.equal(
      summary.totals.find((s: any) => s.currency === 'USD' && s.direction === 'RECEIVABLE').amount,
      '100.3',
    );
    const report = await finance.call(`/finance/accounts/${payable.id}/report.pdf`);
    assert.equal(report.status, 200);
    await writeFile('.local/account-report-test.pdf', Buffer.from(await report.arrayBuffer()));
    const csv = await finance.call('/finance/export.csv');
    assert.equal(csv.status, 200);
    assert.match(await csv.text(), /12345.67/);
    await finance.json(
      `/finance/accounts/${payable.id}/cancel`,
      'POST',
      { reason: 'Cancelación SINTÉTICA' },
      201,
    );
  });
  await t.test(
    'inventario conserva decimales, rechaza consumo concurrente excesivo y lote vencido',
    async () => {
      product = await finance.json(
        '/inventory/products',
        'POST',
        { sku: 'TEST-FOOD', name: 'Alimento SINTÉTICO', category: 'Alimento', unit: 'kg', minimum: '1.500' },
        201,
      );
      lot = await finance.json(
        `/inventory/products/${product.id}/lots`,
        'POST',
        { batch: 'TEST-001', unitCost: '1200.50', currency: 'CRC', expiresDate: future },
        201,
      );
      const input = {
        kind: 'IN',
        quantity: '2.300',
        movementDate: day,
        reason: 'Entrada SINTÉTICA',
        requestId: randomUUID(),
      };
      const first = await finance.json(`/inventory/lots/${lot.id}/movements`, 'POST', input, 201);
      const again = await finance.json(`/inventory/lots/${lot.id}/movements`, 'POST', input, 201);
      assert.equal(first.id, again.id);
      const outputs = await Promise.all([
        admin.call(`/inventory/lots/${lot.id}/movements`, 'POST', {
          ...input,
          kind: 'OUT',
          quantity: '2',
          requestId: randomUUID(),
        }),
        finance.call(`/inventory/lots/${lot.id}/movements`, 'POST', {
          ...input,
          kind: 'OUT',
          quantity: '2',
          requestId: randomUUID(),
        }),
      ]);
      assert.deepEqual(outputs.map((r) => r.status).sort(), [201, 409]);
      const stock = await finance.json(`/inventory/products/${product.id}`);
      assert.equal(stock.lots[0].quantity, '0.3');
      assert.equal(
        (await finance.json('/inventory/products')).items.find((p: any) => p.id === product.id).lowStock,
        true,
      );
      const expired = await finance.json(
        `/inventory/products/${product.id}/lots`,
        'POST',
        { batch: 'TEST-EXPIRED', unitCost: '1', currency: 'CRC', expiresDate: before },
        201,
      );
      await finance.json(
        `/inventory/lots/${expired.id}/movements`,
        'POST',
        { ...input, requestId: randomUUID() },
        201,
      );
      assert.equal(
        (
          await finance.call(`/inventory/lots/${expired.id}/movements`, 'POST', {
            ...input,
            kind: 'OUT',
            quantity: '1',
            requestId: randomUUID(),
          })
        ).status,
        409,
      );
      await finance.json(
        `/inventory/lots/${expired.id}/movements`,
        'POST',
        { ...input, kind: 'DISPOSAL', quantity: '2.3', requestId: randomUUID() },
        201,
      );
    },
  );
  await t.test('PostgreSQL impide alterar pagos y movimientos históricos', async () => {
    const db = new pg.Client({ connectionString: runtime.env.DATABASE_URL });
    await db.connect();
    try {
      await assert.rejects(db.query('UPDATE "Payment" SET amount=0'));
      await assert.rejects(db.query('DELETE FROM "StockMovement"'));
      await assert.rejects(db.query('UPDATE "StockLot" SET quantity=-1 WHERE id=$1', [lot.id]));
    } finally {
      await db.end();
    }
  });
  await t.test('apartado de camada admite asignación y cancelación tras devolver el anticipo', async () => {
    const second = (await vet.json(`/breeding/litters/${litter.id}`)).puppies.find(
      (d: any) => d.id !== puppy.id,
    );
    const held = await finance.json(
      '/reservations',
      'POST',
      {
        litterId: litter.id,
        customer: 'Reserva general TEST',
        reservedDate: day,
        expiresDate: future,
        amount: '50.10',
        currency: 'USD',
      },
      201,
    );
    await finance.json(`/reservations/${held.id}/allocate`, 'POST', { dogId: second.id }, 201);
    const payment = { amount: '10.10', paidDate: day, method: 'Prueba', requestId: randomUUID() };
    await finance.json(`/finance/accounts/${held.account.id}/payments`, 'POST', payment, 201);
    assert.equal(
      (
        await admin.call(`/reservations/${held.id}/close`, 'POST', {
          status: 'CANCELLED',
          closedDate: day,
          reason: 'Prueba',
        })
      ).status,
      409,
    );
    await finance.json(
      `/finance/accounts/${held.account.id}/payments`,
      'POST',
      { ...payment, kind: 'REFUND', requestId: randomUUID() },
      201,
    );
    await admin.json(
      `/reservations/${held.id}/close`,
      'POST',
      { status: 'CANCELLED', closedDate: day, reason: 'Cancelación de prueba' },
      201,
    );
    assert.equal((await admin.json(`/dogs/${second.id}`)).availability, 'AVAILABLE');
    assert.equal((await finance.json(`/finance/accounts/${held.account.id}`)).status, 'CANCELLED');
    await admin.json(`/breeding/puppies/${second.id}/promote`, 'POST', {}, 201);
    const org = await admin.json(
      '/institutions',
      'POST',
      { name: 'Cruce dominios TEST', kind: 'Empresa' },
      201,
    );
    const contract = await admin.json(
      '/contracts',
      'POST',
      {
        number: 'CROSS-DOMAIN-TEST',
        institutionId: org.id,
        title: 'Prueba disponibilidad',
        amount: '1',
        currency: 'CRC',
        periodicity: 'Único',
        startDate: day,
        endDate: future,
        status: 'ACTIVE',
        responsible: 'Prueba',
      },
      201,
    );
    const assigned = await admin.json(
      `/contracts/${contract.id}/assignments`,
      'POST',
      {
        dogId: second.id,
        handlerId: (await admin.json('/auth/me')).id,
        role: 'Prueba',
        startDate: day,
        endDate: future,
      },
      201,
    );
    assert.equal(
      (
        await finance.call('/reservations', 'POST', {
          litterId: litter.id,
          dogId: second.id,
          customer: 'Asignado TEST',
          reservedDate: day,
          expiresDate: future,
          amount: '1',
          currency: 'USD',
        })
      ).status,
      409,
    );
    assert.equal(
      (await admin.call(`/dogs/${second.id}`, 'PATCH', { availability: 'UNAVAILABLE' })).status,
      409,
    );
    await admin.json(
      `/contracts/${contract.id}/assignments/${assigned.id}/release`,
      'POST',
      { releasedOn: day, reason: 'Fin prueba' },
      201,
    );
    const reserved = await finance.json(
      '/reservations',
      'POST',
      {
        litterId: litter.id,
        dogId: second.id,
        customer: 'Reservado TEST',
        reservedDate: day,
        expiresDate: future,
        amount: '1',
        currency: 'USD',
      },
      201,
    );
    assert.equal(
      (
        await admin.call(`/contracts/${contract.id}/assignments`, 'POST', {
          dogId: second.id,
          handlerId: (await admin.json('/auth/me')).id,
          role: 'Prueba',
          startDate: day,
          endDate: future,
          overlapReason: 'Prueba',
        })
      ).status,
      400,
    );
    await admin.json(
      `/reservations/${reserved.id}/close`,
      'POST',
      { status: 'CANCELLED', closedDate: day, reason: 'Fin prueba' },
      201,
    );
    await admin.json(`/dogs/${second.id}`, 'PATCH', {
      administrativeStatus: 'DECEASED',
      availability: 'UNAVAILABLE',
      workStatus: 'REST',
    });
    assert.equal(
      (
        await finance.call('/reservations', 'POST', {
          litterId: litter.id,
          customer: 'Sin cupo TEST',
          reservedDate: day,
          expiresDate: future,
          amount: '1',
          currency: 'USD',
        })
      ).status,
      409,
    );
    const viewer = new Api();
    await admin.json(
      '/users',
      'POST',
      { name: 'Consulta fase3', username: 'phase3-viewer', role: 'CLIENT', password },
      201,
    );
    await viewer.login('phase3-viewer', password);
    for (const path of [
      '/breeding/plans',
      '/reservations',
      '/finance/summary',
      '/finance/export.csv',
      '/inventory/products',
    ])
      assert.equal((await viewer.call(path)).status, 403);
  });
});
