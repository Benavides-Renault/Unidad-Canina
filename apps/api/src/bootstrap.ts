import 'dotenv/config';
import * as argon2 from 'argon2';
import { createInterface } from 'node:readline/promises';
import { createDb } from './db';
import { usernameSchema, parse, passwordSchema, requiredText } from './security';

async function hiddenPassword() {
  if (!process.stdin.isTTY)
    throw new Error('Proporciona BOOTSTRAP_PASSWORD por entorno o usa una terminal interactiva.');
  process.stdout.write('Contraseña (mínimo 12 caracteres; entrada oculta): ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise<string>((resolve, reject) => {
    let value = '';
    const handler = (chunk: Buffer) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') {
          finish();
          reject(new Error('Cancelado.'));
          return;
        }
        if (char === '\r' || char === '\n') {
          finish();
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ' && value.length < 128) value += char;
      }
    };
    const finish = () => {
      process.stdin.off('data', handler);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    process.stdin.on('data', handler);
  });
}
async function main() {
  const db = createDb();
  try {
    if (await db.user.count())
      throw new Error('Bootstrap deshabilitado: ya existen usuarios. Usa la administración privada.');
    const reader = createInterface({ input: process.stdin, output: process.stdout });
    const usernameInput =
      process.env.BOOTSTRAP_USERNAME || (await reader.question('Usuario del primer administrador: '));
    const nameInput = process.env.BOOTSTRAP_NAME || (await reader.question('Nombre: '));
    reader.close();
    const secret = process.env.BOOTSTRAP_PASSWORD || (await hiddenPassword());
    const username = parse(usernameSchema, usernameInput),
      name = parse(requiredText, nameInput),
      password = parse(passwordSchema, secret);
    delete process.env.BOOTSTRAP_PASSWORD;
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(71499534)::text`;
      if (await tx.user.count()) throw new Error('Ya existen usuarios; no se puede repetir el bootstrap.');
      const user = await tx.user.create({ data: { username, name, passwordHash, role: 'ADMIN' } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorName: name,
          entity: 'User',
          entityId: user.id,
          action: 'BOOTSTRAP',
          summary: 'Primer administrador creado desde instalación local.',
        },
      });
    });
    console.log('Administrador creado. Inicia sesión y habilita MFA desde Usuarios/Configuración.');
  } finally {
    await db.$disconnect();
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Bootstrap fallido.');
  process.exitCode = 1;
});
