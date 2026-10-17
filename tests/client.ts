import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
export const runtime = JSON.parse(
  await readFile(new URL('../.local/test-runtime.json', import.meta.url), 'utf8'),
);
export const unitOwnership = {
  ownerPartyId: '00000000-0000-4000-8000-000000000001',
  custodianPartyId: '00000000-0000-4000-8000-000000000001',
};
export class Api {
  cookies: Record<string, string> = {};
  async call(path: string, method = 'GET', body?: unknown) {
    const multipart = body instanceof FormData;
    const res = await fetch(runtime.api + path, {
      method,
      headers: {
        origin: runtime.web,
        ...(body && !multipart ? { 'content-type': 'application/json' } : {}),
        ...(Object.keys(this.cookies).length
          ? {
              cookie: Object.entries(this.cookies)
                .map(([k, v]) => `${k}=${v}`)
                .join('; '),
              'x-csrf-token': this.cookies.valkyr_csrf,
            }
          : {}),
      },
      body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const p = c.split(';')[0],
        i = p.indexOf('=');
      this.cookies[p.slice(0, i)] = p.slice(i + 1);
    }
    return res;
  }
  async json(path: string, method = 'GET', body?: unknown, status = 200) {
    if (path === '/dogs' && method === 'POST') body = { ...unitOwnership, ...(body as object) };
    const res = await this.call(path, method, body),
      value = await res.json();
    assert.equal(res.status, status, `${method} ${path}: ${JSON.stringify(value)}`);
    return value;
  }
  async login(username = runtime.username, password = runtime.password) {
    return this.json('/auth/login', 'POST', { username, password }, 201);
  }
}
