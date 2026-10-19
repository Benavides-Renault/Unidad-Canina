import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const runtime = JSON.parse(readFileSync('.local/test-runtime.json', 'utf8'));
const day = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Costa_Rica',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const before = new Date(Date.parse(`${day}T00:00:00Z`) - 70 * 86400000).toISOString().slice(0, 10);
const future = new Date(Date.parse(`${day}T00:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10);
async function login(page: Page) {
  await page.goto('/panel');
  await page.getByLabel('Usuario', { exact: true }).fill(runtime.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(runtime.password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
}
test('crianza: monta, nacimiento, cachorro, apartado y abono desde la interfaz', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Crianza', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo plan de cruce', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal
    .getByRole('combobox', { name: 'Madre', exact: true })
    .selectOption({ label: 'Madre CRIANZA PRUEBA' });
  await modal
    .getByRole('combobox', { name: 'Padre', exact: true })
    .selectOption({ label: 'Padre CRIANZA PRUEBA' });
  await modal.getByLabel('Fecha del cruce').fill(before);
  await modal.getByLabel('Estado del plan').selectOption('MATED');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await page
    .getByRole('row')
    .filter({ has: page.getByText('Monta registrada', { exact: true }) })
    .getByRole('button', { name: 'Abrir plan' })
    .click();
  await page.getByRole('button', { name: 'Registrar nacimiento', exact: true }).click();
  await modal.getByLabel('Código de camada').fill('CAMADA-E2E');
  await modal.getByLabel('Fecha de nacimiento').fill(day);
  await modal.getByRole('spinbutton', { name: 'Nacidos vivos', exact: true }).fill('1');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'CAMADA-E2E', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Identificar cachorro', exact: true }).click();
  await modal.getByLabel('Nombre del cachorro').fill('Cachorro E2E SINTÉTICO');
  await modal.getByLabel('Sexo del cachorro').selectOption('FEMALE');
  await modal.getByLabel('Raza del cachorro').fill('Prueba');
  await modal.getByLabel('Peso al nacer (kg)').fill('0.350');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await page.getByRole('button', { name: 'Incorporar a la unidad', exact: true }).click();
  await expect(page.getByText('Incorporado a la unidad', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Apartados', exact: true }).click();
  await page.getByLabel('Seleccionar camada').selectOption({ label: 'CAMADA-E2E · 1 nacidos vivos' });
  await page.getByRole('button', { name: 'Nuevo apartado', exact: true }).click();
  await modal.getByLabel('Cachorro específico (opcional)').selectOption({ label: 'Cachorro E2E SINTÉTICO' });
  await modal.getByLabel('Persona interesada').fill('Persona E2E SINTÉTICA');
  await modal
    .getByRole('combobox', { name: 'Propietario cliente', exact: true })
    .selectOption({ label: 'Comprador SINTÉTICO' });
  await modal.getByLabel('Vencimiento del apartado').fill(future);
  await modal.getByLabel('Importe total').fill('50.30');
  await modal.getByRole('combobox', { name: 'Moneda', exact: true }).selectOption('USD');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await page
    .getByRole('row')
    .filter({ has: page.getByText('Persona E2E SINTÉTICA', { exact: true }) })
    .getByRole('button', { name: 'Cuenta y abonos' })
    .click();
  await page.getByRole('button', { name: 'Registrar abono', exact: true }).click();
  await modal.getByLabel('Importe del movimiento').fill('20.10');
  await modal.getByLabel('Referencia / comprobante').fill('E2E-ANTICIPO');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('cell', { name: 'E2E-ANTICIPO', exact: true })).toBeVisible();
  await expect(page.locator('.details-list').getByText(/30[,.]20/)).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);
  await page.screenshot({
    path: 'test-results/apartado-abono-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});
test('administración: cuenta por pagar e inventario con lote, entrada y consumo', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Finanzas', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva cuenta', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Tipo de cuenta').selectOption('PAYABLE');
  await modal.getByLabel('Cliente / proveedor').fill('Proveedor E2E SINTÉTICO');
  await modal.getByRole('textbox', { name: 'Concepto', exact: true }).fill('Compra E2E de alimento');
  await modal.getByRole('textbox', { name: 'Categoría', exact: true }).fill('Alimentación');
  await modal.getByLabel('Importe total').fill('3000.50');
  await modal.getByLabel('Vencimiento de la cuenta').fill(future);
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Compra E2E de alimento', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar abono', exact: true }).click();
  await modal.getByLabel('Importe del movimiento').fill('1000.25');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.locator('.details-list').getByText(/2[\s.,]000[,.]25/)).toBeVisible();
  await page.getByRole('button', { name: 'Inventario', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo producto', exact: true }).click();
  await modal.getByLabel('Código del producto').fill('E2E-FOOD');
  await modal.getByLabel('Nombre del producto').fill('Alimento E2E SINTÉTICO');
  await modal.getByLabel('Unidad de medida').selectOption('kg');
  await modal.getByLabel('Existencia mínima').fill('2');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar lote', exact: true }).click();
  await modal.getByLabel('Número de lote').fill('E2E-LOTE');
  await modal.getByLabel('Caducidad del lote').fill(future);
  await modal.getByLabel('Costo por kg').fill('1000.25');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await page.getByRole('button', { name: 'Registrar movimiento', exact: true }).click();
  await modal.getByLabel('Tipo de movimiento').selectOption('IN');
  await modal.getByLabel('Cantidad (kg)').fill('5.500');
  await modal.getByLabel('Motivo del movimiento').fill('Entrada E2E');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await page.getByRole('button', { name: 'Registrar movimiento', exact: true }).click();
  await modal.getByLabel('Tipo de movimiento').selectOption('OUT');
  await modal.getByLabel('Cantidad (kg)').fill('1.250');
  await modal.getByLabel('Motivo del movimiento').fill('Consumo E2E');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('cell', { name: '4.25 kg', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/inventario-desktop.png', fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'Inventario', exact: true }).click();
  await expect(page.getByRole('cell', { name: '4.25 kg', exact: true }).first()).toBeVisible();
});
