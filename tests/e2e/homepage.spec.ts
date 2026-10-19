import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const runtime = JSON.parse(readFileSync('.local/test-runtime.json', 'utf8'));

for (const width of [390, 1440]) {
  test(`portada pública a ${width}px: encabezado, camadas, perros y pie de página`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Navegación pública' });
    await expect(page.getByRole('heading', { name: /Cada gran vínculo/ })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Perros disponibles' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Camadas', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/acceso');
    await nav.getByRole('link', { name: 'Camadas', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Camadas y preventa' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('.public-catalog .portal-card').first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Camadas y preventa' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await nav.getByRole('link', { name: 'Perros disponibles' }).click();
    await expect(page.getByRole('tab', { name: 'Perros en venta' })).toHaveAttribute('aria-selected', 'true');
    const footer = page.getByRole('contentinfo');
    await footer.scrollIntoViewIfNeeded();
    await expect(footer.getByRole('heading', { name: 'Explora' })).toBeVisible();
    await expect(footer.getByRole('link', { name: /7032 7517/ })).toHaveAttribute('href', 'tel:+50670327517');
    await expect(footer.getByRole('link', { name: 'Escribir por WhatsApp' })).toHaveAttribute(
      'href',
      /^https:\/\/wa\.me\/50670327517\?text=/,
    );
    await footer.getByRole('button', { name: 'Solicita tu cuenta' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar formulario', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await footer.screenshot({ path: `test-results/home-footer-${width}.png` });
    await nav.screenshot({ path: `test-results/home-header-${width}.png` });
  });
}

test('cualquier visitante abre el inicio de sesión desde la portada y entra a su panel', async ({ page }) => {
  const initial = await (await page.request.get('/acceso')).text();
  expect(initial).toMatch(/<form[^>]*method="post"/);
  expect(initial).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*disabled)[^>]*>/);
  const credentialUrls: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.searchParams.has('password') || url.searchParams.has('username'))
      credentialUrls.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('.auth-page')).toHaveCount(0);
  expect((await page.request.get('/api/v1/dogs')).status()).toBe(401);
  await page
    .getByRole('navigation', { name: 'Navegación pública' })
    .getByRole('link', { name: 'Iniciar sesión' })
    .click();
  await expect(page).toHaveURL(/\/acceso$/);
  await expect(page.locator('#private-invitation')).toHaveCount(0);
  await page.getByLabel('Usuario', { exact: true }).fill(runtime.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(runtime.password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/panel$/);
  await expect(page.getByRole('heading', { name: /Buenas|Buenos/ })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Cada gran vínculo/ })).toBeVisible();
  expect(credentialUrls).toEqual([]);
});
