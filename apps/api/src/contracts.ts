import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Prisma, Contract } from '@prisma/client';
import { Response } from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { Allowed, AuthRequest } from './access';
import { Db } from './db';
import { Domain, Tx } from './domain';
import { Storage } from './documents';
import {
  ADMINS,
  civilDate,
  emailSchema,
  fileType,
  hash,
  idSchema,
  instant,
  optionalText,
  pagination,
  parse,
  requiredText,
} from './security';
import {
  BUSINESS,
  civilToday,
  currencySchema,
  dateOrder,
  lock,
  moneySchema,
  reportPdf,
  snapshot,
} from './business-common';

export const institutionSchema = z
  .object({
    name: requiredText,
    kind: requiredText,
    taxId: optionalText,
    address: optionalText,
    notes: optionalText,
  })
  .strict();
export const contactSchema = z
  .object({
    name: requiredText,
    position: optionalText,
    email: emailSchema.nullable().optional(),
    phone: optionalText,
  })
  .strict();
export const contractSchema = z
  .object({
    number: requiredText,
    institutionId: idSchema,
    title: requiredText,
    amount: moneySchema,
    currency: currencySchema,
    periodicity: requiredText,
    startDate: civilDate,
    endDate: civilDate,
    status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
    responsible: requiredText,
    clauses: z
      .string()
      .trim()
      .max(16000)
      .nullable()
      .optional()
      .transform((v) => v || null),
    notes: optionalText,
  })
  .strict();
export const assignmentSchema = z
  .object({
    dogId: idSchema,
    handlerId: idSchema,
    role: requiredText,
    startDate: civilDate,
    endDate: civilDate,
    overlapReason: optionalText,
  })
  .strict();
export const serviceSchema = z
  .object({
    contractId: idSchema,
    occurredAt: instant,
    endsAt: instant,
    location: requiredText,
    publicSummary: requiredText,
    internalNotes: optionalText,
  })
  .strict();

async function scheduleContract(tx: Tx, contract: Contract) {
  await tx.reminder.updateMany({
    where: {
      sourceType: 'CONTRACT',
      sourceId: contract.id,
      status: { in: ['PENDING', 'PROCESSING', 'FAILED'] },
    },
    data: { status: 'CANCELLED' },
  });
  if (contract.status !== 'ACTIVE') return;
  const users = await tx.user.findMany({
    where: { active: true, role: { in: BUSINESS } },
    select: { id: true },
  });
  for (const days of [30, 7, 1]) {
    const scheduled = new Date(contract.endDate.valueOf() + 15 * 3600000 - days * 86400000);
    if (scheduled < new Date() && days !== 1) continue;
    for (const user of users) {
      const dedupeKey = `contract:${contract.id}:${contract.endDate.toISOString().slice(0, 10)}:${days}:${user.id}`;
      const data = {
        dueAt: scheduled < new Date() ? new Date() : scheduled,
        title: `Vence contrato ${contract.number}`,
        body: `Fecha de vencimiento: ${contract.endDate.toISOString().slice(0, 10)}. Revisa el contrato en ORYX K9.`,
      };
      await tx.reminder.upsert({
        where: { dedupeKey },
        create: { ...data, dedupeKey, sourceType: 'CONTRACT', sourceId: contract.id, userId: user.id },
        update: {},
      });
      await tx.reminder.updateMany({
        where: { dedupeKey, status: 'CANCELLED', sentAt: null },
        data: { ...data, status: 'PENDING', attempts: 0 },
      });
    }
  }
}

