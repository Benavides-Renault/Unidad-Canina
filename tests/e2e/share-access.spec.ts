import { test, expect } from '@playwright/test';

test('el catálogo pide la invitación antes de solicitar credenciales y rechaza otros destinos', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 403,
      json: { message: 'Abre el enlace completo de acceso compartido.' },
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/catalogo');
  await expect(page.getByRole('heading', { name: 'Accede con tu enlace privado' })).toBeVisible();
  await expect(page.getByLabel('Usuario', { exact: true })).not.toBeAttached();
  await expect(page.getByLabel('Contraseña', { exact: true })).not.toBeAttached();
  await expect(page.getByRole('heading', { name: /Cada gran vínculo/ })).toBeVisible();
  const origin = new URL(page.url()).origin;
  for (const value of [
    `https://otro.example/#compartir=${'a'.repeat(43)}`,
    `javascript:alert(1)`,
    `${origin}/catalogo#compartir=${'a'.repeat(43)}`,
    `${origin}/?redirect=otro#compartir=${'a'.repeat(43)}`,
    `${origin}/#compartir=incompleto`,
  ]) {
    await page.getByLabel('Enlace de acceso privado', { exact: true }).fill(value);
    await page.getByRole('button', { name: 'Abrir acceso privado' }).click();
    await expect(page.locator('.auth-panel').getByRole('alert')).toContainText(
      'Pega el enlace privado completo',
    );
    expect(page.url()).toBe(`${origin}/catalogo`);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

for (const status of [403, 410, 503]) {
  test(`un fallo ${status} no se presenta como contraseña incorrecta y permite reintentar`, async ({
    page,
  }) => {
    let available = false;
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        status: available ? 401 : status,
        json: { message: available ? 'Unauthorized' : 'Acceso no disponible' },
      }),
    );
    await page.goto('/catalogo');
    await expect(page.getByRole('heading', { name: 'No pudimos comprobar el acceso' })).toBeVisible();
    await expect(page.getByLabel('Contraseña', { exact: true })).not.toBeAttached();
    available = true;
    await page.getByRole('button', { name: 'Volver a comprobar' }).click();
    await expect(page.getByLabel('Usuario', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible();
  });
}
