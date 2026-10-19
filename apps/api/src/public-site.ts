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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { Allowed, AuthRequest, Public } from './access';
import { rateLimit } from './auth';
import { CatalogReader } from './catalog';
import { Db } from './db';
import { Domain } from './domain';
import { lock } from './business-common';
import {
  emailSchema,
  hash,
  idSchema,
  pagination,
  parse,
  passwordSchema,
  publicUser,
  usernameSchema,
} from './security';

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,24}$/, 'Escribe un teléfono con código de país.')
  .refine(
    (value) => /^\d{7,15}$/.test(value.replace(/\D/g, '')),
    'El teléfono debe contener entre 7 y 15 dígitos.',
  )
  .nullish()
  .transform((v) => v || null);
function social(hosts: string[]) {
  return z
    .string()
    .trim()
    .url()
    .max(300)
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.port &&
        hosts.includes(url.hostname.toLowerCase())
      );
    }, 'Usa el enlace HTTPS del perfil en la red social correspondiente.')
    .nullish()
    .transform((v) => v || null);
}
const settingsSchema = z
  .object({
    contactName: z.string().trim().min(2).max(120),
    phone,
    email: emailSchema.nullish().transform((v) => v || null),
    whatsappNumber: z
      .string()
      .trim()
      .regex(/^\+?[1-9]\d{6,14}$/, 'Usa el número internacional, sin espacios.')
      .nullish()
      .transform((v) => v || null),
    instagramUrl: social(['instagram.com', 'www.instagram.com']),
    facebookUrl: social(['facebook.com', 'www.facebook.com', 'm.facebook.com']),
    tiktokUrl: social(['tiktok.com', 'www.tiktok.com']),
  })
  .strict();
const inquirySchema = z
  .object({
    requestKey: idSchema,
    kind: z.enum(['CONTACT', 'PURCHASE', 'ACCOUNT']),
    name: z.string().trim().min(2).max(120),
    email: emailSchema.nullish().transform((v) => v || null),
    phone,
    preferredContact: z.enum(['EMAIL', 'PHONE', 'WHATSAPP']),
    partyKind: z.enum(['PERSON', 'MUNICIPALITY', 'ORGANIZATION']).default('PERSON'),
    organization: nullableText(150),
    message: z.string().trim().min(10).max(2000),
    interestKind: z.enum(['DOG', 'CROSS']).nullish(),
    interestId: idSchema.nullish(),
    consent: z.literal(true),
    website: z.string().max(200).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.preferredContact === 'EMAIL' ? !data.email : !data.phone)
      ctx.addIssue({ code: 'custom', message: 'Indica el correo o teléfono del medio de contacto elegido.' });
    if (Boolean(data.interestKind) !== Boolean(data.interestId))
      ctx.addIssue({ code: 'custom', message: 'Selecciona una publicación válida.' });
  });
const settingsSelect = {
  contactName: true,
  phone: true,
  email: true,
  whatsappNumber: true,
  instagramUrl: true,
  facebookUrl: true,
  tiktokUrl: true,
} as const;
const defaultSettings = {
  contactName: 'ORYX K9',
  phone: null,
  email: null,
  whatsappNumber: null,
  instagramUrl: null,
  facebookUrl: null,
  tiktokUrl: null,
};

