import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const cookieName = '__Host-oryx_share';
const digest = (value) => createHash('sha256').update(value).digest();
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

export function createShareGateway({
  token,
  publicOrigin,
  upstream = 'http://localhost:3000',
  lifetimeMs = 24 * 3600_000,
}) {
  if (!/^[A-Za-z0-9_-]{43,}$/.test(token))
    throw new Error('Se requiere una clave aleatoria de al menos 32 bytes.');
  const expected = digest(token),
    expiresAt = Date.now() + lifetimeMs,
    target = new URL(upstream);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || target.protocol !== 'http:')
    throw new Error('El destino debe ser local.');
  const allowed = (candidate) =>
    typeof candidate === 'string' && candidate.length <= 200 && timingSafeEqual(digest(candidate), expected);
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
    if (pathname === '/__share/unlock' && req.method === 'POST') {
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''))
        return fail(415, 'Formato no permitido.');
      let body = '';
      try {
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 1024) {
            fail(413, 'Solicitud demasiado grande.');
            return;
          }
        }
        if (!allowed(JSON.parse(body).token)) return fail(403, 'El enlace no es válido.');
      } catch {
        return fail(400, 'Solicitud no válida.');
      }
      const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      res.setHeader(
        'Set-Cookie',
        `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`,
      );
      res.writeHead(204);
      return res.end();
    }
    const cookies = (req.headers.cookie || '').split(';').map((part) => part.trim());
    const key = cookies.find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!allowed(key)) {
      if (req.method !== 'GET' || pathname !== '/')
        return fail(403, 'Abre el enlace completo de acceso compartido.');
      const nonce = randomBytes(18).toString('base64');
      res.setHeader(
        'Content-Security-Policy',
        `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
      );
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(
        `<!doctype html><html lang="es"><meta name="viewport" content="width=device-width"><title>ORYX K9 · Acceso privado</title><style nonce="${nonce}">body{font:18px system-ui;background:#f4f3ee;color:#253229;max-width:650px;margin:15vh auto;padding:30px}h1{letter-spacing:.12em}p{line-height:1.7}</style><h1>ORYX K9</h1><p id="status">Abre el enlace completo que te compartieron para acceder.</p><script nonce="${nonce}">const key=new URLSearchParams(location.hash.slice(1)).get('compartir');if(key){history.replaceState(null,'','/');document.getElementById('status').textContent='Abriendo ORYX K9…';fetch('/__share/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:key})}).then(r=>{if(!r.ok)throw Error();location.replace('/')}).catch(()=>{document.getElementById('status').textContent='No se pudo abrir el enlace. Solicita uno nuevo.'})}</script></html>`,
      );
    }
    if (pathname.startsWith('/__share/')) return fail(404, 'No encontrado.');
    const headers = { ...req.headers, host: target.host };
    for (const name of Object.keys(headers))
      if (hopHeaders.includes(name) || name.startsWith('x-forwarded-') || name === 'forwarded')
        delete headers[name];
    headers.cookie = cookies.filter((part) => !part.startsWith(`${cookieName}=`)).join('; ');
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
