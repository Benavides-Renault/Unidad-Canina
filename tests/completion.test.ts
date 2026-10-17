import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import pg from 'pg';
import { Api, runtime } from './client';
import { totp } from '../apps/api/src/security';

test('Ampliaciones 0–3: historial, adjuntos, plantillas, contratos, caja y recuperación', async (t) => {
  const admin = new Api(),
    trainer = new Api(),
    client = new Api(),
    other = new Api();
  await admin.login();
  const password = 'CompletarFases2026!';
  const coach = await admin.json(
    '/users',
    'POST',
    { username: 'complete-trainer', name: 'Entrenador ampliación TEST', role: 'TRAINER', password },
    201,
  );
  const owner = await admin.json(
    '/users',
    'POST',
    { username: 'complete-owner', name: 'Cliente ampliación TEST', role: 'CLIENT', password },
    201,
  );
  const stranger = await admin.json(
    '/users',
    'POST',
    { username: 'complete-other', name: 'Otro cliente TEST', role: 'CLIENT', password },
    201,
  );
  await trainer.login(coach.username, password);
  await client.login(owner.username, password);
  await other.login(stranger.username, password);
  const dog = await admin.json(
    '/dogs',
    'POST',
    {
      name: 'Nexo ampliación TEST',
      breed: 'Prueba',
      sex: 'MALE',
      ownerPartyId: owner.partyId,
      assignedTrainerId: coach.id,
    },
    201,
  );
  const db = new pg.Client({ connectionString: runtime.env.DATABASE_URL });
  await db.connect();
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(new Date());
  const medical = {
    eventDate: day,
    kind: 'ALLERGY',
    title: 'Alergia registrada TEST',
    notes: 'Datos ficticios',
    diagnosis: 'Observación profesional ficticia',
    allergen: 'Material ficticio',
    clinicalStatus: 'SUSPECTED',
    medication: 'Sin indicación terapéutica',
  };
  let record: any, attachment: any, template: any;
  try {
    await t.test('correcciones concurrentes conservan versiones y requieren revisión vigente', async () => {
      record = await trainer.json(`/trainer/dogs/${dog.id}/medical`, 'POST', medical, 201);
      assert.equal(
        (
          await trainer.call(`/trainer/medical/${record.id}`, 'PATCH', {
            ...medical,
            revision: 1,
            correctionReason: 'Corrección',
          })
        ).status,
        403,
      );
      const responses = await Promise.all([
        admin.call(`/trainer/medical/${record.id}`, 'PATCH', {
          ...medical,
          title: 'Alergia corregida TEST',
          revision: 1,
          correctionReason: 'Precisión documental',
        }),
        admin.call(`/trainer/medical/${record.id}`, 'PATCH', {
          ...medical,
          title: 'Alergia corregida TEST',
          revision: 1,
          correctionReason: 'Precisión documental',
        }),
      ]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
      const history = await client.json(`/records/medical/${record.id}/versions`);
      assert.equal(history.length, 2);
      assert.equal(history[1].snapshot.title, medical.title);
      assert.equal(history[0].reason, 'Precisión documental');
      assert.equal((await other.call(`/records/medical/${record.id}/versions`)).status, 404);
      await assert.rejects(
        db.query('UPDATE "MedicalRevision" SET reason=$1 WHERE "entryId"=$2', ['mutación', record.id]),
      );
    });
    await t.test('comprobantes ligados al registro, privados y sólo archivables por admin', async () => {
      const form = new FormData();
      form.set(
        'file',
        new Blob(['%PDF-1.4\nDocumento ficticio de prueba'], { type: 'application/pdf' }),
        'comprobante-test.pdf',
      );
      attachment = await trainer.json(`/records/MEDICAL/${record.id}/files`, 'POST', form, 201);
      const url = `/records/files/${attachment.document.id}/download`;
      assert.equal((await client.call(url)).status, 200);
      assert.equal((await other.call(url)).status, 404);
      assert.equal((await trainer.call(`/records/files/${attachment.document.id}`, 'DELETE')).status, 403);
      assert.equal((await client.call(`/records/MEDICAL/${record.id}/files`, 'POST', form)).status, 403);
      assert.equal((await trainer.call(`/records/BREEDING/${dog.id}/files`, 'POST', form)).status, 404);
      const invalid = new FormData();
      invalid.set('file', new Blob(['<html>mal</html>'], { type: 'application/pdf' }), 'falso.pdf');
      assert.equal((await admin.call(`/records/MEDICAL/${record.id}/files`, 'POST', invalid)).status, 400);
      await assert.rejects(db.query('DELETE FROM "RecordAttachment" WHERE id=$1', [attachment.id]));
    });
    await t.test('certificados congelan la plantilla; PDF respeta propiedad y asignación', async () => {
      template = await admin.json(
        '/templates',
        'POST',
        {
          name: 'Plantilla TEST',
          kind: 'TRAINING',
          title: 'Acreditación interna TEST',
          issuer: 'Centro ficticio',
          body: 'Registro de {{nombre}}, {{codigo}}. Referencia {{referencia}}.',
        },
        201,
      );
      assert.equal((await trainer.call('/templates', 'POST', { name: 'Prohibida' })).status, 403);
      const cert = await trainer.json(
        `/follow-up/dogs/${dog.id}/certificates`,
        'POST',
        {
          title: template.title,
          issuer: template.issuer,
          issueDate: day,
          reference: 'TEST-01',
          templateId: template.id,
        },
        201,
      );
      await admin.json(`/templates/${template.id}`, 'PATCH', {
        name: template.name,
        kind: template.kind,
        title: template.title,
        issuer: template.issuer,
        body: 'Contenido nuevo',
        revision: 1,
      });
      assert.match(
        (await client.json(`/follow-up/dogs/${dog.id}`)).certificates[0].templateSnapshot.body,
        /Nexo ampliación TEST/,
      );
      const pdf = await client.call(`/follow-up/certificates/${cert.id}/report.pdf`);
      assert.equal(pdf.status, 200);
      assert.match(pdf.headers.get('content-type') || '', /pdf/);
      assert.equal((await other.call(`/follow-up/certificates/${cert.id}/report.pdf`)).status, 404);
    });
    await t.test('preferencias de calendario pertenecen a cada usuario', async () => {
      await admin.json('/preferences', 'PATCH', { calendarView: 'week', calendarType: 'CERTIFICATION' });
      assert.equal((await admin.json('/preferences')).calendarView, 'week');
      assert.equal((await client.json('/preferences')).calendarView, 'month');
      assert.equal(
        (await admin.call('/preferences', 'PATCH', { calendarType: 'SECRET', userId: owner.id })).status,
        400,
      );
      await admin.json('/preferences', 'PATCH', { calendarView: 'month', calendarType: 'ALL' });
    });
    await t.test('edición de contactos y renovación enlazada sin duplicar el contrato', async () => {
      const institution = await admin.json(
        '/institutions',
        'POST',
        { name: 'Institución ampliación TEST', kind: 'Municipalidad' },
        201,
      );
      const contact = await admin.json(
        `/institutions/${institution.id}/contacts`,
        'POST',
        { name: 'Contacto TEST' },
        201,
      );
      await admin.json(`/institutions/${institution.id}/contacts/${contact.id}`, 'PATCH', {
        name: 'Contacto actualizado TEST',
        phone: '000-TEST',
      });
      const data = {
        number: 'EXT-CONTRACT-01',
        institutionId: institution.id,
        title: 'Servicio TEST',
        amount: '1000.00',
        currency: 'CRC',
        periodicity: 'Mensual',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        responsible: 'Responsable TEST',
        status: 'COMPLETED',
      };
      const old = await admin.json('/contracts', 'POST', data, 201);
      const { institutionId: _institutionId, ...renew } = data;
      const next = await admin.json(
        `/contracts/${old.id}/renew`,
        'POST',
        {
          ...renew,
          number: 'EXT-CONTRACT-02',
          startDate: '2025-01-01',
          endDate: '2025-12-31',
          expectedRevision: 1,
        },
        201,
      );
      assert.equal(next.renewedFromId, old.id);
      assert.equal(
        (
          await admin.call(`/contracts/${old.id}/renew`, 'POST', {
            ...renew,
            number: 'EXT-CONTRACT-03',
            startDate: '2025-01-01',
            endDate: '2025-12-31',
            expectedRevision: 1,
          })
        ).status,
        409,
      );
      assert.equal((await trainer.call(`/contracts/${old.id}/renew`, 'POST', renew)).status, 403);
    });
    await t.test('proveedores, reintegros, conciliación y cierre bloquean pagos retroactivos', async () => {
      const supplier = await admin.json(
        '/finance-control/suppliers',
        'POST',
        { name: 'Proveedor ampliación TEST', active: true },
        201,
      );
      const account = await admin.json(
        '/finance/accounts',
        'POST',
        {
          direction: 'PAYABLE',
          party: 'Texto sustituido',
          supplierId: supplier.id,
          concept: 'Compra TEST',
          category: 'Equipo',
          amount: '100.00',
          currency: 'USD',
          issueDate: '2023-06-01',
          dueDate: '2023-06-30',
        },
        201,
      );
      assert.equal(account.party, supplier.name);
      const p1 = await admin.json(
        `/finance/accounts/${account.id}/payments`,
        'POST',
        {
          kind: 'PAYMENT',
          amount: '40.00',
          paidDate: '2023-06-10',
          method: 'Banco',
          requestId: randomUUID(),
        },
        201,
      );
      const p2 = await admin.json(
        `/finance/accounts/${account.id}/payments`,
        'POST',
        { kind: 'REFUND', amount: '10.00', paidDate: '2023-06-15', method: 'Banco', requestId: randomUUID() },
        201,
      );
      const flow = await admin.json('/finance-control/cashflow?from=2023-06-01&to=2023-06-30');
      assert.deepEqual(
        flow.totals.find((r: any) => r.currency === 'USD'),
        { currency: 'USD', income: '0.00', expense: '30.00', net: '-30.00' },
      );
      assert.equal(
        (await admin.call('/finance-control/closes', 'POST', { month: '2023-06', notes: 'Cierre TEST' }))
          .status,
        409,
      );
      assert.equal(
        (
          await admin.call(`/finance-control/payments/${p1.id}/reconcile`, 'POST', {
            amount: '41.00',
            statementReference: 'Incorrecto',
          })
        ).status,
        400,
      );
      for (const p of [p1, p2])
        await admin.json(
          `/finance-control/payments/${p.id}/reconcile`,
          'POST',
          { amount: p.amount, statementReference: `EXTRACTO-${p.id}` },
          201,
        );
      const responses = await Promise.all([
        admin.call('/finance-control/closes', 'POST', { month: '2023-06', notes: 'Cierre TEST' }),
        admin.call('/finance-control/closes', 'POST', { month: '2023-06', notes: 'Cierre TEST' }),
      ]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
      assert.equal(
        (
          await admin.call(`/finance/accounts/${account.id}/payments`, 'POST', {
            amount: '5.00',
            paidDate: '2023-06-20',
            method: 'Banco',
            requestId: randomUUID(),
          })
        ).status,
        409,
      );
      assert.equal(
        (await client.call('/finance-control/cashflow?from=2023-06-01&to=2023-06-30')).status,
        403,
      );
      await assert.rejects(db.query('DELETE FROM "FinancialClose" WHERE month=$1', ['2023-06']));
      assert.equal(
        (await admin.call('/finance-control/cashflow/export?from=2023-06-01&to=2023-06-30&format=pdf'))
          .status,
        200,
      );
    });
    await t.test('recuperación MFA de un solo uso resiste consumo simultáneo', async () => {
      const mfaUser = await admin.json(
          '/users',
          'POST',
          { username: 'complete-mfa', name: 'Administrador MFA TEST', role: 'ADMIN', password },
          201,
        ),
        mfa = new Api();
      await mfa.login(mfaUser.username, password);
      const setup = await mfa.json('/auth/mfa/setup', 'POST', {}, 201),
        enabled = await mfa.json('/auth/mfa/enable', 'POST', { code: totp(setup.secret) }, 201);
      assert.equal(enabled.recoveryCodes.length, 8);
      const stored = (await db.query('SELECT "recoveryHashes" FROM "User" WHERE id=$1', [mfaUser.id])).rows[0]
        .recoveryHashes;
      assert.ok(!stored.includes(enabled.recoveryCodes[0]));
      const recovered1 = new Api(),
        recovered2 = new Api(),
        payload = { username: mfaUser.username, password, recoveryCode: enabled.recoveryCodes[0] };
      const results = await Promise.all([
        recovered1.call('/auth/login', 'POST', payload),
        recovered2.call('/auth/login', 'POST', payload),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 401]);
      assert.equal((await mfa.call('/auth/me')).status, 401);
      assert.equal((await new Api().call('/auth/login', 'POST', payload)).status, 401);
    });
    await t.test('archivar un registro retira su comprobante de las rutas alternativas',async()=>{
      const entry=await admin.json(`/trainer/dogs/${dog.id}/medical`,'POST',{...medical,title:'Registro a archivar'},201);
      const form=new FormData();form.set('file',new Blob(['%PDF-1.4\nAdjunto privado'],{type:'application/pdf'}),'archivado.pdf');
      const attached=await trainer.json(`/records/MEDICAL/${entry.id}/files`,'POST',form,201);
      await admin.json(`/trainer/medical/${entry.id}`,'DELETE');
      for(const route of [`/records/files/${attached.document.id}/download`,`/portal/documents/${attached.document.id}/download`,`/records/medical/${entry.id}/versions`])assert.equal((await client.call(route)).status,404,route);
      assert.equal((await client.json(`/records/dogs/${dog.id}`)).attachments.some((a:any)=>a.document.id===attached.document.id),false);
    });
    await writeFile(
      '.local/completion-fixtures.json',
      JSON.stringify({ dogId: dog.id, recordId: record.id, templateId: template.id, password, day }),
    );
  } finally {
    await db.end();
  }
});