@ApiTags('Instituciones')
@Allowed(...BUSINESS)
@Controller('institutions')
export class InstitutionsController {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(Domain) private readonly domain: Domain,
  ) {}
  @Get() async list(@Query() query: Record<string, string>) {
    const { page, pageSize, skip } = pagination(query);
    const where: Prisma.InstitutionWhereInput = {
      archivedAt: null,
      ...(query.search ? { name: { contains: query.search.slice(0, 200), mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.institution.findMany({
        where,
        include: { contacts: { where: { active: true } } },
        skip,
        take: pageSize,
        orderBy: { name: 'asc' },
      }),
      this.db.institution.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
  @Allowed(...ADMINS) @Post() async create(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(institutionSchema, body);
    return this.db.$transaction(async (tx) => {
      const item = await tx.institution.create({ data });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Institution', item.id, 'CREATE', 'Institución registrada.'),
      });
      return item;
    });
  }
  @Allowed(...ADMINS) @Patch(':id') async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    const data = parse(institutionSchema.partial(), body);
    return this.db.$transaction(async (tx) => {
      const item = await tx.institution.update({ where: { id, archivedAt: null }, data });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Institution', id, 'UPDATE', 'Datos de institución actualizados.'),
      });
      return item;
    });
  }
  @Allowed(...ADMINS) @Post(':id/contacts') async contact(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    const data = parse(contactSchema, body);
    return this.db.$transaction(async (tx) => {
      if (!(await tx.institution.findFirst({ where: { id, archivedAt: null } })))
        throw new NotFoundException('Institución no encontrada.');
      const item = await tx.contact.create({ data: { ...data, institutionId: id } });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Contact', item.id, 'CREATE', 'Contacto institucional registrado.'),
      });
      return item;
    });
  }
  @Patch(':id/contacts/:contactId') async editContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    parse(idSchema, contactId);
    const data = parse(contactSchema.extend({ active: z.boolean().optional() }), body);
    return this.db.$transaction(async (tx) => {
      const item = await tx.contact.update({
        where: { id: contactId, institutionId: id, institution: { archivedAt: null } },
        data,
      });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Contact', contactId, 'UPDATE', 'Contacto institucional actualizado.'),
      });
      return item;
    });
  }
}

