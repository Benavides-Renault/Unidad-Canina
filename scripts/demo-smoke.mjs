import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from 'pg';
import { root, loadEnv } from './env.mjs';
loadEnv();
process.chdir(root);
assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/valkyr_demo_\d+$/);
const runtime = JSON.parse(await readFile('.local/demo-runtime.json', 'utf8'));
const apiBase = 'http://127.0.0.1:4000/api/v1';
class Client {
  cookies = {};
  async call(route, method = 'GET', body) {
    const res = await fetch(apiBase + route, {
      method,
      headers: {
        origin: 'http://localhost:3000',
        cookie: Object.entries(this.cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join('; '),
        'x-csrf-token': this.cookies.valkyr_csrf || '',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const value of res.headers.getSetCookie()) {
      const [pair] = value.split(';'),
        i = pair.indexOf('=');
      this.cookies[pair.slice(0, i)] = pair.slice(i + 1);
    }
    return res;
  }
  async json(route, method = 'GET', body) {
    const r = await this.call(route, method, body),
      v = await r.json();
    assert.ok(r.ok, `${route}: ${JSON.stringify(v)}`);
    return v;
  }
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  const privilege = (
    await db.query('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user')
  ).rows[0];
  assert.deepEqual(privilege, { rolsuper: false, rolcreatedb: false, rolcreaterole: false });
  await assert.rejects(db.query('SELECT * FROM "_prisma_migrations"'));
  await assert.rejects(db.query('ALTER TABLE "AuditLog" DISABLE TRIGGER USER'));
  const verifiedUsers = [];
  let admin;
  for (const user of runtime.users) {
    const client = new Client();
    await client.json('/auth/login', 'POST', { username: user.username, password: user.password });
    const me = await client.json('/auth/me');
    assert.equal(me.role, user.role);
    if (user.role === 'ADMIN') {
      admin ||= client;
      assert.equal((await client.json('/dogs?pageSize=100')).total, 18);
      assert.equal((await db.query('SELECT COUNT(*)::int n FROM "Dog"')).rows[0].n, 30);
    } else {
      const route = user.role === 'TRAINER' ? '/trainer/dogs' : '/portal/dogs';
      const list = await client.json(`${route}?pageSize=100`);
      const sql =
        user.role === 'TRAINER'
          ? 'SELECT id FROM "Dog" WHERE "assignedTrainerId"=$1 AND "archivedAt" IS NULL'
          : 'SELECT id FROM "Dog" WHERE "ownerPartyId"=$1 AND "archivedAt" IS NULL';
      const expected = (await db.query(sql, [user.role === 'TRAINER' ? user.id : user.partyId])).rows
        .map((r) => r.id)
        .sort();
      assert.deepEqual(list.items.map((d) => d.id).sort(), expected);
      for (const dog of list.items) {
        await client.json(`${route}/${dog.id}`);
        await client.json(`/follow-up/dogs/${dog.id}`);
      }
      const other = (await db.query('SELECT id FROM "Dog" WHERE id<>ALL($1::uuid[]) LIMIT 1', [expected]))
        .rows[0].id;
      assert.equal((await client.call(`${route}/${other}`)).status, 404);
      assert.equal((await client.call('/users')).status, 403);
      if (user.role === 'CLIENT') {
        const gallery = await client.json('/portal/gallery/dogs?pageSize=100');
        assert.equal(gallery.total, 12);
        const crosses = await client.json('/portal/gallery/crosses?pageSize=100');
        assert.equal(crosses.total, 2);
      }
    }
    verifiedUsers.push(user.username);
  }
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const end = new Date(Date.parse(`${day}T00:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10);
  for (const route of [
    '/dashboard',
    `/calendar/events?from=${day}&to=${end}`,
    '/training?pageSize=100',
    '/appointments?pageSize=100',
    '/breeding/plans',
    '/breeding/litters',
    '/reservations',
    '/finance/accounts',
    '/finance/summary',
    '/inventory/products',
    '/contracts',
    '/institutions',
    '/operations/services',
    '/operations/assignments',
    '/users',
    '/parties',
    '/audit',
    '/notifications',
  ])
    await admin.json(route);
  for (const route of [`/dogs/${runtime.dogs[0].id}/card.pdf`, `/dogs/${runtime.dogs[0].id}/report.pdf`]) {
    const res = await admin.call(route);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/pdf/);
    assert.equal(
      Buffer.from(await res.arrayBuffer())
        .subarray(0, 5)
        .toString(),
      '%PDF-',
    );
  }
  for (const route of ['/dogs/export.csv', '/finance/export.csv'])
    assert.equal((await admin.call(route)).status, 200);
  const times = [];
  for (let batch = 0; batch < 10; batch++)
    await Promise.all(
      Array.from({ length: 10 }, async () => {
        const start = performance.now();
        await admin.json('/dogs?pageSize=100');
        times.push(performance.now() - start);
      }),
    );
  times.sort((a, b) => a - b);
  const status = await admin.json('/system/status');
  assert.equal(status.workerHealthy, true);
  assert.equal(status.storageWritable, true);
  assert.equal(status.backupEnabled, true);
  assert.equal(status.backupHealthy, true);
  const result = {
    passed: true,
    checkedAt: new Date().toISOString(),
    verifiedUsers,
    apiModules: 18,
    pdfAndCsv: true,
    runtimeLeastPrivilege: true,
    concurrentReads: 100,
    p95ms: Math.round(times[94]),
    workerHealthy: status.workerHealthy,
    backupHealthy: status.backupHealthy,
    dogs: 30,
  };
  await writeFile('.local/demo-smoke.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await db.end();
}
