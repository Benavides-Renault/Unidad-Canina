import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Req,
  Res,
  Inject,
  NotFoundException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { DocumentCategory, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { Allowed, AuthRequest } from './access';
import { Db } from './db';
import { Domain, Tx } from './domain';
import { Storage } from './documents';
import { dogScope } from './follow-up';
import { fileType, hash, idSchema, parse } from './security';
import { lock } from './business-common';

const types = z.enum(['VACCINATION', 'MEDICAL', 'TRAINING', 'EVALUATION', 'CERTIFICATION', 'BREEDING']);
type RecordType = z.infer<typeof types>;
const fields = {
  VACCINATION: 'vaccinationId',
  MEDICAL: 'medicalEntryId',
  TRAINING: 'trainingSessionId',
  EVALUATION: 'evaluationId',
  CERTIFICATION: 'certificationId',
  BREEDING: 'breedingDogId',
} as const;
const select = { id: true, name: true, mimeType: true, size: true, category: true, createdAt: true };
const activeAttachment: Prisma.RecordAttachmentWhereInput = {
  AND: [
    { OR: [{ medicalEntryId: null }, { medicalEntry: { archivedAt: null } }] },
    { OR: [{ certificationId: null }, { certification: { archivedAt: null } }] },
    { OR: [{ evaluationId: null }, { evaluation: { goal: { plan: { archivedAt: null } } } }] },
  ],
};

@Allowed('ADMIN', 'TRAINER', 'CLIENT')
@Controller('records')
export class RecordsController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Domain) private domain: Domain,
    @Inject(Storage) private storage: Storage,
  ) {}
  private async dog(tx: Tx, id: string, req: AuthRequest) {
    parse(idSchema, id);
    await lock(tx, `dog:${id}`);
    const dog = await tx.dog.findFirst({ where: { id, ...dogScope(req) } });
    if (!dog) throw new NotFoundException('Perro fuera de tu acceso.');
    return dog;
  }
  private async target(tx: Tx, type: RecordType, id: string, req: AuthRequest) {
    parse(idSchema, id);
    let dogId: string | undefined;
    if (type === 'BREEDING') {
      if (req.user.role !== 'ADMIN') throw new NotFoundException('Registro no disponible.');
      dogId = id;
    }
    if (type === 'VACCINATION') dogId = (await tx.vaccination.findUnique({ where: { id } }))?.dogId;
    if (type === 'MEDICAL')
      dogId = (await tx.medicalEntry.findFirst({ where: { id, archivedAt: null } }))?.dogId;
    if (type === 'TRAINING') dogId = (await tx.trainingSession.findUnique({ where: { id } }))?.dogId;
    if (type === 'CERTIFICATION')
      dogId = (await tx.certification.findFirst({ where: { id, archivedAt: null } }))?.dogId;
    if (type === 'EVALUATION')
      dogId = (
        await tx.goalEvaluation.findFirst({
          where: { id, goal: { plan: { archivedAt: null } } },
          include: { goal: { include: { plan: true } } },
        })
      )?.goal.plan.dogId;
    if (!dogId) throw new NotFoundException('Registro no encontrado.');
    await this.dog(tx, dogId, req);
    // Recheck mutable parent status after acquiring the same lock used by archival.
    if (type === 'MEDICAL' && !(await tx.medicalEntry.findFirst({ where: { id, archivedAt: null } })))
      throw new NotFoundException('Registro archivado.');
    if (type === 'CERTIFICATION' && !(await tx.certification.findFirst({ where: { id, archivedAt: null } })))
      throw new NotFoundException('Registro archivado.');
    if (
      type === 'EVALUATION' &&
      !(await tx.goalEvaluation.findFirst({ where: { id, goal: { plan: { archivedAt: null } } } }))
    )
      throw new NotFoundException('Plan archivado.');
    return dogId;
  }
  @Get('dogs/:id') async list(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.db.$transaction(async (tx) => {
      await this.dog(tx, id, req);
      const attachments = await tx.recordAttachment.findMany({
        where: {
          ...activeAttachment,
          document: { dogId: id, archivedAt: null },
          ...(req.user.role === 'TRAINER' ? { breedingDogId: null } : {}),
        },
        include: { document: { select } },
        orderBy: { createdAt: 'desc' },
      });
      const [medical, vaccines, training, evaluations, certificates] = await Promise.all([
        tx.medicalEntry.findMany({
          where: { dogId: id, archivedAt: null },
          orderBy: { eventDate: 'desc' },
          select: {
            id: true,
            title: true,
            revision: true,
            diagnosis: true,
            allergen: true,
            medication: true,
            clinicalStatus: true,
          },
        }),
        tx.vaccination.findMany({
          where: { dogId: id },
          select: { id: true, product: true, appliedDate: true },
        }),
        tx.trainingSession.findMany({
          where: { dogId: id },
          select: { id: true, objective: true, occurredAt: true },
        }),
        tx.goalEvaluation.findMany({
          where: { goal: { plan: { dogId: id, archivedAt: null } } },
          include: { goal: { select: { title: true } } },
        }),
        tx.certification.findMany({
          where: { dogId: id, archivedAt: null },
          select: { id: true, title: true },
        }),
      ]);
      return {
        attachments,
        medical,
        targets: [
          ...medical.map((x) => ({ id: x.id, type: 'MEDICAL', label: x.title })),
          ...vaccines.map((x) => ({
            id: x.id,
            type: 'VACCINATION',
            label: `${x.product} · ${x.appliedDate.toISOString().slice(0, 10)}`,
          })),
          ...training.map((x) => ({
            id: x.id,
            type: 'TRAINING',
            label: `${x.objective} · ${x.occurredAt.toISOString().slice(0, 10)}`,
          })),
          ...evaluations.map((x) => ({
            id: x.id,
            type: 'EVALUATION',
            label: `${x.goal.title} · ${x.score} · ${x.eventDate.toISOString().slice(0, 10)}`,
          })),
          ...certificates.map((x) => ({ id: x.id, type: 'CERTIFICATION', label: x.title })),
          ...(req.user.role === 'ADMIN'
            ? [{ id, type: 'BREEDING', label: 'Documentación de crianza y pedigrí' }]
            : []),
        ],
      };
    });
  }
  @Get('medical/:id/versions') async versions(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.db.$transaction(async (tx) => {
      await this.target(tx, 'MEDICAL', id, req);
      return tx.medicalRevision.findMany({ where: { entryId: id }, orderBy: { revision: 'desc' } });
    });
  }
  @Allowed('ADMIN', 'TRAINER')
  @Post(':type/:id/files')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 0 } }))
  async upload(
    @Param('type') raw: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthRequest,
  ) {
    const type = parse(types, raw);
    if (!file?.buffer?.length) throw new BadRequestException('Selecciona un archivo.');
    const video =
      file.buffer.subarray(4, 8).toString() === 'ftyp' &&
      ['isom', 'iso2', 'mp41', 'mp42', 'avc1'].includes(file.buffer.subarray(8, 12).toString());
    const mimeType =
      fileType(file.buffer) || (video && ['TRAINING', 'EVALUATION'].includes(type) ? 'video/mp4' : null);
    if (!mimeType || mimeType !== file.mimetype)
      throw new BadRequestException(
        'Usa PDF, PNG o JPEG. Las sesiones y evaluaciones también admiten MP4, hasta 25 MB.',
      );
    return this.db.$transaction(async (tx) => {
      const dogId = await this.target(tx, type, id, req);
      const category: DocumentCategory = ['MEDICAL', 'VACCINATION'].includes(type)
        ? 'CLINICAL'
        : type === 'BREEDING'
          ? 'BREEDING'
          : 'TRAINING';
      const storageKey = randomUUID();
      await this.storage.put(storageKey, file.buffer, mimeType);
      const document = await tx.document.create({
        data: {
          dogId,
          category,
          storageKey,
          name:
            [...path.basename(file.originalname)]
              .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
              .join('')
              .slice(0, 200) || 'adjunto',
          mimeType,
          size: file.size,
          checksum: hash(file.buffer),
          uploadedBy: req.user.id,
        },
      });
      const item = await tx.recordAttachment.create({
        data: { documentId: document.id, [fields[type]]: id },
        include: { document: { select } },
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Document',
          document.id,
          'UPLOAD',
          `Adjunto vinculado a ${type}.`,
          dogId,
        ),
      });
      return item;
    });
  }
  private visible(req: AuthRequest): Prisma.DocumentWhereInput {
    return {
      archivedAt: null,
      dog: dogScope(req),
      recordAttachment: { is: activeAttachment },
      ...(req.user.role === 'TRAINER' ? { category: { not: 'BREEDING' as const } } : {}),
    };
  }
  @Get('files/:id/download') async download(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    parse(idSchema, id);
    const file = await this.db.document.findFirst({ where: { id, ...this.visible(req) } });
    if (!file) throw new NotFoundException('Archivo fuera de tu acceso.');
    const bytes = await this.storage.get(file.storageKey);
    if (hash(bytes) !== file.checksum) throw new BadRequestException('Integridad del archivo no verificada.');
    await this.db.auditLog.create({
      data: this.domain.audit(
        req,
        'Document',
        id,
        'DOWNLOAD',
        'Descarga de adjunto de registro.',
        file.dogId,
      ),
    });
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(file.mimeType);
    res.attachment(file.name);
    res.send(bytes);
  }
  @Allowed('ADMIN') @Delete('files/:id') async archive(@Param('id') id: string, @Req() req: AuthRequest) {
    parse(idSchema, id);
    return this.db.$transaction(async (tx) => {
      const file = await tx.document.findFirst({ where: { id, ...this.visible(req) } });
      if (!file) throw new NotFoundException('Archivo no encontrado.');
      await this.dog(tx, file.dogId, req);
      await tx.document.update({ where: { id }, data: { archivedAt: new Date() } });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Document',
          id,
          'ARCHIVE',
          'Adjunto archivado; contenido retenido.',
          file.dogId,
        ),
      });
      return { success: true };
    });
  }
}
