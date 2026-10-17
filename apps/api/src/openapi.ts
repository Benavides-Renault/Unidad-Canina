import { OpenAPIObject, SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';
import { profileSchema, breedingEventSchema, planSchema, litterSchema, puppySchema } from './breeding';
import { accountSchema, paymentSchema, reservationSchema } from './finance';
import { productSchema, lotSchema, stockSchema } from './inventory';
import { partySchema, publicationSchema, medicalSchema } from './portals';
import {
  assignmentSchema,
  contactSchema,
  contractSchema,
  institutionSchema,
  serviceSchema,
} from './contracts';
import {
  dogSchema,
  appointmentSchema,
  appointmentPatchSchema,
  trainingSchema,
  vaccinationSchema,
} from './schemas';
import {
  civilDate,
  emailSchema,
  usernameSchema,
  instant,
  optionalText,
  passwordSchema,
  requiredText,
  roles,
} from './security';

/** Zod input schemas keep generated API documentation aligned with server validation. */
export function describeApi(document: OpenAPIObject) {
  const bodies: Record<string, z.ZodType> = {
    'patch /breeding/dogs/{id}': profileSchema,
    'post /breeding/dogs/{id}/events': breedingEventSchema,
    'post /breeding/plans': planSchema,
    'patch /breeding/plans/{id}': planSchema
      .omit({ damId: true, sireId: true })
      .partial()
      .extend({ expectedRevision: z.number().int().positive() }),
    'post /breeding/litters': litterSchema,
    'post /breeding/litters/{id}/puppies': puppySchema,
    'post /finance/accounts': accountSchema,
    'post /finance/accounts/{id}/payments': paymentSchema,
    'post /finance/accounts/{id}/cancel': z.object({ reason: requiredText }),
    'post /reservations': reservationSchema,
    'post /reservations/{id}/allocate': z.object({ dogId: z.string().uuid() }),
    'post /reservations/{id}/close': z.object({
      customerPartyId: z.string().uuid().optional(),
      status: z.enum(['DELIVERED', 'CANCELLED', 'EXPIRED']),
      closedDate: civilDate,
      reason: requiredText,
    }),
    'post /inventory/products': productSchema,
    'post /inventory/products/{id}/lots': lotSchema,
    'post /inventory/lots/{id}/movements': stockSchema,
    'post /institutions': institutionSchema,
    'patch /institutions/{id}': institutionSchema.partial(),
    'post /institutions/{id}/contacts': contactSchema,
    'post /contracts': contractSchema,
    'patch /contracts/{id}': contractSchema
      .omit({ institutionId: true })
      .partial()
      .extend({ expectedRevision: z.number().int().positive() }),
    'post /contracts/{id}/assignments': assignmentSchema,
    'post /contracts/{id}/assignments/{assignmentId}/release': z.object({
      releasedOn: civilDate,
      reason: requiredText,
    }),
    'post /operations/services': serviceSchema,
    'post /auth/login': z.object({
      username: usernameSchema,
      password: z.string(),
      totp: z.string().length(6).optional(),
    }),
    'post /auth/forgot-password': z.object({ username: usernameSchema }),
    'post /auth/reset-password': z.object({ token: z.string(), password: passwordSchema }),
    'post /auth/mfa/enable': z.object({ code: z.string().length(6) }),
    'post /auth/mfa/disable': z.object({ code: z.string().length(6), password: z.string() }),
    'post /dogs': dogSchema,
    'post /parties': partySchema,
    'patch /parties/{id}': partySchema.partial(),
    'patch /catalog/dogs/{id}': publicationSchema,
    'post /trainer/dogs/{id}/training': trainingSchema,
    'post /trainer/dogs/{id}/medical': medicalSchema,
    'patch /trainer/medical/{id}': medicalSchema,
    'post /trainer/dogs/{id}/vaccinations': vaccinationSchema,
    'post /trainer/dogs/{id}/weights': z.object({ date: civilDate, kg: z.number().positive().max(200) }),
    'patch /dogs/{id}': dogSchema.partial(),
    'post /dogs/{id}/vaccinations': vaccinationSchema,
    'patch /vaccinations/{id}': vaccinationSchema.partial(),
    'post /dogs/{id}/training': trainingSchema,
    'post /dogs/{id}/weights': z.object({ date: civilDate, kg: z.number().min(0.01).max(200) }),
    'post /dogs/{id}/movements': z.object({
      date: instant,
      location: requiredText,
      custodianPartyId: z.string().uuid(),
      notes: optionalText,
    }),
    'post /appointments': appointmentSchema,
    'patch /appointments/{id}': appointmentPatchSchema,
    'post /users': z.object({
      name: requiredText,
      username: usernameSchema,
      email: emailSchema.nullable().optional(),
      password: passwordSchema,
      role: z.enum(roles),
      partyId: z.string().uuid().nullable().optional(),
      partyName: optionalText,
      partyKind: z.enum(['PERSON', 'MUNICIPALITY', 'ORGANIZATION']).optional(),
    }),
    'patch /users/{id}': z.object({
      name: requiredText.optional(),
      username: usernameSchema.optional(),
      email: emailSchema.nullable().optional(),
      password: passwordSchema.optional(),
      role: z.enum(roles).optional(),
      active: z.boolean().optional(),
      partyId: z.string().uuid().nullable().optional(),
    }),
  };
  document.components ||= {};
  document.components.securitySchemes ||= {};
  document.components.securitySchemes.csrf = {
    type: 'apiKey',
    in: 'header',
    name: 'x-csrf-token',
    description: 'Valor de la cookie legible oryx_csrf; obligatorio en escrituras autenticadas.',
  };
  for (const [route, item] of Object.entries(document.paths)) {
    for (const method of ['get', 'post', 'patch', 'delete'] as const) {
      const operation = item?.[method];
      if (!operation) continue;
      const suffix = route.replace('/api/v1', '');
      const isPublic = ['/health', '/auth/login', '/auth/forgot-password', '/auth/reset-password'].includes(
        suffix,
      );
      if (!isPublic) operation.security = [{ cookie: [], ...(method === 'get' ? {} : { csrf: [] }) }];
      const schema = bodies[`${method} ${suffix}`];
      if (schema) {
        const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
        delete json.$schema;
        operation.requestBody = {
          required: true,
          content: { 'application/json': { schema: json as SchemaObject } },
        };
      }
      if (
        method === 'post' &&
        [
          '/dogs/{id}/documents',
          '/trainer/dogs/{id}/documents',
          '/contracts/{id}/files',
          '/finance/accounts/{id}/files',
        ].includes(suffix)
      )
        operation.requestBody = {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: suffix === '/dogs/{id}/documents' ? ['file', 'category'] : ['file'],
                properties: {
                  file: { type: 'string', format: 'binary', description: 'PDF/JPEG/PNG; máximo 10 MiB.' },
                  ...(suffix === '/dogs/{id}/documents'
                    ? { category: { type: 'string' as const, enum: ['PHOTO', 'DOCUMENT', 'CLINICAL'] } }
                    : {}),
                },
              },
            },
          },
        };
      if (
        method === 'get' &&
        [
          '/dogs',
          '/portal/dogs',
          '/trainer/dogs',
          '/portal/gallery/dogs',
          '/portal/gallery/crosses',
          '/training',
          '/appointments',
          '/notifications',
          '/audit',
          '/users',
          '/contracts',
          '/institutions',
          '/operations/assignments',
          '/operations/services',
          '/breeding/dogs',
          '/breeding/plans',
          '/breeding/litters',
          '/reservations',
          '/finance/accounts',
          '/inventory/products',
          '/inventory/movements',
        ].includes(suffix)
      ) {
        operation.parameters ||= [];
        operation.parameters.push(
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        );
        operation.responses['200'] = {
          description: 'Listado paginado.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: { type: 'array', items: { type: 'object' } },
                  total: { type: 'integer' },
                  page: { type: 'integer' },
                  pageSize: { type: 'integer' },
                },
              },
            },
          },
        };
      }
      for (const [code, description] of Object.entries({
        400: 'Datos inválidos.',
        401: 'Sesión no válida.',
        403: 'Permisos insuficientes o CSRF inválido.',
        404: 'Registro no encontrado.',
        409: 'Conflicto de unicidad o edición concurrente.',
        429: 'Límite de intentos alcanzado.',
      }))
        operation.responses[code] = {
          description,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
                },
              },
            },
          },
        };
    }
  }
  return document;
}
