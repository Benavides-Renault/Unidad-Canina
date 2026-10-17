import {
  Body,
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { rememberBreed } from './breed-registry';
import { civilToday, lock } from './business-common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { drawBrand } from './branding';
import { Response } from 'express';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { Db } from './db';
import { Domain } from './domain';
import { Allowed, AuthRequest } from './access';
import {
  ADMINS,
  CLINICAL,
  MANAGE_DOGS,
  READ_DOGS,
  civilDate,
  csvCell,
  idSchema,
  instant,
  optionalText,
  pagination,
  parse,
  requiredText,
} from './security';
import { dogSchema, trainingSchema, vaccinationSchema } from './schemas';

@ApiTags('Expedientes caninos')
@Allowed(...READ_DOGS)
@Controller('dogs')
export class DogsController {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(Domain) private readonly domain: Domain,
  ) {}
  @Get() async list(@Query() query: Record<string, string>) {
    const { page, pageSize, skip } = pagination(query);
    const where: Prisma.DogWhereInput = {
      archivedAt: null,
      ...(query.includePuppies === 'true' ? {} : { isPuppy: false }),
    };
    if (query.search) {
      const value = query.search.slice(0, 200);
      where.OR = ['name', 'code', 'breed', 'microchip'].map((field) => ({
        [field]: { contains: value, mode: 'insensitive' },
      }));
    }
    if (query.workStatus)
      where.workStatus = parse(
        z.enum(['TRAINING', 'OPERATIONAL', 'REST', 'TEMPORARILY_UNFIT']),
        query.workStatus,
      );
    if (query.location) where.location = { contains: query.location.slice(0, 200), mode: 'insensitive' };
    const [items, total] = await Promise.all([
      this.db.dog.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.db.dog.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
  @Allowed('ADMIN') @Get('identifiers/check') async checkIdentifiers(@Query() query: Record<string, string>) {
    const input = parse(
      z
        .object({
          field: z.enum(['code', 'microchip', 'pedigreeNumber']),
          value: z.string().trim().min(1).max(100),
          excludeId: idSchema.optional(),
        })
        .strict(),
      query,
    );
    const value =
      input.field === 'code' ? input.value.toUpperCase() : input.value.replace(/[\s-]+/g, '').toUpperCase();
    const result =
      input.field === 'code'
        ? await this.db.$queryRaw<
            { id: string }[]
          >`SELECT id FROM "Dog" WHERE upper(btrim(code)) = ${value} AND (${input.excludeId || null}::uuid IS NULL OR id <> ${input.excludeId || null}::uuid) LIMIT 1`
        : input.field === 'microchip'
          ? await this.db.$queryRaw<
              { id: string }[]
            >`SELECT id FROM "Dog" WHERE upper(regexp_replace(microchip, '[[:space:]-]', '', 'g')) = ${value} AND (${input.excludeId || null}::uuid IS NULL OR id <> ${input.excludeId || null}::uuid) LIMIT 1`
          : await this.db.$queryRaw<
              { id: string }[]
            >`SELECT id FROM "Dog" WHERE upper(regexp_replace("pedigreeNumber", '[[:space:]-]', '', 'g')) = ${value} AND (${input.excludeId || null}::uuid IS NULL OR id <> ${input.excludeId || null}::uuid) LIMIT 1`;
    return { available: result.length === 0 };
  }
  @Get('export.csv') async csv(@Req() req: AuthRequest, @Res() res: Response) {
    const dogs = await this.db.dog.findMany({ where: { archivedAt: null }, orderBy: { code: 'asc' } });
    await this.db.auditLog.create({
      data: this.domain.audit(req, 'Dog', 'all', 'EXPORT_CSV', `${dogs.length} expedientes exportados.`),
    });
    const rows: unknown[][] = [
      [
        'Código',
        'Nombre',
        'Raza',
        'Sexo',
        'Microchip',
        'Nacimiento',
        'Ubicación',
        'Responsable',
        'Situación',
        'Trabajo',
        'Reproducción',
        'Disponibilidad',
      ],
    ];
    for (const dog of dogs)
      rows.push([
        dog.code,
        dog.name,
        dog.breed,
        dog.sex,
        dog.microchip,
        dog.birthDate?.toISOString().slice(0, 10),
        dog.location,
        dog.custodian,
        dog.administrativeStatus,
        dog.workStatus,
        dog.reproductiveStatus,
        dog.availability,
      ]);
    res
      .type('text/csv; charset=utf-8')
      .attachment('oryx-perros.csv')
      .send('\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n'));
  }
  @Allowed(...MANAGE_DOGS) @Post() async create(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(dogSchema, body);
    this.domain.validateDog(data);
    return this.db.$transaction(async (tx) => {
      const ownership = await this.ownership(tx, data);
      await rememberBreed(tx, data.breed);
      const dog = await tx.dog.create({
        data: { ...data, ...ownership, code: data.code || `ORYX-${randomUUID().slice(0, 8).toUpperCase()}` },
      });
      if (dog.location)
        await tx.movement.create({
          data: {
            dogId: dog.id,
            date: new Date(),
            location: dog.location,
            custodian: dog.custodian,
            recordedBy: req.user.id,
            notes: 'Ubicación inicial.',
          },
        });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Dog', dog.id, 'CREATE', 'Expediente creado.', dog.id),
      });
      return dog;
    });
  }
  @Get(':id') async detail(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.domain.dog(id);
    return this.db.dog.findUnique({
      where: { id },
      include: {
        ownerParty: true,
        custodianParty: true,
        assignedTrainer: { select: { id: true, name: true } },
        medicalEntries: { where: { archivedAt: null }, orderBy: { eventDate: 'desc' } },
        vaccinations: { orderBy: { appliedDate: 'desc' } },
        weights: { orderBy: { date: 'asc' } },
        movements: { orderBy: { date: 'desc' } },
        trainingSessions: { orderBy: { occurredAt: 'desc' } },
        appointments: { orderBy: { startsAt: 'desc' } },
        documents: {
          where: {
            archivedAt: null,
            recordAttachment: null,
            ...(CLINICAL.includes(req.user.role) ? {} : { category: { not: 'CLINICAL' as const } }),
          },
          select: {
            id: true,
            name: true,
            mimeType: true,
            size: true,
            category: true,
            checksum: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }
  @Allowed(...MANAGE_DOGS) @Patch(':id') async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    await this.domain.dog(id);
    const data = parse(dogSchema.partial(), body);
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'commerce');
      await lock(tx, `dog:${id}`);
      const current = await tx.dog.findUniqueOrThrow({ where: { id } });
      const ownership = await this.ownership(tx, { ...current, ...data });
      this.domain.validateDog({ ...current, ...data });
      if (data.breed) await rememberBreed(tx, data.breed);
      if (
        (data.administrativeStatus && ['DECEASED', 'SOLD', 'RETIRED'].includes(data.administrativeStatus)) ||
        (data.availability && ['UNAVAILABLE', 'RESERVED'].includes(data.availability))
      ) {
        if (
          await tx.assignment.count({
            where: { dogId: id, releasedOn: null, endDate: { gte: civilToday() } },
          })
        )
          throw new ConflictException(
            'Retira las asignaciones vigentes antes de cambiar la disponibilidad del perro.',
          );
      }
      const reservation = await tx.reservation.findFirst({
        where: { dogId: id, status: { in: ['ACTIVE', 'DELIVERED'] } },
      });
      if (
        reservation &&
        ((data.availability !== undefined && data.availability !== current.availability) ||
          (data.administrativeStatus !== undefined &&
            data.administrativeStatus !== current.administrativeStatus))
      )
        throw new ConflictException('Gestiona la disponibilidad y entrega desde el apartado asociado.');
      if (current.litterId && data.birthDate && current.birthDate?.valueOf() !== data.birthDate.valueOf())
        throw new ConflictException('El nacimiento está vinculado al registro de camada.');
      if (data.sex && data.sex !== current.sex) {
        const used =
          (await tx.breedingProfile.count({ where: { OR: [{ damId: id }, { sireId: id }] } })) +
          (await tx.breedingPlan.count({ where: { OR: [{ damId: id }, { sireId: id }] } })) +
          (await tx.litter.count({ where: { OR: [{ damId: id }, { sireId: id }] } }));
        if (used)
          throw new ConflictException(
            'Este perro figura como progenitor; revisa su historial antes de cambiar el sexo.',
          );
      }
      const dog = await tx.dog.update({ where: { id }, data: { ...data, ...ownership } });
      if (
        ((data.location !== undefined && data.location !== current.location) ||
          dog.custodianPartyId !== current.custodianPartyId) &&
        dog.location
      )
        await tx.movement.create({
          data: {
            dogId: id,
            date: new Date(),
            location: dog.location,
            custodian: dog.custodian,
            recordedBy: req.user.id,
            notes: 'Actualización de ficha.',
          },
        });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Dog',
          id,
          'UPDATE',
          `Campos actualizados: ${Object.keys(data).join(', ')}.`,
          id,
        ),
      });
      return dog;
    });
  }
  private async ownership(
    tx: Prisma.TransactionClient,
    data: { ownerPartyId: string; custodianPartyId: string; assignedTrainerId?: string | null },
  ) {
    const owner = await tx.party.findUnique({ where: { id: data.ownerPartyId } });
    const custodian = await tx.party.findUnique({ where: { id: data.custodianPartyId } });
    if (!owner || !custodian)
      throw new BadRequestException('Define un propietario y un responsable registrados.');
    if (
      data.assignedTrainerId &&
      !(await tx.user.findFirst({ where: { id: data.assignedTrainerId, role: 'TRAINER', active: true } }))
    )
      throw new BadRequestException('Selecciona un entrenador activo.');
    return { owner: owner.name, custodian: custodian.name };
  }
  @Allowed(...ADMINS) @Delete(':id') async archive(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.domain.dog(id);
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'commerce');
      await lock(tx, `dog:${id}`);
      if (
        (await tx.reservation.count({ where: { dogId: id, status: 'ACTIVE' } })) ||
        (await tx.assignment.count({
          where: { dogId: id, releasedOn: null, endDate: { gte: civilToday() } },
        }))
      )
        throw new ConflictException(
          'Cierra los apartados y retira las asignaciones vigentes antes de archivar.',
        );
      const dog = await tx.dog.update({ where: { id }, data: { archivedAt: new Date() } });
      const vaccines = await tx.vaccination.findMany({ where: { dogId: id }, select: { id: true } });
      const appointments = await tx.appointment.findMany({ where: { dogId: id }, select: { id: true } });
      await tx.reminder.updateMany({
        where: {
          sourceId: { in: [...vaccines, ...appointments].map((v) => v.id) },
          status: { in: ['PENDING', 'PROCESSING', 'FAILED'] },
        },
        data: { status: 'CANCELLED' },
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Dog',
          id,
          'ARCHIVE',
          'Expediente archivado; se conserva historial.',
          id,
        ),
      });
      return dog;
    });
  }
  @Allowed(...CLINICAL) @Post(':id/vaccinations') async vaccination(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const dog = await this.domain.dog(id),
      data = parse(vaccinationSchema, body);
    this.domain.validateVaccination({ ...data, nextDueDate: data.nextDueDate || null });
    return this.db.$transaction(async (tx) => {
      const vaccination = await tx.vaccination.create({
        data: { ...data, dogId: id, recordedBy: req.user.id },
      });
      await this.domain.vaccinationReminders(tx, vaccination, dog);
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Vaccination', vaccination.id, 'CREATE', 'Vacunación registrada.', id),
      });
      return vaccination;
    });
  }
  @Allowed(...CLINICAL) @Post(':id/weights') async weight(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    await this.domain.dog(id);
    const data = parse(z.object({ date: civilDate, kg: z.number().min(0.01).max(200) }).strict(), body);
    return this.db.$transaction(async (tx) => {
      const weight = await tx.weight.create({ data: { ...data, dogId: id, recordedBy: req.user.id } });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Weight', weight.id, 'CREATE', 'Peso registrado.', id),
      });
      return weight;
    });
  }
  @Allowed(...MANAGE_DOGS) @Post(':id/movements') async movement(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    await this.domain.dog(id);
    const data = parse(
      z
        .object({
          date: z.union([instant, civilDate]),
          location: requiredText,
          custodianPartyId: idSchema,
          notes: optionalText,
        })
        .strict(),
      body,
    );
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Dog" WHERE id = ${id}::uuid FOR UPDATE`;
      const custodian = await tx.party.findUnique({ where: { id: data.custodianPartyId } });
      if (!custodian) throw new BadRequestException('Selecciona un responsable registrado.');
      const { custodianPartyId, ...movementData } = data;
      const latest = await tx.movement.findFirst({ where: { dogId: id }, orderBy: { date: 'desc' } });
      const movement = await tx.movement.create({
        data: { ...movementData, custodian: custodian.name, dogId: id, recordedBy: req.user.id },
      });
      if (!latest || latest.date <= data.date)
        await tx.dog.update({
          where: { id },
          data: {
            location: data.location,
            custodian: custodian.name,
            custodianPartyId,
          },
        });
      await tx.auditLog.create({
        data: this.domain.audit(req, 'Movement', movement.id, 'CREATE', 'Movimiento registrado.', id),
      });
      return movement;
    });
  }
  @Allowed(...MANAGE_DOGS) @Post(':id/training') async training(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    await this.domain.dog(id);
    const data = parse(trainingSchema, body);
    return this.db.$transaction(async (tx) => {
      const training = await tx.trainingSession.create({
        data: { ...data, dogId: id, trainerId: req.user.id, trainerName: req.user.name },
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'TrainingSession',
          training.id,
          'CREATE',
          'Sesión de entrenamiento registrada.',
          id,
        ),
      });
      return training;
    });
  }
  @Get(':id/card.pdf') async card(@Param('id') id: string, @Req() req: AuthRequest, @Res() res: Response) {
    return this.pdf(id, req, res, 'card');
  }
  @Get(':id/report.pdf') async report(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    return this.pdf(id, req, res, 'report');
  }
  private async pdf(id: string, req: AuthRequest, res: Response, kind: 'card' | 'report') {
    const dog = await this.domain.dog(id);
    const vaccines = await this.db.vaccination.findMany({
      where: { dogId: id },
      orderBy: { appliedDate: 'desc' },
    });
    const sessions =
      kind === 'report'
        ? await this.db.trainingSession.findMany({ where: { dogId: id }, orderBy: { occurredAt: 'asc' } })
        : [];
    await this.db.auditLog.create({
      data: this.domain.audit(
        req,
        'Dog',
        id,
        'EXPORT_PDF',
        kind === 'card' ? 'Carné interno de vacunación descargado.' : 'Informe canino descargado.',
        id,
      ),
    });
    const doc = new PDFDocument({ margin: 48, size: 'A4', info: { Title: `ORYX K9 ${dog.name}` } });
    res.type('application/pdf').attachment(`oryx-${dog.code}-${kind}.pdf`);
    doc.pipe(res);
    drawBrand(doc, 48, 40, 68);
    doc.fontSize(19).fillColor('#141414').text('ORYX K9 UNIDAD CANINA', 128, 50);
    doc
      .fontSize(11)
      .fillColor('#785437')
      .text(kind === 'card' ? 'Carné interno de vacunación' : 'Informe del expediente canino', 128, 80);
    doc.x = 48;
    doc.y = 132;
    doc.fillColor('#141414');
    doc.fontSize(17).text(`${dog.name} · ${dog.code}`);
    doc
      .moveDown(0.5)
      .fontSize(10)
      .text(`Raza: ${dog.breed}   |   Sexo: ${dog.sex === 'MALE' ? 'Macho' : 'Hembra'}`)
      .text(
        `Microchip: ${dog.microchip || 'Sin registrar'}   |   Nacimiento: ${dog.birthDate?.toISOString().slice(0, 10) || 'Sin registrar'}`,
      )
      .text(`Propietario: ${dog.owner || 'Sin registrar'}`)
      .text(
        `Emitido: ${new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })} (Costa Rica)`,
      );
    doc
      .moveDown()
      .fontSize(9)
      .fillColor('#555555')
      .text(
        'Registro interno de ORYX K9. No constituye certificación veterinaria oficial ni sustituye el carné firmado por un profesional.',
      )
      .fillColor('#141414');
    doc.moveDown().fontSize(13).text('Vacunaciones registradas');
    if (!vaccines.length) doc.moveDown(0.5).fontSize(10).text('No hay vacunas registradas.');
    for (const v of vaccines) {
      if (doc.y > 680) doc.addPage();
      doc
        .moveDown(0.6)
        .fontSize(11)
        .text(v.product)
        .fontSize(9)
        .text(
          `Aplicación: ${v.appliedDate.toISOString().slice(0, 10)} | Próxima dosis: ${v.nextDueDate?.toISOString().slice(0, 10) || 'Sin definir'}`,
        )
        .text(
          `Fabricante: ${v.manufacturer || '—'} | Lote: ${v.batch || '—'} | Profesional: ${v.professional || '—'}`,
        )
        .text(`Registro: ${v.id}`);
      if (v.notes) doc.text(v.notes);
    }
    if (kind === 'report') {
      doc.moveDown().fontSize(13).text(`Entrenamiento (${sessions.length} sesiones)`);
      if (!sessions.length) doc.fontSize(10).text('Sin sesiones registradas.');
      for (const s of sessions) {
        if (doc.y > 650) doc.addPage();
        doc
          .moveDown(0.6)
          .fontSize(10)
          .text(
            `${s.occurredAt.toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })} · ${s.discipline}`,
          )
          .fontSize(9)
          .text(`${s.objective} · ${s.durationMinutes} min · ${s.trainerName}`)
          .text(`Puntuación: ${s.score ?? 'Sin puntuar'} / 100`);
        if (s.notes) doc.text(s.notes);
      }
    }
    doc.end();
  }
}
