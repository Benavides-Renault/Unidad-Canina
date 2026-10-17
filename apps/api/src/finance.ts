import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Account, Payment, Prisma } from '@prisma/client';
import { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Allowed, AuthRequest } from './access';
import { Db } from './db';
import { Domain, Tx } from './domain';
import { Storage } from './documents';
import {
  ADMINS,
  civilDate,
  csvCell,
  fileType,
  hash,
  idSchema,
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
  notFuture,
  positiveMoney,
  reportPdf,
} from './business-common';

export const accountSchema = z
  .object({
    direction: z.enum(['PAYABLE', 'RECEIVABLE']),
    party: requiredText,
    supplierId: idSchema.optional(),
    concept: requiredText,
    category: requiredText,
    costCenter: optionalText,
    amount: positiveMoney,
    currency: currencySchema,
    dueDate: civilDate,
    issueDate: civilDate,
    exchangeRate: z
      .string()
      .regex(/^\d{1,10}(\.\d{1,6})?$/)
      .transform((v) => new Prisma.Decimal(v))
      .refine((v) => v.gt(0))
      .optional(),
    exchangeDate: civilDate.optional(),
    dogId: idSchema.optional(),
    litterId: idSchema.optional(),
    contractId: idSchema.optional(),
    notes: optionalText,
  })
  .strict();
export const paymentSchema = z
  .object({
    kind: z.enum(['PAYMENT', 'REFUND']).default('PAYMENT'),
    amount: positiveMoney,
    paidDate: civilDate,
    method: requiredText,
    reference: optionalText,
    notes: optionalText,
    requestId: idSchema,
  })
  .strict();
export const reservationSchema = z
  .object({
    litterId: idSchema,
    dogId: idSchema.optional(),
    customer: requiredText,
    customerPartyId: idSchema.optional(),
    contact: optionalText,
    reservedDate: civilDate,
    expiresDate: civilDate,
    conditions: optionalText,
    amount: positiveMoney,
    currency: currencySchema,
  })
  .strict();
const included = {
  payments: { orderBy: { createdAt: 'asc' as const } },
  files: { select: { id: true, name: true, mimeType: true, size: true, createdAt: true } },
} as const;
export function accountBalance(account: Account & { payments: Payment[] }) {
  const paid = account.payments.reduce(
    (sum, p) => sum.plus(p.kind === 'PAYMENT' ? p.amount : p.amount.negated()),
    new Prisma.Decimal(0),
  );
  const balance = account.amount.minus(paid);
  const status = account.cancelledAt
    ? 'CANCELLED'
    : balance.eq(0)
      ? 'PAID'
      : account.dueDate < civilToday()
        ? 'OVERDUE'
        : paid.gt(0)
          ? 'PARTIAL'
          : 'PENDING';
  return { ...account, paid, balance, status };
}
export async function scheduleBusiness(
  tx: Tx,
  sourceType: 'ACCOUNT' | 'RESERVATION',
  id: string,
  date: Date,
  active: boolean,
  title: string,
) {
  await tx.reminder.updateMany({
    where: { sourceType, sourceId: id, status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } },
    data: { status: 'CANCELLED' },
  });
  if (!active) return;
  const users = await tx.user.findMany({
    where: { active: true, role: { in: BUSINESS } },
    select: { id: true },
  });
  for (const user of users) {
    const scheduled = new Date(date.valueOf() + 15 * 3600000 - 86400000),
      dueAt = scheduled < new Date() ? new Date() : scheduled;
    const dedupeKey = `${sourceType}:${id}:${date.toISOString().slice(0, 10)}:${user.id}`;
    const data = {
      dueAt,
      title,
      body: `Vencimiento: ${date.toISOString().slice(0, 10)}. Consulta el registro en VALKYR.`,
    };
    await tx.reminder.upsert({
      where: { dedupeKey },
      create: { ...data, dedupeKey, sourceType, sourceId: id, userId: user.id },
      update: {},
    });
    await tx.reminder.updateMany({
      where: { dedupeKey, status: 'CANCELLED', sentAt: null },
      data: { ...data, status: 'PENDING', attempts: 0 },
    });
  }
}
function accountWhere(query: Record<string, string>): Prisma.AccountWhereInput {
  const where: Prisma.AccountWhereInput = {};
  if (query.direction) where.direction = parse(z.enum(['PAYABLE', 'RECEIVABLE']), query.direction);
  if (query.currency) where.currency = parse(currencySchema, query.currency);
  if (query.search)
    where.OR = [
      { party: { contains: query.search.slice(0, 200), mode: 'insensitive' } },
      { concept: { contains: query.search.slice(0, 200), mode: 'insensitive' } },
    ];
  for (const key of ['dogId', 'litterId', 'contractId'] as const)
    if (query[key]) where[key] = parse(idSchema, query[key]);
  if (query.from || query.to)
    where.issueDate = {
      ...(query.from ? { gte: parse(civilDate, query.from) } : {}),
      ...(query.to ? { lte: parse(civilDate, query.to) } : {}),
    };
  return where;
}
async function validLinks(tx: Tx, data: z.infer<typeof accountSchema>) {
  if (data.dogId && !(await tx.dog.findUnique({ where: { id: data.dogId } })))
    throw new BadRequestException('Perro no encontrado.');
  if (data.litterId && !(await tx.litter.findUnique({ where: { id: data.litterId } })))
    throw new BadRequestException('Camada no encontrada.');
  if (data.contractId && !(await tx.contract.findUnique({ where: { id: data.contractId } })))
    throw new BadRequestException('Contrato no encontrado.');
  if (data.dogId && data.litterId) {
    const dog = await tx.dog.findUnique({ where: { id: data.dogId } });
    if (dog?.litterId !== data.litterId) throw new BadRequestException('El perro no pertenece a esa camada.');
  }
}

