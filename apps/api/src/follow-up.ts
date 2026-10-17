import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { z } from 'zod';
import { Allowed, AuthRequest } from './access';
import { Db } from './db';
import { Domain, Tx } from './domain';
import { civilDate, idSchema, optionalText, parse, requiredText } from './security';
import { lock, notFuture, snapshot, reportPdf } from './business-common';

const planSchema = z
  .object({
    title: requiredText,
    discipline: requiredText,
    startDate: civilDate,
    dueDate: civilDate,
    goals: z
      .array(
        z
          .object({
            title: requiredText,
            criterion: z.string().trim().min(1).max(2000),
            targetScore: z.number().int().min(1).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();
const evaluationSchema = z
  .object({
    eventDate: civilDate,
    score: z.number().int().min(0).max(100),
    notes: z.string().trim().min(1).max(2000),
  })
  .strict();
const certificateSchema = z
  .object({
    templateId: idSchema.optional(),
    title: requiredText,
    issuer: requiredText,
    reference: optionalText,
    issueDate: civilDate,
    expiresDate: civilDate.nullable().optional(),
    notes: optionalText,
  })
  .strict();
const goalHistory = {
  orderBy: { position: 'asc' as const },
  include: {
    evaluations: {
      orderBy: [{ eventDate: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'desc' as const }],
      include: { recorder: { select: { name: true } } },
    },
  },
};

// Ownership and trainer assignment are re-read under the same dog lock used by reassignment.
export function dogScope(req: AuthRequest): Prisma.DogWhereInput {
  return {
    archivedAt: null,
    ...(req.user.role === 'CLIENT'
      ? { ownerPartyId: req.user.partyId || '00000000-0000-0000-0000-000000000000' }
      : req.user.role === 'TRAINER'
        ? { assignedTrainerId: req.user.id }
        : {}),
  };
}
@Allowed('ADMIN', 'TRAINER', 'CLIENT')
@Controller('follow-up')
export class FollowUpController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Domain) private domain: Domain,
  ) {}
  async dog(tx: Tx, id: string, req: AuthRequest) {
    parse(idSchema, id);
    await lock(tx, `dog:${id}`);
    const dog = await tx.dog.findFirst({ where: { id, ...dogScope(req) } });
    if (!dog) throw new NotFoundException('Perro no encontrado o fuera de tu acceso.');
    return dog;
  }
  @Get('dogs/:id') async read(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.db.$transaction(async (tx) => {
      await this.dog(tx, id, req);
      const plans = await tx.trainingPlan.findMany({
        where: { dogId: id, archivedAt: null },
        orderBy: { createdAt: 'desc' },
        include: { goals: goalHistory },
      });
      const certificates = await tx.certification.findMany({
        where: { dogId: id, archivedAt: null },
        orderBy: { issueDate: 'desc' },
      });
      return { plans, certificates };
    });
  }
  @Allowed('ADMIN', 'TRAINER')
  @Post('dogs/:id/plans')
  async createPlan(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const { goals, ...data } = parse(planSchema, body);
    if (data.dueDate < data.startDate)
      throw new BadRequestException('El plazo debe ser posterior o igual al inicio.');
    return this.db.$transaction(async (tx) => {
      await this.dog(tx, id, req);
      const plan = await tx.trainingPlan.create({
        data: {
          ...data,
          dogId: id,
          recordedBy: req.user.id,
          goals: { create: goals.map((g, position) => ({ ...g, position })) },
        },
        include: { goals: goalHistory },
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'TrainingPlan',
          plan.id,
          'CREATE',
          `Plan de entrenamiento: ${plan.title}.`,
          id,
        ),
      });
      return plan;
    });
  }
  @Allowed('ADMIN', 'TRAINER')
  @Post('goals/:id/evaluations')
  async evaluate(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    parse(idSchema, id);
    const data = parse(evaluationSchema, body);
    notFuture(data.eventDate);
    return this.db.$transaction(async (tx) => {
      const goal = await tx.trainingGoal.findUnique({ where: { id }, include: { plan: true } });
      if (!goal) throw new NotFoundException('Objetivo no encontrado.');
      await this.dog(tx, goal.plan.dogId, req);
      const plan = await tx.trainingPlan.findUniqueOrThrow({ where: { id: goal.planId } });
      if (plan.archivedAt || plan.status !== 'ACTIVE')
        throw new ConflictException('El plan ya no está activo.');
      if (data.eventDate < plan.startDate)
        throw new BadRequestException('La evaluación no puede ser anterior al inicio del plan.');
      const result = await tx.goalEvaluation.create({
        data: { ...data, goalId: id, recordedBy: req.user.id },
      });
      await tx.trainingPlan.update({ where: { id: plan.id }, data: { revision: { increment: 1 } } });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'GoalEvaluation',
          result.id,
          'CREATE',
          `Evaluación: ${goal.title}; resultado ${data.score}/100.`,
          plan.dogId,
        ),
      });
      return result;
    });
  }
  @Allowed('ADMIN')
  @Patch('plans/:id')
  async updatePlan(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    parse(idSchema, id);
    const data = parse(
      z
        .object({
          revision: z.number().int().positive(),
          status: z.enum(['ACTIVE', 'COMPLETED']),
          dueDate: civilDate.optional(),
        })
        .strict(),
      body,
    );
    return this.db.$transaction(async (tx) => {
      const found = await tx.trainingPlan.findUnique({ where: { id } });
      if (!found) throw new NotFoundException('Plan no encontrado.');
      await this.dog(tx, found.dogId, req);
      const plan = await tx.trainingPlan.findUniqueOrThrow({
        where: { id },
        include: { goals: goalHistory },
      });
      if (plan.archivedAt || plan.revision !== data.revision)
        throw new ConflictException('El plan cambió. Recarga para revisar sus últimas evaluaciones.');
      if (data.dueDate && data.dueDate < plan.startDate)
        throw new BadRequestException('El plazo no puede ser anterior al inicio.');
      if (
        data.status === 'COMPLETED' &&
        plan.goals.some((g) => !g.evaluations[0] || g.evaluations[0].score < g.targetScore)
      )
        throw new BadRequestException('Todos los objetivos deben alcanzar la meta en su última evaluación.');
      const updated = await tx.trainingPlan.update({
        where: { id },
        data: { status: data.status, dueDate: data.dueDate, revision: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'TrainingPlan',
          id,
          'UPDATE',
          `Estado ${data.status}; plazo ${(data.dueDate || plan.dueDate).toISOString().slice(0, 10)}.`,
          plan.dogId,
        ),
      });
      return updated;
    });
  }
  @Allowed('ADMIN')
  @Delete('plans/:id')
  async archivePlan(@Param('id') id: string, @Req() req: AuthRequest) {
    parse(idSchema, id);
    return this.db.$transaction(async (tx) => {
      const plan = await tx.trainingPlan.findUnique({ where: { id } });
      if (!plan) throw new NotFoundException('Plan no encontrado.');
      await this.dog(tx, plan.dogId, req);
      await tx.trainingPlan.update({
        where: { id },
        data: { archivedAt: new Date(), revision: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'TrainingPlan',
          id,
          'ARCHIVE',
          'Plan archivado; conserva objetivos y evaluaciones.',
          plan.dogId,
        ),
      });
      return { ok: true };
    });
  }
  @Allowed('ADMIN', 'TRAINER')
  @Post('dogs/:id/certificates')
  async certificate(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthRequest) {
    const { templateId, ...data } = parse(certificateSchema, body);
    notFuture(data.issueDate);
    if (data.expiresDate && data.expiresDate <= data.issueDate)
      throw new BadRequestException('El vencimiento debe ser posterior a la emisión.');
    return this.db.$transaction(async (tx) => {
      const dog = await this.dog(tx, id, req);
      const template = templateId
        ? await tx.certificateTemplate.findFirst({
            where: {
              id: templateId,
              archivedAt: null,
              kind: req.user.role === 'TRAINER' ? 'TRAINING' : { in: ['TRAINING', 'BREEDING'] },
            },
          })
        : null;
      if (templateId && !template) throw new BadRequestException('Plantilla no disponible.');
      const values: Record<string, string> = {
        nombre: dog.name,
        codigo: dog.code,
        fecha: data.issueDate.toISOString().slice(0, 10),
        referencia: data.reference || '',
        emisor: data.issuer,
      };
      const templateSnapshot = snapshot({
        templateId,
        revision: template?.revision,
        name: dog.name,
        code: dog.code,
        body: template?.body.replace(/\{\{(.*?)\}\}/g, (_, key) => values[key] || '') || data.notes || '',
      });
      const certificate = await tx.certification.create({
        data: { ...data, templateSnapshot, dogId: id, recordedBy: req.user.id },
      });
      if (data.expiresDate) {
        const admins = await tx.user.findMany({
          where: { active: true, role: 'ADMIN' },
          select: { id: true },
        });
        for (const days of [30, 7, 1]) {
          const at = new Date(data.expiresDate.valueOf() + 15 * 3600000 - days * 86400000);
          if (at < new Date() && days !== 1) continue;
          for (const admin of admins)
            await tx.reminder.create({
              data: {
                sourceType: 'CERTIFICATION',
                sourceId: certificate.id,
                userId: admin.id,
                dueAt: at < new Date() ? new Date() : at,
                dedupeKey: `cert:${certificate.id}:${days}:${admin.id}`,
                title: `Certificación: ${dog.name}`,
                body: `${certificate.title}. Vence: ${data.expiresDate.toISOString().slice(0, 10)}.`,
              },
            });
        }
      }
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Certification',
          certificate.id,
          'CREATE',
          `Certificación registrada: ${certificate.title}.`,
          id,
        ),
      });
      return certificate;
    });
  }
  @Allowed('ADMIN')
  @Delete('certificates/:id')
  async archiveCertificate(@Param('id') id: string, @Req() req: AuthRequest) {
    parse(idSchema, id);
    return this.db.$transaction(async (tx) => {
      const c = await tx.certification.findUnique({ where: { id } });
      if (!c) throw new NotFoundException('Certificación no encontrada.');
      await this.dog(tx, c.dogId, req);
      await tx.certification.update({ where: { id }, data: { archivedAt: new Date() } });
      await tx.reminder.updateMany({
        where: {
          sourceType: 'CERTIFICATION',
          sourceId: id,
          status: { in: ['PENDING', 'PROCESSING', 'FAILED'] },
        },
        data: { status: 'CANCELLED' },
      });
      await tx.auditLog.create({
        data: this.domain.audit(
          req,
          'Certification',
          id,
          'ARCHIVE',
          'Certificación archivada y avisos pendientes cancelados.',
          c.dogId,
        ),
      });
      return { ok: true };
    });
  }
  @Get('certificates/:id/report.pdf') async certificatePdf(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    parse(idSchema, id);
    const item = await this.db.certification.findFirst({
      where: { id, archivedAt: null, dog: dogScope(req) },
      include: { dog: { select: { name: true, code: true } } },
    });
    if (!item) throw new NotFoundException('Certificado fuera de tu acceso.');
    const saved = item.templateSnapshot as { name?: string; code?: string; body?: string } | null;
    await this.db.auditLog.create({
      data: this.domain.audit(req, 'Certification', id, 'EXPORT', 'Certificado interno PDF.', item.dogId),
    });
    reportPdf(
      res,
      item.title,
      [
        `Perro: ${saved?.name || item.dog.name} · ${saved?.code || item.dog.code}`,
        `Emisor registrado: ${item.issuer}`,
        `Referencia: ${item.reference || id}`,
        `Emisión: ${item.issueDate.toISOString().slice(0, 10)}`,
        `Vigencia: ${item.expiresDate?.toISOString().slice(0, 10) || 'Sin vencimiento registrado'}`,
        saved?.body || item.notes || '',
        'VALKYR · Unidad Canina · Registro de formación y seguimiento',
      ],
      `certificado-${id}.pdf`,
    );
  }
}
