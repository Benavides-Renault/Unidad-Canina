import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const target = process.argv[2] || 'current';
if (!/^[a-z0-9-]+$/.test(target)) throw new Error('Usa una etiqueta alfanumérica.');
const password = process.env.BENCHMARK_PASSWORD;
if (!password) throw new Error('Configura BENCHMARK_PASSWORD para las dos cuentas de prueba locales.');
await mkdir('.local', { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto('http://localhost:3000');
  await expect(page.getByLabel('Usuario', { exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const login = await page.evaluate(() => {
    const scripts = performance
      .getEntriesByType('resource')
      .filter((r) => r.name.includes('/_next/') && r.name.split('?')[0].endsWith('.js'));
    return {
      requests: scripts.length,
      decodedBytes: scripts.reduce((n, r) => n + r.decodedBodySize, 0),
      transferBytes: scripts.reduce((n, r) => n + r.transferSize, 0),
    };
  });
  await page.getByLabel('Usuario', { exact: true }).fill(process.env.BENCHMARK_ADMIN || 'admin');
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Abrir navegación' })).toBeVisible();
  const dashboard = await page.evaluate(async () => {
    const samples = [];
    let bytes = 0;
    for (let n = 0; n < 8; n++) {
      const start = performance.now();
      const response = await fetch('/api/v1/dashboard');
      if (!response.ok) throw new Error(`Dashboard ${response.status}`);
      bytes = (await response.text()).length;
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    return { bytes, medianMs: (samples[3] + samples[4]) / 2 };
  });
  const client = await browser.newPage({ viewport: { width: 390, height: 844 } });
  client.on('pageerror', (e) => errors.push(e.message));
  await client.goto('http://localhost:3000');
  await client.getByLabel('Usuario', { exact: true }).fill(process.env.BENCHMARK_CLIENT || 'sofia.cliente');
  await client.getByLabel('Contraseña', { exact: true }).fill(password);
  await client.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await client.getByRole('tab', { name: 'Galería de venta y preventa' }).click();
  await expect(client.locator('.portal-card').first()).toBeVisible();
  await client.waitForLoadState('networkidle');
  const gallery = await client.evaluate(() => {
    const resources = performance
      .getEntriesByType('resource')
      .filter((r) => r.name.includes('/portal/gallery/'));
    return {
      requests: resources.length,
      photos: resources.filter((r) => r.name.includes('/photos/')).length,
      decodedBytes: resources.reduce((n, r) => n + r.decodedBodySize, 0),
      endpoints: resources.filter((r) => !r.name.includes('/photos/')).map((r) => new URL(r.name).pathname),
    };
  });
  assert.deepEqual(errors, []);
  const result = { target, login, dashboard, gallery, errors, checkedAt: new Date().toISOString() };
  await writeFile(`.local/performance-${target}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
