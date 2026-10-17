import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import argon2 from 'argon2';
import PDFDocument from 'pdfkit';
import assert from 'node:assert/strict';
import { root, loadEnv } from './env.mjs';
import { cleanValue } from './demo-content.mjs';

// Explicit local demonstration. Creates a NEW database; never clears an existing one.
// Activation is separate so a failed seed cannot replace the working installation.
loadEnv();
process.chdir(root);
if (!process.argv.includes('--create-demo'))
  throw new Error('Usar --create-demo para preparar datos ficticios en una base nueva.');
const url = new URL(process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname))
  throw new Error('La demostración sólo se prepara en PostgreSQL local.');
const database = `oryx_demo_${Date.now()}`,
  storage = path.join(root, '.local', database, 'files');
const connection = new pg.Client({ connectionString: url.toString() });
await connection.connect();
await connection.query(`CREATE DATABASE ${pg.escapeIdentifier(database)}`);
await connection.end();
url.pathname = `/${database}`;
await mkdir(storage, { recursive: true });
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  APP_ORIGIN: 'http://127.0.0.1:3200',
  API_HOST: '127.0.0.1',
  API_PORT: '4002',
  API_URL: 'http://127.0.0.1:4002',
  STORAGE_DRIVER: 'local',
  STORAGE_PATH: storage,
  COOKIE_SECURE: 'false',
  SMTP_HOST: '',
  NODE_ENV: 'development',
  DEMO_MODE: 'true',
  BACKUP_ENABLED: 'false',
};
const children = [];
async function command(args, cwd = root) {
  await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { cwd, env, stdio: 'inherit', windowsHide: true });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Preparación falló (${code}).`))));
  });
}
const day = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Costa_Rica',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const date = (n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const instant = (n, h = 9) => `${date(n)}T${String(h).padStart(2, '0')}:00:00-06:00`;
const UNIT = '00000000-0000-4000-8000-000000000001',
  password = '1234';
const cookies = {};
async function api(route, method = 'GET', body) {
  const multipart = body instanceof FormData;
  const res = await fetch(`${env.API_URL}/api/v1${route}`, {
    method,
    headers: {
      origin: env.APP_ORIGIN,
      ...(body && !multipart ? { 'content-type': 'application/json' } : {}),
      cookie: Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; '),
      'x-csrf-token': cookies.oryx_csrf || '',
    },
    body: body ? (multipart ? body : JSON.stringify(cleanValue(body))) : undefined,
  });
  for (const value of res.headers.getSetCookie()) {
    const [pair] = value.split(';'),
      i = pair.indexOf('=');
    cookies[pair.slice(0, i)] = pair.slice(i + 1);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${route}: ${JSON.stringify(data)}`);
  return data;
}
async function pdf(title) {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks = [];
  const result = new Promise((resolve) => {
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
  doc.fontSize(24).text('ORYX K9 · Unidad Canina');
  doc.moveDown().fontSize(15).text(cleanValue(title));
  doc
    .moveDown()
    .fontSize(11)
    .text('Registro de seguimiento de la unidad. Administración: María Vargas · +123456789.');
  doc.end();
  return result;
}
async function attachment(route, title, category) {
  const form = new FormData();
  form.set('file', new Blob([await pdf(title)], { type: 'application/pdf' }), 'registro-oryx.pdf');
  if (category) form.set('category', category);
  return api(route, 'POST', form);
}
const users = [],
  dogs = [],
  litters = [],
  puppies = [],
  plans = [],
  accounts = [],
  contracts = [];
try {
  await command(
    [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    path.join(root, 'apps/api'),
  );
  const db = new pg.Client({ connectionString: env.DATABASE_URL });
  await db.connect();
  const adminId = randomUUID();
  await db.query(
    'INSERT INTO "User"(id,name,username,"passwordHash",role,"updatedAt") VALUES($1,$2,$3,$4,$5,NOW())',
    [
      adminId,
      'Administración ORYX',
      'admin',
      await argon2.hash(password, { type: argon2.argon2id }),
      'ADMIN',
    ],
  );
  await db.end();
  const log = createWriteStream(path.join(root, '.local/demo-prepare.log'));
  const server = spawn(process.execPath, ['apps/api/dist/main.js'], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  children.push(server);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${env.API_URL}/api/v1/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!ready) throw new Error('No inició el servidor temporal de demostración.');
  await api('/auth/login', 'POST', { username: 'admin', password });
  users.push({
    id: adminId,
    username: 'admin',
    role: 'ADMIN',
    password,
    name: 'Administración ORYX',
  });
  for (const [username, name, role, partyName, partyKind] of [
    ['coordinacion', 'Coordinación DEMO', 'ADMIN'],
    ['ana.entrenadora', 'Ana · entrenadora DEMO', 'TRAINER'],
    ['diego.entrenador', 'Diego · entrenador DEMO', 'TRAINER'],
    ['lucia.entrenadora', 'Lucía · entrenadora DEMO', 'TRAINER'],
    ['sofia.cliente', 'Sofía · cliente DEMO', 'CLIENT'],
    ['carlos.cliente', 'Carlos · cliente DEMO', 'CLIENT'],
    [
      'muni.valleverde',
      'Municipalidad Valle Verde DEMO',
      'CLIENT',
      'Municipalidad Valle Verde DEMO',
      'MUNICIPALITY',
    ],
    [
      'muni.montelago',
      'Municipalidad Monte Lago DEMO',
      'CLIENT',
      'Municipalidad Monte Lago DEMO',
      'MUNICIPALITY',
    ],
  ])
    users.push({
      ...(await api('/users', 'POST', {
        username,
        name,
        role,
        password,
        ...(partyName ? { partyName, partyKind } : {}),
      })),
      password,
    });
  users.push({
    ...(await api('/users', 'POST', {
      username: 'muni.valleverde2',
      name: 'Segundo acceso Valle Verde DEMO',
      role: 'CLIENT',
      partyId: users.find((u) => u.username === 'muni.valleverde').partyId,
      password,
    })),
    password,
  });
  console.log('Cuentas y propietarios de demostración creados.');
  const coaches = users.filter((u) => u.role === 'TRAINER'),
    owners = users.filter((u) => u.role === 'CLIENT');
  const names = [
    'Thor',
    'Maya',
    'Odín',
    'Freya',
    'Loki',
    'Athena',
    'Rex',
    'Nala',
    'Bruno',
    'Kira',
    'Dante',
    'Luna',
    'Max',
    'Zara',
    'Rocky',
    'Sasha',
    'Zeus',
    'Hera',
  ];
  for (let i = 0; i < names.length; i++) {
    const external = i >= 6 && i < 12,
      owner = owners[(i - 6 + owners.length * 2) % owners.length],
      coach = coaches[i % 3];
    const d = await api('/dogs', 'POST', {
      code: `DEMO-${String(i + 1).padStart(3, '0')}`,
      name: names[i],
      registeredName: `${names[i]} de Valle DEMO`,
      sex: i % 2 ? 'FEMALE' : 'MALE',
      breed: i % 3 === 0 ? 'Pastor alemán' : 'Pastor belga malinois',
      birthDate: date(-1100 - i * 41),
      intakeDate: date(-190),
      coat: i % 3 === 0 ? 'Negro y fuego' : 'Leonado con máscara negra',
      microchip: `DEMO-CHIP-${String(i + 1).padStart(5, '0')}`,
      pedigreeNumber: `DEMO-PED-${i + 1}`,
      registry: 'Registro ficticio DEMO',
      ownerPartyId: external ? owner.partyId : UNIT,
      custodianPartyId: external && i % 2 ? owner.partyId : UNIT,
      assignedTrainerId: coach.id,
      workStatus: i < 12 ? 'OPERATIONAL' : 'TRAINING',
      reproductiveStatus: i < 6 ? 'AVAILABLE' : 'NONE',
      location: external && i % 2 ? 'Con su propietario · DEMO' : 'Centro ORYX · DEMO',
      specialties: [i % 2 ? 'Obediencia' : 'Búsqueda deportiva'],
      notes: 'Expediente ficticio de demostración. No corresponde a un animal real.',
    });
    dogs.push(d);
    if (i < 6 || i >= 12)
      await api(`/catalog/dogs/${d.id}`, 'PATCH', {
        commercialCategory: i < 6 ? 'FOR_BREEDING' : 'FOR_SALE',
        salePublished: i >= 12,
        salePrice: i >= 12 ? String(850000 + (i - 12) * 75000) : null,
        saleCurrency: 'CRC',
        saleContact: i >= 12 ? 'Contacto de demostración: consultar a administración' : null,
        publicDescription: `${d.name}: compañero de demostración para explorar el sistema.`,
        achievements: 'Ejemplo: evaluación interna de obediencia completada. Datos ficticios.',
        trainingSummary: 'Trabajo de obediencia y socialización registrado como demostración.',
        functionalities: 'Compañía activa y entrenamiento deportivo. Aptitudes ficticias para pruebas.',
        pedigreeSummary: 'Línea de demostración; no representa un pedigrí oficial.',
        healthSummary:
          'Información de muestra autorizada por administración; consultar la valoración real antes de una compra.',
      });
    for (let j = 0; j < 4; j++) {
      await api(`/dogs/${d.id}/training`, 'POST', {
        occurredAt: instant(-24 + j * 7, 8 + (i % 6)),
        discipline: i % 2 ? 'Obediencia' : 'Búsqueda deportiva',
        objective: ['Vínculo y llamada', 'Permanencia', 'Discriminación de estímulos', 'Generalización'][j],
        durationMinutes: 20 + j * 5,
        location: 'Pista DEMO',
        exercises: 'Sesión ficticia de 10 intentos para comprobar evolución.',
        successes: 5 + j,
        falseAlerts: 1,
        misses: 4 - j,
        score: 50 + j * 10,
        notes: 'Registro de prueba; no describe un entrenamiento real.',
      });
      await api(`/dogs/${d.id}/weights`, 'POST', { date: date(-90 + j * 30), kg: 27 + (i % 6) + j * 0.2 });
    }
    await api(`/dogs/${d.id}/vaccinations`, 'POST', {
      product: 'Vacunación de demostración',
      appliedDate: date(-90),
      nextDueDate: date((i % 5) * 7 + 1),
      batch: `LOTE-DEMO-${i + 1}`,
      professional: 'Profesional ficticio DEMO',
      notes: 'Datos sintéticos, sin indicación médica.',
    });
    await api(`/trainer/dogs/${d.id}/medical`, 'POST', {
      eventDate: date(-5),
      kind: 'CONSULTATION',
      title: 'Revisión general DEMO',
      notes:
        'Observación ficticia para probar el historial privado. No representa una evaluación clínica real.',
      professional: 'Profesional ficticio DEMO',
    });
    await api('/appointments', 'POST', {
      dogId: d.id,
      title: i % 2 ? 'Seguimiento de entrenamiento DEMO' : 'Revisión de bienestar DEMO',
      startsAt: instant((i % 10) + 1, 9 + (i % 5)),
      location: 'Centro ORYX DEMO',
      professional: coach.name,
      remindBeforeHours: 24,
    });
    if (i < 12) {
      const p = await api(`/follow-up/dogs/${d.id}/plans`, 'POST', {
        title: `Progreso de ${d.name}`,
        discipline: 'Obediencia y autocontrol',
        startDate: date(-30),
        dueDate: date(i - 2),
        goals: [
          {
            title: 'Llamada fiable',
            criterion: 'Porcentaje de respuestas correctas en 10 intentos de demostración.',
            targetScore: 80,
          },
          {
            title: 'Permanencia',
            criterion: 'Porcentaje de ejercicios completados en 10 intentos de demostración.',
            targetScore: 80,
          },
        ],
      });
      plans.push(p);
      for (const g of p.goals)
        for (let n = 0; n < 3; n++)
          await api(`/follow-up/goals/${g.id}/evaluations`, 'POST', {
            eventDate: date(-20 + n * 9),
            score: 45 + n * 20,
            notes: `Evaluación ficticia ${n + 1}; registro para observar evolución.`,
          });
      if (i < 2) {
        const current = (await api(`/follow-up/dogs/${d.id}`)).plans.find((x) => x.id === p.id);
        await api(`/follow-up/plans/${p.id}`, 'PATCH', { revision: current.revision, status: 'COMPLETED' });
      }
    }
    if (i < 8)
      await api(`/follow-up/dogs/${d.id}/certificates`, 'POST', {
        title: 'Evaluación interna de obediencia DEMO',
        issuer: 'Centro de demostración ORYX',
        reference: `DEMO-CERT-${i + 1}`,
        issueDate: date(-120),
        expiresDate: date(i === 0 ? -3 : i * 10 + 1),
        notes: 'Acreditación ficticia para probar vencimientos; no es un certificado oficial.',
      });
    if (external)
      await attachment(`/dogs/${d.id}/documents`, `Historial de demostración de ${d.name}`, 'CLINICAL');
  }
  console.log('18 perros adultos con salud, entrenamiento, objetivos y certificaciones.');
  for (let i = 0; i < 3; i++) {
    const dam = dogs[i * 2 + 1],
      sire = dogs[i * 2],
      birth = -100 + i * 30;
    const p = await api('/breeding/plans', 'POST', {
      damId: dam.id,
      sireId: sire.id,
      plannedDate: date(birth - 63),
      matingDate: date(birth - 63),
      status: 'MATED',
      notes: 'Cruce histórico ficticio DEMO.',
    });
    const l = await api('/breeding/litters', 'POST', {
      code: `DEMO-CAMADA-${i + 1}`,
      damId: dam.id,
      sireId: sire.id,
      planId: p.id,
      birthDate: date(birth),
      liveBorn: 4,
      stillBorn: 0,
      notes: 'Nacimiento ficticio para pruebas.',
    });
    litters.push(l);
    const names = [
      ['Astra', 'Argo', 'Aura', 'Ares'],
      ['Bala', 'Baco', 'Brisa', 'Balto'],
      ['Cora', 'Cosmo', 'Cleo', 'Ciro'],
    ][i];
    for (let j = 0; j < 4; j++) {
      const puppy = await api(`/breeding/litters/${l.id}/puppies`, 'POST', {
        name: names[j],
        sex: j % 2 ? 'MALE' : 'FEMALE',
        breed: dam.breed,
        coat: 'Color de muestra',
        weightKg: 0.45 + j * 0.02,
      });
      puppies.push(puppy);
      await api(`/dogs/${puppy.id}/weights`, 'POST', { date: date(-2), kg: 4.1 + j * 0.3 + i });
      await api(`/trainer/dogs/${puppy.id}/medical`, 'POST', {
        eventDate: date(-3),
        kind: 'OBSERVATION',
        title: 'Seguimiento de cachorro DEMO',
        notes: 'Registro ficticio de seguimiento para comprobar propiedad e historial.',
      });
      if (j >= 2)
        await api(`/catalog/dogs/${puppy.id}`, 'PATCH', {
          commercialCategory: 'FOR_SALE',
          salePublished: true,
          salePrice: String(650000 + i * 50000),
          saleCurrency: 'CRC',
          saleContact: 'Contacto DEMO: consultar a administración',
          publicDescription: `${puppy.name}, cachorro de la camada DEMO ${i + 1}.`,
          pedigreeSummary: `Madre: ${dam.name}. Padre: ${sire.name}. Filiación ficticia de demostración.`,
          trainingSummary: 'Ejemplo de socialización inicial.',
          healthSummary: 'Resumen de demostración autorizado.',
        });
    }
    if (i < 2)
      await api('/breeding/plans', 'POST', {
        damId: dam.id,
        sireId: sire.id,
        plannedDate: date(14 + i * 14),
        status: 'PLANNED',
        published: true,
        publicTitle: `Próxima camada ${dam.name} × ${sire.name}`,
        publicDescription: 'Preventa ficticia: permite explorar los padres y consultar condiciones.',
        puppyPrice: String(700000 + i * 100000),
        currency: 'CRC',
        contact: 'Contacto DEMO: consultar a administración',
      });
  }
  for (let i = 0; i < 4; i++) {
    const puppy = puppies[[0, 1, 4, 5][i]],
      owner = owners[i % owners.length];
    const reservation = await api('/reservations', 'POST', {
      litterId: puppy.litterId,
      dogId: puppy.id,
      customer: owner.name,
      customerPartyId: owner.partyId,
      contact: 'Contacto ficticio DEMO',
      reservedDate: date(-2),
      expiresDate: date(14),
      amount: '700000',
      currency: 'CRC',
      conditions: 'Apartado de demostración sin efectos comerciales.',
    });
    accounts.push(reservation.account);
    if (i !== 3)
      await api(`/finance/accounts/${reservation.account.id}/payments`, 'POST', {
        amount: i === 0 ? '700000' : '150000',
        paidDate: date(-1),
        method: 'Transferencia DEMO',
        reference: `DEMO-ABONO-${i + 1}`,
        requestId: randomUUID(),
      });
    if (i === 0)
      await api(`/reservations/${reservation.id}/close`, 'POST', {
        status: 'DELIVERED',
        closedDate: day,
        reason: 'Entrega ficticia para probar transferencia de propiedad.',
      });
    if (i === 3)
      await api(`/reservations/${reservation.id}/close`, 'POST', {
        status: 'CANCELLED',
        closedDate: day,
        reason: 'Cancelación ficticia para comprobar liberación de cupos.',
      });
  }
  console.log('3 camadas, 12 cachorros, 2 preventas y 4 apartados con distintos estados.');
  for (let i = 0; i < 3; i++) {
    const institution = await api('/institutions', 'POST', {
      name: ['Municipalidad Valle Verde DEMO', 'Municipalidad Monte Lago DEMO', 'Club Canino Horizonte DEMO'][
        i
      ],
      kind: i < 2 ? 'Municipalidad' : 'Organización',
      notes: 'Institución ficticia para pruebas.',
    });
    await api(`/institutions/${institution.id}/contacts`, 'POST', {
      name: 'Contacto de demostración',
      position: 'Coordinación DEMO',
      email: `contacto${i}@example.invalid`,
    });
    const contract = await api('/contracts', 'POST', {
      number: `DEMO-CON-${i + 1}`,
      institutionId: institution.id,
      title: [
        'Programa municipal de entrenamiento',
        'Seguimiento de unidad canina',
        'Taller de socialización',
      ][i],
      amount: String(950000 + i * 250000),
      currency: 'CRC',
      periodicity: 'Mensual',
      startDate: date(-30),
      endDate: date(20 + i * 20),
      status: i < 2 ? 'ACTIVE' : 'DRAFT',
      responsible: 'Coordinación DEMO',
      clauses: 'Condiciones ficticias sin valor contractual.',
      notes: 'Demostración.',
    });
    contracts.push(contract);
    if (i < 2) {
      await api(`/contracts/${contract.id}/assignments`, 'POST', {
        dogId: dogs[6 + i * 2].id,
        handlerId: coaches[i].id,
        role: 'Seguimiento DEMO',
        startDate: date(-20),
        endDate: date(15 + i * 15),
      });
      for (let j = 0; j < 3; j++)
        await api('/operations/services', 'POST', {
          contractId: contract.id,
          occurredAt: instant(-15 + j * 5, 8),
          endsAt: instant(-15 + j * 5, 10),
          location: 'Instalación DEMO',
          publicSummary: 'Sesión de acompañamiento y seguimiento de demostración.',
          internalNotes: 'Información interna ficticia.',
        });
    }
    await attachment(`/contracts/${contract.id}/files`, 'Contrato ficticio de demostración');
  }
  for (let i = 0; i < 8; i++) {
    const amount = String(100000 + i * 25000);
    const account = await api('/finance/accounts', 'POST', {
      direction: i % 2 ? 'PAYABLE' : 'RECEIVABLE',
      party: i % 2 ? 'Proveedor ficticio DEMO' : 'Cliente de demostración',
      concept: [
        'Programa de entrenamiento',
        'Compra de alimento',
        'Seguimiento municipal',
        'Material de pista',
      ][i % 4],
      category: i % 2 ? 'Operación' : 'Servicios',
      costCenter: 'Unidad DEMO',
      amount,
      currency: 'CRC',
      issueDate: date(-20),
      dueDate: date(i < 3 ? -3 : 7 + i),
      ...(i % 2 ? {} : { dogId: dogs[6 + (i % 6)].id }),
      notes: 'Cuenta ficticia para comprobar saldos.',
    });
    accounts.push(account);
    if (i < 5)
      await api(`/finance/accounts/${account.id}/payments`, 'POST', {
        amount: i < 2 ? amount : '50000',
        paidDate: date(-1),
        method: 'Transferencia DEMO',
        requestId: randomUUID(),
      });
    if (i === 3)
      await api(`/finance/accounts/${account.id}/payments`, 'POST', {
        kind: 'REFUND',
        amount: '10000',
        paidDate: day,
        method: 'Devolución DEMO',
        notes: 'Devolución parcial ficticia.',
        requestId: randomUUID(),
      });
    if (i === 0) await attachment(`/finance/accounts/${account.id}/files`, 'Comprobante ficticio de pago');
  }
  for (let i = 0; i < 6; i++) {
    const product = await api('/inventory/products', 'POST', {
      sku: `DEMO-SKU-${i + 1}`,
      name: [
        'Alimento adulto DEMO',
        'Alimento cachorro DEMO',
        'Premios DEMO',
        'Correas DEMO',
        'Material de pista DEMO',
        'Insumos de higiene DEMO',
      ][i],
      category: i < 3 ? 'Alimentación' : 'Equipamiento',
      unit: i < 3 ? 'kg' : 'unidad',
      minimum: i === 0 ? '90' : '10',
    });
    const lot = await api(`/inventory/products/${product.id}/lots`, 'POST', {
      batch: `DEMO-LOTE-${i + 1}`,
      expiresDate: date(i === 5 ? -1 : 90 + i * 15),
      unitCost: String(2000 + i * 1000),
      currency: 'CRC',
    });
    await api(`/inventory/lots/${lot.id}/movements`, 'POST', {
      kind: 'IN',
      quantity: '100',
      movementDate: date(-10),
      reason: 'Ingreso ficticio DEMO',
      requestId: randomUUID(),
    });
    await api(`/inventory/lots/${lot.id}/movements`, 'POST', {
      kind: i === 5 ? 'DISPOSAL' : 'OUT',
      quantity: i === 5 ? '5' : '25',
      movementDate: date(-1),
      reason: i === 5 ? 'Baja de demostración' : 'Consumo de demostración',
      area: 'Centro DEMO',
      ...(i < 3 ? { dogId: dogs[i].id } : {}),
      requestId: randomUUID(),
    });
  }
  for (let i = 6; i < 10; i++)
    await api(`/dogs/${dogs[i].id}/movements`, 'POST', {
      date: instant(-1),
      location: i % 2 ? 'Con propietario DEMO' : 'Centro ORYX DEMO',
      custodianPartyId: i % 2 ? dogs[i].ownerPartyId : coaches[i % 3].partyId,
      notes: 'Movimiento ficticio; conserva propietario.',
    });
  await command(['apps/api/dist/worker.js', '--once']);
  const counts = {};
  const check = new pg.Client({ connectionString: env.DATABASE_URL });
  await check.connect();
  for (const table of [
    'User',
    'Party',
    'Dog',
    'Litter',
    'BreedingPlan',
    'Reservation',
    'TrainingSession',
    'TrainingPlan',
    'TrainingGoal',
    'GoalEvaluation',
    'Certification',
    'Vaccination',
    'Weight',
    'MedicalEntry',
    'Appointment',
    'Document',
    'Contract',
    'ServiceLog',
    'Account',
    'Payment',
    'Product',
    'StockLot',
    'StockMovement',
    'AuditLog',
  ])
    counts[table] = (await check.query(`SELECT COUNT(*)::int n FROM "${table}"`)).rows[0].n;
  assert.equal(counts.Dog, 30);
  assert.equal(counts.User, 10);
  assert.equal(counts.Litter, 3);
  const stock = (
    await check.query(
      'SELECT l.id,l.quantity=SUM(CASE WHEN m.kind=\'IN\' THEN m.quantity ELSE -m.quantity END) valid FROM "StockLot" l JOIN "StockMovement" m ON m."lotId"=l.id GROUP BY l.id',
    )
  ).rows;
  assert.ok(stock.every((r) => r.valid));
  await check.end();
  await writeFile(
    path.join(root, '.local/demo-runtime.json'),
    JSON.stringify(
      {
        database,
        env: Object.fromEntries(
          [
            'DATABASE_URL',
            'APP_ORIGIN',
            'API_HOST',
            'API_PORT',
            'API_URL',
            'APP_ENCRYPTION_KEY',
            'STORAGE_DRIVER',
            'STORAGE_PATH',
            'COOKIE_SECURE',
            'SMTP_HOST',
            'NODE_ENV',
            'DEMO_MODE',
            'BACKUP_ENABLED',
          ].map((key) => [key, env[key]]),
        ),
        users,
        dogs: dogs.map((d) => ({ id: d.id, name: d.name })),
        counts,
        preparedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ prepared: true, database, counts }, null, 2));
} finally {
  for (const child of children) child.kill('SIGTERM');
}
