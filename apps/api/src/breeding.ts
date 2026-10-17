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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Allowed, AuthRequest } from './access';
import { Db } from './db';
import { Domain, Tx } from './domain';
import {
  ADMINS,
  CLINICAL,
  civilDate,
  idSchema,
  optionalText,
  pagination,
  parse,
  requiredText,
} from './security';
import { dateOrder, lock, notFuture, positiveMoney, currencySchema } from './business-common';

export const profileSchema = z
  .object({
    sireId: idSchema.nullable().optional(),
    damId: idSchema.nullable().optional(),
    pedigreeSource: optionalText,
    pedigreeQuality: z.enum(['UNKNOWN', 'REPORTED', 'DOCUMENTED']),
    healthNotes: optionalText,
    professional: optionalText,
    expectedRevision: z.number().int().min(0),
  })
  .strict();
export const breedingEventSchema = z
  .object({
    kind: z.enum(['HEAT', 'CHECK', 'HISTORY']),
    eventDate: civilDate,
    professional: optionalText,
    notes: requiredText,
  })
  .strict();
export const planSchema = z
  .object({
    damId: idSchema,
    sireId: idSchema,
    plannedDate: civilDate,
    matingDate: civilDate.nullable().optional(),
    windowStart: civilDate.nullable().optional(),
    windowEnd: civilDate.nullable().optional(),
    estimationMethod: optionalText,
    professional: optionalText,
    notes: optionalText,
    status: z.enum(['PLANNED', 'MATED', 'CONFIRMED', 'CANCELLED']).default('PLANNED'),
    published: z.boolean().optional(),
    publicTitle: optionalText,
    publicDescription: optionalText,
    puppyPrice: positiveMoney.nullable().optional(),
    currency: currencySchema.optional(),
    contact: optionalText,
  })
  .strict();
export const litterSchema = z
  .object({
    code: requiredText,
    damId: idSchema,
    sireId: idSchema,
    planId: idSchema.optional(),
    birthDate: civilDate,
    liveBorn: z.number().int().min(0).max(30),
    stillBorn: z.number().int().min(0).max(30).default(0),
    notes: optionalText,
  })
  .strict();
export const puppySchema = z
  .object({
    name: requiredText,
    sex: z.enum(['MALE', 'FEMALE']),
    breed: requiredText,
    coat: optionalText,
    microchip: z.string().trim().min(3).max(40).optional(),
    weightKg: z.number().positive().max(30).optional(),
  })
  .strict();
const dogSelect = {
  id: true,
  name: true,
  code: true,
  sex: true,
  birthDate: true,
  commercialCategory: true,
  availability: true,
} as const;

async function parents(tx: Tx, damId: string, sireId: string, date?: Date) {
  if (damId === sireId) throw new BadRequestException('La madre y el padre deben ser distintos.');
  const [dam, sire] = await Promise.all([
    tx.dog.findUnique({ where: { id: damId } }),
    tx.dog.findUnique({ where: { id: sireId } }),
  ]);
  if (!dam || !sire || dam.sex !== 'FEMALE' || sire.sex !== 'MALE')
    throw new BadRequestException('Selecciona una hembra y un macho registrados.');
  if (date && [dam, sire].some((d) => d.birthDate && d.birthDate >= date))
    throw new BadRequestException('La fecha debe ser posterior al nacimiento de ambos progenitores.');
  return { dam, sire };
}
async function ancestry(tx: Tx, dogId: string, depth = 3) {
  const nodes: {
    id: string;
    name: string;
    code: string;
    sireId: string | null;
    damId: string | null;
    quality: string;
    source: string | null;
    depth: number;
  }[] = [];
  const seen = new Set<string>();
  async function visit(id: string, level: number): Promise<void> {
    if (seen.has(id) || level > depth) return;
    seen.add(id);
    const dog = await tx.dog.findUnique({
      where: { id },
      select: { id: true, name: true, code: true, breedingProfile: true },
    });
    if (!dog) return;
    const p = dog.breedingProfile;
    nodes.push({
      id: dog.id,
      name: dog.name,
      code: dog.code,
      sireId: p?.sireId || null,
      damId: p?.damId || null,
      quality: p?.pedigreeQuality || 'UNKNOWN',
      source: p?.pedigreeSource || null,
      depth: level,
    });
    if (p?.sireId) await visit(p.sireId, level + 1);
    if (p?.damId) await visit(p.damId, level + 1);
  }
  await visit(dogId, 0);
  return nodes;
}

