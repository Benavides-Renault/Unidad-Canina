import { z } from 'zod';
import { civilDate, idSchema, instant, optionalText, requiredText } from './security';
const optionalDate = civilDate.nullable().optional();
export const dogSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/)
      .transform((v) => v.toUpperCase())
      .optional(),
    name: requiredText,
    registeredName: optionalText,
    birthDate: optionalDate,
    birthDateEstimated: z.boolean().optional(),
    sex: z.enum(['MALE', 'FEMALE']),
    breed: requiredText,
    coat: optionalText,
    markings: optionalText,
    microchip: z
      .string()
      .trim()
      .max(60)
      .nullable()
      .optional()
      .transform((v) => v?.replace(/[\s-]+/g, '').toUpperCase() || null),
    pedigreeNumber: z
      .string()
      .trim()
      .max(100)
      .nullable()
      .optional()
      .transform((v) => v?.toUpperCase() || null),
    registry: optionalText,
    owner: optionalText,
    ownerPartyId: idSchema,
    custodianPartyId: idSchema,
    assignedTrainerId: idSchema.nullable().optional(),
    breeder: optionalText,
    intakeDate: optionalDate,
    location: optionalText,
    custodian: optionalText,
    specialties: z.array(requiredText).max(30).optional(),
    administrativeStatus: z.enum(['OWNED', 'LOANED', 'SOLD', 'RETIRED', 'DECEASED']).optional(),
    workStatus: z.enum(['TRAINING', 'OPERATIONAL', 'REST', 'TEMPORARILY_UNFIT']).optional(),
    reproductiveStatus: z.enum(['NONE', 'AVAILABLE', 'PLANNED', 'PREGNANT', 'NURSING', 'RETIRED']).optional(),
    availability: z.enum(['AVAILABLE', 'ASSIGNED', 'RESERVED', 'UNAVAILABLE']).optional(),
    notes: optionalText,
  })
  .strict();
export const vaccinationSchema = z
  .object({
    product: requiredText,
    appliedDate: civilDate,
    nextDueDate: optionalDate,
    manufacturer: optionalText,
    batch: optionalText,
    professional: optionalText,
    notes: optionalText,
  })
  .strict();
export const trainingSchema = z
  .object({
    occurredAt: instant,
    discipline: requiredText,
    objective: requiredText,
    durationMinutes: z.number().int().min(1).max(1440),
    location: optionalText,
    exercises: optionalText,
    material: optionalText,
    difficulty: optionalText,
    successes: z.number().int().min(0).max(100000).nullable().optional(),
    falseAlerts: z.number().int().min(0).max(100000).nullable().optional(),
    misses: z.number().int().min(0).max(100000).nullable().optional(),
    score: z.number().min(0).max(100).nullable().optional(),
    notes: optionalText,
  })
  .strict();
export const appointmentSchema = z
  .object({
    dogId: idSchema,
    title: requiredText,
    startsAt: instant,
    location: optionalText,
    professional: optionalText,
    notes: optionalText,
    remindBeforeHours: z.number().int().min(0).max(720).optional(),
  })
  .strict();
export const appointmentPatchSchema = appointmentSchema
  .omit({ dogId: true })
  .partial()
  .extend({ status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']).optional() })
  .strict();
