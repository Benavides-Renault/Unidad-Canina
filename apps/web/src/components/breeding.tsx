'use client';
import { RecordEvidence } from './records';
import { useState } from 'react';
import { ArrowLeft, Heart, Plus } from 'lucide-react';
import { api, errorMessage, formatDate, today, type PageData, type User } from '@/lib/api';
import { useResource } from '@/lib/use-resource';
import { Badge, Button, Empty, ErrorBox, Loading, PageHeading, Panel, type FieldDef } from './ui';
import { BusinessForm, choice, Pager, SimpleTable } from './business-ui';
type Animal = {
  id: string;
  name: string;
  code: string;
  sex: string;
  birthDate?: string;
  isPuppy?: boolean;
  coat?: string;
  microchip?: string;
  availability?: string;
  commercialCategory?: string;
  availableForBreeding?: boolean;
  administrativeStatus?: string;
  reproductiveStatus?: string;
};
type Profile = {
  sireId?: string;
  damId?: string;
  pedigreeSource?: string;
  pedigreeQuality: string;
  healthNotes?: string;
  professional?: string;
  revision: number;
};
type Plan = {
  published?: boolean;
  publicTitle?: string;
  publicDescription?: string;
  puppyPrice?: string;
  currency?: string;
  contact?: string;
  id: string;
  damId: string;
  sireId: string;
  dam: Animal;
  sire: Animal;
  plannedDate: string;
  matingDate?: string;
  expectedBirthDate?: string;
  expectedDeliveryDate?: string;
  litter?: { id: string; code: string; birthDate: string };
  windowStart?: string;
  windowEnd?: string;
  estimationMethod?: string;
  professional?: string;
  notes?: string;
  status: string;
  revision: number;
};
type Litter = {
  id: string;
  code: string;
  dam: Animal;
  sire: Animal;
  birthDate: string;
  liveBorn: number;
  stillBorn: number;
  notes?: string;
  puppies: Animal[];
  _count?: { puppies: number };
};
type Ancestor = {
  id: string;
  name: string;
  code: string;
  depth: number;
  quality: string;
  sireId?: string;
  damId?: string;
  source?: string;
};
const dateField = (name: string, label: string, required = true): FieldDef => ({
  name,
  label,
  type: 'date',
  required,
});
const parents = (dogs: Animal[]): FieldDef[] => [
  {
    name: 'damId',
    label: 'Madre',
    type: 'select',
    required: true,
    options: choice(dogs.filter((d) => d.sex === 'FEMALE')),
  },
  {
    name: 'sireId',
    label: 'Padre',
    type: 'select',
    required: true,
    options: choice(dogs.filter((d) => d.sex === 'MALE')),
  },
];
function planFields(dogs: Animal[], plan?: Plan): FieldDef[] {
  const fields: FieldDef[] = [
    ...(!plan
      ? parents(
          dogs.filter(
            (d) =>
              d.availableForBreeding &&
              d.availability === 'AVAILABLE' &&
              !['SOLD', 'DECEASED', 'RETIRED'].includes(d.administrativeStatus || '') &&
              d.reproductiveStatus !== 'RETIRED',
          ),
        )
      : []),
    {
      ...dateField('crossDate', 'Fecha del cruce'),
      defaultValue: plan?.matingDate || plan?.plannedDate,
      hint: 'Si está programado, indica cuándo se hará. Si ya ocurrió, escribe la fecha real y elige Monta registrada.',
    },
    {
      name: 'status',
      label: 'Estado del plan',
      type: 'select',
      required: true,
      options: ['PLANNED', 'MATED', 'CONFIRMED', 'CANCELLED'],
      defaultValue: 'PLANNED',
    },
    {
      ...dateField('expectedBirthDate', 'Nacimiento previsto', false),
      hint: 'Fecha en que se espera el nacimiento. Podrás registrar la fecha real al nacer la camada.',
    },
    {
      ...dateField('expectedDeliveryDate', 'Entrega prevista', false),
      hint: 'Fecha acordada para la entrega de los cachorros; debe ser posterior al nacimiento previsto.',
    },
    { name: 'notes', label: 'Observaciones del plan', type: 'textarea' },
    { name: 'published', label: 'Publicar camada y reservas en la galería de clientes', type: 'checkbox' },
    { name: 'publicTitle', label: 'Título público de la camada' },
    { name: 'publicDescription', label: 'Información de la camada para clientes', type: 'textarea' },
    {
      name: 'puppyPrice',
      label: 'Precio del cachorro',
      inputMode: 'decimal',
      hint: 'Importe con punto decimal, por ejemplo 1500.00.',
    },
    {
      name: 'currency',
      label: 'Moneda de reserva',
      type: 'select',
      options: ['CRC', 'USD'],
      defaultValue: 'CRC',
    },
    { name: 'contact', label: 'Contacto para apartar', hint: 'Teléfono o correo que verán los clientes.' },
  ];
  return fields.map((f) => ({
    ...f,
    defaultValue:
      plan && f.name !== 'crossDate' ? (plan as unknown as Record<string, string>)[f.name] : f.defaultValue,
  }));
}
function planPayload(values: Record<string, unknown>) {
  const { crossDate, ...data } = values;
  return {
    ...data,
    plannedDate: crossDate,
    matingDate: ['MATED', 'CONFIRMED'].includes(String(data.status)) ? crossDate : null,
  };
}
const litterFields: FieldDef[] = [
  { name: 'code', label: 'Código de camada', required: true },
  dateField('birthDate', 'Fecha de nacimiento'),
  { name: 'liveBorn', label: 'Nacidos vivos', type: 'number', min: 0, max: 30, required: true },
  {
    name: 'stillBorn',
    label: 'Nacidos no vivos',
    type: 'number',
    min: 0,
    max: 30,
    defaultValue: 0,
    required: true,
  },
  { name: 'notes', label: 'Observaciones del parto', type: 'textarea' },
];
export function BreedingPage({ user, openDog }: { user: User; openDog: (id: string) => void }) {
  const [tab, setTab] = useState('plans'),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<{ kind: string; id: string; name?: string } | null>(null),
    [form, setForm] = useState<string | null>(null);
  const options = useResource<Animal[]>('/breeding/options');
  const plans = useResource<PageData<Plan>>(tab === 'plans' ? `/breeding/plans?page=${page}` : null);
  const litters = useResource<PageData<Litter>>(tab === 'litters' ? `/breeding/litters?page=${page}` : null);
  const profiles = useResource<PageData<Animal>>(tab === 'profiles' ? `/breeding/dogs?page=${page}` : null);
  const resource = tab === 'plans' ? plans : tab === 'litters' ? litters : profiles;
  if (selected?.kind === 'litter')
    return (
      <LitterDetail
        id={selected.id}
        user={user}
        openDog={openDog}
        onBack={() => {
          setSelected(null);
          litters.reload();
        }}
      />
    );
  if (selected?.kind === 'profile')
    return (
      <ProfileDetail
        id={selected.id}
        name={selected.name || ''}
        dogs={options.data || []}
        onBack={() => setSelected(null)}
        openDog={openDog}
      />
    );
  if (selected?.kind === 'plan') {
    const p = plans.data?.items.find((p) => p.id === selected.id);
    if (p)
      return (
        <PlanDetail
          plan={p}
          dogs={options.data || []}
          onBack={() => {
            setSelected(null);
            plans.reload();
          }}
          onSaved={plans.reload}
          openLitter={(id) => setSelected({ kind: 'litter', id })}
        />
      );
  }
  return (
    <>
      <PageHeading
        eyebrow="CUIDADO Y CONTINUIDAD"
        title="Crianza"
        description="Ascendencia, planes reproductivos y registro de nacimientos."
      >
        {tab !== 'profiles' && (
          <Button icon={Plus} onClick={() => setForm(tab)}>
            {tab === 'plans' ? 'Nuevo plan de cruce' : 'Registrar camada'}
          </Button>
        )}
      </PageHeading>
      <div className="tabs" role="tablist" aria-label="Crianza">
        {[
          ['plans', 'Cruces y gestación'],
          ['litters', 'Camadas'],
          ['profiles', 'Perfiles reproductivos'],
        ].map(([id, name]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'active' : ''}
            onClick={() => {
              setTab(id);
              setPage(1);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <Panel>
        {resource.loading ? (
          <Loading />
        ) : resource.error ? (
          <ErrorBox message={resource.error} retry={resource.reload} />
        ) : !resource.data?.items.length ? (
          <Empty
            icon={Heart}
            title="Todavía no hay registros"
            description={
              tab === 'profiles'
                ? 'Crea los expedientes de los progenitores en Nuestra unidad.'
                : 'Registra la información conocida para comenzar el seguimiento.'
            }
          />
        ) : (
          <>
            {tab === 'plans' && (
              <SimpleTable headers={['Progenitores', 'Cruce', 'Nacimiento / entrega', 'Estado', 'Detalle']}>
                {plans.data?.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.dam.name}
                      <small>× {p.sire.name}</small>
                    </td>
                    <td>
                      {formatDate(p.plannedDate)}
                      <small>Monta: {formatDate(p.matingDate)}</small>
                    </td>
                    <td>
                      {p.litter
                        ? `Nació: ${formatDate(p.litter.birthDate)}`
                        : formatDate(p.expectedBirthDate)}
                      <small>Entrega: {formatDate(p.expectedDeliveryDate)}</small>
                    </td>
                    <td>
                      <Badge value={p.status} />
                    </td>
                    <td>
                      <Button variant="secondary" onClick={() => setSelected({ kind: 'plan', id: p.id })}>
                        Abrir plan
                      </Button>
                    </td>
                  </tr>
                ))}
              </SimpleTable>
            )}
            {tab === 'litters' && (
              <SimpleTable headers={['Camada', 'Progenitores', 'Nacimiento', 'Cachorros', 'Detalle']}>
                {litters.data?.items.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.code}</strong>
                    </td>
                    <td>
                      {l.dam.name}
                      <small>× {l.sire.name}</small>
                    </td>
                    <td>{formatDate(l.birthDate)}</td>
                    <td>
                      {l._count?.puppies || 0} identificados / {l.liveBorn} vivos
                    </td>
                    <td>
                      <Button variant="secondary" onClick={() => setSelected({ kind: 'litter', id: l.id })}>
                        Abrir camada
                      </Button>
                    </td>
                  </tr>
                ))}
              </SimpleTable>
            )}
            {tab === 'profiles' && (
              <SimpleTable headers={['Perro', 'Sexo', 'Perfil']}>
                {profiles.data?.items.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {d.name}
                      <small>{d.code}</small>
                    </td>
                    <td>
                      <Badge value={d.sex} />
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() => setSelected({ kind: 'profile', id: d.id, name: d.name })}
                      >
                        Ver perfil
                      </Button>
                    </td>
                  </tr>
                ))}
              </SimpleTable>
            )}
            <Pager data={resource.data} page={page} setPage={setPage} />
          </>
        )}
      </Panel>
      {form && (
        <BusinessForm
          title={form === 'plans' ? 'Nuevo plan de cruce' : 'Registrar camada'}
          fields={
            form === 'plans'
              ? planFields(options.data || [])
              : [...parents(options.data || []), ...litterFields]
          }
          path={form === 'plans' ? '/breeding/plans' : '/breeding/litters'}
          transform={form === 'plans' ? planPayload : undefined}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            resource.reload();
          }}
        />
      )}
    </>
  );
}
function PlanDetail({
  plan: p,
  dogs,
  onBack,
  onSaved,
  openLitter,
}: {
  plan: Plan;
  dogs: Animal[];
  onBack: () => void;
  onSaved: () => void;
  openLitter: (id: string) => void;
}) {
  const [form, setForm] = useState<'edit' | 'litter' | null>(null);
  const ancestry = useResource<{
    dam: Ancestor[];
    sire: Ancestor[];
    shared: Ancestor[];
    incomplete: boolean;
    notice: string;
  }>(`/breeding/plans/${p.id}/ancestry`);
  return (
    <>
      <Button variant="ghost" icon={ArrowLeft} onClick={onBack}>
        Volver a crianza
      </Button>
      <PageHeading
        eyebrow="PLAN REPRODUCTIVO"
        title={`${p.dam.name} × ${p.sire.name}`}
        description={`Cruce previsto: ${formatDate(p.plannedDate)}`}
      >
        {!['COMPLETED', 'CANCELLED'].includes(p.status) && (
          <Button onClick={() => setForm('edit')}>Actualizar seguimiento</Button>
        )}
        {['MATED', 'CONFIRMED'].includes(p.status) && (
          <Button variant="secondary" onClick={() => setForm('litter')}>
            Registrar nacimiento
          </Button>
        )}
      </PageHeading>
      <div className="detail-grid">
        <Panel title="Gestación y seguimiento">
          <dl className="details-list">
            <div>
              <dt>Estado</dt>
              <dd>
                <Badge value={p.status} />
              </dd>
            </div>
            <div>
              <dt>Monta efectiva</dt>
              <dd>{formatDate(p.matingDate)}</dd>
            </div>
            <div>
              <dt>Nacimiento previsto</dt>
              <dd>{formatDate(p.expectedBirthDate)}</dd>
            </div>
            <div>
              <dt>Entrega prevista</dt>
              <dd>{formatDate(p.expectedDeliveryDate)}</dd>
            </div>
            {p.litter && (
              <div>
                <dt>Nacimiento real</dt>
                <dd>
                  {formatDate(p.litter.birthDate)}{' '}
                  <Button variant="ghost" onClick={() => openLitter(p.litter!.id)}>
                    Ver camada
                  </Button>
                </dd>
              </div>
            )}
          </dl>
          <p className="panel-text">{p.notes}</p>
          <p className="panel-text muted">
            Las fechas previstas se actualizan según el seguimiento de la camada.
          </p>
        </Panel>
        <Panel title="Revisión de ascendencia">
          {ancestry.error ? (
            <ErrorBox message={ancestry.error} />
          ) : ancestry.loading ? (
            <Loading />
          ) : (
            <>
              <p className="panel-text">{ancestry.data?.notice}</p>
              {!!ancestry.data?.shared.length && (
                <p className="panel-text">
                  Coincidencias: {ancestry.data.shared.map((a) => a.name).join(', ')}
                </p>
              )}
              <Pedigree nodes={ancestry.data?.dam || []} title="Línea materna" />
              <Pedigree nodes={ancestry.data?.sire || []} title="Línea paterna" />
            </>
          )}
        </Panel>
      </div>
      {form && (
        <BusinessForm
          title={form === 'edit' ? 'Seguimiento del cruce' : 'Registrar nacimiento'}
          transform={form === 'edit' ? planPayload : undefined}
          fields={form === 'edit' ? planFields(dogs, p) : litterFields}
          method={form === 'edit' ? 'PATCH' : 'POST'}
          path={form === 'edit' ? `/breeding/plans/${p.id}` : '/breeding/litters'}
          extra={
            form === 'edit'
              ? { expectedRevision: p.revision }
              : { planId: p.id, damId: p.damId, sireId: p.sireId }
          }
          onClose={() => setForm(null)}
          onSaved={(r) => {
            setForm(null);
            onSaved();
            if (form === 'litter') openLitter(String(r.id));
          }}
        />
      )}
    </>
  );
}
function Pedigree({ nodes, title }: { nodes: Ancestor[]; title: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const active = nodes.find((n) => n.id === selected);
  function branch(id: string | undefined, label: string, path: string[] = []): React.ReactNode {
    const node = nodes.find((n) => n.id === id);
    if (!node)
      return (
        <li>
          {label}: <span className="muted">Sin ascendencia documentada</span>
        </li>
      );
    if (path.includes(node.id)) return <li>{label}: relación repetida; revisar documentación</li>;
    return (
      <li>
        <Button variant={selected === node.id ? 'primary' : 'secondary'} onClick={() => setSelected(node.id)}>
          {label}: {node.name}
        </Button>
        <small>
          {node.code} · Generación {path.length}
        </small>
        {path.length < 3 && (
          <details open={path.length === 0}>
            <summary>Ver progenitores de {node.name}</summary>
            <ul>
              {branch(node.sireId, 'Padre', [...path, node.id])}
              {branch(node.damId, 'Madre', [...path, node.id])}
            </ul>
          </details>
        )}
      </li>
    );
  }
  return (
    <div className="pedigree">
      <h3>{title}</h3>
      <ul className="pedigree-tree">{branch(nodes[0]?.id, 'Ejemplar')}</ul>
      {active && (
        <div className="inline-notice">
          <span>
            <strong>{active.name}</strong> ·{' '}
            {active.quality === 'DOCUMENTED'
              ? 'Origen documentado'
              : active.quality === 'REPORTED'
                ? 'Origen reportado'
                : 'Origen desconocido'}
            {active.source ? ` · ${active.source}` : ''}. La información registrada requiere revisión
            profesional.
          </span>
        </div>
      )}
      <details>
        <summary>Ver lista de ascendencia</summary>
        <ul>
          {nodes.map((n) => (
            <li key={n.id}>
              <strong>{n.name}</strong> · {n.depth === 0 ? 'Ejemplar' : `Generación ${n.depth}`}
              <small>
                {n.sireId
                  ? `Padre: ${nodes.find((x) => x.id === n.sireId)?.name || 'Registrado'}`
                  : 'Padre desconocido'}{' '}
                ·{' '}
                {n.damId
                  ? `Madre: ${nodes.find((x) => x.id === n.damId)?.name || 'Registrada'}`
                  : 'Madre desconocida'}
              </small>
              <small>
                {n.quality === 'DOCUMENTED'
                  ? 'Origen documentado'
                  : n.quality === 'REPORTED'
                    ? 'Dato reportado'
                    : 'Origen desconocido'}
                {n.source ? ` · ${n.source}` : ''}
              </small>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
function ProfileDetail({
  id,
  name,
  dogs,
  onBack,
  openDog,
}: {
  id: string;
  name: string;
  dogs: Animal[];
  onBack: () => void;
  openDog: (id: string) => void;
}) {
  const resource = useResource<{
    profile: Profile | null;
    events: { id: string; kind: string; eventDate: string; professional?: string; notes: string }[];
    pedigree: Ancestor[];
    notice: string;
  }>(`/breeding/dogs/${id}`);
  const [form, setForm] = useState<'profile' | 'event' | null>(null);
  const p = resource.data?.profile;
  const profileFields: FieldDef[] = [
    ...parents(dogs.filter((d) => d.id !== id)).map((f) => ({
      ...f,
      required: false,
      label: f.name === 'damId' ? 'Madre registrada' : 'Padre registrado',
    })),
    {
      name: 'pedigreeQuality',
      label: 'Calidad del dato genealógico',
      type: 'select',
      required: true,
      options: [
        { value: 'UNKNOWN', label: 'Desconocido' },
        { value: 'REPORTED', label: 'Reportado sin verificar' },
        { value: 'DOCUMENTED', label: 'Con respaldo documental' },
      ],
      defaultValue: 'UNKNOWN',
    },
    { name: 'pedigreeSource', label: 'Fuente del pedigrí' },
    { name: 'healthNotes', label: 'Condición médica registrada', type: 'textarea' },
    { name: 'professional', label: 'Profesional responsable' },
  ];
  return (
    <>
      <Button variant="ghost" icon={ArrowLeft} onClick={onBack}>
        Volver a perfiles
      </Button>
      <PageHeading eyebrow="PERFIL REPRODUCTIVO" title={name}>
        <Button onClick={() => setForm('profile')}>Editar perfil</Button>
        <Button variant="secondary" onClick={() => setForm('event')}>
          Registrar control / celo
        </Button>
        <Button variant="secondary" onClick={() => openDog(id)}>
          Expediente y documentos
        </Button>
      </PageHeading>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorBox message={resource.error} retry={resource.reload} />
      ) : (
        <div className="detail-grid">
          <Panel title="Antecedentes y controles">
            <p className="panel-text">{p?.healthNotes || 'Sin condición médica registrada.'}</p>
            <p className="panel-text muted">{p?.professional}</p>
            <SimpleTable headers={['Fecha', 'Tipo', 'Registro']}>
              {resource.data?.events.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.eventDate)}</td>
                  <td>
                    <Badge value={e.kind} />
                  </td>
                  <td className="business-wrap">
                    {e.notes}
                    <small>{e.professional}</small>
                  </td>
                </tr>
              ))}
            </SimpleTable>
          </Panel>
          <Panel title="Ascendencia conocida">
            <p className="panel-text">{resource.data?.notice}</p>
            <Pedigree title={name} nodes={resource.data?.pedigree || []} />
            <RecordEvidence dogId={id} role="ADMIN" />
          </Panel>
        </div>
      )}
      {form && (
        <BusinessForm
          title={form === 'profile' ? 'Perfil reproductivo' : 'Registrar control / celo'}
          path={form === 'profile' ? `/breeding/dogs/${id}` : `/breeding/dogs/${id}/events`}
          method={form === 'profile' ? 'PATCH' : 'POST'}
          extra={form === 'profile' ? { expectedRevision: p?.revision || 0 } : undefined}
          fields={
            form === 'profile'
              ? profileFields.map((f) => ({
                  ...f,
                  defaultValue: p ? (p as unknown as Record<string, string>)[f.name] : f.defaultValue,
                }))
              : [
                  {
                    name: 'kind',
                    label: 'Tipo de evento',
                    type: 'select',
                    required: true,
                    options: ['HEAT', 'CHECK', 'HISTORY'],
                  },
                  { ...dateField('eventDate', 'Fecha del evento'), defaultValue: today() },
                  { name: 'professional', label: 'Profesional del control' },
                  { name: 'notes', label: 'Observaciones del evento', type: 'textarea', required: true },
                ]
          }
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            resource.reload();
          }}
        />
      )}
    </>
  );
}
function LitterDetail({
  id,
  user,
  onBack,
  openDog,
}: {
  id: string;
  user: User;
  onBack: () => void;
  openDog: (id: string) => void;
}) {
  const breeds = useResource<{ name: string }[]>('/breeds');
  const resource = useResource<Litter>(`/breeding/litters/${id}`);
  const [form, setForm] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function promote(dogId: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/breeding/puppies/${dogId}/promote`, 'POST', {});
      resource.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const l = resource.data;
  if (resource.loading) return <Loading />;
  if (resource.error || !l)
    return <ErrorBox message={resource.error || 'Camada no encontrada.'} retry={resource.reload} />;
  return (
    <>
      <Button variant="ghost" icon={ArrowLeft} onClick={onBack}>
        Volver a camadas
      </Button>
      <PageHeading
        eyebrow={`${l.dam.name} × ${l.sire.name}`}
        title={l.code}
        description={`Nacimiento: ${formatDate(l.birthDate)} · ${l.liveBorn} vivos · ${l.stillBorn} no vivos`}
      >
        <Button icon={Plus} disabled={l.puppies.length >= l.liveBorn} onClick={() => setForm(true)}>
          Identificar cachorro
        </Button>
      </PageHeading>
      {error && <ErrorBox message={error} />}
      <Panel title="Cachorros e identidad">
        <p className="panel-text">
          Cada cachorro conserva su código, vacunas, fotos e historial al incorporarse a la unidad.
        </p>
        {l.puppies.length ? (
          <SimpleTable headers={['Cachorro', 'Identificación', 'Disponibilidad', 'Acciones']}>
            {l.puppies.map((d) => (
              <tr key={d.id}>
                <td>
                  <strong>{d.name}</strong>
                  <small>
                    {d.code} · {d.sex === 'FEMALE' ? 'Hembra' : 'Macho'}
                  </small>
                </td>
                <td>
                  {d.microchip || 'Sin microchip'}
                  <small>{d.coat}</small>
                </td>
                <td>
                  <Badge value={d.availability} />
                  <small>{d.isPuppy ? 'En camada' : 'Incorporado a la unidad'}</small>
                </td>
                <td>
                  <Button variant="secondary" onClick={() => openDog(d.id)}>
                    Expediente
                  </Button>
                  {d.isPuppy && ['ADMIN'].includes(user.role) && (
                    <Button variant="ghost" disabled={busy} onClick={() => void promote(d.id)}>
                      Incorporar a la unidad
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </SimpleTable>
        ) : (
          <Empty
            compact
            icon={Heart}
            title="Identifica los cachorros"
            description="Registra a cada nacido vivo con su nombre o identificación provisional."
          />
        )}
        <p className="panel-text">{l.notes}</p>
      </Panel>
      {form && (
        <BusinessForm
          title="Identificar cachorro"
          path={`/breeding/litters/${id}/puppies`}
          fields={[
            { name: 'name', label: 'Nombre del cachorro', required: true },
            {
              name: 'sex',
              label: 'Sexo del cachorro',
              type: 'select',
              required: true,
              options: ['FEMALE', 'MALE'],
            },
            {
              name: 'breed',
              label: 'Raza del cachorro',
              type: 'combobox',
              options: breeds.data?.map((b) => b.name),
              required: true,
              hint: 'Selecciona del catálogo o escribe la variedad o cruce.',
            },
            { name: 'coat', label: 'Color / capa' },
            { name: 'microchip', label: 'Microchip del cachorro' },
            {
              name: 'weightKg',
              label: 'Peso al nacer (kg)',
              type: 'number',
              min: 0.001,
              max: 30,
              step: '0.001',
            },
          ]}
          onClose={() => setForm(false)}
          onSaved={() => {
            setForm(false);
            resource.reload();
          }}
        />
      )}
    </>
  );
}
