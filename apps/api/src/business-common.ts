import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Response } from 'express';
import { Role } from './security';
import { Tx } from './domain';

export const BUSINESS: Role[] = ['ADMIN'];
export const moneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,14}(\.\d{1,2})?$/, 'Escribe un importe positivo con hasta dos decimales.')
  .transform((v) => new Prisma.Decimal(v));
export const currencySchema = z.enum(['CRC', 'USD']);
export const positiveMoney = moneySchema.refine(
  (value) => value.gt(0),
  'El importe debe ser mayor que cero.',
);
export const quantitySchema = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,3})?$/, 'Usa hasta tres decimales.')
  .transform((value) => new Prisma.Decimal(value));
export function notFuture(value: Date) {
  if (value > civilToday()) throw new BadRequestException('La fecha no puede estar en el futuro.');
}
export const civilToday = () =>
  new Date(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Costa_Rica',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()) + 'T00:00:00Z',
  );
export const snapshot = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export function dateOrder(start: Date, end: Date) {
  if (end < start) throw new BadRequestException('La fecha final debe ser igual o posterior a la inicial.');
}
export async function lock(tx: Tx, scope: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))::text`;
}
export function reportPdf(res: Response, title: string, lines: string[], filename: string) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: title } });
  res.type('application/pdf');
  res.attachment(filename);
  res.setHeader('Cache-Control', 'private, no-store');
  doc.pipe(res);
  const logo = [
    process.env.BRANDING_LOGO_PATH,
    path.resolve('assets/branding/valkyr-logo-original.png'),
    path.resolve('../../assets/branding/valkyr-logo-original.png'),
  ].find((p) => p && existsSync(p));
  if (logo) doc.image(logo, 48, 35, { fit: [55, 65] });
  doc.fontSize(19).fillColor('#141414').text('VALKYR UNIDAD CANINA', 120, 45);
  doc.fontSize(11).text(title, 120, 76, { width: 420 });
  doc.x = 48;
  doc.y = 125;
  for (const line of lines) {
    if (doc.y > 740) doc.addPage();
    doc.font('Helvetica').fontSize(10).fillColor('#303030').text(line, { width: 495, lineGap: 3 });
    doc.moveDown(0.7);
  }
  doc.end();
}
