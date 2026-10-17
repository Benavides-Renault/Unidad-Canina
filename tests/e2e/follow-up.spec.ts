import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.local/follow-up-fixtures.json', 'utf8'));
const runtime = JSON.parse(readFileSync('.local/test-runtime.json', 'utf8'));
async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Usuario', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
}
test('entrenador crea objetivos, registra progreso y certificación; cliente consulta en móvil', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, 'follow-trainer', fixture.password);
  await page.getByRole('button', { name: 'Ver Atlas seguimiento TEST', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo plan', exact: true }).click();
  let modal = page.getByRole('dialog');
  await modal.getByLabel('Nombre del plan').fill('Plan funcional E2E');
  await modal.getByRole('combobox', { name: 'Disciplina', exact: true }).fill('Obediencia');
  await modal.getByLabel('Fecha objetivo').fill(fixture.future);
  await modal.getByRole('textbox', { name: 'Objetivo 1', exact: true }).fill('Permanencia E2E');
  await modal
    .getByLabel('Criterio de evaluación 1')
    .fill('Diez intentos, diez puntos por respuesta correcta.');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await page.getByRole('button', { name: 'Evaluar Permanencia E2E', exact: true }).click();
  modal = page.getByRole('dialog');
  await modal.getByLabel('Resultado / 100').fill('80');
  await modal.getByLabel('Observaciones y evidencia').fill('Ocho de diez intentos correctos E2E.');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByText(/Meta alcanzada.*Última evaluación/).last()).toBeVisible();
  await page.getByRole('button', { name: 'Registrar certificación', exact: true }).click();
  modal = page.getByRole('dialog');
  await modal.getByLabel('Nombre de la certificación').fill('Certificación E2E');
  await modal.getByLabel('Entidad emisora').fill('Centro de pruebas');
  await modal.getByLabel('Fecha de vencimiento').fill(fixture.future);
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Certificación E2E', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archivar certificación', exact: true })).not.toBeAttached();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    client = await context.newPage();
  client.on('pageerror', (e) => errors.push(e.message));
  await login(client, 'follow-client', fixture.password);
  await client.getByRole('button', { name: 'Ver Atlas seguimiento TEST', exact: true }).click();
  await expect(client.getByRole('heading', { name: 'Plan funcional E2E', exact: true })).toBeVisible();
  await expect(client.getByRole('button', { name: 'Nuevo plan', exact: true })).not.toBeAttached();
  await expect(client.getByRole('heading', { name: 'Certificación E2E', exact: true })).toBeVisible();
  await expect
    .poll(() => client.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);
  await client.screenshot({ path: 'test-results/seguimiento-mobile.png', fullPage: true });
  await context.close();
  expect(errors).toEqual([]);
});
test('administrador filtra el calendario por vencimientos', async ({ page }) => {
  await login(page, runtime.username, runtime.password);
  await page.getByRole('button', { name: 'Calendario', exact: true }).click();
  await page.getByRole('button', { name: 'Mes', exact: true }).click();
  await page.getByLabel('Tipo de evento').selectOption('CERTIFICATION');
  await expect(page.getByText('Vence: Acreditación interna TEST', { exact: true }).first()).toBeVisible();
  await page.getByLabel('Tipo de evento').selectOption('TRAINING_PLAN');
  await expect(page.getByText('Vence: Acreditación interna TEST', { exact: true })).not.toBeAttached();
});
