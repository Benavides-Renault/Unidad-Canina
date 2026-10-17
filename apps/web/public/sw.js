/* Online-only PWA: no caching of HTML, API responses, files, sessions or personal data. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
// Push never contains dog names, medical details, client data or session credentials.
self.addEventListener('push', (event) => {
  let tag = 'valkyr-notification';
  try { const data = event.data?.json(); if(typeof data?.tag === 'string') tag = data.tag.slice(0,100); } catch {}
  event.waitUntil(self.registration.showNotification('VALKYR · Aviso pendiente', { body: 'Abre la aplicación para consultar tus notificaciones.', icon: '/icon-192.png', tag }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
    const target=clients.find(c=>new URL(c.url).origin===self.location.origin);
    if(target)return target.focus();
    return self.clients.openWindow('/');
  }));
});
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => new Response('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width"><title>VALKYR · Sin conexión</title><body style="font-family:system-ui;background:#f6f5f1;color:#202725;padding:10vh 8vw"><h1>Necesitas conexión al servidor</h1><p>VALKYR protege tus datos y no guarda expedientes sin conexión.</p><p>Conéctate a la red autorizada y vuelve a intentarlo.</p><a href="/">Volver a intentar</a></body></html>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })));
  }
});
