import { isDemoDatabase } from './database-names.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { root, loadEnv } from './env.mjs';
loadEnv();
process.chdir(root);
const url = new URL(process.env.DATABASE_URL);
assert.equal(process.env.DEMO_MODE, 'true');
assert.ok(isDemoDatabase(url.pathname));
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
const runtime = JSON.parse(await readFile('.local/demo-runtime.json', 'utf8'));
let cookies = {};
async function api(route, method = 'GET', body) {
  const multipart = body instanceof FormData;
  const res = await fetch(`http://127.0.0.1:4000/api/v1${route}`, {
    method,
    headers: {
      origin: 'http://localhost:3000',
      cookie: Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; '),
      'x-csrf-token': cookies.oryx_csrf || '',
      ...(body && !multipart ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
  });
  for (const value of res.headers.getSetCookie()) {
    const [pair] = value.split(';'),
      i = pair.indexOf('=');
    cookies[pair.slice(0, i)] = pair.slice(i + 1);
  }
  const data = await res.json();
  assert.ok(res.ok, `${route}: ${JSON.stringify(data)}`);
  return data;
}
await api('/auth/login', 'POST', { username: 'admin', password: '1234' });
const templates = await api('/templates');
for (const data of [
  {
    name: 'Obediencia y socialización',
    kind: 'TRAINING',
    title: 'Evaluación de obediencia y socialización',
    issuer: 'ORYX K9 · Unidad Canina',
    body: '{{nombre}}, código {{codigo}}, completó la evaluación de obediencia y socialización el {{fecha}}. Referencia: {{referencia}}. Responsable: {{emisor}}.',
  },
  {
    name: 'Registro de crianza',
    kind: 'BREEDING',
    title: 'Ficha de seguimiento de crianza',
    issuer: 'ORYX K9 · Unidad Canina',
    body: 'Seguimiento de {{nombre}}, código {{codigo}}, registrado el {{fecha}}. La filiación, los controles y la camada se consultan en su expediente. Referencia {{referencia}}.',
  },
  {
    name: 'Servicio de entrenamiento',
    kind: 'CONTRACT',
    title: 'Acuerdo de seguimiento canino',
    issuer: 'ORYX K9 · Unidad Canina',
    body: 'Servicio para {{nombre}}, contrato {{referencia}}, a partir del {{fecha}}. Incluye sesiones de entrenamiento, bitácora de avances y coordinación con el responsable designado. Emisor: {{emisor}}.',
  },
])
  if (!templates.some((t) => t.name === data.name)) templates.push(await api('/templates', 'POST', data));
const suppliers = await api('/finance-control/suppliers');
for (const name of [
  'Suministros Caninos del Valle',
  'Equipo y Protección K9',
  'Distribuidora Nutrición Animal',
])
  if (!suppliers.some((s) => s.name === name))
    suppliers.push(
      await api('/finance-control/suppliers', 'POST', {
        name,
        contact: 'María Vargas',
        phone: '+123456789',
        active: true,
      }),
    );
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(new Date());
for (const name of ['Thor', 'Rex', 'Maya']) {
  const dog = runtime.dogs.find((d) => d.name === name),
    detail = await api(`/trainer/dogs/${dog.id}`);
  let entry = detail.medicalEntries.find((m) => m.title === 'Control de piel y condición corporal');
  if (!entry)
    entry = await api(`/trainer/dogs/${dog.id}/medical`, 'POST', {
      eventDate: day,
      kind: 'CONSULTATION',
      title: 'Control de piel y condición corporal',
      notes:
        'Se revisó la condición corporal y la adaptación a las sesiones. Se mantiene seguimiento en el próximo control.',
      professional: 'Dra. Valeria Rojas',
      diagnosis: 'Control de bienestar registrado',
      clinicalStatus: 'RESOLVED',
      medication: 'Sin medicación registrada',
    });
  if (entry.revision === 1)
    await api(`/trainer/medical/${entry.id}`, 'PATCH', {
      eventDate: day,
      kind: entry.kind,
      title: entry.title,
      notes: entry.notes,
      professional: entry.professional,
      diagnosis: entry.diagnosis,
      clinicalStatus: 'RESOLVED',
      medication: entry.medication,
      revision: 1,
      correctionReason: 'Se completó la identificación del profesional responsable.',
    });
  const evidence = await api(`/records/dogs/${dog.id}`);
  if (!evidence.attachments.some((a) => a.medicalEntryId === entry.id)) {
    const form = new FormData();
    form.set(
      'file',
      new Blob([await readFile('assets/demo/pexels-20368539.jpg')], { type: 'image/jpeg' }),
      'control-bienestar.jpg',
    );
    await api(`/records/MEDICAL/${entry.id}/files`, 'POST', form);
  }
  const follow = await api(`/follow-up/dogs/${dog.id}`),
    template = templates.find((t) => t.kind === 'TRAINING');
  if (!follow.certificates.some((c) => c.reference === `VK-EVAL-${name.toUpperCase()}`))
    await api(`/follow-up/dogs/${dog.id}/certificates`, 'POST', {
      title: template.title,
      issuer: template.issuer,
      reference: `VK-EVAL-${name.toUpperCase()}`,
      issueDate: day,
      templateId: template.id,
      notes: 'Seguimiento individual y evaluación interna del equipo de entrenamiento.',
    });
}
const month = '2026-09',
  existingCloses = await api('/finance-control/closes');
if (!existingCloses.some((c) => c.month === month)) {
  const accounts = await api('/finance/accounts?pageSize=100');
  if (!accounts.items.some((a) => a.concept === 'Equipo de entrenamiento · septiembre')) {
    const account = await api('/finance/accounts', 'POST', {
      direction: 'PAYABLE',
      party: suppliers[0].name,
      supplierId: suppliers[0].id,
      concept: 'Equipo de entrenamiento · septiembre',
      category: 'Equipo',
      amount: '85000.00',
      currency: 'CRC',
      issueDate: '2026-09-05',
      dueDate: '2026-09-20',
    });
    await api(`/finance/accounts/${account.id}/payments`, 'POST', {
      amount: '85000.00',
      paidDate: '2026-09-10',
      method: 'Transferencia bancaria',
      reference: 'TR-0926-014',
      requestId: randomUUID(),
    });
  }
  const flow = await api(`/finance-control/cashflow?from=${month}-01&to=${month}-30`);
  for (const payment of flow.payments)
    if (!payment.reconciliation)
      await api(`/finance-control/payments/${payment.id}/reconcile`, 'POST', {
        amount: payment.amount,
        statementReference: `EX-${month}-${payment.id.slice(0, 8)}`,
        notes: 'Importe y referencia revisados.',
      });
  await api('/finance-control/closes', 'POST', {
    month,
    notes: 'Cierre mensual de septiembre. Movimientos conciliados por administración.',
  });
}
await writeFile(
  '.local/demo-completion-result.json',
  JSON.stringify(
    {
      templates: templates.length,
      suppliers: suppliers.length,
      clinicalExamples: 3,
      closedMonth: month,
      at: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log('Plantillas, proveedores, controles, documentos y cierre mensual incorporados.');
