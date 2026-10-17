import { BreedingPlan } from '@prisma/client';
import { Tx } from './domain';

export async function breedingReminders(tx: Tx, plan: BreedingPlan) {
  await tx.reminder.updateMany({
    where: { sourceType: 'BREEDING', sourceId: plan.id, status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } },
    data: { status: 'CANCELLED' },
  });
  if (plan.status === 'CANCELLED') return;
  const recipients = await tx.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } });
  const milestones = [
    {
      key: 'cross',
      date: plan.status === 'PLANNED' ? plan.plannedDate : null,
      title: 'Cruce previsto',
      body: 'Confirma la fecha del cruce y actualiza su seguimiento en Crianza.',
    },
    {
      key: 'birth',
      date: plan.status !== 'COMPLETED' ? plan.expectedBirthDate : null,
      title: 'Nacimiento previsto',
      body: 'Confirma si nació la camada. Registra la fecha real y los cachorros en Crianza.',
    },
    {
      key: 'delivery',
      date: plan.expectedDeliveryDate,
      title: 'Entrega prevista de camada',
      body: 'Revisa las condiciones acordadas y actualiza la entrega de los cachorros.',
    },
  ];
  for (const milestone of milestones) {
    if (!milestone.date) continue;
    const scheduled = new Date(milestone.date.valueOf() + 15 * 3600000);
    for (const user of recipients) {
      const dedupeKey = `breeding:${plan.id}:${milestone.key}:${milestone.date.toISOString()}:${user.id}`;
      const data = {
        sourceType: 'BREEDING',
        sourceId: plan.id,
        userId: user.id,
        title: milestone.title,
        body: `${milestone.body} Fecha: ${milestone.date.toISOString().slice(0, 10)}.`,
        dueAt: scheduled < new Date() ? new Date() : scheduled,
      };
      await tx.reminder.upsert({ where: { dedupeKey }, create: { ...data, dedupeKey }, update: {} });
      await tx.reminder.updateMany({
        where: { dedupeKey, status: 'CANCELLED', sentAt: null },
        data: { ...data, status: 'PENDING', attempts: 0, lockedAt: null },
      });
    }
  }
}
