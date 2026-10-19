import {
  BadRequestException,
  ConflictException,
  Body,
  Controller,
  Delete,
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
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { Allowed, AuthRequest } from './access';
import { Db } from './db';
import { Domain, Tx } from './domain';
import { Storage } from './documents';
import {
  civilDate,
  emailSchema,
  fileType,
  hash,
  idSchema,
  optionalText,
  pagination,
  parse,
  requiredText,
} from './security';
import { currencySchema, lock, notFuture, positiveMoney, snapshot } from './business-common';
import { trainingSchema, vaccinationSchema } from './schemas';
import { CatalogReader, identity, catalogPhotoWhere } from './catalog';
export { saleWhere, breedingParentWhere } from './catalog';

export const UNIT_PARTY = '00000000-0000-4000-8000-000000000001';
export const partySchema = z
  .object({
    name: requiredText,
    kind: z.enum(['PERSON', 'MUNICIPALITY', 'ORGANIZATION']),
    phone: optionalText,
    email: emailSchema.nullable().optional(),
  })
  .strict();
export const publicationSchema = z
  .object({
    commercialCategory: z.enum(['NOT_LISTED', 'FOR_SALE', 'FOR_BREEDING']).optional(),
    availableForSale: z.boolean().optional(),
    availableForBreeding: z.boolean().optional(),
    salePublished: z.boolean(),
    salePrice: positiveMoney.nullable().optional(),
    saleCurrency: currencySchema,
    saleContact: optionalText,
    publicDescription: optionalText,
    achievements: optionalText,
    trainingSummary: optionalText,
    functionalities: optionalText,
    healthSummary: optionalText,
    pedigreeSummary: optionalText,
  })
  .strict();
export const medicalSchema = z
  .object({
    eventDate: civilDate,
    kind: z.enum([
      'OBSERVATION',
      'CONSULTATION',
      'TREATMENT',
      'DEWORMING',
      'ALLERGY',
      'INJURY',
      'SURGERY',
      'LAB',
    ]),
    title: requiredText,
    notes: requiredText,
    professional: optionalText,
    diagnosis: optionalText,
    clinicalStatus: z.enum(['SUSPECTED', 'CONFIRMED', 'RESOLVED']).nullable().optional(),
    allergen: optionalText,
    medication: optionalText,
  })
  .strict();

@ApiTags('Personas y entidades')
@Allowed('ADMIN')
@Controller('parties')
export class PartiesController {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(Domain) private readonly domain: Domain,
  ) {}
  @Get() async list() {
    return this.db.party.findMany({
      orderBy: { name: 'asc' },
      include: { users: { select: { id: true, name: true, role: true, active: true } } },
    });
  }
  @Post() async create(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(partySchema, body);
    return this.db.$transaction(async (tx) => {
      const party = await tx.party.create({ data });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Party', party.id, 'CREATE', 'Persona o entidad registrada.'),
      });
      return party;
    });
  }
  @Patch(':id') async update(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    parse(idSchema, id);
    const data = parse(partySchema.partial(), body);
    if (id === UNIT_PARTY && data.kind)
      throw new BadRequestException('La entidad de ORYX K9 conserva su categoría.');
    return this.db.$transaction(async (tx) => {
      const party = await tx.party.update({ where: { id }, data });
      await tx.dog.updateMany({ where: { ownerPartyId: id }, data: { owner: party.name } });
      await tx.dog.updateMany({ where: { custodianPartyId: id }, data: { custodian: party.name } });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Party', id, 'UPDATE', 'Persona o entidad actualizada.'),
      });
      return party;
    });
  }
}

