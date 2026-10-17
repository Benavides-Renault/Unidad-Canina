import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Response } from 'express';
import { z } from 'zod';
import { Allowed, AuthRequest } from './access';
import { Db } from './db';
import { Domain } from './domain';
import { CLINICAL, MANAGE_DOGS, READ_DOGS, checkRoles, fileType, hash, idSchema, parse } from './security';
import { guardedUpload } from './upload-policy';
@Injectable()
export class Storage {
  private client?: S3Client;
  private initialized = false;
  constructor() {
    if (process.env.STORAGE_DRIVER === 's3')
      this.client = new S3Client({
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION || 'us-east-1',
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY || '',
          secretAccessKey: process.env.S3_SECRET_KEY || '',
        },
      });
  }
  private file(key: string) {
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new BadRequestException('Identificador de archivo inválido.');
    return path.join(path.resolve(process.env.STORAGE_PATH || '.private-files'), key);
  }
  private async bucket() {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error('S3_BUCKET es obligatorio.');
    if (!this.initialized) {
      try {
        await this.client!.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status !== 404) throw error;
        await this.client!.send(new CreateBucketCommand({ Bucket: bucket }));
      }
      this.initialized = true;
    }
    return bucket;
  }
  async put(key: string, data: Buffer, mimeType: string) {
    this.file(key);
    await guardedUpload(data, async () => {
      if (this.client) {
        await this.client.send(
          new PutObjectCommand({
            Bucket: await this.bucket(),
            Key: key,
            Body: data,
            ContentType: mimeType,
            IfNoneMatch: '*',
          }),
        );
      } else {
        const filename = this.file(key);
        await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
        await writeFile(filename, data, { flag: 'wx', mode: 0o600 });
      }
    });
  }
  async get(key: string) {
    if (this.client) {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: await this.bucket(), Key: key }),
      );
      return Buffer.from(await response.Body!.transformToByteArray());
    }
    return readFile(this.file(key));
  }
}
@ApiTags('Archivos privados')
@Allowed(...READ_DOGS)
@Controller()
export class DocumentsController {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(Domain) private readonly domain: Domain,
    @Inject(Storage) private readonly storage: Storage,
  ) {}
  @Allowed('ADMIN')
  @Post('dogs/:id/documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1 } }))
  async upload(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    await this.domain.dog(id);
    const { category } = parse(
      z.object({ category: z.enum(['PHOTO', 'DOCUMENT', 'CLINICAL']) }).strict(),
      body,
    );
    checkRoles(req.user.role, category === 'CLINICAL' ? CLINICAL : MANAGE_DOGS);
    if (!file || !file.buffer?.length) throw new BadRequestException('Selecciona un archivo.');
    const mimeType = fileType(file.buffer);
    if (!mimeType || mimeType !== file.mimetype || (category === 'PHOTO' && mimeType === 'application/pdf'))
      throw new BadRequestException(
        'Archivo inválido. Sólo PDF, JPEG y PNG; las fotos deben ser JPEG o PNG.',
      );
    const name =
      [...path.basename(file.originalname)]
        .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
        .join('')
        .slice(0, 200) || 'archivo';
    const storageKey = randomUUID();
    await this.storage.put(storageKey, file.buffer, mimeType);
    return this.db.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          dogId: id,
          name,
          storageKey,
          mimeType,
          size: file.size,
          checksum: hash(file.buffer),
          category,
          uploadedBy: req.user.id,
        },
      });
      if (category === 'PHOTO') await tx.dog.update({ where: { id }, data: { photoId: document.id } });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Document',
          document.id,
          'UPLOAD',
          `Documento ${category} cargado; ${file.size} bytes.`,
          id,
        ),
      });
      return { id: document.id, name, mimeType, size: file.size, category, createdAt: document.createdAt };
    });
  }
  @Get('documents/:id/download') async download(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    parse(idSchema, id);
    const document = await this.db.document.findFirst({
      where: { id, archivedAt: null, dog: { archivedAt: null } },
    });
    if (!document) throw new NotFoundException('Archivo no encontrado.');
    if (document.category === 'CLINICAL') checkRoles(req.user.role, CLINICAL);
    const data = await this.storage.get(document.storageKey);
    if (hash(data) !== document.checksum)
      throw new BadRequestException(
        'La integridad del archivo no pudo verificarse. Contacta al administrador.',
      );
    await this.db.auditLog.create({
      data: this.domain.audit(
        req,
        'Document',
        id,
        'DOWNLOAD',
        `Descarga de documento ${document.category}.`,
        document.dogId,
      ),
    });
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(document.mimeType);
    if (document.category === 'PHOTO')
      res.setHeader(
        'Content-Disposition',
        `inline; filename="photo-${id}.${document.mimeType === 'image/png' ? 'png' : 'jpg'}"`,
      );
    else res.attachment(document.name);
    res.send(data);
  }
  @Allowed('ADMIN') @Delete('documents/:id') async archive(@Param('id') id: string, @Req() req: AuthRequest) {
    parse(idSchema, id);
    const document = await this.db.document.findFirst({
      where: { id, archivedAt: null, dog: { archivedAt: null } },
    });
    if (!document) throw new NotFoundException('Archivo no encontrado.');
    checkRoles(req.user.role, document.category === 'CLINICAL' ? CLINICAL : MANAGE_DOGS);
    await this.db.$transaction(async (tx) => {
      await tx.document.update({ where: { id }, data: { archivedAt: new Date() } });
      await tx.dog.updateMany({ where: { id: document.dogId, photoId: id }, data: { photoId: null } });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Document',
          id,
          'ARCHIVE',
          'Documento archivado; archivo conservado para retención.',
          document.dogId,
        ),
      });
    });
    return { success: true };
  }
}
