export const API = '/api/v1';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const multipart = body instanceof FormData;
  if (body && !multipart) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    const csrf = document.cookie
      .split('; ')
      .find((item) => item.startsWith('oryx_csrf='))
      ?.slice('oryx_csrf='.length);
    if (csrf) headers['x-csrf-token'] = decodeURIComponent(csrf);
  }
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: options.signal,
      body: body ? (multipart ? (body as FormData) : JSON.stringify(body)) : undefined,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError('No se pudo conectar con el servidor. Comprueba tu conexión a la red autorizada.', 0);
  }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const message = result.message;
    const fallback =
      response.status === 403
        ? 'Tu rol no tiene permiso para esta acción.'
        : response.status === 401
          ? 'La sesión no es válida. Inicia sesión nuevamente.'
          : response.status === 409
            ? 'Ya existe un registro con estos datos. Revisa el código y el microchip.'
            : response.status >= 500
              ? 'El servidor no está disponible. Vuelve a intentarlo en unos momentos.'
              : 'No se pudo completar la acción. Revisa los datos.';
    throw new ApiError(
      Array.isArray(message) ? message.join(' · ') : typeof message === 'string' ? message : fallback,
      response.status,
    );
  }
  if (response.status === 204 || response.headers.get('content-length') === '0') return undefined as T;
  return response.json().catch(() => undefined) as Promise<T>;
}

const dateFormatter = new Intl.DateTimeFormat('es-CR', {
  dateStyle: 'medium',
  timeZone: 'America/Costa_Rica',
});
const dateTimeFormatter = new Intl.DateTimeFormat('es-CR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Costa_Rica',
});
export const formatDate = (value?: string | null, withTime = false) => {
  if (!value) return 'Sin registrar';
  const civil = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(civil ? `${value}T12:00:00-06:00` : value);
  if (Number.isNaN(date.getTime())) return 'Fecha no válida';
  return (withTime ? dateTimeFormatter : dateFormatter).format(date);
};
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export const localInstant = (value: string) =>
  new Date(`${value}${value.length === 16 ? ':00' : ''}-06:00`).toISOString();
export const localNow = () => new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 19);
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Ocurrió un error inesperado.';