@ApiTags('Catálogo y contacto público')
@Controller('public')
export class PublicSiteController {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(CatalogReader) private readonly catalog: CatalogReader,
  ) {}
  @Public() @Get('settings') async settings() {
    return (
      (await this.db.publicSiteSettings.findUnique({ where: { id: 'main' }, select: settingsSelect })) ||
      defaultSettings
    );
  }
  @Public() @Get('dogs') dogs(@Query() query: Record<string, string>) {
    return this.catalog.dogs(query);
  }
  @Public() @Get('dogs/:id') dog(@Param('id') id: string) {
    return this.catalog.dog(id);
  }
  @Public() @Get('crosses') crosses(@Query() query: Record<string, string>) {
    return this.catalog.crosses(query);
  }
  @Public() @Get('crosses/:id') cross(@Param('id') id: string) {
    return this.catalog.cross(id);
  }
  @Public() @Get('photos/:id') photo(@Param('id') id: string, @Res() res: Response) {
    return this.catalog.photo(id, res);
  }
  @Public() @Post('inquiries') async submit(@Body() body: unknown, @Req() req: Request) {
    const input = parse(inquirySchema, body);
    const receipt = {
      received: true,
      message: 'Recibimos tu solicitud. El equipo de ORYX K9 te contactará por el medio indicado.',
    };
    if (input.website) return receipt;
    const { consent: _consent, website: _website, ...data } = input;
    const payloadHash = hash(JSON.stringify(data));
    const previous = await this.db.customerInquiry.findUnique({ where: { requestKey: data.requestKey } });
    if (previous) {
      if (previous.payloadHash !== payloadHash)
        throw new ConflictException('Actualiza el formulario antes de enviar una nueva solicitud.');
      return receipt;
    }
    await rateLimit(this.db, `public-inquiry:ip:${hash(req.ip || 'unknown')}`, 30, 60);
    await rateLimit(this.db, `public-inquiry:contact:${hash(data.email || data.phone || '')}`, 5, 60);
    const interest = data.interestId
      ? data.interestKind === 'DOG'
        ? (await this.catalog.dog(data.interestId)).name
        : (await this.catalog.cross(data.interestId)).publicTitle
      : null;
    await this.db.$transaction(async (tx) => {
      await lock(tx, `inquiry:${data.requestKey}`);
      const existing = await tx.customerInquiry.findUnique({ where: { requestKey: data.requestKey } });
      if (existing) {
        if (existing.payloadHash !== payloadHash)
          throw new ConflictException('La solicitud ya se envió con otros datos.');
        return;
      }
      const inquiry = await tx.customerInquiry.create({
        data: { ...data, payloadHash, interestLabel: interest },
      });
      const admins = await tx.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } });
      const title =
        data.kind === 'ACCOUNT'
          ? 'Nueva solicitud de cuenta'
          : data.kind === 'PURCHASE'
            ? 'Nueva consulta de compra'
            : 'Nueva solicitud de contacto';
      for (const admin of admins) {
        const notificationBody = `${data.name}${interest ? ` · ${interest}` : ''}. Revisa Solicitudes para atenderla.`;
        const reminder = await tx.reminder.create({
          data: {
            dedupeKey: `inquiry:${inquiry.id}:${admin.id}`,
            sourceType: 'INQUIRY',
            sourceId: inquiry.id,
            userId: admin.id,
            dueAt: new Date(),
            status: 'SENT',
            sentAt: new Date(),
            title,
            body: notificationBody,
          },
        });
        await tx.notification.create({
          data: { userId: admin.id, reminderId: reminder.id, title, body: notificationBody },
        });
      }
      await tx.auditLog.create({
        data: {
          entity: 'CustomerInquiry',
          entityId: inquiry.id,
          action: 'CREATE',
          summary: 'Solicitud recibida desde el formulario público.',
        },
      });
    });
    return receipt;
  }
}