@ApiTags('Finanzas internas')
@Allowed(...BUSINESS)
@Controller('finance')
export class FinanceController {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(Domain) private readonly domain: Domain,
    @Inject(Storage) private readonly storage: Storage,
  ) {}
  @Get('references') async references() {
    const [dogs, litters, contracts] = await Promise.all([
      this.db.dog.findMany({
        where: { archivedAt: null },
        select: { id: true, name: true, code: true, litterId: true },
        orderBy: { name: 'asc' },
      }),
      this.db.litter.findMany({ select: { id: true, code: true }, orderBy: { birthDate: 'desc' } }),
      this.db.contract.findMany({ select: { id: true, number: true }, orderBy: { number: 'asc' } }),
    ]);
    return { dogs, litters, contracts };
  }
  @Get('accounts') async list(@Query() query: Record<string, string>, @Req() req: AuthRequest) {
    const { page, pageSize, skip } = pagination(query),
      where = accountWhere(query);
    const [items, total] = await Promise.all([
      this.db.account.findMany({
        where,
        include: included,
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
        skip,
        take: pageSize,
      }),
      this.db.account.count({ where }),
    ]);
    await this.db.auditLog.create({
      data: this.domain.audit(req, 'Account', 'list', 'READ', 'Consulta de cuentas internas.'),
    });
    return { items: items.map(accountBalance), total, page, pageSize };
  }
  @Get('summary') async summary(@Query() query: Record<string, string>, @Req() req: AuthRequest) {
    const where = accountWhere(query);
    const accounts = await this.db.account.findMany({
      where: { ...where, cancelledAt: null },
      include: { payments: true },
    });
    const totals = ['CRC', 'USD'].flatMap((currency) =>
      ['PAYABLE', 'RECEIVABLE'].map((direction) => {
        const rows = accounts
          .filter((a) => a.currency === currency && a.direction === direction)
          .map(accountBalance);
        const sum = (key: 'amount' | 'paid' | 'balance') =>
          rows.reduce((s, a) => s.plus(a[key]), new Prisma.Decimal(0));
        return {
          currency,
          direction,
          count: rows.length,
          amount: sum('amount'),
          paid: sum('paid'),
          balance: sum('balance'),
          overdue: rows
            .filter((a) => a.status === 'OVERDUE')
            .reduce((s, a) => s.plus(a.balance), new Prisma.Decimal(0)),
        };
      }),
    );
    await this.db.auditLog.create({
      data: this.domain.audit(req, 'Account', 'summary', 'READ', 'Resumen por moneda y fecha de emisión.'),
    });
    return { totals };
  }
  @Get('export.csv') async exportCsv(
    @Query() query: Record<string, string>,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    const items = await this.db.account.findMany({
      where: accountWhere(query),
      include: { payments: true },
      take: 5001,
      orderBy: { issueDate: 'desc' },
    });
    if (items.length > 5000)
      throw new BadRequestException('Reduce el periodo para exportar hasta 5000 cuentas.');
    await this.db.auditLog.create({
      data: this.domain.audit(req, 'Account', 'export', 'EXPORT', 'Exportación CSV de cuentas internas.'),
    });
    const rows = [
      [
        'Dirección',
        'Persona / proveedor',
        'Concepto',
        'Moneda',
        'Importe',
        'Abonado',
        'Saldo',
        'Vencimiento',
        'Estado',
      ],
      ...items
        .map(accountBalance)
        .map((a) => [
          a.direction,
          a.party,
          a.concept,
          a.currency,
          a.amount.toFixed(2),
          a.paid.toFixed(2),
          a.balance.toFixed(2),
          a.dueDate.toISOString().slice(0, 10),
          a.status,
        ]),
    ];
    res.setHeader('Cache-Control', 'private, no-store');
    res.type('text/csv; charset=utf-8');
    res.attachment('valkyr-cuentas.csv');
    res.send('\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'));
  }
  @Get('accounts/:id') async account(@Param('id') id: string, @Req() req: AuthRequest) {
    parse(idSchema, id);
    const item = await this.db.account.findUnique({ where: { id }, include: included });
    if (!item) throw new NotFoundException('Cuenta no encontrada.');
    await this.db.auditLog.create({
      data: this.domain.audit(req, 'Account', id, 'READ', 'Consulta de detalle financiero.'),
    });
    return accountBalance(item);
  }
  @Post('accounts') async create(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(accountSchema, body);
    notFuture(data.issueDate);
    dateOrder(data.issueDate, data.dueDate);
    if (Boolean(data.exchangeRate) !== Boolean(data.exchangeDate))
      throw new BadRequestException('El tipo de cambio requiere valor y fecha.');
    if (data.exchangeDate) notFuture(data.exchangeDate);
    return this.db.$transaction(async (tx) => {
      await validLinks(tx, data);
      if (data.supplierId) {
        const supplier = await tx.supplier.findFirst({ where: { id: data.supplierId, active: true } });
        if (!supplier || data.direction !== 'PAYABLE')
          throw new BadRequestException('Elige un proveedor activo para una cuenta por pagar.');
        data.party = supplier.name;
      }
      const item = await tx.account.create({ data });
      await scheduleBusiness(tx, 'ACCOUNT', item.id, item.dueDate, true, `Vence cuenta: ${item.concept}`);
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Account', item.id, 'CREATE', 'Cuenta interna registrada.'),
      });
      return item;
    });
  }
  @Post('accounts/:id/payments') async payment(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    const data = parse(paymentSchema, body);
    notFuture(data.paidDate);
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'commerce');
      const prior = await tx.payment.findUnique({ where: { requestId: data.requestId } });
      if (prior) {
        if (
          prior.accountId !== id ||
          prior.kind !== data.kind ||
          !prior.amount.eq(data.amount) ||
          prior.paidDate.valueOf() !== data.paidDate.valueOf() ||
          prior.method !== data.method ||
          (prior.reference || null) !== (data.reference || null) ||
          (prior.notes || null) !== (data.notes || null)
        )
          throw new ConflictException('La clave de esta operación ya se usó con otros datos.');
        return prior;
      }
      if (await tx.financialClose.count({ where: { month: data.paidDate.toISOString().slice(0, 7) } }))
        throw new ConflictException('El periodo está cerrado. Registra la corrección en un periodo abierto.');
      const a = await tx.account.findUnique({
        where: { id },
        include: { payments: true, reservation: true },
      });
      if (!a) throw new NotFoundException('Cuenta no encontrada.');
      if (a.cancelledAt) throw new ConflictException('La cuenta está anulada.');
      if (a.reservation && a.reservation.status !== 'ACTIVE')
        throw new ConflictException('La reserva está cerrada.');
      dateOrder(a.issueDate, data.paidDate);
      const totals = accountBalance(a);
      if (data.kind === 'PAYMENT' && data.amount.gt(totals.balance))
        throw new ConflictException('El abono supera el saldo pendiente.');
      if (data.kind === 'REFUND' && data.amount.gt(totals.paid))
        throw new ConflictException('La devolución supera lo abonado.');
      const item = await tx.payment.create({ data: { ...data, accountId: id, recordedBy: req.user.id } });
      const remaining = totals.balance.plus(data.kind === 'PAYMENT' ? data.amount.negated() : data.amount);
      await scheduleBusiness(tx, 'ACCOUNT', id, a.dueDate, remaining.gt(0), `Vence cuenta: ${a.concept}`);
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Payment',
          item.id,
          data.kind,
          'Movimiento financiero registrado con saldo validado.',
        ),
      });
      return item;
    });
  }
  @Post('accounts/:id/cancel') async cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    const { reason } = parse(z.object({ reason: requiredText }).strict(), body);
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'commerce');
      const a = await tx.account.findUnique({ where: { id }, include: { payments: true } });
      if (!a) throw new NotFoundException('Cuenta no encontrada.');
      if (a.reservationId) throw new ConflictException('Cancela esta cuenta desde la reserva asociada.');
      if (!accountBalance(a).paid.eq(0))
        throw new ConflictException('Registra primero la devolución de los abonos.');
      if (a.cancelledAt) return a;
      const item = await tx.account.update({
        where: { id },
        data: { cancelledAt: new Date(), cancelReason: reason },
      });
      await scheduleBusiness(tx, 'ACCOUNT', id, a.dueDate, false, '');
      await tx.auditLog.create({ data: this.domain.audit(req, 'Account', id, 'CANCEL', reason) });
      return item;
    });
  }
  @Get('accounts/:id/report.pdf') async report(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    parse(idSchema, id);
    const a = await this.db.account.findUnique({
      where: { id },
      include: { payments: { orderBy: { createdAt: 'asc' } } },
    });
    if (!a) throw new NotFoundException('Cuenta no encontrada.');
    const total = accountBalance(a);
    await this.db.auditLog.create({
      data: this.domain.audit(req, 'Account', id, 'EXPORT', 'Estado de cuenta interno PDF.'),
    });
    reportPdf(
      res,
      'Estado de cuenta interno',
      [
        `Referencia: ${a.id}`,
        `${a.direction === 'PAYABLE' ? 'Por pagar' : 'Por cobrar'}: ${a.party}`,
        a.concept,
        `Importe: ${a.currency} ${a.amount.toFixed(2)}`,
        `Abonos netos: ${a.currency} ${total.paid.toFixed(2)}. Saldo: ${a.currency} ${total.balance.toFixed(2)}`,
        `Vencimiento: ${a.dueDate.toISOString().slice(0, 10)}`,
        ...a.payments.map(
          (p) =>
            `${p.paidDate.toISOString().slice(0, 10)} - ${p.kind === 'REFUND' ? 'Devolución' : 'Abono'} ${a.currency} ${p.amount.toFixed(2)} - ${p.method} - ${p.reference || 'Sin referencia'}`,
        ),
        'Control interno. No es una factura electrónica ni un comprobante fiscal oficial.',
      ],
      `cuenta-${id}.pdf`,
    );
  }
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } }))
  @Post('accounts/:id/files')
  async upload(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Req() req: AuthRequest) {
    parse(idSchema, id);
    if (!(await this.db.account.findUnique({ where: { id } })))
      throw new NotFoundException('Cuenta no encontrada.');
    const mimeType = file?.buffer && fileType(file.buffer);
    if (!mimeType || mimeType !== file.mimetype)
      throw new BadRequestException('Selecciona un PDF, PNG o JPEG válido de hasta 10 MB.');
    const storageKey = randomUUID();
    await this.storage.put(storageKey, file.buffer, mimeType);
    return this.db.$transaction(async (tx) => {
      const item = await tx.accountFile.create({
        data: {
          accountId: id,
          name:
            file.originalname
              .split(/[\\/]/)
              .pop()!
              .split('')
              .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
              .join('')
              .slice(0, 200) || 'comprobante',
          storageKey,
          mimeType,
          size: file.size,
          checksum: hash(file.buffer),
          uploadedBy: req.user.id,
        },
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'AccountFile',
          item.id,
          'UPLOAD',
          'Adjunto financiero privado registrado.',
        ),
      });
      return { id: item.id, name: item.name, size: item.size };
    });
  }
  @Get('accounts/:id/files/:fileId/download') async download(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    parse(idSchema, id);
    parse(idSchema, fileId);
    const file = await this.db.accountFile.findFirst({ where: { id: fileId, accountId: id } });
    if (!file) throw new NotFoundException('Adjunto no encontrado.');
    const bytes = await this.storage.get(file.storageKey);
    if (hash(bytes) !== file.checksum)
      throw new ConflictException('El archivo no supera la comprobación de integridad.');
    await this.db.auditLog.create({
      data: this.domain.audit(req, 'AccountFile', fileId, 'DOWNLOAD', 'Descarga de adjunto financiero.'),
    });
    res.type(file.mimeType);
    res.attachment(file.name);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(bytes);
  }
}

