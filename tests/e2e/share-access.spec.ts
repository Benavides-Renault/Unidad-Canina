import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const runtime = JSON.parse(readFileSync('.local/test-runtime.json', 'utf8'));

for (const width of [390, 1440]) {
  test(`catálogo público a ${width}px sin acceso privado desde la primera carga ni al recargar`, async ({
    page,
  }) => {
    const privateRequests: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/v1/') && !path.startsWith('/api/v1/public/')) privateRequests.push(path);
    });
    const response = await page.request.get('/catalogo');
    expect(await response.text()).not.toMatch(
      /auth-page|public-access|private-invitation|#compartir=|Accede con tu enlace privado/,
    );
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/catalogo#acceso');
    for (let load = 0; load < 2; load++) {
      await expect(page.locator('.public-catalog .portal-card').first()).toBeVisible();
      await page.locator('.public-footer').scrollIntoViewIfNeeded();
      await expect(page.locator('.auth-page, .public-access, #private-invitation')).toHaveCount(0);
      await expect(page.getByLabel('Usuario', { exact: true })).toHaveCount(0);
      await expect(page.getByLabel('Contraseña', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Ingresar', exact: true })).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText('Accede con tu enlace privado');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (!load) await page.reload();
    }
    expect(privateRequests).toEqual([]);
    await page.screenshot({ path: `test-results/public-footer-${width}.png` });
  });
}

test('una sesión abierta no añade controles privados al catálogo', async ({ page }) => {
  await page.goto('/panel');
  await page.getByLabel('Usuario', { exact: true }).fill(runtime.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(runtime.password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Buenas|Buenos/ })).toBeVisible();
  await page.goto('/catalogo');
  await expect(page.getByRole('heading', { name: /Cada gran vínculo/ })).toBeVisible();
  await expect(page.locator('.auth-page, .public-access, #private-invitation')).toHaveCount(0);
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveCount(0);
  await page.goto('/panel');
  await expect(page.getByRole('heading', { name: /Buenas|Buenos/ })).toBeVisible();
});