@ApiTags('Crianza')
@Allowed(...CLINICAL)
@Controller('breeding')
export class BreedingController {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(Domain) private readonly domain: Domain,
  ) {}
  @Get('options') async options() {
    return this.db.dog.findMany({
      where: { archivedAt: null, isPuppy: false },
      select: dogSelect,
      orderBy: { name: 'asc' },
    });
  }
  @Get('dogs') async dogs(@Query() query: Record<string, string>) {
    const { page, pageSize, skip } = pagination(query);
    const where: Prisma.DogWhereInput = {
      archivedAt: null,
      isPuppy: false,
      ...(query.search ? { name: { contains: query.search.slice(0, 200), mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.dog.findMany({
        where,
        select: { ...dogSelect, breedingProfile: true, reproductiveStatus: true },
        orderBy: { name: 'asc' },
        skip,
        take: pageSize,
      }),
      this.db.dog.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
  @Get('dogs/:id') async profile(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.domain.dog(id);
    const [profile, events, pedigree] = await Promise.all([
      this.db.breedingProfile.findUnique({ where: { dogId: id } }),
      this.db.breedingEvent.findMany({ where: { dogId: id }, orderBy: { eventDate: 'desc' }, take: 100 }),
      ancestry(this.db, id),
    ]);
    await this.db.auditLog.create({
      data: this.domain.audit(req, 'BreedingProfile', id, 'READ', 'Consulta reproductiva.', id),
    });
    return {
      profile,
      events,
      pedigree,
      depth: 3,
      notice:
        'Ascendencia registrada hasta tres generaciones. Los ancestros ausentes son desconocidos; no se calcula un coeficiente genético.',
    };
  }
  @Patch('dogs/:id') async saveProfile(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    await this.domain.dog(id);
    const { expectedRevision, ...data } = parse(profileSchema, body);
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'pedigree');
      const previous = await tx.breedingProfile.findUnique({ where: { dogId: id } });
      if ((previous?.revision || 0) !== expectedRevision)
        throw new ConflictException('El perfil cambió. Recarga antes de editar.');
      for (const [parentId, sex] of [
        [data.sireId, 'MALE'],
        [data.damId, 'FEMALE'],
      ] as const) {
        if (!parentId) continue;
        if (parentId === id) throw new BadRequestException('Un perro no puede ser su propio progenitor.');
        const dog = await tx.dog.findUnique({ where: { id: parentId } });
        if (!dog || dog.sex !== sex)
          throw new BadRequestException('El progenitor no corresponde al sexo indicado.');
        const cycle = await tx.$queryRaw<
          { id: string }[]
        >`WITH RECURSIVE ancestors(id) AS (SELECT ${parentId}::uuid UNION SELECT parent.id FROM ancestors a JOIN "BreedingProfile" p ON p."dogId"=a.id CROSS JOIN LATERAL (VALUES(p."sireId"),(p."damId")) parent(id) WHERE parent.id IS NOT NULL) SELECT id::text FROM ancestors WHERE id=${id}::uuid`;
        if (cycle.length) throw new BadRequestException('La ascendencia crearía un ciclo. Revisa los datos.');
      }
      if (data.pedigreeQuality === 'DOCUMENTED' && !data.pedigreeSource)
        throw new BadRequestException('Indica el origen documental del pedigrí.');
      const item = await tx.breedingProfile.upsert({
        where: { dogId: id },
        create: { ...data, dogId: id },
        update: { ...data, revision: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'BreedingProfile',
          id,
          'UPDATE',
          'Perfil y procedencia de ascendencia actualizados.',
          id,
        ),
      });
      return item;
    });
  }
  @Post('dogs/:id/events') async event(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const dog = await this.domain.dog(id),
      data = parse(breedingEventSchema, body);
    notFuture(data.eventDate);
    if (data.kind === 'HEAT' && dog.sex !== 'FEMALE')
      throw new BadRequestException('El registro de celo corresponde a una hembra.');
    return this.db.$transaction(async (tx) => {
      const item = await tx.breedingEvent.create({ data: { ...data, dogId: id, recordedBy: req.user.id } });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'BreedingEvent',
          item.id,
          'CREATE',
          'Evento reproductivo registrado.',
          id,
        ),
      });
      return item;
    });
  }
  @Get('plans') async plans(@Query() query: Record<string, string>) {
    const { page, pageSize, skip } = pagination(query);
    const where: Prisma.BreedingPlanWhereInput = query.status
      ? { status: parse(z.enum(['PLANNED', 'MATED', 'CONFIRMED', 'COMPLETED', 'CANCELLED']), query.status) }
      : {};
    const [items, total] = await Promise.all([
      this.db.breedingPlan.findMany({
        where,
        include: {
          dam: { select: dogSelect },
          sire: { select: dogSelect },
          litter: { select: { id: true, code: true } },
        },
        orderBy: { plannedDate: 'desc' },
        skip,
        take: pageSize,
      }),
      this.db.breedingPlan.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
  @Get('plans/:id/ancestry') async compare(@Param('id') id: string) {
    parse(idSchema, id);
    const plan = await this.db.breedingPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan no encontrado.');
    const [dam, sire] = await Promise.all([ancestry(this.db, plan.damId), ancestry(this.db, plan.sireId)]);
    const ids = new Set(dam.map((n) => n.id));
    const shared = sire.filter((n) => ids.has(n.id));
    const incomplete = [...dam, ...sire].some(
      (n) => n.quality !== 'DOCUMENTED' || (n.depth < 3 && (!n.sireId || !n.damId)),
    );
    return {
      dam,
      sire,
      shared,
      incomplete,
      notice: shared.length
        ? 'Hay ascendencia compartida registrada. Requiere revisión profesional antes de decidir el cruce.'
        : incomplete
          ? 'Datos incompletos: no se puede descartar parentesco. Requiere revisión profesional.'
          : 'No se encontraron ancestros comunes en las tres generaciones registradas. No constituye una evaluación genética.',
    };
  }
  private validatePlan(data: z.infer<typeof planSchema>) {
    if (
      data.published &&
      (!data.puppyPrice || !data.publicTitle?.trim() || !data.contact?.trim() || data.status === 'CANCELLED')
    )
      throw new BadRequestException('La preventa requiere título, precio, contacto y un cruce abierto.');
    if (data.matingDate) notFuture(data.matingDate);
    if (['MATED', 'CONFIRMED'].includes(data.status) && !data.matingDate)
      throw new BadRequestException('Registra la fecha efectiva de monta.');
    if (data.windowStart || data.windowEnd) {
      if (
        !data.windowStart ||
        !data.windowEnd ||
        !data.estimationMethod ||
        !data.professional ||
        !data.matingDate
      )
        throw new BadRequestException(
          'La ventana requiere ambas fechas, monta, método de estimación y profesional responsable.',
        );
      dateOrder(data.windowStart, data.windowEnd);
      dateOrder(data.matingDate, data.windowStart);
    }
  }
  @Post('plans') async createPlan(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(planSchema, body);
    this.validatePlan(data);
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'breeding');
      for (const id of [data.damId, data.sireId].sort()) await lock(tx, `dog:${id}`);
      const { dam, sire } = await parents(tx, data.damId, data.sireId, data.matingDate || data.plannedDate);
      if (
        [dam, sire].some(
          (d) =>
            d.archivedAt ||
            d.isPuppy ||
            ['DECEASED', 'SOLD', 'RETIRED'].includes(d.administrativeStatus) ||
            d.commercialCategory !== 'FOR_BREEDING' ||
            d.availability !== 'AVAILABLE' ||
            d.reproductiveStatus === 'RETIRED',
        )
      )
        throw new BadRequestException('Selecciona progenitores marcados como disponibles para cruza.');
      const item = await tx.breedingPlan.create({ data });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'BreedingPlan', item.id, 'CREATE', 'Plan reproductivo registrado.'),
      });
      return item;
    });
  }
  @Patch('plans/:id') async updatePlan(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    const { expectedRevision, ...data } = parse(
      planSchema
        .omit({ damId: true, sireId: true })
        .partial()
        .extend({ expectedRevision: z.number().int().positive() }),
      body,
    );
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'breeding');
      const old = await tx.breedingPlan.findUnique({ where: { id } });
      if (!old) throw new NotFoundException('Plan no encontrado.');
      if (old.revision !== expectedRevision) throw new ConflictException('El plan cambió; recarga la vista.');
      if (['COMPLETED', 'CANCELLED'].includes(old.status))
        throw new ConflictException('El plan ya está cerrado.');
      const next = { ...old, ...data } as z.infer<typeof planSchema>;
      if (data.status === 'CANCELLED') {
        data.published = false;
        next.published = false;
      }
      this.validatePlan(next);
      for (const dogId of [old.damId, old.sireId].sort()) await lock(tx, `dog:${dogId}`);
      const pair = await parents(tx, old.damId, old.sireId, next.matingDate || next.plannedDate);
      if (
        next.published &&
        [pair.dam, pair.sire].some(
          (d) =>
            d.archivedAt ||
            d.isPuppy ||
            d.reproductiveStatus === 'RETIRED' ||
            d.commercialCategory !== 'FOR_BREEDING' ||
            d.availability !== 'AVAILABLE' ||
            ['DECEASED', 'SOLD', 'RETIRED'].includes(d.administrativeStatus),
        )
      )
        throw new BadRequestException(
          'Los progenitores de la publicación deben estar disponibles para cruza.',
        );
      const item = await tx.breedingPlan.update({
        where: { id },
        data: { ...data, revision: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'BreedingPlan',
          id,
          'UPDATE',
          'Seguimiento de monta y ventana de gestación actualizado.',
        ),
      });
      return item;
    });
  }
  @Get('litters') async litters(@Query() query: Record<string, string>) {
    const { page, pageSize, skip } = pagination(query);
    const [items, total] = await Promise.all([
      this.db.litter.findMany({
        include: {
          dam: { select: dogSelect },
          sire: { select: dogSelect },
          _count: { select: { puppies: true } },
        },
        orderBy: { birthDate: 'desc' },
        skip,
        take: pageSize,
      }),
      this.db.litter.count(),
    ]);
    return { items, total, page, pageSize };
  }
  @Post('litters') async createLitter(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(litterSchema, body);
    notFuture(data.birthDate);
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'breeding');
      await parents(tx, data.damId, data.sireId, data.birthDate);
      if (data.planId) {
        const plan = await tx.breedingPlan.findUnique({ where: { id: data.planId } });
        if (
          !plan ||
          plan.damId !== data.damId ||
          plan.sireId !== data.sireId ||
          !['MATED', 'CONFIRMED'].includes(plan.status) ||
          !plan.matingDate ||
          plan.matingDate > data.birthDate
        )
          throw new BadRequestException(
            'La camada debe corresponder a un plan con monta registrada y padres coincidentes.',
          );
        await tx.breedingPlan.update({
          where: { id: plan.id },
          data: { status: 'COMPLETED', published: false, revision: { increment: 1 } },
        });
      }
      const item = await tx.litter.create({ data });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Litter', item.id, 'CREATE', 'Nacimiento y camada registrados.'),
      });
      return item;
    });
  }
  @Get('litters/:id') async litter(@Param('id') id: string) {
    parse(idSchema, id);
    const item = await this.db.litter.findUnique({
      where: { id },
      include: {
        dam: { select: dogSelect },
        sire: { select: dogSelect },
        puppies: {
          orderBy: { code: 'asc' },
          select: {
            ...dogSelect,
            isPuppy: true,
            coat: true,
            microchip: true,
            administrativeStatus: true,
            availability: true,
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Camada no encontrada.');
    return item;
  }
  @Post('litters/:id/puppies') async puppy(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    const { weightKg, ...data } = parse(puppySchema, body);
    return this.db.$transaction(async (tx) => {
      await lock(tx, `litter:${id}`);
      const litter = await tx.litter.findUnique({
        where: { id },
        include: {
          _count: { select: { puppies: true } },
          dam: { select: { ownerPartyId: true, custodianPartyId: true, owner: true, custodian: true } },
        },
      });
      if (!litter) throw new NotFoundException('Camada no encontrada.');
      if (litter._count.puppies >= litter.liveBorn)
        throw new ConflictException('Ya se identificaron todos los nacidos vivos registrados.');
      const dog = await tx.dog.create({
        data: {
          ...data,
          code: `VK-${randomUUID().slice(0, 8).toUpperCase()}`,
          litterId: id,
          isPuppy: true,
          birthDate: litter.birthDate,
          ownerPartyId: litter.dam.ownerPartyId,
          custodianPartyId: litter.dam.custodianPartyId,
          owner: litter.dam.owner,
          custodian: litter.dam.custodian,
        },
      });
      await tx.breedingProfile.create({
        data: {
          dogId: dog.id,
          sireId: litter.sireId,
          damId: litter.damId,
          pedigreeQuality: 'REPORTED',
          pedigreeSource: `Registro de nacimiento ${litter.code}`,
        },
      });
      if (weightKg)
        await tx.weight.create({
          data: { dogId: dog.id, date: litter.birthDate, kg: weightKg, recordedBy: req.user.id },
        });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Dog',
          dog.id,
          'CREATE',
          `Cachorro registrado en camada ${litter.code}.`,
          dog.id,
        ),
      });
      return dog;
    });
  }
  @Allowed(...ADMINS) @Post('puppies/:id/promote') async promote(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    parse(idSchema, id);
    return this.db.$transaction(async (tx) => {
      await lock(tx, `dog:${id}`);
      const dog = await tx.dog.findUnique({ where: { id } });
      if (!dog?.litterId || dog.archivedAt) throw new NotFoundException('Cachorro no encontrado.');
      if (!dog.isPuppy) return dog;
      const item = await tx.dog.update({ where: { id }, data: { isPuppy: false } });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Dog',
          id,
          'PROMOTE',
          'Cachorro incorporado a la unidad conservando identidad e historial.',
          id,
        ),
      });
      return item;
    });
  }
}