@ApiTags('Apartados')
@Allowed(...BUSINESS)
@Controller('reservations')
export class ReservationsController {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(Domain) private readonly domain: Domain,
  ) {}
  @Get('options') async options() {
    return this.db.litter.findMany({
      select: {
        id: true,
        code: true,
        liveBorn: true,
        puppies: {
          where: { archivedAt: null, administrativeStatus: 'OWNED' },
          select: { id: true, name: true, code: true, availability: true },
        },
      },
      orderBy: { birthDate: 'desc' },
    });
  }
  @Get() async list(@Query() query: Record<string, string>, @Req() req: AuthRequest) {
    const { page, pageSize, skip } = pagination(query);
    const where: Prisma.ReservationWhereInput = query.status
      ? { status: parse(z.enum(['ACTIVE', 'DELIVERED', 'CANCELLED', 'EXPIRED']), query.status) }
      : {};
    const [items, total] = await Promise.all([
      this.db.reservation.findMany({
        where,
        include: {
          litter: { select: { code: true } },
          dog: { select: { id: true, name: true, code: true } },
          account: { include: { payments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.db.reservation.count({ where }),
    ]);
    await this.db.auditLog.create({
      data: this.domain.audit(req, 'Reservation', 'list', 'READ', 'Consulta de apartados privados.'),
    });
    return {
      items: items.map((i) => ({ ...i, account: i.account ? accountBalance(i.account) : null })),
      total,
      page,
      pageSize,
    };
  }
  private async available(tx: Tx, dogId: string, litterId: string) {
    if (await tx.assignment.count({ where: { dogId, releasedOn: null, endDate: { gte: civilToday() } } }))
      throw new ConflictException('Retira las asignaciones vigentes antes de reservar este cachorro.');
    const dog = await tx.dog.findUnique({ where: { id: dogId } });
    if (
      !dog ||
      dog.litterId !== litterId ||
      dog.archivedAt ||
      dog.administrativeStatus !== 'OWNED' ||
      dog.availability !== 'AVAILABLE'
    )
      throw new ConflictException('El cachorro no está disponible en esta camada.');
    if (await tx.reservation.findFirst({ where: { dogId, status: { in: ['ACTIVE', 'DELIVERED'] } } }))
      throw new ConflictException('El cachorro ya tiene un apartado o entrega.');
    return dog;
  }
  @Post() async create(@Body() body: unknown, @Req() req: AuthRequest) {
    const { amount, currency, ...data } = parse(reservationSchema, body);
    notFuture(data.reservedDate);
    dateOrder(data.reservedDate, data.expiresDate);
    if (data.expiresDate < civilToday())
      throw new BadRequestException('La reserva nueva no puede estar vencida.');
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'commerce');
      await lock(tx, `litter:${data.litterId}`);
      if (data.dogId) await lock(tx, `dog:${data.dogId}`);
      const litter = await tx.litter.findUnique({ where: { id: data.litterId } });
      if (!litter) throw new NotFoundException('Camada no encontrada.');
      dateOrder(litter.birthDate, data.reservedDate);
      const used = await tx.reservation.count({
        where: { litterId: litter.id, status: { in: ['ACTIVE', 'DELIVERED'] } },
      });
      const unavailable = await tx.dog.count({
        where: {
          litterId: litter.id,
          OR: [
            { archivedAt: { not: null } },
            { administrativeStatus: { not: 'OWNED' } },
            { availability: { not: 'AVAILABLE' } },
          ],
          reservations: { none: { status: { in: ['ACTIVE', 'DELIVERED'] } } },
        },
      });
      if (used + unavailable >= litter.liveBorn)
        throw new ConflictException('La camada no tiene cupos disponibles.');
      if (data.dogId) await this.available(tx, data.dogId, litter.id);
      if (data.customerPartyId) {
        const party = await tx.party.findUnique({ where: { id: data.customerPartyId } });
        if (!party || party.kind === 'UNIT')
          throw new BadRequestException('Selecciona el propietario cliente.');
      }
      const item = await tx.reservation.create({ data });
      const account = await tx.account.create({
        data: {
          direction: 'RECEIVABLE',
          party: data.customer,
          concept: `Apartado ${litter.code}`,
          category: 'Crianza',
          amount,
          currency,
          dueDate: data.expiresDate,
          issueDate: data.reservedDate,
          reservationId: item.id,
          dogId: data.dogId,
          litterId: litter.id,
        },
      });
      if (data.dogId) await tx.dog.update({ where: { id: data.dogId }, data: { availability: 'RESERVED' } });
      await scheduleBusiness(
        tx,
        'RESERVATION',
        item.id,
        item.expiresDate,
        true,
        `Vence apartado ${litter.code}`,
      );
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Reservation',
          item.id,
          'CREATE',
          'Apartado y cuenta por cobrar registrados.',
          data.dogId,
        ),
      });
      return { ...item, account };
    });
  }
  @Post(':id/allocate') async allocate(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    const { dogId } = parse(z.object({ dogId: idSchema }).strict(), body);
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'commerce');
      const item = await tx.reservation.findUnique({ where: { id } });
      if (!item) throw new NotFoundException('Reserva no encontrada.');
      if (item.status !== 'ACTIVE' || item.dogId)
        throw new ConflictException('Sólo se asigna un cachorro a un apartado activo de camada.');
      await lock(tx, `dog:${dogId}`);
      await this.available(tx, dogId, item.litterId);
      await tx.dog.update({ where: { id: dogId }, data: { availability: 'RESERVED' } });
      await tx.account.update({ where: { reservationId: id }, data: { dogId } });
      const saved = await tx.reservation.update({ where: { id }, data: { dogId } });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Reservation', id, 'ALLOCATE', 'Cachorro vinculado al apartado.', dogId),
      });
      return saved;
    });
  }
  @Allowed(...ADMINS) @Post(':id/close') async close(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    const data = parse(
      z
        .object({
          status: z.enum(['DELIVERED', 'CANCELLED', 'EXPIRED']),
          closedDate: civilDate,
          reason: requiredText,
          customerPartyId: idSchema.optional(),
        })
        .strict(),
      body,
    );
    notFuture(data.closedDate);
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'commerce');
      const item = await tx.reservation.findUnique({
        where: { id },
        include: { account: { include: { payments: true } } },
      });
      if (!item?.account) throw new NotFoundException('Apartado no encontrado.');
      if (item.status !== 'ACTIVE') throw new ConflictException('El apartado ya está cerrado.');
      dateOrder(item.reservedDate, data.closedDate);
      const a = accountBalance(item.account);
      if (data.status === 'DELIVERED' && (!item.dogId || !a.balance.eq(0)))
        throw new ConflictException('Para entregar, asigna un cachorro y completa el saldo.');
      const customerPartyId = data.customerPartyId || item.customerPartyId;
      const customerParty = customerPartyId
        ? await tx.party.findUnique({ where: { id: customerPartyId } })
        : null;
      if (data.status === 'DELIVERED' && (!customerParty || customerParty.kind === 'UNIT'))
        throw new BadRequestException(
          'La entrega requiere identificar al propietario cliente para su portal.',
        );
      if (data.status !== 'DELIVERED' && !a.paid.eq(0))
        throw new ConflictException(
          'Registra la devolución de los abonos antes de cancelar o vencer el apartado.',
        );
      if (data.status === 'EXPIRED' && data.closedDate <= item.expiresDate)
        throw new BadRequestException('Aún no pasó el vencimiento del apartado.');
      if (item.dogId) {
        await lock(tx, `dog:${item.dogId}`);
        await tx.dog.update({
          where: { id: item.dogId },
          data:
            data.status === 'DELIVERED'
              ? {
                  administrativeStatus: 'SOLD',
                  availability: 'UNAVAILABLE',
                  ownerPartyId: customerParty!.id,
                  custodianPartyId: customerParty!.id,
                  owner: customerParty!.name,
                  custodian: customerParty!.name,
                  assignedTrainerId: null,
                  salePublished: false,
                }
              : { availability: 'AVAILABLE' },
        });
      }
      if (data.status !== 'DELIVERED')
        await tx.account.update({
          where: { id: a.id },
          data: { cancelledAt: new Date(), cancelReason: data.reason },
        });
      await scheduleBusiness(tx, 'RESERVATION', id, item.expiresDate, false, '');
      await scheduleBusiness(tx, 'ACCOUNT', a.id, a.dueDate, false, '');
      const result = await tx.reservation.update({
        where: { id },
        data: {
          status: data.status,
          closedDate: data.closedDate,
          closeReason: data.reason,
          customerPartyId: customerPartyId || undefined,
        },
      });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Reservation', id, data.status, data.reason, item.dogId || undefined),
      });
      return result;
    });
  }
}
