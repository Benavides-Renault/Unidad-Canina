import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
import { Api, runtime } from './client';
const admin = new Api(),
  trainer = new Api(),
  finance = new Api(),
  anonymous = new Api();
const day = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Costa_Rica',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const password = 'SoloContratosDePrueba2026!';
test('Fase 2: contratos privados, asignaciones concurrentes, servicios y versiones', async (t) => {
  await admin.login();
  const me = await admin.json('/auth/me');
  const handler = await admin.json(
    '/users',
    'POST',
    { name: 'Operador de contratos', username: 'contracts-trainer', password, role: 'TRAINER' },
    201,
  );
  await admin.json(
    '/users',
    'POST',
    { name: 'Cliente de contratos', username: 'contracts-finance', password, role: 'CLIENT' },
    201,
  );
  await trainer.login('contracts-trainer', password);
  await finance.login('contracts-finance', password);
  let institution: { id: string },
    contract: { id: string; number: string; amount: string; revision: number },
    dog: { id: string },
    assignment: { id: string },
    fileId: string;
  await t.test(
    'creación y versiones conservan importes exactos; datos contractuales restringidos',
    async () => {
      institution = await admin.json(
        '/institutions',
        'POST',
        { name: 'Institución SINTÉTICA', kind: 'Empresa' },
        201,
      );
      await admin.json(
        `/institutions/${institution.id}/contacts`,
        'POST',
        { name: 'Contacto SINTÉTICO', phone: '0000-0000' },
        201,
      );
      contract = await admin.json(
        '/contracts',
        'POST',
        {
          institutionId: institution.id,
          number: 'TEST-CONTRACT-001',
          title: 'Servicio SINTÉTICO',
          amount: '1234.56',
          currency: 'CRC',
          periodicity: 'Mensual',
          startDate: day,
          endDate: day,
          status: 'ACTIVE',
          responsible: 'Responsable SINTÉTICO',
          clauses: 'CLAUSULA_PRIVADA',
        },
        201,
      );
      assert.equal(contract.amount, '1234.56');
      assert.equal((await trainer.call('/contracts')).status, 403);
      assert.equal((await trainer.call(`/contracts/${contract.id}`)).status, 403);
      assert.equal((await anonymous.call(`/contracts/${contract.id}`)).status, 401);
      assert.equal((await finance.call(`/contracts/${contract.id}`)).status, 403);
      assert.equal(
        (await finance.call(`/contracts/${contract.id}`, 'PATCH', { notes: 'bad', expectedRevision: 1 }))
          .status,
        403,
      );
      contract = await admin.json(`/contracts/${contract.id}`, 'PATCH', {
        title: 'Servicio SINTÉTICO actualizado',
        expectedRevision: 1,
      });
      assert.equal(contract.revision, 2);
      assert.equal(
        (await admin.call(`/contracts/${contract.id}`, 'PATCH', { notes: 'stale', expectedRevision: 1 }))
          .status,
        409,
      );
      assert.equal((await admin.json(`/contracts/${contract.id}`)).versions.length, 2);
    },
  );
  await t.test('serializa solapamientos y audita excepción y retiro sin borrar historia', async () => {
    dog = await admin.json(
      '/dogs',
      'POST',
      { name: 'Perro CONTRATOS PRUEBA', sex: 'MALE', breed: 'Prueba', workStatus: 'OPERATIONAL' },
      201,
    );
    const data = { dogId: dog.id, handlerId: handler.id, role: 'Servicio', startDate: day, endDate: day };
    const responses = await Promise.all([
      admin.call(`/contracts/${contract.id}/assignments`, 'POST', data),
      admin.call(`/contracts/${contract.id}/assignments`, 'POST', data),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
    assignment = await responses.find((r) => r.status === 201)!.json();
    assert.equal(
      (
        await trainer.call(`/contracts/${contract.id}/assignments`, 'POST', {
          ...data,
          overlapReason: 'No autorizado',
        })
      ).status,
      403,
    );
    const override = await admin.json(
      `/contracts/${contract.id}/assignments`,
      'POST',
      { ...data, handlerId: me.id, overlapReason: 'Turnos compatibles autorizados de prueba' },
      201,
    );
    await admin.json(
      `/contracts/${contract.id}/assignments/${override.id}/release`,
      'POST',
      { releasedOn: day, reason: 'Fin de prueba' },
      201,
    );
    const detail = await admin.json(`/contracts/${contract.id}`);
    assert.equal(detail.assignments.length, 2);
    assert.ok(detail.assignments.some((a: { releasedOn?: string }) => a.releasedOn));
    assert.equal(
      (await admin.call(`/contracts/${contract.id}`, 'PATCH', { status: 'COMPLETED', expectedRevision: 2 }))
        .status,
      409,
    );
    assert.equal((await trainer.call('/operations/assignments')).status, 403);
  });
  await t.test('archivos privados versionados y descarga denegada a entrenador', async () => {
    for (let version = 1; version <= 2; version++) {
      const form = new FormData();
      form.set(
        'file',
        new Blob(['%PDF-1.7\nTEST CONTRACT ONLY'], { type: 'application/pdf' }),
        `contrato-prueba-v${version}.pdf`,
      );
      const file = await admin.json(`/contracts/${contract.id}/files`, 'POST', form, 201);
      fileId = file.id;
      assert.equal(file.version, version);
    }
    assert.equal((await trainer.call(`/contracts/${contract.id}/files/${fileId}/download`)).status, 403);
    assert.equal((await anonymous.call(`/contracts/${contract.id}/files/${fileId}/download`)).status, 401);
    const download = await admin.call(`/contracts/${contract.id}/files/${fileId}/download`);
    assert.equal(download.status, 200);
    assert.match(await download.text(), /^%PDF-/);
    const bad = new FormData();
    bad.set('file', new Blob(['<script>spoofed</script>'], { type: 'application/pdf' }), 'fake.pdf');
    assert.equal((await admin.call(`/contracts/${contract.id}/files`, 'POST', bad)).status, 400);
  });
  await t.test('servicios por responsable, informe redactado y recordatorios idempotentes', async () => {
    await admin.json(
      '/operations/services',
      'POST',
      {
        contractId: contract.id,
        occurredAt: `${day}T09:00:00-06:00`,
        endsAt: `${day}T10:00:00-06:00`,
        location: 'Sede SINTÉTICA',
        publicSummary: 'Servicio de prueba completado.',
        internalNotes: 'NOTA_INTERNA_SECRETA',
      },
      201,
    );
    const unassigned = await admin.json(
      '/users',
      'POST',
      { name: 'Sin asignar', username: 'unassigned-trainer', password, role: 'TRAINER' },
      201,
    );
    const other = new Api();
    await other.login(unassigned.username, password);
    assert.equal(
      (
        await other.call('/operations/services', 'POST', {
          contractId: contract.id,
          occurredAt: `${day}T09:00:00-06:00`,
          endsAt: `${day}T10:00:00-06:00`,
          location: 'Prueba',
          publicSummary: 'No autorizado',
        })
      ).status,
      403,
    );
    const report = await admin.call(`/contracts/${contract.id}/client-report.pdf`);
    assert.equal(report.status, 200);
    await writeFile('.local/contract-report-test.pdf', Buffer.from(await report.arrayBuffer()));
    await promisify(execFile)(process.execPath, ['apps/api/dist/worker.js', '--once'], {
      env: { ...process.env, ...runtime.env },
    });
    const notifications = await admin.json('/notifications');
    assert.ok(notifications.items.some((n: { title: string }) => n.title.includes(contract.number)));
    await promisify(execFile)(process.execPath, ['apps/api/dist/worker.js', '--once'], {
      env: { ...process.env, ...runtime.env },
    });
    assert.equal((await admin.json('/notifications')).total, notifications.total);
    await admin.json(
      `/contracts/${contract.id}/assignments/${assignment.id}/release`,
      'POST',
      { releasedOn: day, reason: 'Servicio terminado' },
      201,
    );
    await admin.json(`/contracts/${contract.id}`, 'PATCH', { status: 'COMPLETED', expectedRevision: 2 });
    assert.equal((await admin.json(`/contracts/${contract.id}`)).assignments.length, 2);
  });
  const db = new pg.Client({ connectionString: runtime.env.DATABASE_URL });
  await db.connect();
  try {
    await assert.rejects(
      db.query('UPDATE "ContractVersion" SET revision=99 WHERE "contractId"=$1', [contract.id]),
    );
    const events = await db.query('SELECT action FROM "AuditLog" WHERE action=$1', ['OVERLAP_OVERRIDE']);
    assert.ok(events.rowCount);
  } finally {
    await db.end();
  }
});
