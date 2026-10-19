import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createShareGateway } from '../scripts/share-gateway.mjs';

// Native HTTP keeps the explicit Host header needed to simulate the tunnel.
function request(url, { body, ...options } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, async (res) => {
      const chunks = [];
      for await (const chunk of res) chunks.push(chunk);
      const headers = new Headers();
      for (const [key, value] of Object.entries(res.headers))
        for (const item of Array.isArray(value) ? value : [value])
          if (item !== undefined) headers.append(key, item);
      resolve(
        new Response(res.statusCode === 204 ? null : Buffer.concat(chunks), {
          status: res.statusCode,
          headers,
        }),
      );
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('temporary sharing requires a private link and preserves origin, cookies and streaming', async () => {
  const token = randomBytes(32).toString('base64url');
  const origin = 'https://oryx-test.trycloudflare.com';
  const upstream = http
    .createServer(async (req, res) => {
      let body = '';
      for await (const c of req) body += c;
      res.setHeader('Set-Cookie', ['oryx_session=example; HttpOnly; Path=/', 'oryx_csrf=example; Path=/']);
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
      res.end(
        JSON.stringify({
          origin: req.headers.origin,
          cookie: req.headers.cookie,
          body,
          host: req.headers.host,
        }),
      );
    })
    .listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const target = `http://127.0.0.1:${upstream.address().port}`;
  const gateway = createShareGateway({ token, publicOrigin: origin, upstream: target }).listen(
    0,
    '127.0.0.1',
  );
  await once(gateway, 'listening');
  const call = (path, { headers = {}, ...options } = {}) =>
    request(`http://127.0.0.1:${gateway.address().port}${path}`, {
      ...options,
      headers: { host: new URL(origin).host, ...headers },
    });
  try {
    const landing = await call('/');
    assert.equal(landing.status, 200);
    assert.match(await landing.text(), /enlace completo/);
    assert.equal((await call('/api/v1/dogs')).status, 403);
    for (const path of [
      '/catalogo?tipo=crosses&id=00000000-0000-4000-a000-000000000001',
      '/api/v1/public/settings',
      '/api/v1/public/dogs?page=1',
      '/api/v1/public/crosses/00000000-0000-4000-a000-000000000001',
      '/api/v1/public/photos/00000000-0000-4000-a000-000000000001',
      '/_next/static/chunks/public-site.js',
      '/oryx-logo.png',
    ])
      assert.equal((await call(path)).status, 200, path);
    for (const path of [
      '/api/v1/inquiries',
      '/api/v1/public/../dogs',
      '/api/v1/public/settings/private',
      '/_next/server/app.js',
    ])
      assert.equal((await call(path)).status, 403, path);
    assert.equal(
      (await call('/api/v1/public/settings', { method: 'PATCH', headers: { origin } })).status,
      403,
    );
    assert.equal((await call('/api/v1/public/inquiries', { method: 'POST' })).status, 403);
    assert.equal(
      (
        await call('/api/v1/public/inquiries', {
          method: 'POST',
          headers: { origin: 'https://evil.example' },
        })
      ).status,
      403,
    );
    assert.equal(
      (await call('/api/v1/public/inquiries', { method: 'POST', headers: { origin } })).status,
      200,
    );
    assert.equal((await call('/', { headers: { host: 'evil.example' } })).status, 421);
    const unlock = (key, suppliedOrigin = origin) =>
      call('/__share/unlock', {
        method: 'POST',
        headers: { origin: suppliedOrigin, 'content-type': 'application/json' },
        body: JSON.stringify({ token: key }),
      });
    assert.equal((await unlock('invalid')).status, 403);
    assert.equal((await unlock(token, 'https://evil.example')).status, 403);
    const admitted = await unlock(token);
    assert.equal(admitted.status, 204);
    assert.match(admitted.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/);
    const cookie = admitted.headers.get('set-cookie').split(';')[0] + '; oryx_csrf=example';
    assert.equal((await call('/api/v1/auth/login', { method: 'POST', headers: { cookie } })).status, 403);
    assert.equal(
      (
        await call('/api/v1/auth/login', {
          method: 'POST',
          headers: { cookie, origin: 'https://evil.example' },
        })
      ).status,
      403,
    );
    const proxied = await call('/api/v1/auth/login', {
      method: 'POST',
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: '{"username":"visitor"}',
    });
    assert.equal(proxied.status, 200);
    assert.ok(proxied.headers.getSetCookie().every((c) => c.includes('Secure')));
    assert.equal(proxied.headers.get('access-control-allow-origin'), origin);
    const payload = await proxied.json();
    assert.equal(payload.origin, target);
    assert.equal(payload.cookie, 'oryx_csrf=example');
    assert.equal(payload.body, '{"username":"visitor"}');
    assert.equal(proxied.headers.get('cache-control'), 'no-store');
    assert.equal(proxied.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  } finally {
    await Promise.all([new Promise((r) => gateway.close(r)), new Promise((r) => upstream.close(r))]);
  }
});

test('temporary sharing expires and refuses nonlocal upstreams', async () => {
  const token = randomBytes(32).toString('base64url');
  assert.throws(() =>
    createShareGateway({ token, publicOrigin: 'https://example.com', upstream: 'http://external.example' }),
  );
  const server = createShareGateway({ token, publicOrigin: 'https://example.com', lifetimeMs: -1 }).listen(
    0,
    '127.0.0.1',
  );
  await once(server, 'listening');
  try {
    assert.equal(
      (await request(`http://127.0.0.1:${server.address().port}/`, { headers: { host: 'example.com' } }))
        .status,
      410,
    );
  } finally {
    await new Promise((r) => server.close(r));
  }
});