export type Role = 'ADMIN' | 'TRAINER' | 'CLIENT';
export type User = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: Role;
  active?: boolean;
  mfaEnabled?: boolean;
  mfaRequired?: boolean;
  passwordMinLength?: number;
  partyId?: string | null;
};
export type PageData<T> = { items: T[]; total: number; page: number; pageSize: number };
export type Vaccination = {
  id: string;
  product: string;
  appliedDate: string;
  nextDueDate?: string;
  manufacturer?: string;
  batch?: string;
  professional?: string;
  notes?: string;
  dog?: Dog;
};
export type Training = {
  id: string;
  occurredAt: string;
  discipline: string;
  objective: string;
  durationMinutes: number;
  location?: string;
  exercises?: string;
  material?: string;
  difficulty?: string;
  successes?: number;
  falseAlerts?: number;
  misses?: number;
  score?: number;
  notes?: string;
  trainer?: User;
  trainerName?: string;
  dog?: Dog;
};
export type Appointment = {
  id: string;
  dogId: string;
  title: string;
  startsAt: string;
  location?: string;
  professional?: string;
  notes?: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  dog?: Dog;
};
export type DocumentRecord = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  category: string;
  createdAt: string;
};
export type Movement = { id: string; date: string; location: string; custodian?: string; notes?: string };
export type Weight = { id: string; date: string; kg: number };
export type Dog = {
  id: string;
  code: string;
  name: string;
  registeredName?: string;
  birthDate?: string;
  birthDateEstimated?: boolean;
  sex: string;
  breed: string;
  coat?: string;
  markings?: string;
  microchip?: string;
  pedigreeNumber?: string;
  registry?: string;
  owner?: string;
  ownerPartyId: string;
  custodianPartyId: string;
  assignedTrainerId?: string | null;
  commercialCategory?: string;
  availableForSale?: boolean;
  availableForBreeding?: boolean;
  salePublished?: boolean;
  salePrice?: string;
  saleCurrency?: string;
  saleContact?: string;
  publicDescription?: string;
  achievements?: string;
  trainingSummary?: string;
  functionalities?: string;
  healthSummary?: string;
  pedigreeSummary?: string;
  breeder?: string;
  intakeDate?: string;
  location?: string;
  custodian?: string;
  specialties?: string[];
  administrativeStatus: string;
  workStatus: string;
  reproductiveStatus: string;
  availability: string;
  notes?: string;
  photoId?: string;
  createdAt?: string;
  updatedAt?: string;
  vaccinations?: Vaccination[];
  trainingSessions?: Training[];
  appointments?: Appointment[];
  documents?: DocumentRecord[];
  movements?: Movement[];
  weights?: Weight[];
};
export type Notification = { id: string; title: string; body: string; readAt?: string; createdAt: string };
export type DashboardData = {
  totalDogs: number;
  operationalDogs: number;
  trainingDogs: number;
  availableDogs: number;
  upcomingVaccinations: Vaccination[];
  upcomingAppointments: Appointment[];
  recentTraining: Training[];
  trainingCount: number;
};
export const labels: Record<string, string> = {
  MATED: 'Monta registrada',
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmado',
  DELIVERED: 'Entregado',
  EXPIRED: 'Vencido',
  PAYABLE: 'Por pagar',
  RECEIVABLE: 'Por cobrar',
  PAID: 'Pagada',
  PARTIAL: 'Abonada',
  OVERDUE: 'Morosa',
  PAYMENT: 'Abono',
  REFUND: 'Devolución',
  IN: 'Entrada',
  OUT: 'Consumo',
  DISPOSAL: 'Baja',
  LOW_STOCK: 'Bajo mínimo',
  HEAT: 'Celo',
  CHECK: 'Control veterinario',
  HISTORY: 'Antecedente',
  DRAFT: 'Borrador',
  ACTIVE: 'Activo',
  CLIENT: 'Cliente',
  ADMIN: 'Administración',
  TRAINER: 'Entrenador',
  UNIT: 'ORYX K9',
  PERSON: 'Persona',
  MUNICIPALITY: 'Municipalidad',
  ORGANIZATION: 'Organización',
  NOT_LISTED: 'Uso interno',
  FOR_SALE: 'Disponible para venta',
  FOR_BREEDING: 'Disponible para cruza',
  OBSERVATION: 'Observación médica',
  CONSULTATION: 'Consulta',
  TREATMENT: 'Tratamiento registrado',
  DEWORMING: 'Desparasitación',
  ALLERGY: 'Alergia',
  INJURY: 'Lesión',
  SURGERY: 'Cirugía',
  LAB: 'Laboratorio',
  SUSPECTED: 'Sospecha registrada',
  RESOLVED: 'Resuelto',
  MALE: 'Macho',
  FEMALE: 'Hembra',
  OWNED: 'Propio',
  LOANED: 'En préstamo',
  SOLD: 'Vendido',
  RETIRED: 'Retirado',
  DECEASED: 'Fallecido',
  TRAINING: 'En formación',
  OPERATIONAL: 'Operativo',
  REST: 'Descanso',
  TEMPORARILY_UNFIT: 'Baja temporal',
  NONE: 'No aplica',
  AVAILABLE: 'Disponible',
  PLANNED: 'Planificado',
  PREGNANT: 'Gestante',
  NURSING: 'Lactancia',
  ASSIGNED: 'Asignado',
  RESERVED: 'Reservado',
  UNAVAILABLE: 'No disponible',
  SCHEDULED: 'Programada',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  PHOTO: 'Fotografía',
  DOCUMENT: 'Documento',
  CLINICAL: 'Archivo clínico',
};
export const canManageDogs = (role: Role) => role === 'ADMIN';
export const canHealth = (role: Role) => role === 'ADMIN';
export const canAppointments = (role: Role) => role === 'ADMIN';
