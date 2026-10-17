import { test, expect, type Page } from '@playwright/test';
async function login(page: Page, username: string, password = '1234') {
  await page.goto('/');
  await page.getByLabel('Usuario', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.locator('.demo-banner')).toHaveCount(0);
}
test('demo: administración navega todos los módulos poblados sin errores', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 500) errors.push(`${r.status()} ${r.url()}`);
  });
  await login(page, 'admin');
  await expect(page.getByRole('heading', { name: /Buenas|Buenos/ })).toBeVisible();
  await page.screenshot({ path: '.local/demo-dashboard.png', fullPage: true });
  const menu = page.locator('aside nav button');
  const count = await menu.count();
  expect(count).toBeGreaterThan(12);
  for (let i = 0; i < count; i++) {
    await menu.nth(i).click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('main [role="alert"]')).not.toBeAttached();
  }
  await page.getByRole('button', { name: 'Configuración', exact: true }).click();
  await expect(page.getByText(/Copia cifrada y verificada/)).toBeVisible();
  expect(errors).toEqual([]);
});
test('demo: entrenador ve sus perros y progreso; cliente ve propiedad, venta y padres', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, 'ana.entrenadora');
  await page.getByRole('button', { name: 'Ver Thor', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Progreso de Thor', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archivar plan', exact: true })).not.toBeAttached();
  await page.screenshot({ path: '.local/demo-entrenador.png', fullPage: true });
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      timezoneId: 'America/Costa_Rica',
    }),
    client = await context.newPage();
  client.on('pageerror', (e) => errors.push(e.message));
  await login(client, 'sofia.cliente');
  await expect(client.getByRole('heading', { name: 'Mis perros', exact: true })).toBeVisible();
  await client.getByRole('button', { name: 'Ver Rex', exact: true }).click();
  await expect(client.getByRole('heading', { name: 'Progreso de Rex', exact: true })).toBeVisible();
  await expect(
    client.getByRole('button', { name: 'Añadir registro médico', exact: true }),
  ).not.toBeAttached();
  await client.getByRole('tab', { name: 'Galería de venta y preventa', exact: true }).click();
  await expect
    .poll(() =>
      client
        .locator('main img')
        .evaluateAll((images) =>
          images.every(
            (image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await expect(client.getByRole('button', { name: 'Ver Astra', exact: true })).not.toBeAttached();
  await client.getByRole('tab', { name: 'Preventa · Cruces', exact: true }).click();
  await client
    .getByRole('button')
    .filter({ has: client.getByRole('heading', { name: 'Próxima camada Maya × Thor', exact: true }) })
    .click();
  await client.getByRole('button', { name: 'Ver Maya', exact: true }).click();
  await expect(client.getByRole('heading', { name: 'Maya', exact: true })).toBeVisible();
  await expect(client.locator('main')).not.toContainText(/DEMO|demostración|ficticio|no representa/i);
  await expect
    .poll(() => client.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);
  await client.screenshot({ path: '.local/demo-cliente-mobile.png', fullPage: true });
  expect(await client.locator('.skip-link').evaluate((el) => el.getBoundingClientRect().bottom < 0)).toBe(
    true,
  );
  expect(errors).toEqual([]);
  await context.close();
});
