'use client';
import { trainingDisciplines } from '@/lib/training-catalog';
import { FollowUp } from './follow-up';
import { RecordEvidence } from './records';
import { useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Dog as DogIcon,
  Download,
  FileText,
  GraduationCap,
  HeartPulse,
  MapPin,
  Pencil,
  Search,
  ShieldCheck,
  Syringe,
  Trash2,
  Upload,
  Weight as WeightIcon,
} from 'lucide-react';
import {
  API,
  api,
  canAppointments,
  canHealth,
  canManageDogs,
  errorMessage,
  formatDate,
  labels,
  localInstant,
  localNow,
  today,
  type Dog,
  type PageData,
  type Training,
  type User,
  type Vaccination,
} from '@/lib/api';
import { useResource } from '@/lib/use-resource';
import {
  AddButton,
  Badge,
  Button,
  DataForm,
  Empty,
  ErrorBox,
  Loading,
  Modal,
  PageHeading,
  Panel,
  type FieldDef,
} from './ui';

export const dogFields = (dog?: Dog, breeds: string[] = []): FieldDef[] => [
  { name: 'name', label: 'Nombre de llamado', required: true, defaultValue: dog?.name },
  {
    name: 'code',
    label: 'Código ORYX K9',
    required: !!dog,
    defaultValue: dog?.code,
    hint: 'Se genera automáticamente si lo dejas vacío.',
  },
  { name: 'registeredName', label: 'Nombre registrado', defaultValue: dog?.registeredName },
  {
    name: 'breed',
    label: 'Raza',
    type: 'combobox',
    options: breeds,
    required: true,
    defaultValue: dog?.breed,
    hint: 'Busca una raza del catálogo o escribe una variedad o cruce. El catálogo se administra en Configuración.',
  },
  {
    name: 'sex',
    label: 'Sexo',
    type: 'select',
    required: true,
    options: ['MALE', 'FEMALE'],
    defaultValue: dog?.sex || 'MALE',
  },
  {
    name: 'birthDate',
    label: 'Fecha de nacimiento',
    type: 'date',
    max: today(),
    defaultValue: dog?.birthDate?.slice(0, 10),
  },
  {
    name: 'birthDateEstimated',
    label: 'La fecha de nacimiento es estimada',
    type: 'checkbox',
    defaultValue: dog?.birthDateEstimated,
    full: true,
  },
  { name: 'coat', label: 'Color / capa', defaultValue: dog?.coat },
  { name: 'markings', label: 'Señas particulares', defaultValue: dog?.markings },
  {
    name: 'microchip',
    label: 'Microchip',
    defaultValue: dog?.microchip,
    hint: 'Identificador único. Déjalo vacío si no tiene.',
  },
  { name: 'pedigreeNumber', label: 'Número de pedigrí', defaultValue: dog?.pedigreeNumber },
  { name: 'registry', label: 'Registro / asociación', defaultValue: dog?.registry },
  { name: 'breeder', label: 'Criador / origen', defaultValue: dog?.breeder },
  {
    name: 'intakeDate',
    label: 'Fecha de ingreso',
    type: 'date',
    defaultValue: dog?.intakeDate?.slice(0, 10) || today(),
  },
  ...(!dog ? [{ name: 'location', label: 'Ubicación actual' }] : []),
  {
    name: 'specialties',
    label: 'Especialidades',
    type: 'multiselect',
    options: [...new Set([...trainingDisciplines, ...(dog?.specialties || [])])],
    defaultValue: dog?.specialties || [],
    hint: 'Puedes seleccionar varias especialidades. No cambia la disponibilidad para venta o cruza.',
    full: true,
  },
  {
    name: 'administrativeStatus',
    label: 'Situación administrativa',
    type: 'select',
    required: true,
    options: ['OWNED', 'LOANED', 'SOLD', 'RETIRED', 'DECEASED'],
    defaultValue: dog?.administrativeStatus || 'OWNED',
  },
  {
    name: 'workStatus',
    label: 'Fase de trabajo',
    type: 'select',
    required: true,
    options: ['TRAINING', 'OPERATIONAL', 'REST', 'TEMPORARILY_UNFIT'],
    defaultValue: dog?.workStatus || 'TRAINING',
  },
  {
    name: 'reproductiveStatus',
    label: 'Estado reproductivo',
    type: 'select',
    required: true,
    options: ['NONE', 'AVAILABLE', 'PLANNED', 'PREGNANT', 'NURSING', 'RETIRED'],
    defaultValue: dog?.reproductiveStatus || 'NONE',
  },
  {
    name: 'availability',
    label: 'Disponibilidad',
    type: 'select',
    required: true,
    options: ['AVAILABLE', 'ASSIGNED', 'RESERVED', 'UNAVAILABLE'],
    defaultValue: dog?.availability || 'AVAILABLE',
  },
  { name: 'notes', label: 'Observaciones', type: 'textarea', defaultValue: dog?.notes },
];
export function DogEditor({
  dog,
  onClose,
  onSaved,
}: {
  dog?: Dog;
  onClose: () => void;
  onSaved: (dog: Dog) => void;
}) {
  const breeds = useResource<{ name: string }[]>('/breeds');
  const parties = useResource<{ id: string; name: string; kind: string }[]>('/parties');
  const trainers = useResource<{ id: string; name: string; role: string }[]>('/operations/handlers');
  const ownerFields: FieldDef[] = [
    {
      name: 'ownerPartyId',
      label: 'Propietario registrado',
      type: 'select',
      required: true,
      options:
        parties.data?.map((p) => ({ value: p.id, label: `${p.name} · ${labels[p.kind] || p.kind}` })) || [],
      defaultValue: dog?.ownerPartyId || '00000000-0000-4000-8000-000000000001',
      hint: 'La cuenta cliente vinculada a este propietario podrá consultar el historial completo.',
    },
    {
      name: 'custodianPartyId',
      label: 'Quién tiene el perro',
      type: 'select',
      required: true,
      options: parties.data?.map((p) => ({ value: p.id, label: p.name })) || [],
      defaultValue: dog?.custodianPartyId || '00000000-0000-4000-8000-000000000001',
    },
    {
      name: 'assignedTrainerId',
      label: 'Entrenador asignado',
      type: 'select',
      options:
        trainers.data?.filter((t) => t.role === 'TRAINER').map((t) => ({ value: t.id, label: t.name })) || [],
      defaultValue: dog?.assignedTrainerId,
      hint: 'Sólo este entrenador podrá añadir entrenamientos y registros médicos.',
    },
  ];
  return (
    <Modal
      title={dog ? 'Editar expediente' : 'Un nuevo integrante'}
      description="Registra su identidad. Los campos con asterisco son obligatorios."
      onClose={onClose}
      wide
    >
      {parties.error || trainers.error ? (
        <ErrorBox message={parties.error || trainers.error || ''} />
      ) : parties.loading || trainers.loading ? (
        <Loading />
      ) : (
        <DataForm
          clearOptional={!!dog}
          fields={[
            ...dogFields(
              dog,
              breeds.data?.map((b) => b.name),
            ),
            ...ownerFields,
          ].map((f) =>
            ['code', 'microchip', 'pedigreeNumber'].includes(f.name)
              ? {
                  ...f,
                  validate: async (value: string) => {
                    if (!value.trim()) return;
                    const result = await api<{ available: boolean }>(
                      `/dogs/identifiers/check?${new URLSearchParams({ field: f.name, value, ...(dog ? { excludeId: dog.id } : {}) })}`,
                    );
                    return result.available ? undefined : `Este ${f.label.toLowerCase()} ya está registrado.`;
                  },
                }
              : f,
          )}
          onCancel={onClose}
          submitLabel={dog ? 'Guardar cambios' : 'Crear expediente'}
          onSubmit={async (values) => {
            const saved = await api<Dog>(dog ? `/dogs/${dog.id}` : '/dogs', dog ? 'PATCH' : 'POST', values);
            onSaved(saved);
          }}
        />
      )}
    </Modal>
  );
}
export function Dogs({
  user,
  openDog,
  createDog,
  revision,
}: {
  user: User;
  openDog: (id: string) => void;
  createDog: () => void;
  revision: number;
}) {
  const [search, setSearch] = useState(() =>
    typeof window !== 'undefined' ? sessionStorage.getItem('oryx-search') || '' : '',
  );
  const [query, setQuery] = useState(search);
  const [status, setStatus] = useState(() =>
    typeof window !== 'undefined' ? sessionStorage.getItem('oryx-status') || '' : '',
  );
  const [location, setLocation] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useResource<PageData<Dog>>(
    `/dogs?${new URLSearchParams({ search: query, workStatus: status, location, page: String(page), pageSize: '12' })}`,
    revision,
  );
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setQuery(search);
    sessionStorage.setItem('oryx-search', search);
    setPage(1);
  };
  return (
    <>
      <PageHeading
        eyebrow="EL CORAZÓN DE ORYX K9"
        title="Nuestra unidad"
        description="Identidad, bienestar y trayectoria de cada perro."
      >
        <a className="button button-secondary" href={`${API}/dogs/export.csv`} download>
          <Download size={16} />
          Exportar CSV
        </a>
        {canManageDogs(user.role) && <AddButton onClick={createDog}>Nuevo perro</AddButton>}
      </PageHeading>
      <Panel className="dogs-panel">
        <div className="directory-toolbar">
          <form className="search-field" onSubmit={submitSearch}>
            <Search size={18} />
            <input
              aria-label="Buscar perro por nombre, código o microchip"
              placeholder="Buscar por nombre, código o microchip…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="submit" aria-label="Buscar">
              <ArrowRight size={17} />
            </button>
          </form>
          <select
            aria-label="Filtrar por fase de trabajo"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              sessionStorage.setItem('oryx-status', event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas las fases</option>
            {['TRAINING', 'OPERATIONAL', 'REST', 'TEMPORARILY_UNFIT'].map((value) => (
              <option value={value} key={value}>
                {labels[value]}
              </option>
            ))}
          </select>
          <input
            aria-label="Filtrar por ubicación"
            className="location-filter"
            placeholder="Ubicación"
            value={location}
            onChange={(event) => {
              setLocation(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="directory-summary">
          <span>
            <strong>{data?.total || 0}</strong> expedientes encontrados
          </span>
          <span>Registros activos</span>
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} retry={reload} />
        ) : data?.items.length ? (
          <>
            <div className="dog-grid">
              {data.items.map((dog) => (
                <button className="dog-card" key={dog.id} onClick={() => openDog(dog.id)}>
                  <div className="dog-card-photo">
                    {dog.photoId ? (
                      <img
                        src={`${API}/documents/${dog.photoId}/download`}
                        alt={`Fotografía de ${dog.name}`}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="dog-avatar">
                        <DogIcon size={62} strokeWidth={1.2} />
                        <span>SIN FOTOGRAFÍA</span>
                      </div>
                    )}
                    <Badge value={dog.workStatus} />
                  </div>
                  <div className="dog-card-info">
                    <div className="dog-card-name">
                      <h2>{dog.name}</h2>
                      <ChevronRight size={18} />
                    </div>
                    <p>
                      {dog.breed} <span>·</span> {labels[dog.sex]}
                    </p>
                    <div className="dog-card-location">
                      <MapPin size={14} />
                      {dog.location || 'Ubicación pendiente'}
                    </div>
                    <div className="dog-card-bottom">
                      <code>{dog.code}</code>
                      <span>{labels[dog.availability]}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="pagination">
              <span>
                Página {page} de {Math.max(1, Math.ceil(data.total / 12))}
              </span>
              <div>
                <Button
                  variant="secondary"
                  icon={ChevronLeft}
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  disabled={page * 12 >= data.total}
                  onClick={() => setPage(page + 1)}
                >
                  Siguiente
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <Empty
            icon={DogIcon}
            title={query || status || location ? 'No encontramos coincidencias' : 'Tu unidad comienza aquí'}
            description={
              query || status || location
                ? 'Prueba con otro nombre o ajusta los filtros.'
                : 'Crea el primer expediente para reunir su identidad, salud y evolución en un solo lugar.'
            }
            action={
              query || status || location ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('');
                    setSearch('');
                    setStatus('');
                    setLocation('');
                    sessionStorage.removeItem('oryx-search');
                    sessionStorage.removeItem('oryx-status');
                  }}
                >
                  Limpiar filtros
                </Button>
              ) : canManageDogs(user.role) ? (
                <AddButton onClick={createDog}>Crear primer expediente</AddButton>
              ) : undefined
            }
          />
        )}
      </Panel>
    </>
  );
}

