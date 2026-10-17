import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import { z } from 'zod';
import { Allowed } from './access';
import { Db } from './db';
import { civilDate, parse } from './security';
import { accountBalance } from './finance';

const kinds = [
  'ALL',
  'APPOINTMENT',
  'VACCINATION',
  'TRAINING_PLAN',
  'CERTIFICATION',
  'BREEDING',
  'CONTRACT',
  'RESERVATION',
  'ACCOUNT',
] as const;
type Event = {
  id: string;
  sourceId: string;
  type: string;
  title: string;
  startsAt: Date;
  allDay: boolean;
  status: string;
  dogId?: string | null;
  dog?: { name: string } | null;
  notes?: string | null;
  location?: string | null;
  professional?: string | null;
};
@Allowed('ADMIN')
@Controller('calendar')
export class CalendarController {
  constructor(@Inject(Db) private db: Db) {}
  @Get('events') async events(@Query() query: Record<string, string>) {
    const { from, to, type } = parse(
      z.object({ from: civilDate, to: civilDate, type: z.enum(kinds).default('ALL') }).strict(),
      query,
    );
    if (to <= from || to.valueOf() - from.valueOf() > 62 * 86400000)
      throw new BadRequestException('Selecciona un periodo de 1 a 62 días. La fecha final es exclusiva.');
    const range = { gte: from, lt: to },
      dog = { archivedAt: null },
      include = { dog: { select: { name: true } } },
      take = 5001;
    const events: Event[] = [];
    const add = (kind: string, id: string, title: string, day: Date, rest: Partial<Event> = {}) =>
      events.push({
        id: `${kind}:${id}`,
        sourceId: id,
        type: kind,
        title,
        startsAt: new Date(day.valueOf() + 6 * 3600000),
        allDay: true,
        status: 'SCHEDULED',
        ...rest,
      });
    const wanted = (k: string) => type === 'ALL' || type === k;
    await Promise.all([
      wanted('APPOINTMENT') &&
        this.db.appointment
          .findMany({
            where: {
              startsAt: {
                gte: new Date(from.valueOf() + 6 * 3600000),
                lt: new Date(to.valueOf() + 6 * 3600000),
              },
              dog,
            },
            include,
            take,
          })
          .then((rows) =>
            rows.forEach((r) =>
              add('APPOINTMENT', r.id, r.title, r.startsAt, {
                sourceId: r.id,
                startsAt: r.startsAt,
                allDay: false,
                status: r.status,
                dogId: r.dogId,
                dog: r.dog,
                notes: r.notes,
                location: r.location,
                professional: r.professional,
              }),
            ),
          ),
      wanted('VACCINATION') &&
        this.db.vaccination.findMany({ where: { nextDueDate: range, dog }, include, take }).then((rows) =>
          rows.forEach((r) =>
            add('VACCINATION', r.id, `Vacuna: ${r.product}`, r.nextDueDate!, {
              dogId: r.dogId,
              dog: r.dog,
            }),
          ),
        ),
      wanted('TRAINING_PLAN') &&
        this.db.trainingPlan
          .findMany({ where: { dueDate: range, archivedAt: null, status: 'ACTIVE', dog }, include, take })
          .then((rows) =>
            rows.forEach((r) =>
              add('TRAINING_PLAN', r.id, `Objetivos: ${r.title}`, r.dueDate, { dogId: r.dogId, dog: r.dog }),
            ),
          ),
      wanted('CERTIFICATION') &&
        this.db.certification
          .findMany({ where: { expiresDate: range, archivedAt: null, dog }, include, take })
          .then((rows) =>
            rows.forEach((r) =>
              add('CERTIFICATION', r.id, `Vence: ${r.title}`, r.expiresDate!, { dogId: r.dogId, dog: r.dog }),
            ),
          ),
      wanted('BREEDING') &&
        this.db.breedingPlan
          .findMany({
            where: {
              OR: [{ plannedDate: range }, { expectedBirthDate: range }, { expectedDeliveryDate: range }],
              status: { in: ['PLANNED', 'MATED', 'CONFIRMED', 'COMPLETED'] },
              dam: dog,
              sire: dog,
            },
            include: { dam: { select: { name: true } }, sire: { select: { name: true } } },
            take,
          })
          .then((rows) =>
            rows.forEach((r) => {
              const inRange = (date: Date | null) => date && date >= from && date < to;
              const rest = { sourceId: r.id, dogId: r.damId, dog: r.dam };
              if (r.status === 'PLANNED' && inRange(r.plannedDate))
                add('BREEDING', r.id, `Cruce: ${r.dam.name} × ${r.sire.name}`, r.plannedDate, rest);
              if (r.status !== 'COMPLETED' && inRange(r.expectedBirthDate))
                add('BREEDING', r.id + ':birth', `Nacimiento previsto: ${r.dam.name}`, r.expectedBirthDate!, {
                  ...rest,
                  notes: 'Confirma la fecha real en Crianza → Registrar nacimiento.',
                });
              if (inRange(r.expectedDeliveryDate))
                add(
                  'BREEDING',
                  r.id + ':delivery',
                  `Entrega prevista: ${r.dam.name}`,
                  r.expectedDeliveryDate!,
                  rest,
                );
            }),
          ),
      wanted('CONTRACT') &&
        this.db.contract
          .findMany({ where: { endDate: range, status: 'ACTIVE' }, take })
          .then((rows) =>
            rows.forEach((r) => add('CONTRACT', r.id, `Fin de contrato ${r.number}: ${r.title}`, r.endDate)),
          ),
      wanted('RESERVATION') &&
        this.db.reservation
          .findMany({ where: { expiresDate: range, status: 'ACTIVE' }, include, take })
          .then((rows) =>
            rows.forEach((r) =>
              add('RESERVATION', r.id, `Reserva: ${r.customer}`, r.expiresDate, {
                dogId: r.dogId,
                dog: r.dog,
              }),
            ),
          ),
      wanted('ACCOUNT') &&
        this.db.account
          .findMany({
            where: { dueDate: range, cancelledAt: null },
            include: { ...include, payments: true },
            take,
          })
          .then((rows) => {
            if (rows.length >= take)
              throw new BadRequestException(
                'Hay demasiadas cuentas en este periodo. Acota el periodo para consultar todos sus vencimientos.',
              );
            return rows;
          })
          .then((rows) =>
            rows.forEach((r) => {
              if (accountBalance(r).balance.gt(0))
                add(
                  'ACCOUNT',
                  r.id,
                  `${r.direction === 'RECEIVABLE' ? 'Cobro' : 'Pago'}: ${r.concept}`,
                  r.dueDate,
                  { dogId: r.dogId, dog: r.dog },
                );
            }),
          ),
    ]);
    // Fail visibly instead of silently omitting reminders in a crowded period.
    if (events.length > 5000)
      throw new BadRequestException(
        'Hay más de 5000 eventos. Acota el periodo o el tipo para consultar todos.',
      );
    events.sort((a, b) => a.startsAt.valueOf() - b.startsAt.valueOf() || a.id.localeCompare(b.id));
    return { items: events, total: events.length };
  }
}
