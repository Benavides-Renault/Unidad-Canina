import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ECDH } from 'node:crypto';
import { PrismaClient, PushDelivery } from '@prisma/client';
import webpush from 'web-push';
import { z } from 'zod';
import { AuthRequest } from './access';
import { Db } from './db';
import { parse } from './security';
import { lock } from './business-common';

export const pushConfigured = () =>
  Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
export function validatePushEndpoint(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException('Endpoint push inválido.');
  }
  const allowed = [
    'fcm.googleapis.com',
    'android.googleapis.com',
    'web.push.apple.com',
    'updates.push.services.mozilla.com',
    'push.services.mozilla.com',
    'wns.windows.com',
  ];
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !allowed.some(
      (host) =>
        url.hostname === host ||
        (['push.services.mozilla.com', 'wns.windows.com'].includes(host) &&
          url.hostname.endsWith(`.${host}`)),
    )
  )
    throw new BadRequestException('Proveedor push no admitido.');
  return url.toString();
}
const subscriptionSchema = z
  .object({
    endpoint: z.string().max(2048),
    expirationTime: z.number().nullable().optional(),
    keys: z
      .object({
        p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
        auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
      })
      .strict(),
  })
  .strict();
@Controller('push')
export class PushController {
  constructor(@Inject(Db) private db: Db) {}
  @Get('config') config() {
    return {
      configured: pushConfigured(),
      publicKey: pushConfigured() ? process.env.VAPID_PUBLIC_KEY : null,
    };
  }
  @Get('subscriptions') async list(@Req() req: AuthRequest) {
    return this.db.pushSubscription.findMany({
      where: { userId: req.user.id, active: true },
      select: { id: true, createdAt: true },
    });
  }
  @Post('subscriptions') async subscribe(@Body() body: unknown, @Req() req: AuthRequest) {
    if (!pushConfigured())
      throw new ServiceUnavailableException('Web Push aún no está configurado en esta instalación.');
    const data = parse(subscriptionSchema, body),
      endpoint = validatePushEndpoint(data.endpoint);
    try {
      ECDH.convertKey(Buffer.from(data.keys.p256dh, 'base64url'), 'prime256v1');
    } catch {
      throw new BadRequestException('Clave de dispositivo inválida.');
    }
    return this.db.$transaction(async (tx) => {
      await lock(tx, `push:${endpoint}`);
      const old = await tx.pushSubscription.findUnique({ where: { endpoint } });
      if (old && old.active && old.userId !== req.user.id)
        throw new ConflictException(
          'Este navegador está vinculado a otra cuenta. Desactiva sus notificaciones antes de cambiar de usuario.',
        );
      const item = await tx.pushSubscription.upsert({
        where: { endpoint },
        create: { userId: req.user.id, endpoint, p256dh: data.keys.p256dh, auth: data.keys.auth },
        update: { userId: req.user.id, p256dh: data.keys.p256dh, auth: data.keys.auth, active: true },
        select: { id: true },
      });
      await tx.userPreference.upsert({
        where: { userId: req.user.id },
        create: { userId: req.user.id, pushEnabled: true },
        update: { pushEnabled: true },
      });
      return item;
    });
  }
  @Post('unsubscribe') async unsubscribe(@Body() body: unknown, @Req() req: AuthRequest) {
    const { endpoint } = parse(z.object({ endpoint: z.string().max(2048) }).strict(), body);
    await this.db.pushSubscription.updateMany({
      where: { endpoint, userId: req.user.id },
      data: { active: false },
    });
    return { success: true };
  }
  @Get('deliveries') async history(@Req() req: AuthRequest) {
    return this.db.pushDelivery.findMany({
      where: { notification: { userId: req.user.id } },
      select: { id: true, status: true, attempts: true, nextAttempt: true, sentAt: true, lastError: true },
      orderBy: { nextAttempt: 'desc' },
      take: 100,
    });
  }
}
type SendPush = (
  subscription: webpush.PushSubscription,
  payload: string,
  options: webpush.RequestOptions,
) => Promise<unknown>;
export async function processPush(db: PrismaClient, send: SendPush = webpush.sendNotification) {
  if (!pushConfigured()) return { claimed: 0, sent: 0 };
  await db.pushDelivery.updateMany({
    where: { status: 'PROCESSING', lockedAt: { lt: new Date(Date.now() - 300000) } },
    data: { status: 'PENDING', lockedAt: null },
  });
  const jobs = await db.$queryRaw<
    PushDelivery[]
  >`UPDATE "PushDelivery" SET status='PROCESSING',"lockedAt"=NOW(),attempts=attempts+1 WHERE id IN (SELECT id FROM "PushDelivery" WHERE status='PENDING' AND "nextAttempt"<=NOW() ORDER BY "nextAttempt" FOR UPDATE SKIP LOCKED LIMIT 25) RETURNING *`;
  let sent = 0;
  for (const job of jobs) {
    const item = await db.pushDelivery.findUniqueOrThrow({
      where: { id: job.id },
      include: {
        subscription: { include: { user: { include: { preferences: true } } } },
        notification: { include: { reminder: true } },
      },
    });
    const sub = item.subscription;
    if (
      !sub.active ||
      !sub.user.active ||
      sub.user.role !== 'ADMIN' ||
      !sub.user.preferences?.pushEnabled ||
      item.notification.userId !== sub.userId ||
      item.notification.reminder.status === 'CANCELLED'
    ) {
      await db.pushDelivery.update({ where: { id: job.id }, data: { status: 'CANCELLED', lockedAt: null } });
      continue;
    }
    try {
      validatePushEndpoint(sub.endpoint);
      await send(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({
          title: 'VALKYR · Aviso pendiente',
          body: 'Abre la aplicación para consultar tus notificaciones.',
          tag: job.notificationId,
        }),
        {
          vapidDetails: {
            subject: process.env.VAPID_SUBJECT!,
            publicKey: process.env.VAPID_PUBLIC_KEY!,
            privateKey: process.env.VAPID_PRIVATE_KEY!,
          },
          TTL: 3600,
          timeout: 10000,
          topic: job.notificationId.replaceAll('-', '').slice(0, 32),
        },
      );
      await db.pushDelivery.update({
        where: { id: job.id },
        data: { status: 'SENT', sentAt: new Date(), lockedAt: null, lastError: null },
      });
      sent++;
    } catch (error) {
      const gone = [404, 410].includes(Number((error as { statusCode?: number }).statusCode));
      if (gone) await db.pushSubscription.update({ where: { id: sub.id }, data: { active: false } });
      await db.pushDelivery.update({
        where: { id: job.id },
        data: {
          status: gone ? 'CANCELLED' : job.attempts >= 5 ? 'FAILED' : 'PENDING',
          lockedAt: null,
          nextAttempt: new Date(Date.now() + Math.min(60, 2 ** job.attempts) * 60000),
          lastError: gone
            ? 'El navegador invalidó la suscripción.'
            : 'Error de entrega push; se reintenta hasta cinco veces.',
        },
      });
    }
  }
  return { claimed: jobs.length, sent };
}
