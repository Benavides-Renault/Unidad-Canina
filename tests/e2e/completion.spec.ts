import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.local/completion-fixtures.json', 'utf8'));
const runtime = JSON.parse(readFileSync('.local/test-runtime.json', 'utf8'));
async function login(page: Page, username = runtime.username, password = runtime.password) {
  await page.goto('/');
  await page.getByLabel('Usuario', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
}
test('comprobantes vinculados y versiones clínicas en el portal del propietario', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, 'complete-trainer', fixture.password);
  await page.getByRole('button', { name: 'Ver Nexo ampliación TEST', exact: true }).click();
  await page.getByRole('button', { name: 'Vincular comprobante', exact: true }).click();
  let modal = page.getByRole('dialog');
  await modal.getByLabel('Registro relacionado').selectOption(`MEDICAL:${fixture.recordId}`);
  await modal
    .getByLabel('Comprobante', { exact: true })
    .setInputFiles({
      name: 'control-vinculado-e2e.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\nControl de prueba\n%%EOF'),
    });
  await modal.getByRole('button', { name: 'Guardar comprobante vinculado', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('link', { name: 'control-vinculado-e2e.pdf', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar certificación', exact: true }).click();
  modal = page.getByRole('dialog');
  await modal.getByLabel('Plantilla opcional').selectOption(fixture.templateId);
  await expect(modal.getByLabel('Nombre de la certificación')).toHaveValue('Acreditación interna TEST');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(modal).not.toBeVisible();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    client = await context.newPage();
  try {
    await login(client, 'complete-owner', fixture.password);
    await client.getByRole('button', { name: 'Ver Nexo ampliación TEST', exact: true }).click();
    await client.getByRole('button', { name: 'Ver 2 versiones', exact: true }).click();
    await expect(client.getByRole('dialog').getByText('Precisión documental', { exact: true })).toBeVisible();
    await client.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
    const download = client.waitForEvent('download');
    await client.getByRole('link', { name: 'control-vinculado-e2e.pdf', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('control-vinculado-e2e.pdf');
    await expect(
      client.getByRole('button', { name: 'Vincular comprobante', exact: true }),
    ).not.toBeAttached();
    expect(await client.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await client.screenshot({ path: 'test-results/clinical-history-mobile.png', fullPage: true });
  } finally {
    await context.close();
  }
  expect(errors).toEqual([]);
});
test('plantillas y preferencias de calendario se conservan al recargar', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Configuración', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva plantilla', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Nombre de la plantilla').fill('Convenio de seguimiento E2E');
  await modal.getByLabel('Uso', { exact: false }).selectOption('CONTRACT');
  await modal.getByLabel('Título del documento').fill('Seguimiento canino');
  await modal.getByLabel('Entidad emisora').fill('VALKYR');
  await modal
    .getByLabel('Contenido de la plantilla')
    .fill('Servicio para {{nombre}}, referencia {{referencia}}.');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Convenio de seguimiento E2E · v1', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Calendario', exact: true }).click();
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  await page.getByLabel('Tipo de evento').selectOption('CONTRACT');
  await expect(page.getByLabel('Tipo de evento')).toBeEnabled();
  await page.reload();
  await page.getByRole('button', { name: 'Calendario', exact: true }).click();
  await expect(page.getByLabel('Tipo de evento')).toHaveValue('CONTRACT');
  await page.getByRole('button', { name: 'Mes', exact: true }).click();
  await page.getByLabel('Tipo de evento').selectOption('ALL');
});
test('proveedor, flujo de caja y cierre mensual desde administración', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Finanzas', exact: true }).click();
  await page.getByRole('button', { name: 'Proveedores, caja y cierres', exact: true }).click();
  await page.getByRole('button', { name: 'Proveedores', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo proveedor', exact: true }).click();
  let modal = page.getByRole('dialog');
  await modal.getByLabel('Nombre del proveedor').fill('Suministros Caninos E2E');
  await modal.getByLabel('Persona de contacto').fill('María Vargas');
  await modal.getByLabel('Teléfono').fill('+123456789');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Suministros Caninos E2E' })).toContainText(
    '+123456789',
  );
  await page.getByRole('button', { name: 'Flujo de caja', exact: true }).click();
  await page.getByLabel('Desde', { exact: true }).fill('2023-06-01');
  await page.getByLabel('Hasta', { exact: true }).fill('2023-06-30');
  await expect(page.getByRole('row').filter({ hasText: 'Compra TEST' })).toHaveCount(2);
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Exportar flujo PDF', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  await page.getByRole('button', { name: 'Cierres mensuales', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar mes', exact: true }).click();
  modal = page.getByRole('dialog');
  await modal.getByLabel('Mes (AAAA-MM)', { exact: false }).fill('2022-03');
  await modal.getByLabel('Observaciones del cierre').fill('Cierre sin movimientos E2E');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await page.getByText('2022-03 · Cierre sin movimientos E2E', { exact: true }).click();
  await expect(page.getByText('0 movimientos conservados.', { exact: true })).toBeVisible();
});
