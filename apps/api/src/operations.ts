import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { Allowed, AuthRequest } from './access';
import { Db } from './db';
import { Domain } from './domain';
import {
  ADMINS,
  CLINICAL,
  READ_DOGS,
  emailSchema,
  usernameSchema,
  idSchema,
  instant,
  pagination,
  parse,
  passwordSchema,
  publicUser,
  requiredText,
  roles,
  optionalText,
} from './security';
import { appointmentPatchSchema, appointmentSchema, vaccinationSchema } from './schemas';
import { lock } from './business-common';

@ApiTags('Salud')
@Allowed(...CLINICAL)
@Controller('vaccinations')
export class VaccinationsController {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(Domain) private readonly domain: Domain,
  ) {}
  @Patch(':id') async update(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    parse(idSchema, id);
    const existing = await this.db.vaccination.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Vacunación no encontrada.');
    const dog = await this.domain.dog(existing.dogId);
    const data = parse(vaccinationSchema.partial(), body);
    this.domain.validateVaccination({ ...existing, ...data });
    return this.db.$transaction(async (tx) => {
      const vaccine = await tx.vaccination.update({ where: { id }, data });
      await this.domain.vaccinationReminders(tx, vaccine, dog);
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Vaccination',
          id,
          'UPDATE',
          `Campos actualizados: ${Object.keys(data).join(', ')}.`,
          dog.id,
        ),
      });
      return vaccine;
    });
  }
}
@ApiTags('Entrenamiento')
@Allowed(...READ_DOGS)
@Controller('training')
export class TrainingController {
  constructor(@Inject(Db) private readonly db: Db) {}
  @Get() async list(@Query() query: Record<string, string>) {
    const { page, pageSize, skip } = pagination(query);
    const where: Prisma.TrainingSessionWhereInput = {
      dog: { archivedAt: null },
      ...(query.dogId ? { dogId: parse(idSchema, query.dogId) } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.trainingSession.findMany({
        where,
        skip,
        take: pageSize,
        include: { dog: { select: { id: true, name: true, code: true } } },
        orderBy: { occurredAt: 'desc' },
      }),
      this.db.trainingSession.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}
@ApiTags('Calendario')
@Allowed(...READ_DOGS)
@Controller('appointments')
export class AppointmentsController {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(Domain) private readonly domain: Domain,
  ) {}
  @Get() async list(@Query() query: Record<string, string>) {
    const { page, pageSize, skip } = pagination(query);
    const where: Prisma.AppointmentWhereInput = { dog: { archivedAt: null } };
    if (query.from || query.to)
      where.startsAt = {
        ...(query.from ? { gte: parse(instant, query.from) } : {}),
        ...(query.to ? { lte: parse(instant, query.to) } : {}),
      };
    const [items, total] = await Promise.all([
      this.db.appointment.findMany({
        where,
        skip,
        take: pageSize,
        include: { dog: { select: { id: true, name: true, code: true } } },
        orderBy: { startsAt: 'asc' },
      }),
      this.db.appointment.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
  @Allowed('ADMIN') @Post() async create(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(appointmentSchema, body);
    const dog = await this.domain.dog(data.dogId);
    return this.db.$transaction(async (tx) => {
      const appointment = await tx.appointment.create({ data: { ...data, createdBy: req.user.id } });
      await this.domain.appointmentReminder(tx, appointment, dog);
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Appointment', appointment.id, 'CREATE', 'Cita programada.', dog.id),
      });
      return appointment;
    });
  }
  @Allowed('ADMIN') @Patch(':id') async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    const current = await this.db.appointment.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Cita no encontrada.');
    const dog = await this.domain.dog(current.dogId);
    const data = parse(appointmentPatchSchema, body);
    return this.db.$transaction(async (tx) => {
      const appointment = await tx.appointment.update({ where: { id }, data });
      await this.domain.appointmentReminder(tx, appointment, dog);
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Appointment',
          id,
          'UPDATE',
          `Campos actualizados: ${Object.keys(data).join(', ')}.`,
          dog.id,
        ),
      });
      return appointment;
    });
  }
}
@ApiTags('Inicio')
@Allowed(...READ_DOGS)
@Controller('dashboard')
export class DashboardController {
  constructor(@Inject(Db) private readonly db: Db) {}
  @Get() async get() {
    const now = new Date(),
      until = new Date(now.valueOf() + 30 * 86400000),
      dog = { archivedAt: null };
    const [counts, upcomingVaccinations, upcomingAppointments, recentTraining, trainingCount] =
      await Promise.all([
        this.db.$queryRaw<
          { totalDogs: number; operationalDogs: number; trainingDogs: number; availableDogs: number }[]
        >`
        SELECT count(*)::int AS "totalDogs",
          count(*) FILTER (WHERE "workStatus" = 'OPERATIONAL')::int AS "operationalDogs",
          count(*) FILTER (WHERE "workStatus" = 'TRAINING')::int AS "trainingDogs",
          count(*) FILTER (WHERE availability = 'AVAILABLE')::int AS "availableDogs"
        FROM "Dog" WHERE "archivedAt" IS NULL
      `,
        this.db.vaccination.findMany({
          where: { dog, nextDueDate: { lte: until } },
          take: 20,
          orderBy: { nextDueDate: 'asc' },
          include: { dog: { select: { id: true, name: true, code: true } } },
        }),
        this.db.appointment.findMany({
          where: { dog, status: 'SCHEDULED', startsAt: { gte: now, lte: until } },
          take: 20,
          orderBy: { startsAt: 'asc' },
          include: { dog: { select: { id: true, name: true, code: true } } },
        }),
        this.db.trainingSession.findMany({
          where: { dog },
          take: 10,
          orderBy: { occurredAt: 'desc' },
          include: { dog: { select: { id: true, name: true, code: true } } },
        }),
        this.db.trainingSession.count({ where: { dog } }),
      ]);
    return {
      ...counts[0],
      upcomingVaccinations,
      upcomingAppointments,
      recentTraining,
      trainingCount,
    };
  }
}
@ApiTags('Notificaciones')
@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(Db) private readonly db: Db) {}
  private scope(req: AuthRequest): Prisma.NotificationWhereInput {
    const types: string[] = [];
    if (req.user.role === 'ADMIN') types.push('INQUIRY');
    if (READ_DOGS.includes(req.user.role)) types.push('APPOINTMENT', 'CERTIFICATION');
    if (CLINICAL.includes(req.user.role)) types.push('VACCINATION');
    if (BUSINESS.includes(req.user.role)) types.push('CONTRACT', 'ACCOUNT', 'RESERVATION', 'BREEDING');
    return { userId: req.user.id, reminder: { sourceType: { in: types } } };
  }
  @Get('summary') async summary(@Req() req: AuthRequest) {
    const unread = await this.db.notification.count({ where: { ...this.scope(req), readAt: null } });
    return { unread };
  }
  @Get() async list(@Req() req: AuthRequest, @Query() query: Record<string, string>) {
    const { page, pageSize, skip } = pagination(query),
      where = this.scope(req);
    const [items, total] = await Promise.all([
      this.db.notification.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.db.notification.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
  @Patch(':id/read') async read(@Param('id') id: string, @Req() req: AuthRequest) {
    parse(idSchema, id);
    const result = await this.db.notification.updateMany({
      where: { id, ...this.scope(req) },
      data: { readAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Notificación no encontrada.');
    return { success: true };
  }
}
@ApiTags('Auditoría')
@Allowed(...ADMINS)
@Controller('audit')
export class AuditController {
  constructor(@Inject(Db) private readonly db: Db) {}
  @Get() async list(@Query() query: Record<string, string>) {
    const { page, pageSize, skip } = pagination(query);
    const where = query.dogId ? { dogId: parse(idSchema, query.dogId) } : {};
    const [items, total] = await Promise.all([
      this.db.auditLog.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.db.auditLog.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}
@ApiTags('Administración de usuarios')
@Allowed('ADMIN')
@Controller('users')
export class UsersController {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(Domain) private readonly domain: Domain,
  ) {}
  @Get() async list(@Query() query: Record<string, string>) {
    const { page, pageSize, skip } = pagination(query);
    const search = String(query.search || '')
      .trim()
      .slice(0, 200);
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { username: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};
    const [users, total] = await Promise.all([
      this.db.user.findMany({ where, skip, take: pageSize, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] }),
      this.db.user.count({ where }),
    ]);
    return { items: users.map(publicUser), total, page, pageSize };
  }
  @Post() async create(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(
      z
        .object({
          name: requiredText,
          username: usernameSchema,
          email: emailSchema.nullable().optional(),
          password: passwordSchema,
          role: z.enum(roles),
          partyId: idSchema.nullable().optional(),
          partyName: optionalText,
          partyKind: z.enum(['PERSON', 'MUNICIPALITY', 'ORGANIZATION']).optional(),
        })
        .strict(),
      body,
    );
    const passwordHash = await argon2.hash(data.password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    return this.db.$transaction(async (tx) => {
      let partyId = data.partyId || null;
      if (partyId) {
        const party = await tx.party.findUnique({ where: { id: partyId } });
        if (!party || (data.role === 'CLIENT' && party.kind === 'UNIT'))
          throw new BadRequestException('Selecciona una persona o entidad cliente válida.');
      }
      if (!partyId && data.role !== 'ADMIN') {
        const party = await tx.party.create({
          data: {
            name: data.partyName || data.name,
            kind: data.role === 'TRAINER' ? 'PERSON' : data.partyKind || 'PERSON',
          },
        });
        partyId = party.id;
      }
      const user = await tx.user.create({
        data: {
          name: data.name,
          username: data.username,
          email: data.email,
          role: data.role,
          passwordHash,
          partyId,
        },
      });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'User', user.id, 'CREATE', `Usuario creado con rol ${data.role}.`),
      });
      return publicUser(user);
    });
  }
  @Patch(':id') async update(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    parse(idSchema, id);
    const data = parse(
      z
        .object({
          name: requiredText.optional(),
          username: usernameSchema.optional(),
          email: emailSchema.nullable().optional(),
          password: passwordSchema.optional(),
          role: z.enum(roles).optional(),
          active: z.boolean().optional(),
          partyId: idSchema.nullable().optional(),
        })
        .strict(),
      body,
    );
    const { password, ...profile } = data;
    const passwordHash = password
      ? await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 })
      : undefined;
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(71499534)::text`;
      await lock(tx, `auth:${id}`);
      const current = await tx.user.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Usuario no encontrado.');
      if (id === req.user.id && (data.active === false || (data.role && data.role !== 'ADMIN')))
        throw new BadRequestException('Otro administrador debe cambiar tu acceso administrativo.');
      const role = data.role || current.role;
      const partyId = data.partyId === undefined ? current.partyId : data.partyId;
      if (role === 'CLIENT') {
        const party = partyId ? await tx.party.findUnique({ where: { id: partyId } }) : null;
        if (!party || party.kind === 'UNIT')
          throw new BadRequestException('El cliente requiere su persona o entidad propietaria.');
      } else if (partyId && !(await tx.party.findUnique({ where: { id: partyId } }))) {
        throw new BadRequestException('Persona o entidad no encontrada.');
      }
      if (
        current.role === 'ADMIN' &&
        current.active &&
        (data.active === false || (data.role && data.role !== 'ADMIN'))
      ) {
        const count = await tx.user.count({ where: { role: 'ADMIN', active: true } });
        if (count <= 1) throw new BadRequestException('Debe existir al menos un administrador activo.');
      }
      const user = await tx.user.update({ where: { id }, data: { ...profile, passwordHash } });
      if (data.active === false || (data.role && data.role !== 'TRAINER'))
        await tx.dog.updateMany({ where: { assignedTrainerId: id }, data: { assignedTrainerId: null } });
      if (
        passwordHash ||
        data.active === false ||
        (data.partyId !== undefined && data.partyId !== current.partyId) ||
        (data.role && data.role !== current.role)
      )
        await tx.session.deleteMany({ where: { userId: id } });
      if (passwordHash)
        await tx.passwordReset.updateMany({
          where: { userId: id, usedAt: null },
          data: { usedAt: new Date() },
        });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'User',
          id,
          'UPDATE',
          `Campos actualizados: ${Object.keys(data).join(', ')}.`,
        ),
      });
      return publicUser(user);
    });
  }
}
import { BUSINESS } from './business-common';
