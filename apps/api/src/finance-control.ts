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
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { z } from 'zod';
import { Allowed, AuthRequest } from './access';
import { Db } from './db';
import { Domain, Tx } from './domain';
import { civilDate, csvCell, emailSchema, idSchema, optionalText, parse, requiredText } from './security';
import { civilToday, dateOrder, lock, positiveMoney, reportPdf, snapshot } from './business-common';
const supplierSchema = z
  .object({
    name: requiredText,
    taxId: optionalText,
    contact: optionalText,
    email: emailSchema.nullable().optional(),
    phone: optionalText,
    notes: optionalText,
    active: z.boolean().optional(),
  })
  .strict();
const monthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
function range(query: Record<string, string>) {
  const from = parse(civilDate, query.from),
    to = parse(civilDate, query.to);
  dateOrder(from, to);
  if (to.valueOf() - from.valueOf() > 366 * 86400000)
    throw new BadRequestException('Consulta hasta 366 días.');
  return { from, to };
}
async function cashflow(tx: Tx, from: Date, to: Date, filter: Prisma.AccountWhereInput = {}) {
  const payments = await tx.payment.findMany({
    where: { paidDate: { gte: from, lte: to }, account: filter },
    include: {
      account: {
        select: {
          direction: true,
          currency: true,
          concept: true,
          party: true,
          dogId: true,
          contractId: true,
        },
      },
      reconciliation: true,
    },
    orderBy: [{ paidDate: 'asc' }, { id: 'asc' }],
    take: 5001,
  });
  if (payments.length > 5000) throw new BadRequestException('Reduce el periodo: máximo 5000 movimientos.');
  const totals = ['CRC', 'USD'].map((currency) => {
    let income = new Prisma.Decimal(0),
      expense = new Prisma.Decimal(0);
    for (const p of payments.filter((p) => p.account.currency === currency)) {
      const amount = p.kind === 'REFUND' ? p.amount.negated() : p.amount;
      if (p.account.direction === 'RECEIVABLE') income = income.plus(amount);
      else expense = expense.plus(amount);
    }
    return {
      currency,
      income: income.toFixed(2),
      expense: expense.toFixed(2),
      net: income.minus(expense).toFixed(2),
    };
  });
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), payments, totals };
}
@Allowed('ADMIN')
@Controller('finance-control')
export class FinanceControlController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Domain) private domain: Domain,
  ) {}
  @Get('suppliers') suppliers() {
    return this.db.supplier.findMany({ orderBy: { name: 'asc' } });
  }
  @Post('suppliers') async createSupplier(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(supplierSchema, body);
    return this.db.$transaction(async (tx) => {
      const item = await tx.supplier.create({ data });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Supplier', item.id, 'CREATE', 'Proveedor registrado.'),
      });
      return item;
    });
  }
  @Patch('suppliers/:id') async editSupplier(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    const { revision, ...data } = parse(
      supplierSchema.extend({ revision: z.number().int().positive() }),
      body,
    );
    return this.db.$transaction(async (tx) => {
      const changed = await tx.supplier.updateMany({
        where: { id, revision },
        data: { ...data, revision: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('El proveedor cambió. Recarga.');
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Supplier', id, 'UPDATE', 'Proveedor actualizado.'),
      });
      return tx.supplier.findUniqueOrThrow({ where: { id } });
    });
  }
  @Get('cashflow') async flow(@Query() query: Record<string, string>, @Req() req: AuthRequest) {
    const { from, to } = range(query);
    const filter = {
      ...(query.dogId ? { dogId: parse(idSchema, query.dogId) } : {}),
      ...(query.contractId ? { contractId: parse(idSchema, query.contractId) } : {}),
    };
    const result = await cashflow(this.db, from, to, filter);
    await this.db.auditLog.create({
      data: this.domain.audit(
        req,
        'Payment',
        'cashflow',
        'READ',
        'Flujo de caja por fecha de pago consultado.',
      ),
    });
    return result;
  }
  @Get('cashflow/export') async exportFlow(
    @Query() query: Record<string, string>,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    const flow = await this.flow(query, req);
    const rows = flow.payments.map((p) => [
      p.paidDate.toISOString().slice(0, 10),
      p.account.party,
      p.account.concept,
      p.account.direction,
      p.kind,
      p.account.currency,
      p.amount.toFixed(2),
      p.method,
      p.reference || '',
      p.reconciliation?.statementReference || 'Pendiente',
    ]);
    await this.db.auditLog.create({
      data: this.domain.audit(req, 'Payment', 'cashflow', 'EXPORT', 'Exportación del flujo de caja.'),
    });
    if (query.format === 'pdf')
      return reportPdf(
        res,
        'Flujo de caja interno',
        [
          `${flow.from} a ${flow.to} · Fecha efectiva de pago`,
          ...flow.totals.map(
            (t) =>
              `${t.currency}: ingresos netos ${t.income}; egresos netos ${t.expense}; flujo neto ${t.net}`,
          ),
          ...rows.map((r) => r.join(' · ')),
          'Monedas separadas. Control interno; no es factura fiscal.',
        ],
        'flujo-caja.pdf',
      );
    res.type('text/csv; charset=utf-8');
    res.attachment('flujo-caja.csv');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(
      '\uFEFF' +
        [
          [
            'Fecha',
            'Persona',
            'Concepto',
            'Dirección',
            'Movimiento',
            'Moneda',
            'Importe',
            'Método',
            'Referencia',
            'Conciliación',
          ],
          ...rows,
        ]
          .map((r) => r.map(csvCell).join(','))
          .join('\r\n'),
    );
  }
  @Post('payments/:id/reconcile') async reconcile(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    const { amount, ...data } = parse(
      z.object({ amount: positiveMoney, statementReference: requiredText, notes: optionalText }).strict(),
      body,
    );
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'commerce');
      const payment = await tx.payment.findUnique({ where: { id }, include: { reconciliation: true } });
      if (!payment) throw new NotFoundException('Movimiento no encontrado.');
      if (payment.reconciliation) throw new ConflictException('Movimiento ya conciliado.');
      if (!payment.amount.eq(amount))
        throw new BadRequestException('El importe del comprobante no coincide con el movimiento.');
      const item = await tx.paymentReconciliation.create({
        data: { ...data, paymentId: id, recordedBy: req.user.id },
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Payment',
          id,
          'RECONCILE',
          'Movimiento conciliado contra comprobante externo.',
        ),
      });
      return item;
    });
  }
  @Get('closes') closes() {
    return this.db.financialClose.findMany({ orderBy: { month: 'desc' } });
  }
  @Post('closes') async close(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(z.object({ month: monthSchema, notes: requiredText }).strict(), body);
    const from = new Date(`${data.month}-01T00:00:00Z`),
      to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
    if (to >= civilToday()) throw new BadRequestException('Sólo se cierran meses ya finalizados.');
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'commerce');
      if (await tx.financialClose.findUnique({ where: { month: data.month } }))
        throw new ConflictException('El mes ya está cerrado.');
      const flow = await cashflow(tx, from, to);
      if (flow.payments.some((p) => !p.reconciliation))
        throw new ConflictException('Concilia todos los movimientos del mes antes de cerrarlo.');
      const item = await tx.financialClose.create({
        data: { ...data, endDate: to, snapshot: snapshot(flow), recordedBy: req.user.id },
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'FinancialClose',
          item.id,
          'CLOSE',
          `Cierre inmutable del mes ${data.month}.`,
        ),
      });
      return item;
    });
  }
}
