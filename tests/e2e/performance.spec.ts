import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const runtime = JSON.parse(readFileSync('.local/test-runtime.json', 'utf8'));
const fixture = JSON.parse(readFileSync('.local/portal-test-fixtures.json', 'utf8'));
async function login(page: Page, username = runtime.username, password = runtime.password) {
  await page.goto('/panel');
  await page.getByLabel('Usuario', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
}

test('búsquedas: agrupa la escritura y descarta respuestas de la consulta anterior', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Usuarios', exact: true }).click();
  const search = page.getByLabel('Buscar por nombre o usuario');
  await expect(page.locator('main .loading')).not.toBeAttached();
  const searches: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/users?'))
      searches.push(new URL(request.url()).searchParams.get('search') || '');
  });
  await search.pressSequentially('admin', { delay: 20 });
  await expect.poll(() => searches).toEqual(['admin']);
  await expect(page.locator('main .loading')).not.toBeAttached();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const failed = page.waitForEvent('requestfailed', (request) => request.url().includes('search=lento'));
  await page.route('**/api/v1/users?**search=lento', async (route) => {
    await held;
    await route
      .fulfill({
        json: {
          items: [
            { id: 'stale', name: 'Respuesta obsoleta', username: 'lento', role: 'ADMIN', active: true },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        },
      })
      .catch(() => undefined);
  });
  try {
    const pending = page.waitForRequest('**/api/v1/users?**search=lento');
    await search.fill('lento');
    await pending;
    await search.fill('admin');
    await expect(page.locator('main .loading')).not.toBeAttached();
    await failed;
    release();
    await expect(page.locator('main')).not.toContainText('Respuesta obsoleta');
    await expect(search).toHaveValue('admin');
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('galería: consulta únicamente la pestaña abierta y mantiene venta y reservas separadas', async ({
  page,
}) => {
  const endpoints: string[] = [];
  page.on('request', (request) => {
    if (/\/portal\/gallery\/(dogs|crosses)\?/.test(request.url()))
      endpoints.push(new URL(request.url()).pathname);
  });
  await login(page, 'portal-cliente-a', fixture.password);
  await page.getByRole('tab', { name: 'Galería de venta y reservas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ver Venta TEST', exact: true })).toBeVisible();
  // Development Strict Mode can start and cancel the first mount's request.
  expect([...new Set(endpoints)]).toEqual(['/api/v1/portal/gallery/dogs']);
  await page.getByRole('tab', { name: 'Reservas · Cruces', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Camada futura TEST', exact: true })).toBeVisible();
  expect([...new Set(endpoints)]).toEqual(['/api/v1/portal/gallery/dogs', '/api/v1/portal/gallery/crosses']);
  await expect(page.getByRole('button', { name: 'Ver Venta TEST', exact: true })).not.toBeAttached();
});

test('notificaciones: el contador no se limita a una página y permite consultar las siguientes', async ({
  page,
}) => {
  await page.route('**/api/v1/notifications/summary', (route) => route.fulfill({ json: { unread: 26 } }));
  await page.route('**/api/v1/notifications?**', (route) => {
    const current = Number(new URL(route.request().url()).searchParams.get('page'));
    const start = (current - 1) * 20;
    return route.fulfill({
      json: {
        items: Array.from({ length: current === 1 ? 20 : 6 }, (_, i) => ({
          id: `notice-${start + i}`,
          title: `Nacimiento ${start + i + 1}`,
          body: 'Seguimiento de camada',
          createdAt: '2026-10-17T00:00:00Z',
        })),
        total: 26,
        page: current,
        pageSize: 20,
      },
    });
  });
  await login(page);
  await expect(page.getByRole('button', { name: 'Notificaciones, 26 sin leer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Notificaciones, 26 sin leer', exact: true }).click();
  await expect(page.locator('.notification-row')).toHaveCount(20);
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.locator('.notification-row')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: 'Nacimiento 21', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Siguiente', exact: true })).toBeDisabled();
});
