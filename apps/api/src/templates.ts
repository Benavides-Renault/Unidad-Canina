import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Req,
  Inject,
  ConflictException,
} from '@nestjs/common';
import { z } from 'zod';
import { Allowed, AuthRequest } from './access';
import { Db } from './db';
import { Domain } from './domain';
import { idSchema, parse, requiredText } from './security';
const schema = z
  .object({
    name: requiredText,
    kind: z.enum(['TRAINING', 'BREEDING', 'CONTRACT']),
    title: requiredText,
    issuer: requiredText,
    body: z.string().trim().min(1).max(12000),
  })
  .strict();
function validate(body: string) {
  for (const key of body.matchAll(/\{\{(.*?)\}\}/g))
    if (!['nombre', 'codigo', 'fecha', 'referencia', 'emisor'].includes(key[1]))
      throw new BadRequestException(`Variable no admitida: ${key[1]}.`);
}
@Allowed('ADMIN', 'TRAINER')
@Controller('templates')
export class TemplatesController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Domain) private domain: Domain,
  ) {}
  @Get() list(@Req() req: AuthRequest) {
    return this.db.certificateTemplate.findMany({
      where: { archivedAt: null, ...(req.user.role === 'TRAINER' ? { kind: 'TRAINING' } : {}) },
      orderBy: { name: 'asc' },
    });
  }
  @Allowed('ADMIN') @Post() async create(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(schema, body);
    validate(data.body);
    return this.db.$transaction(async (tx) => {
      const item = await tx.certificateTemplate.create({ data });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'CertificateTemplate', item.id, 'CREATE', 'Plantilla interna creada.'),
      });
      return item;
    });
  }
  @Allowed('ADMIN') @Patch(':id') async edit(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    const { revision, ...data } = parse(schema.extend({ revision: z.number().int().positive() }), body);
    validate(data.body);
    return this.db.$transaction(async (tx) => {
      const changed = await tx.certificateTemplate.updateMany({
        where: { id, revision, archivedAt: null },
        data: { ...data, revision: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('La plantilla cambió o está archivada.');
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'CertificateTemplate',
          id,
          'UPDATE',
          'Nueva revisión de plantilla; certificados anteriores conservan su contenido.',
        ),
      });
      return tx.certificateTemplate.findUniqueOrThrow({ where: { id } });
    });
  }
  @Allowed('ADMIN') @Delete(':id') async archive(@Param('id') id: string, @Req() req: AuthRequest) {
    parse(idSchema, id);
    return this.db.$transaction(async (tx) => {
      await tx.certificateTemplate.update({ where: { id }, data: { archivedAt: new Date() } });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'CertificateTemplate', id, 'ARCHIVE', 'Plantilla archivada.'),
      });
      return { success: true };
    });
  }
}
