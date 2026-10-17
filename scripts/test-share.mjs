import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { root } from './env.mjs';
process.chdir(root);
const shared = JSON.parse(await readFile('.local/share-runtime.json', 'utf8'));
assert.ok(!shared.stoppedAt && new Date(shared.expiresAt) > new Date());
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const adminContext = await browser.newContext();
  assert.equal((await adminContext.request.get(shared.origin + '/api/v1/dogs')).status(), 403);
  const page = await adminContext.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(shared.shareUrl);
  await page.getByLabel('Usuario', { exact: true }).fill('admin');
  await page.getByLabel('Contraseña', { exact: true }).fill('1234');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Buenas|Buenos/ })).toBeVisible({ timeout: 30000 });
  assert.equal(new URL(page.url()).hash, '');
  const cookies = await adminContext.cookies();
  assert.ok(
    cookies
      .filter((c) => ['__Host-valkyr_share', 'valkyr_session', 'valkyr_csrf'].includes(c.name))
      .every((c) => c.secure),
  );
  for (const name of ['Nuestra unidad', 'Crianza', 'Finanzas']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('main [role="alert"]')).not.toBeAttached();
  }
  await page.screenshot({ path: '.local/share-admin.png', fullPage: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: 'America/Costa_Rica',
  });
  const client = await context.newPage();
  client.on('pageerror', (e) => errors.push(e.message));
  await client.goto(shared.shareUrl);
  await client.getByLabel('Usuario', { exact: true }).fill('sofia.cliente');
  await client.getByLabel('Contraseña', { exact: true }).fill('1234');
  await client.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(client.getByRole('heading', { name: 'Mis perros', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await client.getByRole('tab', { name: 'Galería de venta y preventa', exact: true }).click();
  await expect.poll(() => client.locator('main img').count()).toBeGreaterThan(0);
  for (const photo of await client.locator('main img').all()) {
    await photo.scrollIntoViewIfNeeded();
    await expect
      .poll(() => photo.evaluate((image) => image.complete && image.naturalWidth > 0), { timeout: 30000 })
      .toBe(true);
  }
  await expect
    .poll(
      () =>
        client
          .locator('main img')
          .evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)),
      { timeout: 30000 },
    )
    .toBe(true);
  await client.getByRole('tab', { name: 'Preventa · Cruces', exact: true }).click();
  await client
    .getByRole('button')
    .filter({ has: client.getByRole('heading', { name: 'Próxima camada Maya × Thor', exact: true }) })
    .click();
  await expect(client.getByText('María Vargas · +123456789', { exact: true })).toBeVisible();
  await client.getByRole('button', { name: 'Ver Maya', exact: true }).click();
  await expect(client.getByRole('heading', { name: 'Maya', exact: true })).toBeVisible();
  assert.ok(await client.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await client.screenshot({ path: '.local/share-client-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    origin: shared.origin,
    anonymousApiDenied: true,
    adminLogin: true,
    clientLogin: true,
    secureCookies: true,
    photos: true,
    presales: true,
    mobile: true,
    checkedAt: new Date().toISOString(),
  };
  await writeFile('.local/share-verification.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