export const vaccinationFields = (vaccine?: Vaccination): FieldDef[] => [
  {
    name: 'product',
    label: 'Nombre de la vacuna / producto',
    required: true,
    defaultValue: vaccine?.product,
  },
  {
    name: 'appliedDate',
    label: 'Fecha aplicada',
    type: 'date',
    required: true,
    max: today(),
    defaultValue: vaccine?.appliedDate?.slice(0, 10) || today(),
  },
  {
    name: 'nextDueDate',
    label: 'Próxima dosis',
    type: 'date',
    defaultValue: vaccine?.nextDueDate?.slice(0, 10),
    hint: 'Genera recordatorios para personal autorizado.',
  },
  { name: 'manufacturer', label: 'Fabricante', defaultValue: vaccine?.manufacturer },
  { name: 'batch', label: 'Número de lote', defaultValue: vaccine?.batch },
  { name: 'professional', label: 'Profesional responsable', defaultValue: vaccine?.professional },
  {
    name: 'notes',
    label: 'Dosis registrada / observaciones',
    type: 'textarea',
    defaultValue: vaccine?.notes,
  },
];
export const trainingFields: FieldDef[] = [
  { name: 'occurredAt', label: 'Fecha y hora · Costa Rica', type: 'datetime-local', required: true },
  {
    name: 'discipline',
    label: 'Disciplina',
    type: 'combobox',
    options: trainingDisciplines,
    required: true,
    hint: 'Elige un área o escribe una especialidad. La sesión quedará en el historial del perro seleccionado.',
  },
  { name: 'objective', label: 'Objetivo de la sesión', required: true, full: true },
  { name: 'durationMinutes', label: 'Duración (minutos)', type: 'number', min: 1, max: 1440, required: true },
  { name: 'location', label: 'Lugar' },
  { name: 'exercises', label: 'Ejercicios realizados', type: 'textarea' },
  { name: 'material', label: 'Material utilizado' },
  { name: 'difficulty', label: 'Nivel de dificultad' },
  { name: 'successes', label: 'Aciertos', type: 'number', min: 0 },
  { name: 'falseAlerts', label: 'Alertas falsas', type: 'number', min: 0 },
  { name: 'misses', label: 'Fallas', type: 'number', min: 0 },
  {
    name: 'score',
    label: 'Evaluación (0–100)',
    type: 'number',
    min: 0,
    max: 100,
    hint: 'Usa el mismo criterio para comparar sesiones.',
  },
  { name: 'notes', label: 'Resultados, incidencias y observaciones', type: 'textarea' },
];
export function TrainingHistory({ items }: { items: Training[] }) {
  const scored = items
    .filter((item) => item.score !== null && item.score !== undefined)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return (
    <>
      {scored.length >= 2 && (
        <div className="score-chart">
          <div>
            <strong>Evolución de evaluaciones</strong>
            <span>{scored.length} sesiones puntuadas · 0–100</span>
          </div>
          <svg
            viewBox="0 0 600 140"
            role="img"
            aria-label={`Evolución cronológica de ${scored.length} sesiones puntuadas. Última puntuación: ${scored[scored.length - 1].score}.`}
          >
            {[0, 50, 100].map((value) => (
              <g key={value}>
                <line x1="28" x2="585" y1={120 - value} y2={120 - value} stroke="#e9e6df" />
                <text x="0" y={124 - value} fill="#7c827c" fontSize="10">
                  {value}
                </text>
              </g>
            ))}
            <polyline
              fill="none"
              stroke="#ab7448"
              strokeWidth="2.5"
              points={scored
                .map(
                  (item, index) =>
                    `${32 + (index / Math.max(1, scored.length - 1)) * 550},${120 - Number(item.score)}`,
                )
                .join(' ')}
            />
            {scored.map((item, index) => (
              <circle
                key={item.id}
                cx={32 + (index / Math.max(1, scored.length - 1)) * 550}
                cy={120 - Number(item.score)}
                r="4"
                fill="#ab7448"
              >
                <title>
                  {formatDate(item.occurredAt)}: {item.score}/100
                </title>
              </circle>
            ))}
          </svg>
          <p>
            Las evaluaciones reflejan los criterios registrados por cada entrenador; no equivalen a una
            certificación.
          </p>
        </div>
      )}
      {items.length ? (
        <div className="timeline">
          {[...items]
            .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
            .map((session) => (
              <article className="timeline-item" key={session.id}>
                <div className="timeline-marker">
                  <GraduationCap size={17} />
                </div>
                <div className="timeline-content">
                  <div className="timeline-heading">
                    <h3>{session.discipline}</h3>
                    <span>{formatDate(session.occurredAt, true)}</span>
                  </div>
                  <p>{session.objective}</p>
                  <div className="session-tags">
                    <span>{session.durationMinutes} min</span>
                    {session.location && <span>{session.location}</span>}
                    {session.score != null && <span>Evaluación: {session.score}/100</span>}
                    {(session.trainerName || session.trainer) && (
                      <span>{session.trainerName || session.trainer?.name}</span>
                    )}
                  </div>
                  {session.exercises && (
                    <p>
                      <strong>Ejercicios:</strong> {session.exercises}
                    </p>
                  )}
                  {session.notes && <p className="muted">{session.notes}</p>}
                  {[session.successes, session.falseAlerts, session.misses].some(
                    (value) => value != null,
                  ) && (
                    <small>
                      Aciertos: {session.successes ?? '—'} · Alertas falsas: {session.falseAlerts ?? '—'} ·
                      Fallas: {session.misses ?? '—'}
                    </small>
                  )}
                </div>
              </article>
            ))}
        </div>
      ) : (
        <Empty
          icon={GraduationCap}
          title="Una historia por entrenar"
          description="Las sesiones registradas se mostrarán aquí en orden cronológico."
        />
      )}
    </>
  );
}

