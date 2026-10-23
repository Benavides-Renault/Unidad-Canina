import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const runtime = JSON.parse(readFileSync('.local/test-runtime.json', 'utf8'));
const fixture = JSON.parse(readFileSync('.local/portal-test-fixtures.json', 'utf8'));
async function login(page: Page, username: string, password: string) {
  await page.goto('/panel');
  await page.getByLabel('Usuario', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
}
test('cliente: historial propio completo, venta autorizada y padres de reservas en móvil', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, 'portal-cliente-a', fixture.password);
  await expect(page.getByRole('heading', { name: 'Mis perros', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver Municipal B TEST', exact: true })).not.toBeAttached();
  await expect(page.getByRole('button', { name: 'Usuarios', exact: true })).not.toBeAttached();
  await page.getByRole('button', { name: 'Ver Propio A TEST', exact: true }).click();
  await expect(page.getByText('DETALLE_MEDICO_COMPLETO', { exact: true })).toBeVisible();
  await expect(page.getByText('DETALLE_ENTRENAMIENTO_COMPLETO').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Añadir registro médico', exact: true })).not.toBeAttached();
  await page.getByRole('tab', { name: 'Galería de venta y reservas', exact: true }).click();
  await page.getByRole('button', { name: 'Ver Venta TEST', exact: true }).click();
  await expect(page.getByText('SALUD_PUBLICA_AUTORIZADA', { exact: true })).toBeVisible();
  await expect(page.getByText('SECRETO_MEDICO_VENTA', { exact: true })).not.toBeAttached();
  await expect(page.getByText('Contacto TEST 0000-0000', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Volver a la galería', exact: true }).click();
  await page.getByRole('tab', { name: 'Reservas · Cruces', exact: true }).click();
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: 'Camada futura TEST', exact: true }) })
    .click();
  await page.getByRole('button', { name: 'Ver Madre portal TEST', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Madre portal TEST', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Volver al cruce', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);
  await page.screenshot({ path: 'test-results/portal-reservas-mobile.png', fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mis perros', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test('entrenador: añade salud a perro asignado y carece de controles para modificar', async ({ page }) => {
  await login(page, 'portal-entrenador-a', fixture.password);
  await expect(page.getByRole('heading', { name: 'Mis perros asignados', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver Municipal B TEST', exact: true })).not.toBeAttached();
  await page.getByRole('button', { name: 'Ver Propio A TEST', exact: true }).click();
  await page.getByRole('button', { name: 'Añadir registro médico', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Asunto médico').fill('Seguimiento E2E TEST');
  await modal.getByLabel('Detalle del registro').fill('Nota E2E persistente del entrenador');
  await modal.getByRole('button', { name: 'Guardar registro', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByText('Nota E2E persistente del entrenador', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Corregir|Retirar|Archivar|Editar/ })).not.toBeAttached();
  await page.screenshot({ path: 'test-results/portal-entrenador.png', fullPage: true });
});
test('administración: controla contenido de venta', async ({ page }) => {
  await login(page, runtime.username, runtime.password);
  await page.getByRole('button', { name: 'Venta y reservas', exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'Venta TEST' }).getByRole('button').click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByLabel('Publicar este perro en venta')).toBeChecked();
  await expect(modal.getByLabel('Precio de venta')).toHaveValue('50000.25');
  await modal.getByLabel('Información general', { exact: true }).fill('Descripción editada E2E');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await page.screenshot({ path: 'test-results/admin-publicaciones.png', fullPage: true });
});
