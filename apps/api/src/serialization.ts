import { Prisma } from '@prisma/client';

export function serializeDates(value: unknown, key = ''): unknown {
  if (value instanceof Prisma.Decimal) return value.toString();
  if (value instanceof Date)
    return [
      'birthDate',
      'intakeDate',
      'appliedDate',
      'nextDueDate',
      'startDate',
      'endDate',
      'releasedOn',
      'plannedDate',
      'matingDate',
      'expectedBirthDate',
      'expectedDeliveryDate',
      'windowStart',
      'windowEnd',
      'eventDate',
      'reservedDate',
      'expiresDate',
      'closedDate',
      'dueDate',
      'issueDate',
      'paidDate',
      'exchangeDate',
      'movementDate',
    ].includes(key)
      ? value.toISOString().slice(0, 10)
      : value.toISOString();
  if (Array.isArray(value)) return value.map((item) => serializeDates(item));
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    // Only JSON records are DTOs. Responses, buffers and streams can contain cycles.
    if (prototype !== Object.prototype && prototype !== null) return value;
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [
        name,
        name === 'date' && 'kg' in value && item instanceof Date
          ? item.toISOString().slice(0, 10)
          : serializeDates(item, name),
      ]),
    );
  }
  return value;
}
