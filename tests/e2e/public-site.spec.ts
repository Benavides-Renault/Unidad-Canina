import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const runtime = JSON.parse(readFileSync('.local/test-runtime.json', 'utf8'));
const fixture = JSON.parse(readFileSync('.local/public-test-fixtures.json', 'utf8'));
test('visitante: ficha compartida, padres y WhatsApp sin iniciar sesión', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/catalogo?tipo=dogs&id=${fixture.dogId}`);
  await expect(page.getByRole('heading', { name: 'PUBLIC · Atlas', exact: true })).toBeVisible();
  const whatsapp = page.locator('.public-interest').getByRole('link', { name: 'Consultar por WhatsApp' });
  const href = await whatsapp.getAttribute('href');
  expect(href).toContain('https://wa.me/50670327517?text=');
  expect(decodeURIComponent(href!)).toContain('PUBLIC · Atlas');
  await expect(page.locator('.public-catalog')).not.toContainText('PUBLIC-CHIP-PRIVATE');
  await page.goto(`/catalogo?tipo=crosses&id=${fixture.crossId}`);
  await expect(page.getByRole('heading', { name: 'PUBLIC · Próxima camada', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ver PUBLIC · Madre', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'PUBLIC · Madre', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Volver a la camada' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'PUBLIC · Próxima camada', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test('visitante móvil: contacto por correo y solicitud de cuenta llegan a administración', async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const contactName = `Visitante móvil ${suffix}`;
  const accountName = `Cuenta móvil ${suffix}`;
  const username = `public-mobile-${suffix}`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/catalogo');
  await expect(page.getByRole('heading', { name: /Cada gran vínculo/ })).toBeVisible();
  await page.getByRole('button', { name: 'Enviar solicitud de contacto', exact: true }).click();
  await page.getByLabel('Nombre completo', { exact: true }).fill(contactName);
  await page
    .getByLabel('Correo electrónico', { exact: true })
    .fill(`mobile-contact-${suffix}@example.invalid`);
  await page.getByLabel('Cuéntanos qué necesitas').fill('Quisiera información para comprar un compañero.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
  await expect(
    page.getByText('Recibimos tu solicitud. Te contactaremos por el medio indicado.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Entendido' }).click();
  await page.getByRole('button', { name: 'Solicitar cuenta', exact: true }).click();
  await page.getByLabel('Nombre completo', { exact: true }).fill(accountName);
  await page
    .getByLabel('Correo electrónico', { exact: true })
    .fill(`mobile-account-${suffix}@example.invalid`);
  await page.getByLabel('Cuéntanos qué necesitas').fill('Necesito una cuenta para consultar mis perros.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
  await page.getByRole('button', { name: 'Entendido' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.goto('/');
  await page.getByLabel('Usuario', { exact: true }).fill(runtime.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(runtime.password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Solicitudes', exact: true }).click();
  await expect(page.getByRole('heading', { name: contactName, exact: true })).toBeVisible();
  await page.getByRole('heading', { name: accountName, exact: true }).click();
  await page.getByRole('button', { name: 'Aprobar y crear cuenta', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Usuario', { exact: false }).fill(username);
  await page
    .getByRole('dialog')
    .getByLabel('Contraseña inicial', { exact: false })
    .fill('Approved-mobile-2026');
  await page.getByRole('button', { name: 'Crear cuenta de cliente', exact: true }).click();
  await expect(
    page.getByText(`Cuenta ${username} creada. Comunica las credenciales al solicitante.`, { exact: true }),
  ).toBeVisible();
});
test('enlace retirado y expediente privado no son accesibles desde el catálogo', async ({ page }) => {
  await page.goto(`/catalogo?tipo=dogs&id=${fixture.privateDogId}`);
  await expect(page.locator('.public-catalog').getByRole('alert')).toContainText('Publicación no disponible');
  expect((await page.request.get(`/api/v1/dogs/${fixture.privateDogId}`)).status()).toBe(401);
  expect((await page.request.get('/api/v1/inquiries')).status()).toBe(401);
});
