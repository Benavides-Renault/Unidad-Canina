import { readFile, writeFile } from 'node:fs/promises';
import webpush from 'web-push';
import { root, loadEnv } from './env.mjs';
loadEnv();
process.chdir(root);
const subject = process.argv.find((a) => a.startsWith('--subject='))?.slice(10);
if (!subject || !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$|^https:\/\/[^\s]+$/.test(subject))
  throw new Error('Indica --subject=mailto:correo-de-contacto o una URL HTTPS de contacto.');
if (process.env.VAPID_PRIVATE_KEY || process.env.VAPID_PUBLIC_KEY)
  throw new Error('Ya existen claves VAPID; no se rotan automáticamente.');
const file = '.local/local.env',
  old = await readFile(file, 'utf8');
const keys = webpush.generateVAPIDKeys();
const retained = old.split(/\r?\n/).filter((l) => !/^VAPID_(PRIVATE_KEY|PUBLIC_KEY|SUBJECT)=/.test(l));
await writeFile(
  file,
  retained.join('\n') +
    `\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=${subject}\n`,
  { mode: 0o600 },
);
console.log(
  'Claves VAPID guardadas en la configuración local. Reinicia API y trabajador; cada navegador debe activar sus notificaciones.',
);