export function DogDetail({
  id,
  user,
  onBack,
  onAppointment,
}: {
  id: string;
  user: User;
  onBack: () => void;
  onAppointment: (dogId: string) => void;
}) {
  const { data: dog, error, loading, reload } = useResource<Dog>(`/dogs/${id}`);
  const parties = useResource<{ id: string; name: string }[]>('/parties');
  const [tab, setTab] = useState('summary');
  const [modal, setModal] = useState<string | null>(null);
  const [editVaccine, setEditVaccine] = useState<Vaccination | undefined>();
  const [actionError, setActionError] = useState('');
  const [uploading, setUploading] = useState(false);
  const admin = user.role === 'ADMIN';
  const manage = canManageDogs(user.role);
  const health = canHealth(user.role);
  const done = () => {
    setModal(null);
    setEditVaccine(undefined);
    reload();
  };
  const mutate = async (action: () => Promise<unknown>) => {
    setActionError('');
    try {
      await action();
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };
  if (loading) return <Loading />;
  if (error || !dog) return <ErrorBox message={error || 'No se encontró el expediente.'} retry={reload} />;
  const tabs = [
    { id: 'summary', label: 'Resumen' },
    { id: 'health', label: 'Salud y vacunas' },
    { id: 'training', label: 'Entrenamiento' },
    { id: 'documents', label: 'Documentos' },
    { id: 'movements', label: 'Ubicaciones' },
    ...(admin ? [{ id: 'audit', label: 'Auditoría' }] : []),
  ];
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = new FormData(event.currentTarget);
    const file = body.get('file');
    if (!(file instanceof File) || !file.size) {
      setActionError('Selecciona un archivo.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setActionError('El archivo supera el máximo de 10 MB.');
      return;
    }
    const form = event.currentTarget;
    setUploading(true);
    setActionError('');
    try {
      await api(`/dogs/${id}/documents`, 'POST', body);
      form.reset();
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }
  return (
    <>
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} />
        Volver a la unidad
      </button>
      <div className="dog-profile">
        <div className="profile-avatar">
          {dog.photoId ? (
            <img src={`${API}/documents/${dog.photoId}/download`} alt={dog.name} />
          ) : (
            <DogIcon size={50} strokeWidth={1.3} />
          )}
        </div>
        <div className="profile-name">
          <div className="eyebrow">EXPEDIENTE {dog.code}</div>
          <h1>{dog.name}</h1>
          <p>
            {dog.breed} · {labels[dog.sex]}
            {dog.birthDate ? ` · ${formatDate(dog.birthDate)}` : ''}
          </p>
          <div className="profile-badges">
            <Badge value={dog.workStatus} />
            <Badge value={dog.availability} />
          </div>
        </div>
        <div className="profile-actions">
          <a
            href={`${API}/dogs/${id}/card.pdf`}
            className="button button-secondary"
            target="_blank"
            rel="noreferrer"
          >
            <Download size={16} />
            Carné PDF
          </a>
          {manage && (
            <Button icon={Pencil} onClick={() => setModal('edit')}>
              Editar ficha
            </Button>
          )}
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Secciones del expediente">
        {tabs.map((item) => (
          <button
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`dog-panel-${item.id}`}
            key={item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {actionError && <ErrorBox message={actionError} />}
      <div role="tabpanel" id={`dog-panel-${tab}`}>
        {tab === 'summary' && (
          <div className="detail-grid">
            <Panel title="Identidad" subtitle="La información esencial de su expediente">
              <dl className="details-list">
                {[
                  ['Nombre registrado', dog.registeredName],
                  ['Microchip', dog.microchip],
                  [
                    'Fecha de nacimiento',
                    dog.birthDate
                      ? `${formatDate(dog.birthDate)}${dog.birthDateEstimated ? ' (estimada)' : ''}`
                      : undefined,
                  ],
                  ['Color / capa', dog.coat],
                  ['Señas particulares', dog.markings],
                  ['Propietario', dog.owner],
                  ['Criador / origen', dog.breeder],
                  ['Número de pedigrí', dog.pedigreeNumber],
                  ['Registro / asociación', dog.registry],
                  ['Fecha de ingreso', dog.intakeDate ? formatDate(dog.intakeDate) : undefined],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value || 'Sin registrar'}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
            <div className="detail-stack">
              <Panel title="Situación actual">
                <dl className="details-list">
                  <div>
                    <dt>Ubicación</dt>
                    <dd>{dog.location || 'Sin registrar'}</dd>
                  </div>
                  <div>
                    <dt>Responsable</dt>
                    <dd>{dog.custodian || 'Sin registrar'}</dd>
                  </div>
                  <div>
                    <dt>Administración</dt>
                    <dd>
                      <Badge value={dog.administrativeStatus} />
                    </dd>
                  </div>
                  <div>
                    <dt>Reproducción</dt>
                    <dd>
                      <Badge value={dog.reproductiveStatus} />
                    </dd>
                  </div>
                  <div>
                    <dt>Especialidades</dt>
                    <dd>{dog.specialties?.join(', ') || 'Sin registrar'}</dd>
                  </div>
                </dl>
              </Panel>
              <Panel title="Observaciones">
                <p className="panel-text">{dog.notes || 'No hay observaciones registradas.'}</p>
              </Panel>
              {canAppointments(user.role) && (
                <Button variant="secondary" icon={CalendarDays} onClick={() => onAppointment(id)}>
                  Programar cita
                </Button>
              )}
              {admin && (
                <button
                  className="archive-link"
                  onClick={() => {
                    if (
                      window.confirm(
                        `¿Archivar el expediente de ${dog.name}? Se conservará su historial y desaparecerá de los registros activos.`,
                      )
                    )
                      mutate(async () => {
                        await api(`/dogs/${id}`, 'DELETE');
                        onBack();
                      });
                  }}
                >
                  <Trash2 size={14} />
                  Archivar expediente
                </button>
              )}
            </div>
          </div>
        )}
        {tab === 'health' && (
          <>
            <RecordEvidence dogId={id} role={user.role} />
            <Panel
              title="Vacunación"
              subtitle="Controles, observaciones y seguimiento de salud"
              action={
                health ? (
                  <AddButton onClick={() => setModal('vaccine')}>Registrar vacuna</AddButton>
                ) : undefined
              }
            >
              {dog.vaccinations?.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Vacuna / producto</th>
                        <th>Aplicación</th>
                        <th>Próxima dosis</th>
                        <th>Profesional</th>
                        {health && (
                          <th>
                            <span className="sr-only">Acciones</span>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {dog.vaccinations.map((vaccine) => (
                        <tr key={vaccine.id}>
                          <td>
                            <strong>{vaccine.product}</strong>
                            <small>
                              {[vaccine.manufacturer, vaccine.batch && `Lote ${vaccine.batch}`]
                                .filter(Boolean)
                                .join(' · ')}
                            </small>
                          </td>
                          <td>{formatDate(vaccine.appliedDate)}</td>
                          <td>{formatDate(vaccine.nextDueDate)}</td>
                          <td>{vaccine.professional || 'Sin registrar'}</td>
                          {health && (
                            <td>
                              <button
                                className="icon-button"
                                aria-label={`Editar vacuna ${vaccine.product}`}
                                onClick={() => {
                                  setEditVaccine(vaccine);
                                  setModal('vaccine');
                                }}
                              >
                                <Pencil size={16} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  compact
                  icon={Syringe}
                  title="Vacunación pendiente de registrar"
                  description="Añade la fecha aplicada, el producto y la próxima dosis del carné veterinario."
                />
              )}
            </Panel>
            <Panel
              title="Historial de peso"
              subtitle="Mediciones registradas en kilogramos"
              action={
                health ? <AddButton onClick={() => setModal('weight')}>Añadir peso</AddButton> : undefined
              }
            >
              {dog.weights?.length ? (
                <div className="weight-grid">
                  {dog.weights.map((weight) => (
                    <div className="weight-card" key={weight.id}>
                      <WeightIcon size={18} />
                      <strong>
                        {Number(weight.kg).toLocaleString('es-CR')} <small>kg</small>
                      </strong>
                      <span>{formatDate(weight.date)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  compact
                  icon={HeartPulse}
                  title="Sin mediciones todavía"
                  description="El seguimiento del peso comienza con la primera medición."
                />
              )}
            </Panel>
          </>
        )}
        {tab === 'training' && (
          <>
            <FollowUp dogId={id} role={user.role} />
            <RecordEvidence dogId={id} role={user.role} />
            <Panel
              title="Bitácora de entrenamiento"
              subtitle="Objetivos y resultados de cada sesión"
              action={
                <div className="heading-actions">
                  <a
                    className="button button-secondary"
                    href={`${API}/dogs/${id}/report.pdf`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download size={16} />
                    Informe PDF
                  </a>
                  {manage && <AddButton onClick={() => setModal('training')}>Nueva sesión</AddButton>}
                </div>
              }
            >
              <TrainingHistory items={dog.trainingSessions || []} />
            </Panel>
          </>
        )}
        {tab === 'documents' && (
          <Panel
            title="Archivos del expediente"
            subtitle="Acceso privado · PDF, JPEG o PNG · Hasta 10 MB por archivo"
          >
            {(manage || health) && (
              <form className="upload-form" onSubmit={upload}>
                <div>
                  <Upload size={21} />
                  <strong>Adjuntar al expediente</strong>
                  <span>Las fotografías principales deben ser JPEG o PNG.</span>
                </div>
                <label className="sr-only" htmlFor="upload-category">
                  Tipo de archivo
                </label>
                <select id="upload-category" name="category">
                  {manage && (
                    <>
                      <option value="PHOTO">Fotografía principal</option>
                      <option value="DOCUMENT">Documento general</option>
                    </>
                  )}
                  {health && <option value="CLINICAL">Archivo clínico</option>}
                </select>
                <label className="sr-only" htmlFor="upload-file">
                  Archivo
                </label>
                <input
                  id="upload-file"
                  name="file"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  required
                />
                <Button type="submit" disabled={uploading} icon={Upload}>
                  {uploading ? 'Subiendo…' : 'Subir archivo'}
                </Button>
              </form>
            )}
            {dog.documents?.length ? (
              <div className="document-list">
                {dog.documents.map((doc) => (
                  <div className="document-row" key={doc.id}>
                    <div className="document-icon">
                      <FileText size={22} />
                    </div>
                    <div>
                      <strong>{doc.name}</strong>
                      <p>
                        {labels[doc.category]} ·{' '}
                        {(doc.size / 1024).toLocaleString('es-CR', { maximumFractionDigits: 0 })} KB ·{' '}
                        {formatDate(doc.createdAt)}
                      </p>
                    </div>
                    <a
                      className="icon-button"
                      href={`${API}/documents/${doc.id}/download`}
                      aria-label={`Descargar ${doc.name}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Download size={18} />
                    </a>
                    {admin && (
                      <button
                        className="icon-button"
                        aria-label={`Archivar ${doc.name}`}
                        onClick={() => {
                          if (window.confirm(`¿Archivar ${doc.name}?`))
                            mutate(() => api(`/documents/${doc.id}`, 'DELETE'));
                        }}
                      >
                        <Trash2 size={17} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                icon={FileText}
                title="Los documentos, en su lugar"
                description="Añade fotografías, carnés y documentos de respaldo al expediente."
              />
            )}
          </Panel>
        )}
        {tab === 'movements' && (
          <Panel
            title="Historial de ubicaciones"
            subtitle="Trazabilidad de movimientos y responsables"
            action={
              manage ? (
                <AddButton onClick={() => setModal('movement')}>Registrar movimiento</AddButton>
              ) : undefined
            }
          >
            {dog.movements?.length ? (
              <div className="timeline">
                {dog.movements.map((movement) => (
                  <article className="timeline-item" key={movement.id}>
                    <div className="timeline-marker">
                      <MapPin size={17} />
                    </div>
                    <div className="timeline-content">
                      <div className="timeline-heading">
                        <h3>{movement.location}</h3>
                        <span>{formatDate(movement.date)}</span>
                      </div>
                      <p>Responsable: {movement.custodian || 'Sin registrar'}</p>
                      {movement.notes && <p className="muted">{movement.notes}</p>}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                icon={MapPin}
                title="Sin movimientos registrados"
                description={`Ubicación actual: ${dog.location || 'sin registrar'}. Los cambios de ubicación conservarán su historial.`}
              />
            )}
          </Panel>
        )}
        {tab === 'audit' && admin && <Audit dogId={id} />}
      </div>
      {modal === 'edit' && <DogEditor dog={dog} onClose={() => setModal(null)} onSaved={done} />}
      {modal === 'vaccine' && (
        <Modal
          title={editVaccine ? 'Editar registro de vacuna' : 'Registrar vacuna'}
          description="Transcribe la información del respaldo veterinario."
          onClose={done}
        >
          <DataForm
            clearOptional={!!editVaccine}
            fields={vaccinationFields(editVaccine)}
            onCancel={done}
            onSubmit={async (values) => {
              await api(
                editVaccine ? `/vaccinations/${editVaccine.id}` : `/dogs/${id}/vaccinations`,
                editVaccine ? 'PATCH' : 'POST',
                values,
              );
              done();
            }}
          />
        </Modal>
      )}
      {modal === 'weight' && (
        <Modal title="Registrar peso" onClose={done}>
          <DataForm
            fields={[
              {
                name: 'date',
                label: 'Fecha de medición',
                type: 'date',
                required: true,
                defaultValue: today(),
                max: today(),
              },
              {
                name: 'kg',
                label: 'Peso en kilogramos',
                type: 'number',
                required: true,
                min: 0.01,
                max: 150,
                step: '0.01',
              },
            ]}
            onCancel={done}
            onSubmit={async (values) => {
              await api(`/dogs/${id}/weights`, 'POST', values);
              done();
            }}
          />
        </Modal>
      )}
      {modal === 'movement' && (
        <Modal
          title="Registrar movimiento"
          description="Actualizará la ubicación actual y conservará el historial."
          onClose={done}
        >
          <DataForm
            fields={[
              {
                name: 'date',
                label: 'Fecha y hora del movimiento · Costa Rica',
                type: 'datetime-local',
                required: true,
                defaultValue: localNow(),
                step: '1',
              },
              { name: 'location', label: 'Nueva ubicación', required: true },
              {
                name: 'custodianPartyId',
                label: 'Quién tiene el perro',
                type: 'select',
                required: true,
                options: parties.data?.map((p) => ({ value: p.id, label: p.name })) || [],
                defaultValue: dog.custodianPartyId,
              },
              { name: 'notes', label: 'Motivo / observaciones', type: 'textarea' },
            ]}
            onCancel={done}
            onSubmit={async (values) => {
              values.date = localInstant(String(values.date));
              await api(`/dogs/${id}/movements`, 'POST', values);
              done();
            }}
          />
        </Modal>
      )}
      {modal === 'training' && (
        <Modal
          title="Nueva sesión de entrenamiento"
          description={`Registra el trabajo de ${dog.name}. Horario de Costa Rica.`}
          onClose={done}
          wide
        >
          <DataForm
            fields={trainingFields.map((f) =>
              f.name === 'discipline'
                ? {
                    ...f,
                    options: [...new Set([...(dog.specialties || []), ...trainingDisciplines])],
                    hint: `Especialidades del perro: ${dog.specialties?.join(', ') || 'Sin clasificar'}. Puedes registrar otra disciplina.`,
                  }
                : f,
            )}
            onCancel={done}
            onSubmit={async (values) => {
              values.occurredAt = localInstant(String(values.occurredAt));
              await api(`/dogs/${id}/training`, 'POST', values);
              done();
            }}
          />
        </Modal>
      )}
    </>
  );
}

function Audit({ dogId }: { dogId: string }) {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useResource<
    PageData<{
      id: string;
      action: string;
      entity: string;
      summary?: unknown;
      createdAt: string;
      actorName?: string;
      actor?: User;
      user?: User;
    }>
  >(`/audit?dogId=${dogId}&page=${page}`);
  return (
    <Panel title="Auditoría del expediente" subtitle="Registro de acciones conservado para trazabilidad">
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} retry={reload} />
      ) : data?.items.length ? (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Acción</th>
                  <th>Entidad</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDate(entry.createdAt, true)}</td>
                    <td>{entry.action}</td>
                    <td>{entry.entity}</td>
                    <td>{entry.actorName || entry.actor?.name || entry.user?.name || 'Sistema'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>Página {page}</span>
            <div>
              <Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
                Anterior
              </Button>
              <Button
                variant="secondary"
                disabled={page * data.pageSize >= data.total}
                onClick={() => setPage(page + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </>
      ) : (
        <Empty
          compact
          icon={ShieldCheck}
          title="Sin eventos disponibles"
          description="Las acciones autorizadas sobre el expediente se mostrarán aquí."
        />
      )}
    </Panel>
  );
}
