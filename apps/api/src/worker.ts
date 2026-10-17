import 'dotenv/config';
import { PrismaClient, Reminder } from '@prisma/client';
import { createDb } from './db';
import { CLINICAL, READ_DOGS } from './security';
import { mailConfigured, sendMail } from './mail';
import { BUSINESS } from './business-common';
import { accountBalance } from './finance';
import { processPush } from './push';

export async function processReminders(
  db: PrismaClient,
  batchSize = 25,
  sendPush?: Parameters<typeof processPush>[1],
) {
  const batch = Math.max(1, Math.min(100, Math.trunc(batchSize)));
  await db.reminder.updateMany({
    where: { status: 'PROCESSING', lockedAt: { lt: new Date(Date.now() - 5 * 60000) } },
    data: { status: 'PENDING', lockedAt: null },
  });
  const jobs = await db.$queryRaw<Reminder[]>`
    UPDATE "Reminder" SET status = 'PROCESSING', "lockedAt" = NOW(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM "Reminder" WHERE status = 'PENDING' AND "dueAt" <= NOW()
      ORDER BY "dueAt" ASC FOR UPDATE SKIP LOCKED LIMIT ${batch}
    ) RETURNING *`;
  let sent = 0;
  for (const job of jobs) {
    try {
      const user = await db.user.findUnique({ where: { id: job.userId }, include: { preferences: true } });
      const source =
        job.sourceType === 'VACCINATION'
          ? await db.vaccination.findFirst({ where: { id: job.sourceId, dog: { archivedAt: null } } })
          : job.sourceType === 'CONTRACT'
            ? await db.contract.findFirst({ where: { id: job.sourceId, status: 'ACTIVE' } })
            : job.sourceType === 'ACCOUNT'
              ? await db.account
                  .findFirst({ where: { id: job.sourceId, cancelledAt: null }, include: { payments: true } })
                  .then((a) => (a && accountBalance(a).balance.gt(0) ? a : null))
              : job.sourceType === 'RESERVATION'
                ? await db.reservation.findFirst({ where: { id: job.sourceId, status: 'ACTIVE' } })
                : job.sourceType === 'APPOINTMENT'
                  ? await db.appointment.findFirst({
                      where: { id: job.sourceId, status: 'SCHEDULED', dog: { archivedAt: null } },
                    })
                  : job.sourceType === 'CERTIFICATION'
                    ? await db.certification.findFirst({
                        where: { id: job.sourceId, archivedAt: null, dog: { archivedAt: null } },
                      })
                    : null;
      if (
        !user?.active ||
        !source ||
        !(
          job.sourceType === 'VACCINATION'
            ? CLINICAL
            : ['CONTRACT', 'ACCOUNT', 'RESERVATION'].includes(job.sourceType)
              ? BUSINESS
              : READ_DOGS
        ).includes(user.role)
      ) {
        await db.reminder.updateMany({
          where: { id: job.id, status: 'PROCESSING' },
          data: { status: 'CANCELLED', lockedAt: null },
        });
        continue;
      }
      const current = await db.reminder.findUnique({ where: { id: job.id } });
      if (current?.status !== 'PROCESSING') continue;
      const notification = await db.notification.upsert({
        where: { reminderId: job.id },
        create: { reminderId: job.id, userId: job.userId, title: job.title, body: job.body },
        update: {},
      });
      if (user.preferences?.pushEnabled) {
        const subscriptions = await db.pushSubscription.findMany({
          where: { userId: user.id, active: true },
          select: { id: true },
        });
        await db.pushDelivery.createMany({
          data: subscriptions.map((s) => ({ subscriptionId: s.id, notificationId: notification.id })),
          skipDuplicates: true,
        });
      }
      if (user.email && user.preferences?.emailEnabled !== false && mailConfigured() && !job.emailSentAt) {
        await sendMail(user.email, `VALKYR · ${job.title}`, job.body, job.id);
        await db.reminder.update({ where: { id: job.id }, data: { emailSentAt: new Date() } });
      }
      await db.reminder.updateMany({
        where: { id: job.id, status: 'PROCESSING' },
        data: { status: 'SENT', sentAt: new Date(), lastError: null, lockedAt: null },
      });
      sent++;
    } catch {
      const failed = job.attempts >= 5;
      await db.reminder.updateMany({
        where: { id: job.id, status: 'PROCESSING' },
        data: {
          status: failed ? 'FAILED' : 'PENDING',
          dueAt: new Date(Date.now() + Math.min(60, 2 ** job.attempts) * 60000),
          lockedAt: null,
          lastError: 'Error de entrega; revisar SMTP o conexión de base de datos.',
        },
      });
    }
  }
  await processPush(db, sendPush);
  await db.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.serviceHeartbeat.upsert({
    where: { name: 'reminder-worker' },
    create: { name: 'reminder-worker', pulsedAt: new Date() },
    update: { pulsedAt: new Date() },
  });
  return { claimed: jobs.length, sent };
}
async function main() {
  const db = createDb();
  let stopping = false;
  process.on('SIGTERM', () => {
    stopping = true;
  });
  process.on('SIGINT', () => {
    stopping = true;
  });
  try {
    do {
      const result = await processReminders(db);
      if (result.claimed || process.argv.includes('--once'))
        console.log(`Recordatorios: ${result.claimed} procesados, ${result.sent} enviados.`);
      if (process.argv.includes('--once') || stopping) break;
      await new Promise((resolve) => setTimeout(resolve, Number(process.env.WORKER_POLL_MS || 15000)));
    } while (!stopping);
  } finally {
    await db.$disconnect();
  }
}
if (require.main === module)
  main().catch((error: unknown) => {
    console.error('El trabajador falló:', error instanceof Error ? error.name : 'Error');
    process.exitCode = 1;
  });