@ApiTags('Contratos privados')
@Allowed(...BUSINESS)
@Controller('contracts')
export class ContractsController {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(Domain) private readonly domain: Domain,
    @Inject(Storage) private readonly storage: Storage,
  ) {}
  @Post(':id/renew') async renew(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    parse(idSchema, id);
    const { expectedRevision, ...data } = parse(
      contractSchema.omit({ institutionId: true }).extend({ expectedRevision: z.number().int().positive() }),
      body,
    );
    dateOrder(data.startDate, data.endDate);
    return this.db.$transaction(async (tx) => {
      await lock(tx, `contract:${id}`);
      const old = await tx.contract.findUnique({ where: { id }, include: { institution: true } });
      if (!old || old.institution.archivedAt)
        throw new NotFoundException('Contrato o institución no disponible.');
      if (old.revision !== expectedRevision)
        throw new ConflictException('El contrato cambió. Recarga antes de renovar.');
      if (old.status === 'CANCELLED' || data.startDate <= old.endDate)
        throw new BadRequestException(
          'La renovación debe comenzar después del contrato anterior y éste no puede estar cancelado.',
        );
      if (await tx.contract.count({ where: { renewedFromId: id, status: { not: 'CANCELLED' } } }))
        throw new ConflictException('Ya existe una renovación. Abre ese contrato para continuar la cadena.');
      const item = await tx.contract.create({
        data: { ...data, institutionId: old.institutionId, renewedFromId: id },
      });
      await tx.contractVersion.create({
        data: { contractId: item.id, revision: 1, snapshot: snapshot(item), recordedBy: req.user.id },
      });
      await scheduleContract(tx, item);
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Contract',
          item.id,
          'RENEW',
          `Renovación enlazada al contrato ${old.number}.`,
        ),
      });
      return item;
    });
  }
  @Get() async list(@Query() query: Record<string, string>, @Req() req: AuthRequest) {
    const { page, pageSize, skip } = pagination(query);
    const where: Prisma.ContractWhereInput = {
      ...(query.status
        ? { status: parse(z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED']), query.status) }
        : {}),
      ...(query.dueBefore ? { endDate: { lte: parse(civilDate, query.dueBefore) } } : {}),
      ...(query.dogId ? { assignments: { some: { dogId: parse(idSchema, query.dogId) } } } : {}),
      ...(query.search
        ? {
            OR: [
              { number: { contains: query.search.slice(0, 200), mode: 'insensitive' } },
              { title: { contains: query.search.slice(0, 200), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.contract.findMany({
        where,
        include: {
          institution: { select: { id: true, name: true } },
          _count: { select: { assignments: true, services: true, files: true } },
        },
        skip,
        take: pageSize,
        orderBy: { endDate: 'asc' },
      }),
      this.db.contract.count({ where }),
    ]);
    await this.db.auditLog.create({
      data: this.domain.audit(req, 'Contract', 'list', 'READ', 'Listado de contratos consultado.'),
    });
    return { items, total, page, pageSize };
  }
  @Get(':id') async detail(@Param('id') id: string, @Req() req: AuthRequest) {
    parse(idSchema, id);
    const item = await this.db.contract.findUnique({
      where: { id },
      include: {
        institution: { include: { contacts: { where: { active: true } } } },
        versions: { orderBy: { revision: 'desc' }, take: 50 },
        files: {
          select: { id: true, name: true, mimeType: true, size: true, version: true, createdAt: true },
          orderBy: { version: 'desc' },
        },
        assignments: {
          include: {
            dog: { select: { id: true, name: true, code: true } },
            handler: { select: { id: true, name: true } },
          },
          orderBy: { startDate: 'desc' },
        },
        services: { orderBy: { occurredAt: 'desc' }, take: 100 },
      },
    });
    if (!item) throw new NotFoundException('Contrato no encontrado.');
    await this.db.auditLog.create({
      data: this.domain.audit(req, 'Contract', id, 'READ', 'Contrato privado consultado.'),
    });
    return item;
  }
  @Allowed(...ADMINS) @Post() async create(@Body() body: unknown, @Req() req: AuthRequest) {
    const { templateId, ...data } = parse(contractSchema.extend({ templateId: idSchema.optional() }), body);
    dateOrder(data.startDate, data.endDate);
    return this.db.$transaction(async (tx) => {
      if (!(await tx.institution.findFirst({ where: { id: data.institutionId, archivedAt: null } })))
        throw new BadRequestException('Selecciona una institución activa.');
      if (templateId) {
        const template = await tx.certificateTemplate.findFirst({
          where: { id: templateId, kind: 'CONTRACT', archivedAt: null },
        });
        if (!template) throw new BadRequestException('Plantilla contractual no disponible.');
        const institution = await tx.institution.findUniqueOrThrow({ where: { id: data.institutionId } });
        const values: Record<string, string> = {
          nombre: institution.name,
          codigo: data.number,
          fecha: data.startDate.toISOString().slice(0, 10),
          referencia: data.number,
          emisor: template.issuer,
        };
        if (!data.clauses)
          data.clauses = template.body.replace(/\{\{(.*?)\}\}/g, (_, key) => values[key] || '');
      }
      const item = await tx.contract.create({ data });
      await tx.contractVersion.create({
        data: { contractId: item.id, revision: 1, snapshot: snapshot(item), recordedBy: req.user.id },
      });
      await scheduleContract(tx, item);
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Contract',
          item.id,
          'CREATE',
          'Contrato y primera versión registrados.',
        ),
      });
      return item;
    });
  }
  @Allowed(...ADMINS) @Patch(':id') async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    const data = parse(
      contractSchema
        .omit({ institutionId: true })
        .partial()
        .extend({ expectedRevision: z.number().int().positive() }),
      body,
    );
    const { expectedRevision, ...changes } = data;
    return this.db.$transaction(async (tx) => {
      await lock(tx, `contract:${id}`);
      const existing = await tx.contract.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Contrato no encontrado.');
      if (existing.revision !== expectedRevision)
        throw new ConflictException('El contrato cambió. Recarga antes de guardar.');
      const next = { ...existing, ...changes };
      dateOrder(next.startDate, next.endDate);
      const assignments = await tx.assignment.findMany({ where: { contractId: id, releasedOn: null } });
      if (assignments.length && next.status !== 'ACTIVE')
        throw new ConflictException('Retira las asignaciones antes de finalizar o cancelar el contrato.');
      if (assignments.some((a) => a.startDate < next.startDate || a.endDate > next.endDate))
        throw new ConflictException('El periodo debe incluir las asignaciones vigentes.');
      const item = await tx.contract.update({
        where: { id },
        data: { ...changes, revision: { increment: 1 } },
      });
      await tx.contractVersion.create({
        data: { contractId: id, revision: item.revision, snapshot: snapshot(item), recordedBy: req.user.id },
      });
      await scheduleContract(tx, item);
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Contract',
          id,
          'UPDATE',
          `Versión ${item.revision} registrada; historial conservado.`,
        ),
      });
      return item;
    });
  }
  @Allowed(...ADMINS) @Post(':id/assignments') async assign(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    const data = parse(assignmentSchema, body);
    dateOrder(data.startDate, data.endDate);
    return this.db.$transaction(async (tx) => {
      await lock(tx, `contract:${id}`);
      await lock(tx, `dog:${data.dogId}`);
      const contract = await tx.contract.findUnique({ where: { id } });
      if (!contract || contract.status !== 'ACTIVE')
        throw new BadRequestException('El contrato debe estar activo.');
      if (data.startDate < contract.startDate || data.endDate > contract.endDate)
        throw new BadRequestException('La asignación debe estar dentro del periodo contractual.');
      const dog = await tx.dog.findFirst({ where: { id: data.dogId, archivedAt: null } });
      if (
        !dog ||
        ['DECEASED', 'SOLD', 'RETIRED'].includes(dog.administrativeStatus) ||
        ['TEMPORARILY_UNFIT', 'REST'].includes(dog.workStatus) ||
        dog.isPuppy ||
        ['UNAVAILABLE', 'RESERVED'].includes(dog.availability)
      )
        throw new BadRequestException('Este perro no está disponible para una asignación.');
      if (
        !(await tx.user.findFirst({
          where: { id: data.handlerId, active: true, role: { in: ['ADMIN', 'TRAINER'] } },
        }))
      )
        throw new BadRequestException('Selecciona un responsable operativo activo.');
      const candidates = await tx.assignment.findMany({
        where: { dogId: data.dogId, startDate: { lte: data.endDate }, endDate: { gte: data.startDate } },
      });
      const conflicts = candidates.filter((a) => (a.releasedOn || a.endDate) >= data.startDate);
      if (conflicts.length && !data.overlapReason)
        throw new ConflictException(
          'El perro tiene una asignación en ese periodo. Revisa las fechas o registra una justificación de excepción.',
        );
      const item = await tx.assignment.create({ data: { ...data, contractId: id } });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Assignment',
          item.id,
          conflicts.length ? 'OVERLAP_OVERRIDE' : 'CREATE',
          conflicts.length
            ? `Excepción autorizada por administración. Motivo: ${data.overlapReason}`
            : 'Asignación registrada.',
          data.dogId,
        ),
      });
      return item;
    });
  }
  @Allowed(...ADMINS) @Post(':id/assignments/:assignmentId/release') async release(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    parse(idSchema, assignmentId);
    const data = parse(z.object({ releasedOn: civilDate, reason: requiredText }).strict(), body);
    return this.db.$transaction(async (tx) => {
      await lock(tx, `contract:${id}`);
      const item = await tx.assignment.findFirst({ where: { id: assignmentId, contractId: id } });
      if (!item) throw new NotFoundException('Asignación no encontrada.');
      await lock(tx, `dog:${item.dogId}`);
      if (item.releasedOn) throw new ConflictException('La asignación ya fue retirada.');
      if (
        data.releasedOn < item.startDate ||
        data.releasedOn > item.endDate ||
        data.releasedOn > civilToday()
      )
        throw new BadRequestException('El retiro debe estar dentro de la asignación y no puede ser futuro.');
      const updated = await tx.assignment.update({
        where: { id: assignmentId },
        data: { releasedOn: data.releasedOn, releaseReason: data.reason },
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Assignment',
          item.id,
          'RELEASE',
          'Asignación retirada; historial conservado.',
          item.dogId,
        ),
      });
      return updated;
    });
  }
  @Allowed(...ADMINS)
  @Post(':id/files')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } }))
  async upload(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Req() req: AuthRequest) {
    parse(idSchema, id);
    if (!(await this.db.contract.findUnique({ where: { id } })))
      throw new NotFoundException('Contrato no encontrado.');
    const mimeType = file?.buffer && fileType(file.buffer);
    if (!mimeType || mimeType !== file.mimetype)
      throw new BadRequestException('Selecciona un PDF, PNG o JPEG válido, de hasta 10 MB.');
    const storageKey = randomUUID();
    await this.storage.put(storageKey, file.buffer, mimeType);
    return this.db.$transaction(async (tx) => {
      await lock(tx, `contract:${id}`);
      const last = await tx.contractFile.aggregate({ where: { contractId: id }, _max: { version: true } });
      const item = await tx.contractFile.create({
        data: {
          contractId: id,
          version: (last._max.version || 0) + 1,
          name:
            path
              .basename(file.originalname)
              .split('')
              .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
              .join('')
              .slice(0, 200) || 'contrato',
          mimeType,
          size: file.size,
          checksum: hash(file.buffer),
          storageKey,
          uploadedBy: req.user.id,
        },
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'ContractFile',
          item.id,
          'UPLOAD',
          `Archivo privado versión ${item.version}.`,
        ),
      });
      return { id: item.id, name: item.name, version: item.version };
    });
  }
  @Get(':id/files/:fileId/download') async download(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    parse(idSchema, id);
    parse(idSchema, fileId);
    const file = await this.db.contractFile.findFirst({ where: { id: fileId, contractId: id } });
    if (!file) throw new NotFoundException('Archivo no encontrado.');
    const bytes = await this.storage.get(file.storageKey);
    if (hash(bytes) !== file.checksum)
      throw new BadRequestException('La integridad del archivo no coincide.');
    await this.db.auditLog.create({
      data: this.domain.audit(
        req,
        'ContractFile',
        file.id,
        'DOWNLOAD',
        'Descarga autorizada de contrato privado.',
      ),
    });
    res.type(file.mimeType);
    res.attachment(file.name);
    res.send(bytes);
  }
  @Get(':id/client-report.pdf') async report(
    @Param('id') id: string,
    @Query() query: Record<string, string>,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    parse(idSchema, id);
    const from = query.from ? parse(instant, query.from) : undefined,
      to = query.to ? parse(instant, query.to) : undefined;
    if (from && to) dateOrder(from, to);
    const item = await this.db.contract.findUnique({
      where: { id },
      include: {
        institution: { select: { name: true } },
        services: {
          where: { occurredAt: { gte: from, lte: to } },
          orderBy: { occurredAt: 'asc' },
          take: 1001,
        },
      },
    });
    if (!item) throw new NotFoundException('Contrato no encontrado.');
    if (item.services.length > 1000)
      throw new BadRequestException('Acota el periodo del informe a un máximo de 1000 servicios.');
    await this.db.auditLog.create({
      data: this.domain.audit(
        req,
        'Contract',
        id,
        'EXPORT',
        'Informe para cliente: únicamente fecha y resumen aprobado, sin importes ni notas internas.',
      ),
    });
    reportPdf(
      res,
      'Informe de servicios',
      [
        `Institución: ${item.institution.name}`,
        `Contrato: ${item.number}`,
        `Periodo contractual: ${item.startDate.toISOString().slice(0, 10)} al ${item.endDate.toISOString().slice(0, 10)}`,
        `Servicios: ${item.services.length}`,
        ...item.services.map(
          (s) =>
            `${s.occurredAt.toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })}: ${s.publicSummary}`,
        ),
        'Documento interno de seguimiento. Revisar antes de compartir.',
      ],
      `servicios-${id}.pdf`,
    );
  }
}

