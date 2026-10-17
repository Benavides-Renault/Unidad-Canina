import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { z } from 'zod';

export const roles = ['ADMIN', 'TRAINER', 'CLIENT'] as const;
export type Role = (typeof roles)[number];
export const READ_DOGS: Role[] = ['ADMIN'];
export const MANAGE_DOGS: Role[] = ['ADMIN'];
export const CLINICAL: Role[] = ['ADMIN'];
export const ADMINS: Role[] = ['ADMIN'];
export const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export function equal(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function encryptionKey() {
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key || !/^[a-f\d]{64}$/i.test(key))
    throw new Error('APP_ENCRYPTION_KEY debe contener 64 caracteres hexadecimales.');
  return Buffer.from(key, 'hex');
}
export function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((v) => v.toString('base64url')).join('.');
}
export function decrypt(value: string) {
  const [iv, tag, body] = value.split('.').map((v) => Buffer.from(v, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(body), cipher.final()]).toString('utf8');
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes: Buffer) {
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  return (bits.match(/.{1,5}/g) || []).map((v) => alphabet[parseInt(v.padEnd(5, '0'), 2)]).join('');
}
function unbase32(value: string) {
  const bits = [...value].map((v) => alphabet.indexOf(v).toString(2).padStart(5, '0')).join('');
  return Buffer.from((bits.match(/.{8}/g) || []).map((v) => parseInt(v, 2)));
}
export function totp(secret: string, time = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const digest = createHmac('sha1', unbase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
export function verifyTotp(secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  return [-1, 0, 1].some((step) => equal(totp(secret, Date.now() + step * 30000), code));
}
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map((v) => `${v.path.join('.') || 'datos'}: ${v.message}`),
    );
  return result.data;
}
export const requiredText = z.string().trim().min(1).max(200);
export const optionalText = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .optional()
  .transform((v) => v || null);
export const passwordSchema = z
  .string()
  .max(128)
  .refine((value) => value.length >= (process.env.DEMO_MODE === 'true' ? 4 : 12), {
    error: () => `Usa al menos ${process.env.DEMO_MODE === 'true' ? 4 : 12} caracteres.`,
  });
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Usa al menos 3 caracteres para el usuario.')
  .max(40)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, 'Usa letras sin acentos, números, puntos, guiones o guion bajo.');
export const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const idSchema = z.string().uuid();
export const civilDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  }, 'Fecha inválida.')
  .transform((v) => new Date(`${v}T00:00:00Z`));
export const instant = z
  .string()
  .datetime({ offset: true })
  .transform((v) => new Date(v));
export function pagination(query: Record<string, unknown>) {
  const page = Number(query.page || 1),
    pageSize = Number(query.pageSize || 20);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new BadRequestException('Paginación inválida.');
  return { page, pageSize, skip: (page - 1) * pageSize };
}
export function checkRoles(role: Role, allowed: Role[]) {
  if (!allowed.includes(role)) throw new ForbiddenException('No tienes permiso para esta operación.');
}
export function fileType(data: Buffer): string | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (
    data.length >= 4 &&
    data[0] === 255 &&
    data[1] === 216 &&
    data[2] === 255 &&
    data[data.length - 2] === 255 &&
    data[data.length - 1] === 217
  )
    return 'image/jpeg';
  if (data.length >= 8 && data.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export const publicUser = (user: {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: string;
  partyId?: string | null;
  totpSecret?: string | null;
  active?: boolean;
}) => ({
  id: user.id,
  name: user.name,
  username: user.username,
  email: user.email,
  role: user.role,
  partyId: user.partyId || null,
  mfaEnabled: Boolean(user.totpSecret),
  mfaRequired: process.env.ADMIN_MFA_REQUIRED === 'true' && user.role === 'ADMIN',
  passwordMinLength: process.env.DEMO_MODE === 'true' ? 4 : 12,
  ...(user.active === undefined ? {} : { active: user.active }),
});
