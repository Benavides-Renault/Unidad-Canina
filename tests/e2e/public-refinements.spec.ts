import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.local/public-test-fixtures.json', 'utf8'));

test('volver y avanzar desde una consulta no restaura el formulario del perro anterior', async ({ page }) => {
  await page.goto('/disponibles?tipo=dogs');
  await page.getByRole('link', { name: 'Ver PUBLIC · Atlas', exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('id') === fixture.dogId);
  await page.getByRole('button', { name: 'Consultar disponibilidad', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('PUBLIC · Atlas');
  await expect(page.locator('.whatsapp-float')).toBeHidden();

  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Perros en venta', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.whatsapp-float')).toBeVisible();

  await page.goForward();
  await expect(page.getByRole('heading', { level: 1, name: 'PUBLIC · Atlas', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.whatsapp-float')).toBeVisible();
  await page.getByRole('button', { name: 'Consultar disponibilidad', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Cuéntanos qué necesitas')).toHaveValue(/PUBLIC · Atlas/);
});

test('el enlace de cuenta del pie permite reabrir el formulario y oculta WhatsApp mientras está abierto', async ({
  page,
}) => {
  await page.goto('/contacto?solicitud=cuenta');
  const dialog = page.getByRole('dialog');
  const whatsapp = page.locator('.whatsapp-float');
  const accountLink = page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'Solicita tu cuenta', exact: true });

  await expect(dialog.getByRole('heading', { name: 'Solicitar una cuenta', exact: true })).toBeVisible();
  await expect(whatsapp).toBeHidden();
  page.once('dialog', (confirmation) => confirmation.accept());
  await dialog.getByRole('button', { name: 'Cerrar formulario', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(whatsapp).toBeVisible();

  for (let reopen = 0; reopen < 2; reopen++) {
    await accountLink.click();
    await expect(dialog.getByRole('heading', { name: 'Solicitar una cuenta', exact: true })).toBeVisible();
    await expect(whatsapp).toBeHidden();
    page.once('dialog', (confirmation) => confirmation.accept());
    await dialog.getByRole('button', { name: 'Cerrar formulario', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(whatsapp).toBeVisible();
  }
});

test('WhatsApp recarga el contacto público actualizado y al recuperar el foco sin cambiar datos reales', async ({
  page,
}) => {
  let number: string | null = '+50671112222';
  let reads = 0;
  await page.route('**/api/v1/public/settings', (route) => {
    reads++;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ contactName: 'ORYX K9', phone: null, email: null, whatsappNumber: number }),
    });
  });
  await page.goto('/');
  const whatsapp = page.getByRole('link', { name: 'Contactar por WhatsApp', exact: true });
  await expect(whatsapp).toHaveAttribute('href', /^https:\/\/wa\.me\/50671112222\?text=/);

  const initialReads = reads;
  number = '+50672223333';
  await page.evaluate(() => window.dispatchEvent(new Event('oryx:public-contact-updated')));
  await expect.poll(() => reads).toBeGreaterThan(initialReads);
  await expect(whatsapp).toHaveAttribute('href', /^https:\/\/wa\.me\/50672223333\?text=/);
  await expect(page.locator('.whatsapp-float')).toHaveCount(1);

  const updatedReads = reads;
  number = null;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => reads).toBeGreaterThan(updatedReads);
  await expect(page.locator('.whatsapp-float')).toHaveCount(0);
});

test('las pestañas del catálogo cambian con flechas, Inicio y Fin conservando foco y panel asociado', async ({
  page,
}) => {
  await page.goto('/disponibles?tipo=dogs');
  await expect(page.getByRole('link', { name: 'Ver PUBLIC · Atlas', exact: true })).toBeVisible();
  const dogs = page.getByRole('tab', { name: 'Perros en venta', exact: true });
  const crosses = page.getByRole('tab', { name: 'Camadas y reservas', exact: true });
  const panel = page.getByRole('tabpanel');
  await dogs.focus();

  for (const [key, kind, tab, panelLabel] of [
    ['ArrowRight', 'crosses', crosses, 'catalog-tab-crosses'],
    ['ArrowLeft', 'dogs', dogs, 'catalog-tab-dogs'],
    ['End', 'crosses', crosses, 'catalog-tab-crosses'],
    ['Home', 'dogs', dogs, 'catalog-tab-dogs'],
  ] as const) {
    await page.keyboard.press(key);
    await expect(page).toHaveURL((url) => url.searchParams.get('tipo') === kind);
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(tab).toBeFocused();
    await expect(tab).toHaveAttribute('tabindex', '0');
    await expect(panel).toHaveAttribute('aria-labelledby', panelLabel);
  }
  await page.keyboard.press('Tab');
  await expect(panel).toBeFocused();
});