@ApiTags('Operaciones y servicios')
@Allowed('ADMIN')
@Controller('operations')
export class ServicesController {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(Domain) private readonly domain: Domain,
  ) {}
  @Get('assignments') async assignments(@Query() query: Record<string, string>, @Req() req: AuthRequest) {
    const { page, pageSize, skip } = pagination(query);
    const where: Prisma.AssignmentWhereInput = {
      ...(req.user.role === 'TRAINER' ? { handlerId: req.user.id } : {}),
      ...(query.dogId ? { dogId: parse(idSchema, query.dogId) } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.assignment.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { startDate: 'desc' },
        include: {
          dog: { select: { id: true, name: true, code: true } },
          handler: { select: { name: true } },
          contract: {
            select: {
              id: true,
              number: true,
              title: true,
              status: true,
              institution: { select: { name: true } },
            },
          },
        },
      }),
      this.db.assignment.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
  @Get('handlers') async handlers() {
    return this.db.user.findMany({
      where: { active: true, role: { in: ['ADMIN', 'TRAINER'] } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
  @Get('services') async services(@Query() query: Record<string, string>, @Req() req: AuthRequest) {
    const { page, pageSize, skip } = pagination(query);
    const where: Prisma.ServiceLogWhereInput = {
      ...(req.user.role === 'TRAINER' ? { recordedBy: req.user.id } : {}),
      ...(query.contractId ? { contractId: parse(idSchema, query.contractId) } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.serviceLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { occurredAt: 'desc' },
        include: {
          contract: { select: { number: true, title: true } },
          recorder: { select: { name: true } },
        },
      }),
      this.db.serviceLog.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
  @Post('services') async create(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(serviceSchema, body);
    dateOrder(data.occurredAt, data.endsAt);
    if (data.endsAt <= data.occurredAt)
      throw new BadRequestException('El final debe ser posterior al inicio.');
    return this.db.$transaction(async (tx) => {
      await lock(tx, `contract:${data.contractId}`);
      const contract = await tx.contract.findUnique({ where: { id: data.contractId } });
      if (!contract || contract.status !== 'ACTIVE')
        throw new BadRequestException('El contrato debe estar activo.');
      const day = new Date(data.occurredAt.valueOf() - 6 * 3600000).toISOString().slice(0, 10),
        endDay = new Date(data.endsAt.valueOf() - 6 * 3600000).toISOString().slice(0, 10);
      if (
        day < contract.startDate.toISOString().slice(0, 10) ||
        endDay > contract.endDate.toISOString().slice(0, 10)
      )
        throw new BadRequestException('El servicio debe estar dentro del periodo contractual.');
      if (req.user.role === 'TRAINER') {
        const assignments = await tx.assignment.findMany({
          where: {
            contractId: contract.id,
            handlerId: req.user.id,
            startDate: { lte: new Date(`${day}T00:00:00Z`) },
            endDate: { gte: new Date(`${endDay}T00:00:00Z`) },
          },
        });
        if (!assignments.some((a) => !a.releasedOn || a.releasedOn.toISOString().slice(0, 10) >= endDay))
          throw new BadRequestException('No tienes una asignación que cubra este servicio.');
      }
      const item = await tx.serviceLog.create({ data: { ...data, recordedBy: req.user.id } });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'ServiceLog',
          item.id,
          'CREATE',
          'Servicio operativo registrado con resumen para cliente separado.',
        ),
      });
      return item;
    });
  }
}
