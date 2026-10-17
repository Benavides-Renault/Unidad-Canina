import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const runtime = JSON.parse(readFileSync('.local/test-runtime.json', 'utf8'));
const day = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Costa_Rica',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
test('contratos: institución, contrato, asignación y servicio desde formularios', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Usuario', { exact: true }).fill(runtime.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(runtime.password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.getByRole('button', { name: 'Contratos', exact: true }).click();
  await page.getByRole('tab', { name: 'Instituciones', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva institución', exact: true }).click();
  await page.getByLabel('Institución / cliente').fill('Institución E2E SINTÉTICA');
  await page.getByLabel('Tipo de institución').selectOption('Empresa');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Institución E2E SINTÉTICA', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Contratos', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo contrato', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Número de contrato').fill('E2E-CONTRATO');
  await modal
    .getByRole('combobox', { name: 'Institución', exact: true })
    .selectOption({ label: 'Institución E2E SINTÉTICA' });
  await modal.getByLabel('Objeto del contrato').fill('Servicio E2E sintético');
  await modal.getByLabel('Monto del contrato').fill('2500.50');
  await modal.getByLabel('Fecha de inicio').fill(day);
  await modal.getByLabel('Fecha de vencimiento').fill('2030-12-31');
  await modal.getByLabel('Estado del contrato').selectOption('ACTIVE');
  await modal.getByLabel('Responsable del contrato').fill('Responsable E2E');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'E2E-CONTRATO', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Asignar perro', exact: true }).click();
  await modal.getByLabel('Perro', { exact: false }).selectOption({ label: 'Perro CONTRATOS PRUEBA' });
  await modal.getByLabel('Responsable operativo').selectOption({ label: 'Administrador de PRUEBAS' });
  await modal.getByLabel('Función en el contrato').fill('Apoyo de prueba');
  await modal.getByLabel('Justificación de excepción').fill('Asignación sintética compatible para E2E');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await page.getByRole('button', { name: 'Operaciones', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar servicio', exact: true }).click();
  await modal
    .getByLabel('Contrato asignado')
    .selectOption({ label: 'E2E-CONTRATO · Servicio E2E sintético' });
  await modal.getByLabel('Inicio del servicio').fill(`${day}T09:00`);
  await modal.getByLabel('Fin del servicio').fill(`${day}T10:00`);
  await modal.getByLabel('Lugar del servicio').fill('Sede de prueba');
  await modal.getByLabel('Resumen para el cliente').fill('Servicio E2E realizado.');
  await modal.getByLabel('Incidencias / notas internas').fill('Solo administración y personal autorizado.');
  await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('cell', { name: /^Servicio E2E realizado\./ })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/operaciones-mobile.png', fullPage: true });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Abrir navegación', exact: true })).toBeVisible();
});