@ApiTags('Publicación comercial')
@Allowed('ADMIN')
@Controller('catalog')
export class CatalogAdminController {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(Domain) private readonly domain: Domain,
  ) {}
  @Patch('dogs/:id') async publish(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    parse(idSchema, id);
    const data = parse(publicationSchema, body);
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'commerce');
      await lock(tx, `dog:${id}`);
      const dog = await tx.dog.findFirst({ where: { id, archivedAt: null } });
      if (!dog) throw new NotFoundException('Perro no encontrado.');
      const availableForSale =
        data.availableForSale ??
        (data.commercialCategory ? data.commercialCategory === 'FOR_SALE' : dog.availableForSale);
      const availableForBreeding =
        data.availableForBreeding ??
        (data.commercialCategory ? data.commercialCategory === 'FOR_BREEDING' : dog.availableForBreeding);
      if (
        data.salePublished &&
        (!availableForSale ||
          !data.salePrice ||
          !data.saleContact?.trim() ||
          dog.availability !== 'AVAILABLE' ||
          ['SOLD', 'DECEASED', 'RETIRED'].includes(dog.administrativeStatus))
      )
        throw new BadRequestException('Para publicar requiere disponibilidad para venta, precio y contacto.');
      if (
        availableForBreeding &&
        (dog.isPuppy ||
          dog.availability !== 'AVAILABLE' ||
          dog.reproductiveStatus === 'RETIRED' ||
          ['SOLD', 'DECEASED', 'RETIRED'].includes(dog.administrativeStatus))
      )
        throw new BadRequestException('El perro no está disponible para cruza.');
      const result = await tx.dog.update({
        where: { id },
        data: {
          ...data,
          availableForSale,
          availableForBreeding,
          commercialCategory: availableForSale
            ? 'FOR_SALE'
            : availableForBreeding
              ? 'FOR_BREEDING'
              : 'NOT_LISTED',
        },
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Dog',
          id,
          'PUBLICATION',
          'Categoría y contenido de galería actualizados.',
          id,
        ),
      });
      return result;
    });
  }
}

const fileSelect = {
  id: true,
  name: true,
  mimeType: true,
  size: true,
  category: true,
  createdAt: true,
} as const;
const history = {
  vaccinations: { orderBy: { appliedDate: 'desc' as const } },
  weights: { orderBy: { date: 'asc' as const } },
  trainingSessions: { orderBy: { occurredAt: 'desc' as const } },
  medicalEntries: { where: { archivedAt: null }, orderBy: { eventDate: 'desc' as const } },
  appointments: { orderBy: { startsAt: 'desc' as const } },
  movements: { orderBy: { date: 'desc' as const } },
  documents: {
    where: { archivedAt: null, recordAttachment: null },
    select: fileSelect,
    orderBy: { createdAt: 'desc' as const },
  },
};
async function sendPrivateFile(
  db: Db,
  domain: Domain,
  storage: Storage,
  id: string,
  req: AuthRequest,
  res: Response,
  where: Prisma.DocumentWhereInput,
) {
  parse(idSchema, id);
  const file = await db.document.findFirst({ where: { id, archivedAt: null, ...where } });
  if (!file) throw new NotFoundException('Archivo no encontrado.');
  const bytes = await storage.get(file.storageKey);
  if (hash(bytes) !== file.checksum)
    throw new BadRequestException('No se pudo verificar la integridad del archivo.');
  await db.auditLog.create({
    data: domain.audit(
      req,
      'Document',
      id,
      'DOWNLOAD',
      'Archivo consultado desde portal autorizado.',
      file.dogId,
    ),
  });
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(file.mimeType);
  if (file.category === 'PHOTO')
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${file.id}.${file.mimeType === 'image/png' ? 'png' : 'jpg'}"`,
    );
  else res.attachment(file.name);
  return res.send(bytes);
}

