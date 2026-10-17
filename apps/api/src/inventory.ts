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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Allowed, AuthRequest } from './access';
import { Db } from './db';
import { Domain } from './domain';
import { civilDate, idSchema, optionalText, pagination, parse, requiredText } from './security';
import {
  BUSINESS,
  civilToday,
  currencySchema,
  lock,
  moneySchema,
  notFuture,
  quantitySchema,
} from './business-common';
export const productSchema = z
  .object({
    sku: requiredText,
    name: requiredText,
    category: requiredText,
    unit: requiredText,
    minimum: quantitySchema,
  })
  .strict();
export const lotSchema = z
  .object({
    batch: requiredText,
    expiresDate: civilDate.optional(),
    unitCost: moneySchema,
    currency: currencySchema,
  })
  .strict();
export const stockSchema = z
  .object({
    kind: z.enum(['IN', 'OUT', 'DISPOSAL']),
    quantity: quantitySchema.refine((v) => v.gt(0), 'La cantidad debe ser mayor que cero.'),
    movementDate: civilDate,
    reason: requiredText,
    area: optionalText,
    dogId: idSchema.optional(),
    requestId: idSchema,
  })
  .strict();
@ApiTags('Inventario')
@Allowed(...BUSINESS)
@Controller('inventory')
export class InventoryController {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(Domain) private readonly domain: Domain,
  ) {}
  @Get('products') async list(@Query() query: Record<string, string>) {
    const { page, pageSize, skip } = pagination(query);
    const where: Prisma.ProductWhereInput = {
      active: true,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search.slice(0, 200), mode: 'insensitive' } },
              { sku: { contains: query.search.slice(0, 200), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.product.findMany({
        where,
        include: { lots: true },
        orderBy: { name: 'asc' },
        skip,
        take: pageSize,
      }),
      this.db.product.count({ where }),
    ]);
    return {
      items: items.map((p) => {
        const stock = p.lots.reduce((s, l) => s.plus(l.quantity), new Prisma.Decimal(0));
        const usable = p.lots
          .filter((l) => !l.expiresDate || l.expiresDate >= civilToday())
          .reduce((s, l) => s.plus(l.quantity), new Prisma.Decimal(0));
        return {
          ...p,
          stock,
          usable,
          lowStock: usable.lt(p.minimum),
          expiredLots: p.lots.filter((l) => l.expiresDate && l.expiresDate < civilToday() && l.quantity.gt(0))
            .length,
        };
      }),
      total,
      page,
      pageSize,
    };
  }
  @Post('products') async create(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(productSchema, body);
    return this.db.$transaction(async (tx) => {
      const item = await tx.product.create({ data });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Product', item.id, 'CREATE', 'Producto, unidad y mínimo registrados.'),
      });
      return item;
    });
  }
  @Get('products/:id') async detail(@Param('id') id: string) {
    parse(idSchema, id);
    const item = await this.db.product.findUnique({
      where: { id },
      include: { lots: { orderBy: { createdAt: 'asc' } } },
    });
    if (!item) throw new NotFoundException('Producto no encontrado.');
    return item;
  }
  @Post('products/:id/lots') async lot(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    const data = parse(lotSchema, body);
    return this.db.$transaction(async (tx) => {
      if (!(await tx.product.findUnique({ where: { id, active: true } })))
        throw new NotFoundException('Producto no encontrado.');
      const item = await tx.stockLot.create({ data: { ...data, productId: id } });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'StockLot',
          item.id,
          'CREATE',
          'Lote registrado sin existencias; las entradas se registran como movimientos.',
        ),
      });
      return item;
    });
  }
  @Get('movements') async movements(@Query() query: Record<string, string>) {
    const { page, pageSize, skip } = pagination(query);
    const where: Prisma.StockMovementWhereInput = {
      ...(query.lotId ? { lotId: parse(idSchema, query.lotId) } : {}),
      ...(query.productId ? { lot: { productId: parse(idSchema, query.productId) } } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.stockMovement.findMany({
        where,
        include: {
          lot: { select: { batch: true, product: { select: { name: true, unit: true } } } },
          dog: { select: { name: true, code: true } },
          recorder: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.db.stockMovement.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
  @Post('lots/:id/movements') async move(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    const data = parse(stockSchema, body);
    notFuture(data.movementDate);
    return this.db.$transaction(async (tx) => {
      await lock(tx, `stock-request:${data.requestId}`);
      await lock(tx, `lot:${id}`);
      const previous = await tx.stockMovement.findUnique({ where: { requestId: data.requestId } });
      if (previous) {
        if (
          previous.lotId !== id ||
          previous.kind !== data.kind ||
          !previous.quantity.eq(data.quantity) ||
          previous.movementDate.valueOf() !== data.movementDate.valueOf() ||
          previous.reason !== data.reason ||
          (previous.dogId || null) !== (data.dogId || null) ||
          (previous.area || null) !== (data.area || null)
        )
          throw new ConflictException('La clave de operación se usó con datos distintos.');
        return previous;
      }
      const lot = await tx.stockLot.findUnique({ where: { id }, include: { product: true } });
      if (!lot?.product.active) throw new NotFoundException('Lote activo no encontrado.');
      if (data.kind === 'OUT' && lot.expiresDate && lot.expiresDate < civilToday())
        throw new ConflictException('El lote está vencido. Registra una baja si corresponde.');
      if (data.dogId && !(await tx.dog.findFirst({ where: { id: data.dogId, archivedAt: null } })))
        throw new BadRequestException('Selecciona un perro activo.');
      const delta = data.kind === 'IN' ? data.quantity : data.quantity.negated();
      const balance = lot.quantity.plus(delta);
      if (balance.lt(0)) throw new ConflictException('El movimiento supera las existencias del lote.');
      const item = await tx.stockMovement.create({ data: { ...data, lotId: id, recordedBy: req.user.id } });
      await tx.stockLot.update({ where: { id }, data: { quantity: balance } });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'StockMovement',
          item.id,
          'CREATE',
          `${data.kind}: ${data.quantity.toString()} ${lot.product.unit}; saldo ${balance.toString()}.`,
          data.dogId,
        ),
      });
      return item;
    });
  }
}
