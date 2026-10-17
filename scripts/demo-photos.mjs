import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { root, loadEnv } from './env.mjs';
loadEnv();
process.chdir(root);
// Explicit opt-in and database guard: stock photographs never enter a normal installation.
assert.ok(process.argv.includes('--demo-only'), 'Usa --demo-only.');
assert.equal(process.env.DEMO_MODE, 'true');
assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/valkyr_demo_\d+$/);
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname));
const sources = [
  { id: 20368539, group: 'shepherd', author: 'Julissa Pires', slug: 'german-shepherd-dog' },
  { id: 18058222, group: 'shepherd', author: 'Nano Erdozain', slug: 'close-up-of-a-german-shepherd-dog' },
  { id: 30211148, group: 'malinois', author: 'Diana', slug: 'majestic-belgian-malinois-in-natural-setting' },
  { id: 6641155, group: 'malinois', author: 'Zacharias Korsalka', slug: 'belgian-shepherd-malinois-dog' },
  {
    id: 9983475,
    group: 'puppy',
    author: 'Дмитрий Пропадалин',
    slug: 'close-up-photo-of-a-cute-german-shepherd-puppy',
  },
  { id: 20600677, group: 'puppy', author: 'Nothing Ahead', slug: 'adorable-german-shepherd-puppy' },
];
await mkdir('assets/demo', { recursive: true });
for (const source of sources) {
  source.source = `https://www.pexels.com/photo/${source.slug}-${source.id}/`;
  source.download = `https://images.pexels.com/photos/${source.id}/pexels-photo-${source.id}.jpeg?fm=jpg&w=1000&q=85`;
  source.license = 'https://www.pexels.com/license/';
  source.file = `assets/demo/pexels-${source.id}.jpg`;
  let bytes;
  try {
    bytes = await readFile(source.file);
  } catch {
    const response = await fetch(source.download, { signal: AbortSignal.timeout(30000) });
    assert.ok(response.ok, `Descarga ${source.id}: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.length < 2_000_000 && bytes[0] === 255 && bytes[1] === 216, 'JPEG inválido.');
    await writeFile(source.file, bytes, { flag: 'wx' });
  }
  source.sha256 = createHash('sha256').update(bytes).digest('hex');
}
await writeFile('assets/demo/sources.json', JSON.stringify(sources, null, 2) + '\n');
const cookies = {};
async function call(route, method = 'GET', body) {
  const multipart = body instanceof FormData;
  const response = await fetch('http://127.0.0.1:4000/api/v1' + route, {
    method,
    headers: {
      origin: 'http://localhost:3000',
      cookie: Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; '),
      'x-csrf-token': cookies.valkyr_csrf || '',
      ...(body && !multipart ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
  });
  for (const value of response.headers.getSetCookie()) {
    const [pair] = value.split(';'),
      i = pair.indexOf('=');
    cookies[pair.slice(0, i)] = pair.slice(i + 1);
  }
  const result = await response.json();
  assert.ok(response.ok, `${route}: ${JSON.stringify(result)}`);
  return result;
}
assert.equal((await call('/health')).demoMode, true);
await call('/auth/login', 'POST', { username: 'admin', password: '1234' });
const dogs = await call('/dogs?includePuppies=true&pageSize=100');
assert.equal(dogs.total, 30);
let uploaded = 0;
for (const [index, dog] of dogs.items.entries()) {
  if (dog.photoId) continue;
  const group = dog.isPuppy || dog.litterId ? 'puppy' : /malinois/i.test(dog.breed) ? 'malinois' : 'shepherd';
  const choices = sources.filter((s) => s.group === group),
    source = choices[index % choices.length];
  const form = new FormData();
  form.set('category', 'PHOTO');
  form.set(
    'file',
    new Blob([await readFile(source.file)], { type: 'image/jpeg' }),
    `DEMO-ilustrativa-Pexels-${source.id}.jpg`,
  );
  await call(`/dogs/${dog.id}/documents`, 'POST', form);
  uploaded++;
}
console.log(JSON.stringify({ uploaded, sources: sources.length, illustrativeOnly: true }));