@ApiTags('Portal de clientes')
@Allowed('ADMIN', 'CLIENT')
@Controller('portal')
export class PortalController {
  constructor(
    @Inject(CatalogReader) private readonly catalog: CatalogReader,
    @Inject(Db) private readonly db: Db,
    @Inject(Domain) private readonly domain: Domain,
    @Inject(Storage) private readonly storage: Storage,
  ) {}
  private owned(req: AuthRequest): Prisma.DogWhereInput {
    return { archivedAt: null, ownerPartyId: req.user.partyId || '00000000-0000-4000-8000-000000000000' };
  }
  @Get('dogs') async dogs(@Query() query: Record<string, string>, @Req() req: AuthRequest) {
    const { page, pageSize, skip } = pagination(query);
    const where = this.owned(req);
    const [items, total] = await Promise.all([
      this.db.dog.findMany({
        where,
        select: {
          ...identity,
          ownerParty: { select: { name: true, kind: true } },
          custodianParty: { select: { name: true, kind: true } },
        },
        orderBy: { name: 'asc' },
        skip,
        take: pageSize,
      }),
      this.db.dog.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
  @Get('dogs/:id') async dog(@Param('id') id: string, @Req() req: AuthRequest) {
    parse(idSchema, id);
    const dog = await this.db.dog.findFirst({
      where: { id, ...this.owned(req) },
      select: {
        ...identity,
        microchip: true,
        pedigreeNumber: true,
        registry: true,
        breeder: true,
        ownerParty: { select: { name: true, kind: true } },
        custodianParty: { select: { name: true, kind: true } },
        assignedTrainer: { select: { name: true } },
        ...history,
      },
    });
    if (!dog) throw new NotFoundException('Perro no encontrado.');
    await this.db.auditLog.create({
      data: this.domain.audit(
        req,
        'Dog',
        id,
        'CLIENT_READ',
        'El propietario consultó el historial completo.',
        id,
      ),
    });
    return dog;
  }
  @Get('documents/:id/download') async document(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    return sendPrivateFile(this.db, this.domain, this.storage, id, req, res, {
      dog: this.owned(req),
      recordAttachment: null,
    });
  }
  @Get('gallery/dogs') gallery(@Query() query: Record<string, string>) {
    return this.catalog.dogs(query);
  }
  @Get('gallery/dogs/:id') sale(@Param('id') id: string) {
    return this.catalog.dog(id);
  }
  @Get('gallery/crosses') crosses(@Query() query: Record<string, string>) {
    return this.catalog.crosses(query);
  }
  @Get('gallery/photos/:id') photo(@Param('id') id: string, @Req() req: AuthRequest, @Res() res: Response) {
    return sendPrivateFile(this.db, this.domain, this.storage, id, req, res, catalogPhotoWhere);
  }
}

@ApiTags('Trabajo asignado')
@Allowed('ADMIN', 'TRAINER')
@Controller('trainer')
export class TrainerController {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(Domain) private readonly domain: Domain,
    @Inject(Storage) private readonly storage: Storage,
  ) {}
  private scope(req: AuthRequest): Prisma.DogWhereInput {
    return { archivedAt: null, ...(req.user.role === 'ADMIN' ? {} : { assignedTrainerId: req.user.id }) };
  }
  private async assigned(tx: Tx, id: string, req: AuthRequest) {
    parse(idSchema, id);
    await lock(tx, `dog:${id}`);
    const dog = await tx.dog.findFirst({ where: { id, ...this.scope(req) } });
    if (!dog) throw new NotFoundException('Perro no asignado.');
    return dog;
  }
  @Get('dogs') async dogs(@Query() query: Record<string, string>, @Req() req: AuthRequest) {
    const { page, pageSize, skip } = pagination(query);
    const where = this.scope(req);
    const [items, total] = await Promise.all([
      this.db.dog.findMany({ where, select: identity, orderBy: { name: 'asc' }, skip, take: pageSize }),
      this.db.dog.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
  @Get('dogs/:id') async detail(@Param('id') id: string, @Req() req: AuthRequest) {
    parse(idSchema, id);
    const dog = await this.db.dog.findFirst({
      where: { id, ...this.scope(req) },
      select: {
        ...identity,
        vaccinations: history.vaccinations,
        weights: history.weights,
        trainingSessions: history.trainingSessions,
        medicalEntries: history.medicalEntries,
        documents: {
          ...history.documents,
          where: { archivedAt: null, recordAttachment: null, category: { in: ['PHOTO', 'CLINICAL'] } },
        },
      },
    });
    if (!dog) throw new NotFoundException('Perro no asignado.');
    return dog;
  }
  @Post('dogs/:id/training') async training(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const data = parse(trainingSchema, body);
    return this.db.$transaction(async (tx) => {
      await this.assigned(tx, id, req);
      const item = await tx.trainingSession.create({
        data: { ...data, dogId: id, trainerId: req.user.id, trainerName: req.user.name },
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'TrainingSession',
          item.id,
          'CREATE',
          'Entrenamiento añadido al perro asignado.',
          id,
        ),
      });
      return item;
    });
  }
  @Post('dogs/:id/medical') async medical(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const data = parse(medicalSchema, body);
    notFuture(data.eventDate);
    return this.db.$transaction(async (tx) => {
      await this.assigned(tx, id, req);
      const item = await tx.medicalEntry.create({ data: { ...data, dogId: id, recordedBy: req.user.id } });
      await tx.medicalRevision.create({
        data: {
          entryId: item.id,
          revision: 1,
          snapshot: snapshot(item),
          reason: 'Registro inicial',
          recordedBy: req.user.id,
        },
      });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'MedicalEntry', item.id, 'CREATE', 'Registro médico añadido.', id),
      });
      return item;
    });
  }
  @Post('dogs/:id/vaccinations') async vaccine(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const data = parse(vaccinationSchema, body);
    this.domain.validateVaccination({ ...data, nextDueDate: data.nextDueDate || null });
    return this.db.$transaction(async (tx) => {
      const dog = await this.assigned(tx, id, req);
      const item = await tx.vaccination.create({ data: { ...data, dogId: id, recordedBy: req.user.id } });
      await this.domain.vaccinationReminders(tx, item, dog);
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Vaccination',
          item.id,
          'CREATE',
          'Vacuna añadida al perro asignado.',
          id,
        ),
      });
      return item;
    });
  }
  @Post('dogs/:id/weights') async weight(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const data = parse(z.object({ date: civilDate, kg: z.number().positive().max(200) }).strict(), body);
    notFuture(data.date);
    return this.db.$transaction(async (tx) => {
      await this.assigned(tx, id, req);
      const item = await tx.weight.create({ data: { ...data, dogId: id, recordedBy: req.user.id } });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Weight', item.id, 'CREATE', 'Peso añadido al perro asignado.', id),
      });
      return item;
    });
  }
  @Post('dogs/:id/documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } }))
  async upload(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Req() req: AuthRequest) {
    if (!file?.buffer.length) throw new BadRequestException('Selecciona un comprobante médico.');
    const mimeType = fileType(file.buffer);
    if (!mimeType || mimeType !== file.mimetype)
      throw new BadRequestException('Sólo PDF, PNG o JPEG válidos.');
    return this.db.$transaction(async (tx) => {
      await this.assigned(tx, id, req);
      const storageKey = randomUUID();
      await this.storage.put(storageKey, file.buffer, mimeType);
      const item = await tx.document.create({
        data: {
          dogId: id,
          name:
            path
              .basename(file.originalname)
              .split('')
              .filter((character) => character.charCodeAt(0) >= 32)
              .join('')
              .slice(0, 200) || 'comprobante',
          storageKey,
          mimeType,
          size: file.size,
          checksum: hash(file.buffer),
          category: 'CLINICAL',
          uploadedBy: req.user.id,
        },
        select: fileSelect,
      });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Document', item.id, 'UPLOAD', 'Comprobante médico añadido.', id),
      });
      return item;
    });
  }
  @Get('documents/:id/download') async download(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    return sendPrivateFile(this.db, this.domain, this.storage, id, req, res, {
      dog: this.scope(req),
      recordAttachment: null,
      category: { in: ['PHOTO', 'CLINICAL'] },
    });
  }
  @Allowed('ADMIN') @Patch('medical/:id') async edit(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    const { revision, correctionReason, ...data } = parse(
      medicalSchema.extend({ revision: z.number().int().positive(), correctionReason: requiredText }),
      body,
    );
    notFuture(data.eventDate);
    return this.db.$transaction(async (tx) => {
      const old = await tx.medicalEntry.findFirst({ where: { id, archivedAt: null } });
      if (!old) throw new NotFoundException('Registro médico no encontrado.');
      await this.assigned(tx, old.dogId, req);
      const changed = await tx.medicalEntry.updateMany({
        where: { id, revision, archivedAt: null },
        data: { ...data, revision: { increment: 1 } },
      });
      if (changed.count !== 1)
        throw new ConflictException('El registro cambió. Actualiza antes de corregir.');
      const item = await tx.medicalEntry.findUniqueOrThrow({ where: { id } });
      await tx.medicalRevision.create({
        data: {
          entryId: id,
          revision: item.revision,
          snapshot: snapshot(item),
          reason: correctionReason,
          recordedBy: req.user.id,
        },
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'MedicalEntry',
          id,
          'UPDATE',
          'Registro médico corregido por administración.',
          item.dogId,
        ),
      });
      return item;
    });
  }
  @Allowed('ADMIN') @Delete('medical/:id') async archive(@Param('id') id: string, @Req() req: AuthRequest) {
    parse(idSchema, id);
    return this.db.$transaction(async (tx) => {
      const old = await tx.medicalEntry.findFirst({ where: { id, archivedAt: null } });
      if (!old) throw new NotFoundException('Registro médico no encontrado.');
      await lock(tx, `dog:${old.dogId}`);
      const item = await tx.medicalEntry.update({ where: { id }, data: { archivedAt: new Date() } });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'MedicalEntry',
          id,
          'ARCHIVE',
          'Registro médico retirado por administración.',
          item.dogId,
        ),
      });
      return { success: true };
    });
  }
}
