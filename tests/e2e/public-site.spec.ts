import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const runtime = JSON.parse(readFileSync('.local/test-runtime.json', 'utf8'));
const fixture = JSON.parse(readFileSync('.local/public-test-fixtures.json', 'utf8'));
test('visitante: ficha compartida, padres y WhatsApp sin iniciar sesión', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const detailUrl = `/disponibles?tipo=dogs&id=${fixture.dogId}`;
  const initial = await page.request.get(detailUrl);
  expect(await initial.text()).not.toMatch(/<section[^>]*class="[^"]*\bpublic-hero\b/);
  await page.goto(detailUrl);
  await expect(page.getByRole('heading', { level: 1, name: 'PUBLIC · Atlas', exact: true })).toBeVisible();
  await expect(page.locator('.public-hero')).toHaveCount(0);
  const whatsapp = page.getByRole('link', { name: 'Contactar por WhatsApp', exact: true });
  await expect(whatsapp).toBeVisible();
  const href = await whatsapp.getAttribute('href');
  expect(href).toContain('https://wa.me/50670327517?text=');
  expect(decodeURIComponent(href!)).not.toContain('PUBLIC · Atlas');
  await expect(page.locator('a[href^="https://wa.me/"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Consultar disponibilidad', exact: true }).click();
  const purchase = page.getByRole('dialog');
  await expect(purchase).toContainText('PUBLIC · Atlas');
  await expect(purchase.getByLabel('Cuéntanos qué necesitas')).toHaveValue(/PUBLIC · Atlas/);
  page.once('dialog', (dialog) => dialog.accept());
  await purchase.getByRole('button', { name: 'Cerrar formulario', exact: true }).click();
  await expect(page.locator('.public-catalog')).not.toContainText('PUBLIC-CHIP-PRIVATE');
  await page.goto(`/disponibles?tipo=crosses&id=${fixture.crossId}&pagina=2`);
  await expect(page.getByRole('heading', { name: 'PUBLIC · Próxima camada', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Ver PUBLIC · Madre', exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get('progenitor') === 'dam' && url.searchParams.get('pagina') === '2',
  );
  await expect(page.getByRole('heading', { level: 1, name: 'PUBLIC · Madre', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'PUBLIC · Madre', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'PUBLIC · Próxima camada', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'PUBLIC · Madre', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Volver a la camada' }).click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get('id') === fixture.crossId && !url.searchParams.has('progenitor'),
  );
  await expect(page.getByRole('heading', { name: 'PUBLIC · Próxima camada', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'PUBLIC · Próxima camada', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Volver al catálogo' }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/disponibles' &&
      url.searchParams.get('tipo') === 'crosses' &&
      url.searchParams.get('pagina') === '2' &&
      !url.searchParams.has('id') &&
      !url.searchParams.has('progenitor'),
  );
  expect(errors).toEqual([]);
});
test('pestañas y fichas conservan el historial del catálogo al volver, avanzar y recargar', async ({
  page,
}) => {
  await page.goto('/disponibles?tipo=dogs');
  await page.getByRole('tab', { name: 'Camadas y reservas', exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname === '/disponibles' && url.searchParams.get('tipo') === 'crosses',
  );
  await page.getByRole('link', { name: 'Ver PUBLIC · Próxima camada', exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('id') === fixture.crossId);
  await expect(page.locator('.public-hero')).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Camadas y reservas', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Perros en venta', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.goForward();
  await expect(page.getByRole('tab', { name: 'Camadas y reservas', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.goForward();
  await expect(
    page.getByRole('heading', { level: 1, name: 'PUBLIC · Próxima camada', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 1, name: 'PUBLIC · Próxima camada', exact: true }),
  ).toBeVisible();
});

test('enlaces anteriores conservan publicación, página y progenitor al abrir el catálogo nuevo', async ({
  page,
}) => {
  for (const path of ['/catalogo', '/']) {
    await page.goto(`${path}?tipo=crosses&id=${fixture.crossId}&pagina=2&progenitor=sire`);
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === '/disponibles' &&
        url.searchParams.get('tipo') === 'crosses' &&
        url.searchParams.get('id') === fixture.crossId &&
        url.searchParams.get('pagina') === '2' &&
        url.searchParams.get('progenitor') === 'sire',
    );
    await expect(page.getByRole('heading', { level: 1, name: 'PUBLIC · Padre', exact: true })).toBeVisible();
    await expect(page.locator('.public-hero')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'PUBLIC · Padre', exact: true })).toBeVisible();
  }
  await page.goto('/catalogo?tipo=dogs');
  await expect(page).toHaveURL(
    (url) => url.pathname === '/disponibles' && url.searchParams.get('tipo') === 'dogs',
  );
  await expect(page.getByRole('tab', { name: 'Perros en venta', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

for (const unavailable of ['empty', 'error'] as const) {
  test(`contacto mantiene el formulario sin enlaces ficticios cuando settings está ${unavailable}`, async ({
    page,
  }) => {
    await page.route('**/api/v1/public/settings', (route) =>
      route.fulfill({
        status: unavailable === 'error' ? 503 : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          unavailable === 'error'
            ? { message: 'Contacto temporalmente no disponible.' }
            : { contactName: 'ORYX K9', phone: null, email: null, whatsappNumber: null },
        ),
      }),
    );
    await page.goto('/contacto');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Hablemos de lo que buscas.', exact: true }),
    ).toBeVisible();
    await expect(page.locator('a[href^="https://wa.me/"], a[href^="tel:"], a[href^="mailto:"]')).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: 'Enviar solicitud de contacto', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
}

test('visitante móvil: contacto por correo y solicitud de cuenta llegan a administración', async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const contactName = `Visitante móvil ${suffix}`;
  const accountName = `Cuenta móvil ${suffix}`;
  const username = `public-mobile-${suffix}`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contacto');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Hablemos de lo que buscas.', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.public-hero')).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Solicitar una cuenta', exact: true }).click();
  await page.getByLabel('Nombre completo', { exact: true }).fill(accountName);
  await page
    .getByLabel('Correo electrónico', { exact: true })
    .fill(`mobile-account-${suffix}@example.invalid`);
  await page.getByLabel('Cuéntanos qué necesitas').fill('Necesito una cuenta para consultar mis perros.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
  await page.getByRole('button', { name: 'Entendido' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.goto('/panel');
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
  await page.goto(`/disponibles?tipo=dogs&id=${fixture.privateDogId}`);
  await expect(page.locator('.public-catalog').getByRole('alert')).toContainText('Publicación no disponible');
  expect((await page.request.get(`/api/v1/dogs/${fixture.privateDogId}`)).status()).toBe(401);
  expect((await page.request.get('/api/v1/inquiries')).status()).toBe(401);
});
