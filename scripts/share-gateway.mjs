import http from 'node:http';

const hopHeaders = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

function isApplicationRequest(pathname, method) {
  if (pathname.startsWith('/api/v1/'))
    return ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (!['GET', 'HEAD'].includes(method)) return false;
  return (
    [
      '/',
      '/catalogo',
      '/disponibles',
      '/contacto',
      '/quienes-somos',
      '/acceso',
      '/panel',
      '/reset-password',
      '/oryx-logo.png',
      '/favicon.ico',
      '/manifest.webmanifest',
      '/sw.js',
    ].includes(pathname) || /^\/_next\/static\/[A-Za-z0-9_./-]+$/.test(pathname)
  );
}

export function createShareGateway({
  publicOrigin,
  upstream = 'http://localhost:3000',
  lifetimeMs = 24 * 3600_000,
}) {
  const expiresAt = Date.now() + lifetimeMs,
    target = new URL(upstream);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || target.protocol !== 'http:')
    throw new Error('El destino debe ser local.');
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    const fail = (status, message) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message }));
    };
    const origin = typeof publicOrigin === 'function' ? publicOrigin() : publicOrigin;
    if (!origin) return fail(503, 'El acceso se está iniciando.');
    const external = new URL(origin);
    if (req.headers.host !== external.host) return fail(421, 'Dirección no permitida.');
    if (Date.now() >= expiresAt) return fail(410, 'Este enlace venció. Solicita uno nuevo.');
    if (!req.url?.startsWith('/') || req.url.startsWith('//')) return fail(400, 'Ruta no válida.');
    if (req.headers.origin && req.headers.origin !== external.origin)
      return fail(403, 'Origen no permitido.');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== external.origin)
      return fail(403, 'Se requiere el origen del sitio.');
    const pathname = new URL(req.url, external).pathname;
    if (!isApplicationRequest(pathname, req.method)) return fail(404, 'No encontrado.');
    // Authentication, CSRF, MFA and role permissions are enforced by the API AccessGuard.
    const cookies = (req.headers.cookie || '').split(';').map((part) => part.trim());
    const headers = { ...req.headers, host: target.host };
    for (const name of Object.keys(headers))
      if (hopHeaders.includes(name) || name.startsWith('x-forwarded-') || name === 'forwarded')
        delete headers[name];
    headers.cookie = cookies.filter((part) => !part.startsWith('__Host-oryx_share=')).join('; ');
    if (headers.origin) headers.origin = target.origin;
    if (headers.referer) headers.referer = target.origin + '/';
    const outgoing = http.request(
      { hostname: target.hostname, port: target.port, path: req.url, method: req.method, headers },
      (incoming) => {
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (
            value === undefined ||
            hopHeaders.includes(name) ||
            ['cache-control', 'referrer-policy', 'x-robots-tag'].includes(name)
          )
            continue;
          if (name === 'set-cookie')
            res.setHeader(
              name,
              value.map((v) => (/;\s*Secure(?:;|$)/i.test(v) ? v : `${v}; Secure`)),
            );
          else if (name === 'access-control-allow-origin') res.setHeader(name, external.origin);
          else if (name === 'location' && String(value).startsWith(target.origin + '/'))
            res.setHeader(name, external.origin + String(value).slice(target.origin.length));
          else res.setHeader(name, value);
        }
        res.writeHead(incoming.statusCode || 502);
        incoming.pipe(res);
      },
    );
    outgoing.setTimeout(120_000, () => outgoing.destroy());
    outgoing.on('error', () => {
      if (!res.headersSent) fail(502, 'ORYX K9 no está disponible. Comprueba que siga abierto en la PC.');
      else res.destroy();
    });
    req.on('aborted', () => outgoing.destroy());
    res.on('close', () => {
      if (!res.writableEnded) outgoing.destroy();
    });
    req.pipe(outgoing);
  });
  server.on('upgrade', (_req, socket) => socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'));
  server.requestTimeout = 120_000;
  server.headersTimeout = 30_000;
  return server;
}
