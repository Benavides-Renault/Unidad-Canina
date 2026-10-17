import { BadRequestException, Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Appointment, Dog, Prisma, Vaccination } from '@prisma/client';
import { Db } from './db';
import { AuthRequest } from './access';
import { idSchema, parse } from './security';
export type Tx = Prisma.TransactionClient;
@Injectable()
export class Domain {
  constructor(@Inject(Db) readonly db: Db) {}
  async dog(id: string) {
    parse(idSchema, id);
    const dog = await this.db.dog.findFirst({ where: { id, archivedAt: null } });
    if (!dog) throw new NotFoundException('Expediente no encontrado.');
    return dog;
  }
  audit(
    req: AuthRequest,
    entity: string,
    entityId: string,
    action: string,
    summary: string,
    dogId?: string,
  ): Prisma.AuditLogUncheckedCreateInput {
    return {
      actorId: req.user.id,
      actorName: req.user.name,
      entity,
      entityId,
      action,
      summary,
      dogId,
      origin: req.ip,
    };
  }
  validateDog(dog: Partial<Dog>) {
    if (dog.birthDate && dog.birthDate > new Date())
      throw new BadRequestException('La fecha de nacimiento no puede estar en el futuro.');
    if (dog.sex === 'MALE' && ['PREGNANT', 'NURSING'].includes(dog.reproductiveStatus || ''))
      throw new BadRequestException('Gestación y lactancia sólo se aplican a hembras.');
    if (
      dog.administrativeStatus === 'DECEASED' &&
      (dog.availability !== 'UNAVAILABLE' || dog.workStatus === 'OPERATIONAL')
    )
      throw new BadRequestException(
        'Un perro fallecido debe estar no disponible y fuera de servicio operativo.',
      );
  }
  validateVaccination(v: Pick<Vaccination, 'appliedDate' | 'nextDueDate'>) {
    if (v.appliedDate > new Date())
      throw new BadRequestException('La fecha de aplicación no puede estar en el futuro.');
    if (v.nextDueDate && v.nextDueDate <= v.appliedDate)
      throw new BadRequestException('La próxima dosis debe ser posterior a la aplicación.');
  }
  async vaccinationReminders(tx: Tx, vaccine: Vaccination, dog: Dog) {
    await tx.reminder.updateMany({
      where: {
        sourceType: 'VACCINATION',
        sourceId: vaccine.id,
        status: { in: ['PENDING', 'PROCESSING', 'FAILED'] },
      },
      data: { status: 'CANCELLED' },
    });
    if (!vaccine.nextDueDate) return;
    const users = await tx.user.findMany({
      where: { active: true, role: 'ADMIN' },
      select: { id: true },
    });
    for (const days of [30, 7, 1]) {
      const scheduled = new Date(vaccine.nextDueDate.valueOf() + 15 * 3600000 - days * 86400000);
      if (scheduled < new Date() && days !== 1) continue;
      const dueAt = scheduled < new Date() ? new Date() : scheduled;
      for (const user of users) {
        const dedupeKey = `vaccine:${vaccine.id}:${vaccine.nextDueDate.toISOString().slice(0, 10)}:${days}:${user.id}`;
        await tx.reminder.upsert({
          where: { dedupeKey },
          create: {
            dedupeKey,
            sourceType: 'VACCINATION',
            sourceId: vaccine.id,
            userId: user.id,
            dueAt,
            title: `Vacuna: ${dog.name}`,
            body: `${vaccine.product}. Próxima dosis: ${vaccine.nextDueDate.toISOString().slice(0, 10)}. Registro interno; confirmar con veterinario.`,
          },
          update: {},
        });
        await tx.reminder.updateMany({
          where: { dedupeKey, status: 'CANCELLED', sentAt: null },
          data: {
            status: 'PENDING',
            dueAt,
            attempts: 0,
            title: `Vacuna: ${dog.name}`,
            body: `${vaccine.product}. Próxima dosis: ${vaccine.nextDueDate.toISOString().slice(0, 10)}. Registro interno; confirmar con veterinario.`,
          },
        });
      }
    }
  }
  async appointmentReminder(tx: Tx, appointment: Appointment, dog: Dog) {
    await tx.reminder.updateMany({
      where: {
        sourceType: 'APPOINTMENT',
        sourceId: appointment.id,
        status: { in: ['PENDING', 'PROCESSING', 'FAILED'] },
      },
      data: { status: 'CANCELLED' },
    });
    if (appointment.status !== 'SCHEDULED') return;
    const scheduled = new Date(appointment.startsAt.valueOf() - appointment.remindBeforeHours * 3600000);
    const dueAt = scheduled < new Date() ? new Date() : scheduled;
    const dedupeKey = `appointment:${appointment.id}:${appointment.startsAt.toISOString()}:${appointment.remindBeforeHours}:${appointment.createdBy}`;
    await tx.reminder.upsert({
      where: { dedupeKey },
      create: {
        dedupeKey,
        sourceType: 'APPOINTMENT',
        sourceId: appointment.id,
        userId: appointment.createdBy,
        dueAt,
        title: `Cita: ${dog.name}`,
        body: `${appointment.title}. ${appointment.startsAt.toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })} (Costa Rica). ${appointment.location || ''}`,
      },
      update: {},
    });
    await tx.reminder.updateMany({
      where: { dedupeKey, status: 'CANCELLED', sentAt: null },
      data: {
        status: 'PENDING',
        dueAt,
        attempts: 0,
        title: `Cita: ${dog.name}`,
        body: `${appointment.title}. ${appointment.startsAt.toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })} (Costa Rica). ${appointment.location || ''}`,
      },
    });
  }
}
