import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
import { Api, runtime } from './client';

const day = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Costa_Rica',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const shift = (n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
test('Seguimiento: objetivos, certificaciones, calendario e integridad', async (t) => {
  const admin = new Api(),
    trainer = new Api(),
    client = new Api();
  await admin.login();
  const password = 'SeguimientoPrueba2026!';
  const coach = await admin.json(
    '/users',
    'POST',
    { username: 'follow-trainer', name: 'Entrenador de seguimiento TEST', role: 'TRAINER', password },
    201,
  );
  const owner = await admin.json(
    '/users',
    'POST',
    { username: 'follow-client', name: 'Cliente de seguimiento TEST', role: 'CLIENT', password },
    201,
  );
  await trainer.login(coach.username, password);
  await client.login(owner.username, password);
  const dog = await admin.json(
    '/dogs',
    'POST',
    {
      name: 'Atlas seguimiento TEST',
      sex: 'MALE',
      breed: 'Prueba',
      assignedTrainerId: coach.id,
      ownerPartyId: owner.partyId,
    },
    201,
  );
  const hidden = await admin.json(
    '/dogs',
    'POST',
    { name: 'Otro seguimiento TEST', sex: 'FEMALE', breed: 'Prueba', custodianPartyId: owner.partyId },
    201,
  );
  const payload = {
    title: 'Plan medible TEST',
    discipline: 'Obediencia',
    startDate: shift(-10),
    dueDate: shift(7),
    goals: [
      {
        title: 'Respuesta a llamada',
        criterion: 'Respuestas correctas en 10 intentos, 10 puntos por acierto.',
        targetScore: 80,
      },
    ],
  };
  let plan: any, cert: any;
  const db = new pg.Client({ connectionString: runtime.env.DATABASE_URL });
  await db.connect();
  try {
    await t.test('acceso por propiedad y asignación; entrenador sólo agrega', async () => {
      assert.equal((await client.call(`/follow-up/dogs/${hidden.id}`)).status, 404);
      assert.equal((await trainer.call(`/follow-up/dogs/${hidden.id}/plans`, 'POST', payload)).status, 404);
      assert.equal((await client.call(`/follow-up/dogs/${dog.id}/plans`, 'POST', payload)).status, 403);
      plan = await trainer.json(`/follow-up/dogs/${dog.id}/plans`, 'POST', payload, 201);
      assert.equal((await trainer.call(`/follow-up/plans/${plan.id}`, 'DELETE')).status, 403);
      assert.equal(
        (await trainer.call(`/follow-up/plans/${plan.id}`, 'PATCH', { revision: 1, status: 'COMPLETED' }))
          .status,
        403,
      );
      assert.equal(
        (await admin.call(`/follow-up/plans/${plan.id}`, 'PATCH', { revision: 1, status: 'COMPLETED' }))
          .status,
        400,
      );
      assert.equal((await client.json(`/follow-up/dogs/${dog.id}`)).plans.length, 1);
      assert.equal(
        (await trainer.call(`/follow-up/dogs/${dog.id}/plans`, 'POST', { ...payload, dueDate: shift(-11) }))
          .status,
        400,
      );
    });
    await t.test('evaluaciones validadas, inmutables y cierre con revisión vigente', async () => {
      const path = `/follow-up/goals/${plan.goals[0].id}/evaluations`;
      for (const data of [
        { eventDate: shift(1), score: 90, notes: 'futuro' },
        { eventDate: shift(-11), score: 90, notes: 'anterior' },
        { eventDate: day, score: 101, notes: 'fuera de rango' },
      ])
        assert.equal((await trainer.call(path, 'POST', data)).status, 400);
      await trainer.json(
        path,
        'POST',
        { eventDate: shift(-2), score: 70, notes: 'Siete respuestas correctas.' },
        201,
      );
      await trainer.json(
        path,
        'POST',
        { eventDate: day, score: 90, notes: 'Nueve respuestas correctas.' },
        201,
      );
      assert.equal(
        (await admin.call(`/follow-up/plans/${plan.id}`, 'PATCH', { revision: 1, status: 'COMPLETED' }))
          .status,
        409,
      );
      const current = (await admin.json(`/follow-up/dogs/${dog.id}`)).plans[0];
      assert.equal(current.goals[0].evaluations[0].score, 90);
      const concurrent = await Promise.all([
        admin.call(`/follow-up/plans/${plan.id}`, 'PATCH', {
          revision: current.revision,
          status: 'COMPLETED',
        }),
        admin.call(`/follow-up/plans/${plan.id}`, 'PATCH', {
          revision: current.revision,
          status: 'COMPLETED',
        }),
      ]);
      assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
      assert.equal(
        (await trainer.call(path, 'POST', { eventDate: day, score: 100, notes: 'Plan cerrado' })).status,
        409,
      );
      await assert.rejects(
        db.query('UPDATE "GoalEvaluation" SET score=100 WHERE "goalId"=$1', [plan.goals[0].id]),
      );
      await assert.rejects(db.query('DELETE FROM "GoalEvaluation" WHERE "goalId"=$1', [plan.goals[0].id]));
    });
    await t.test('certificaciones: vigencia, avisos y acceso privado', async () => {
      const data = {
        title: 'Acreditación interna TEST',
        issuer: 'Centro ficticio de pruebas',
        issueDate: shift(-90),
        expiresDate: shift(1),
        reference: 'TEST-001',
        notes: 'Detalle privado no publicado',
      };
      assert.equal(
        (
          await trainer.call(`/follow-up/dogs/${dog.id}/certificates`, 'POST', {
            ...data,
            expiresDate: shift(-91),
          })
        ).status,
        400,
      );
      cert = await trainer.json(`/follow-up/dogs/${dog.id}/certificates`, 'POST', data, 201);
      await db.query(
        'UPDATE "Reminder" SET "dueAt"=NOW()-INTERVAL \'1 second\' WHERE "sourceType"=\'CERTIFICATION\' AND "sourceId"=$1',
        [cert.id],
      );
      await promisify(execFile)(process.execPath, ['apps/api/dist/worker.js', '--once'], {
        env: { ...process.env, ...runtime.env },
      });
      assert.ok(
        (await admin.json('/notifications?pageSize=100')).items.some((n: any) =>
          n.title.includes('Atlas seguimiento TEST'),
        ),
      );
      assert.equal((await client.json(`/follow-up/dogs/${dog.id}`)).certificates[0].notes, data.notes);
      assert.equal((await trainer.call(`/follow-up/certificates/${cert.id}`, 'DELETE')).status, 403);
    });
    await t.test('calendario filtra tipos y respeta día local y límite exclusivo', async () => {
      const start = await admin.json(
        '/appointments',
        'POST',
        {
          dogId: dog.id,
          title: 'Inicio día CR TEST',
          startsAt: `${day}T00:00:00-06:00`,
          remindBeforeHours: 0,
        },
        201,
      );
      await admin.json(
        '/appointments',
        'POST',
        {
          dogId: dog.id,
          title: 'Siguiente día CR TEST',
          startsAt: `${shift(1)}T00:00:00-06:00`,
          remindBeforeHours: 0,
        },
        201,
      );
      const events = await admin.json(`/calendar/events?from=${day}&to=${shift(1)}&type=APPOINTMENT`);
      assert.ok(events.items.some((e: any) => e.sourceId === start.id));
      assert.ok(!events.items.some((e: any) => e.title === 'Siguiente día CR TEST'));
      const certificates = await admin.json(`/calendar/events?from=${day}&to=${shift(2)}&type=CERTIFICATION`);
      assert.ok(certificates.items.some((e: any) => e.sourceId === cert.id && e.allDay));
      assert.ok(certificates.items.every((e: any) => e.type === 'CERTIFICATION'));
      assert.equal((await client.call(`/calendar/events?from=${day}&to=${shift(1)}`)).status, 403);
      assert.equal((await admin.call(`/calendar/events?from=${day}&to=${shift(63)}`)).status, 400);
      assert.equal((await admin.call('/calendar/events?from=2026-02-30&to=2026-03-02')).status, 400);
    });
    await t.test('reasignación revoca acceso, archivado retira avisos y conserva historial', async () => {
      await admin.json(`/dogs/${dog.id}`, 'PATCH', { assignedTrainerId: null });
      assert.equal((await trainer.call(`/follow-up/dogs/${dog.id}`)).status, 404);
      await admin.json(`/dogs/${dog.id}`, 'PATCH', { assignedTrainerId: coach.id });
      const extra = await admin.json(
        `/follow-up/dogs/${dog.id}/certificates`,
        'POST',
        { title: 'Por archivar TEST', issuer: 'Pruebas', issueDate: day, expiresDate: shift(30) },
        201,
      );
      await admin.json(`/follow-up/certificates/${extra.id}`, 'DELETE');
      assert.ok(
        (await db.query('SELECT status FROM "Reminder" WHERE "sourceId"=$1', [extra.id])).rows.every(
          (r) => r.status === 'CANCELLED',
        ),
      );
      const extraPlan = await trainer.json(
        `/follow-up/dogs/${dog.id}/plans`,
        'POST',
        { ...payload, title: 'Plan archivado TEST' },
        201,
      );
      await admin.json(`/follow-up/plans/${extraPlan.id}`, 'DELETE');
      assert.ok(
        !(await client.json(`/follow-up/dogs/${dog.id}`)).plans.some((p: any) => p.id === extraPlan.id),
      );
      assert.equal(
        (await db.query('SELECT COUNT(*)::int n FROM "TrainingGoal" WHERE "planId"=$1', [extraPlan.id]))
          .rows[0].n,
        1,
      );
    });
    await writeFile(
      '.local/follow-up-fixtures.json',
      JSON.stringify({ dogId: dog.id, planId: plan.id, password, day, future: shift(14) }),
    );
  } finally {
    await db.end();
  }
});