@ApiTags('Solicitudes y contacto comercial')
@Allowed('ADMIN')
@Controller('inquiries')
export class InquiriesController {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(Domain) private readonly domain: Domain,
  ) {}
  @Get('settings') async settings() {
    return (
      (await this.db.publicSiteSettings.findUnique({ where: { id: 'main' }, select: settingsSelect })) ||
      defaultSettings
    );
  }
  @Patch('settings') async configure(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(settingsSchema, body);
    return this.db.$transaction(async (tx) => {
      const result = await tx.publicSiteSettings.upsert({
        where: { id: 'main' },
        create: { id: 'main', ...data },
        update: data,
        select: settingsSelect,
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'PublicSiteSettings',
          'main',
          'UPDATE',
          'Contacto y redes del catálogo público actualizados.',
        ),
      });
      return result;
    });
  }
  @Get('summary') async summary() {
    return {
      pending: await this.db.customerInquiry.count({ where: { status: { in: ['NEW', 'IN_PROGRESS'] } } }),
    };
  }
  @Get() async list(@Query() query: Record<string, string>) {
    const { page, pageSize, skip } = pagination(query);
    const where: Prisma.CustomerInquiryWhereInput = {};
    if (query.status)
      where.status = parse(z.enum(['NEW', 'IN_PROGRESS', 'CLOSED', 'APPROVED', 'REJECTED']), query.status);
    if (query.kind) where.kind = parse(z.enum(['CONTACT', 'PURCHASE', 'ACCOUNT']), query.kind);
    const [items, total] = await Promise.all([
      this.db.customerInquiry.findMany({
        where,
        omit: { payloadHash: true, requestKey: true },
        include: { approvedUser: { select: { username: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: pageSize,
        skip,
      }),
      this.db.customerInquiry.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
  @Patch(':id') async update(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    parse(idSchema, id);
    const data = parse(
      z
        .object({
          status: z.enum(['NEW', 'IN_PROGRESS', 'CLOSED', 'REJECTED']),
          adminNotes: nullableText(3000),
        })
        .strict(),
      body,
    );
    return this.db.$transaction(async (tx) => {
      await lock(tx, `inquiry-review:${id}`);
      const inquiry = await tx.customerInquiry.findUnique({ where: { id } });
      if (!inquiry) throw new NotFoundException('Solicitud no encontrada.');
      if (inquiry.status === 'APPROVED')
        throw new ConflictException('La cuenta ya fue aprobada. Adminístrala desde Usuarios.');
      await tx.customerInquiry.update({ where: { id }, data });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'CustomerInquiry',
          id,
          'UPDATE',
          `Solicitud marcada como ${data.status}.`,
        ),
      });
      return { success: true };
    });
  }
  @Post(':id/approve') async approve(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    const data = parse(
      z.object({ username: usernameSchema, password: passwordSchema, partyId: idSchema.nullish() }).strict(),
      body,
    );
    const passwordHash = await argon2.hash(data.password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    return this.db.$transaction(async (tx) => {
      await lock(tx, `inquiry-review:${id}`);
      const inquiry = await tx.customerInquiry.findUnique({ where: { id } });
      if (!inquiry) throw new NotFoundException('Solicitud no encontrada.');
      if (inquiry.kind !== 'ACCOUNT' || !['NEW', 'IN_PROGRESS'].includes(inquiry.status))
        throw new ConflictException('Esta solicitud no está pendiente de aprobación de cuenta.');
      let partyId = data.partyId;
      if (partyId) {
        const party = await tx.party.findUnique({ where: { id: partyId } });
        if (!party || party.kind === 'UNIT')
          throw new BadRequestException('Selecciona un propietario cliente válido.');
      } else {
        const party = await tx.party.create({
          data: {
            name: inquiry.organization || inquiry.name,
            kind: parse(z.enum(['PERSON', 'MUNICIPALITY', 'ORGANIZATION']), inquiry.partyKind),
            phone: inquiry.phone,
            email: inquiry.email,
          },
        });
        partyId = party.id;
      }
      const user = await tx.user.create({
        data: {
          name: inquiry.name,
          username: data.username,
          passwordHash,
          email: inquiry.email,
          role: 'CLIENT',
          partyId,
        },
      });
      await tx.customerInquiry.update({
        where: { id },
        data: { status: 'APPROVED', approvedUserId: user.id },
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'CustomerInquiry',
          id,
          'APPROVE',
          'Solicitud aprobada y cuenta de cliente creada.',
        ),
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'User',
          user.id,
          'CREATE',
          'Cuenta de cliente creada desde una solicitud revisada.',
        ),
      });
      return publicUser(user);
    });
  }
}
