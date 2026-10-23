'use client';
import { BrandMark } from '@/components/brand';
import { RecordEvidence } from './records';
import { NotificationPreferences } from './notification-preferences';
import { useState, type FormEvent } from 'react';
import { ArrowLeft, Dog as DogIcon, HeartPulse, LogOut, Plus, ShoppingBag } from 'lucide-react';
import {
  API,
  api,
  errorMessage,
  formatDate,
  labels,
  localInstant,
  today,
  type Dog,
  type User,
  type PageData,
  type Training,
  type Vaccination,
  type DocumentRecord,
  type Weight,
  type Movement,
  type Appointment,
} from '@/lib/api';
import { useResource } from '@/lib/use-resource';
import {
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
import { BusinessForm, money, Pager, SimpleTable } from './business-ui';
import { trainingFields, vaccinationFields } from './dogs';
import { FollowUp } from './follow-up';
import { ContactLinks, InquiryDialog, type PublicSettings } from './public-contact';

type Party = { id: string; name: string; kind: string; phone?: string; email?: string };
type Medical = {
  revision: number;
  id: string;
  eventDate: string;
  kind: string;
  title: string;
  notes: string;
  professional?: string;
};
type PortalDog = Dog & {
  ownerParty?: Party;
  custodianParty?: Party;
  assignedTrainer?: { name: string };
  medicalEntries?: Medical[];
};
type Cross = {
  id: string;
  publicTitle: string;
  publicDescription?: string;
  plannedDate: string;
  expectedBirthDate?: string;
  expectedDeliveryDate?: string;
  windowStart?: string;
  windowEnd?: string;
  status: string;
  puppyPrice: string;
  currency: string;
  contact: string;
  dam: PortalDog;
  sire: PortalDog;
  litter?: { birthDate: string; puppies: PortalDog[] } | null;
};

export function RestrictedWorkspace({ user, logout }: { user: User; logout: () => Promise<void> }) {
  const [section, setSection] = useState('dogs');
  return (
    <div className="portal-shell">
      <a className="skip-link" href="#portal-content">
        Saltar al contenido
      </a>
      <header className="portal-header">
        <div className="portal-brand">
          <BrandMark />
          <div>
            <strong>ORYX K9</strong>
            <small>{user.role === 'CLIENT' ? 'MI ESPACIO' : 'ENTRENAMIENTO Y SALUD'}</small>
          </div>
        </div>
        <div className="portal-user">
          <span>
            {user.name}
            <small>{labels[user.role]}</small>
          </span>
          <Button variant="secondary" icon={LogOut} onClick={logout}>
            Cerrar sesión
          </Button>
        </div>
      </header>
      <main id="portal-content" className="portal-content">
        {user.role === 'CLIENT' ? (
          <>
            <div className="tabs" role="tablist" aria-label="Portal de clientes">
              {[
                ['dogs', 'Mis perros'],
                ['gallery', 'Galería de venta y reservas'],
              ].map(([id, name]) => (
                <button
                  role="tab"
                  aria-selected={section === id}
                  className={section === id ? 'active' : ''}
                  key={id}
                  onClick={() => setSection(id)}
                >
                  {name}
                </button>
              ))}
            </div>
            {section === 'dogs' ? <OwnedDogs /> : <Gallery />}
          </>
        ) : (
          <TrainerWorkspace user={user} />
        )}
      </main>
      <footer className="portal-footer">
        <details>
          <summary>Mis preferencias de avisos</summary>
          <NotificationPreferences />
        </details>
        ORYX K9 · Unidad Canina ·{' '}
        {user.role === 'CLIENT' ? 'Tu equipo, siempre cerca.' : 'Seguimiento de los perros asignados.'}
      </footer>
    </div>
  );
}

function Photo({ dog, source }: { dog: PortalDog; source: 'portal' | 'trainer' | 'gallery' }) {
  const url = dog.photoId
    ? `${API}/${source === 'gallery' ? 'portal/gallery/photos' : `${source}/documents`}/${dog.photoId}${source === 'gallery' ? '' : '/download'}`
    : null;
  return (
    <div className={`portal-photo ${url ? '' : 'placeholder'}`}>
      {url ? (
        <img src={url} alt={dog.name} loading="lazy" decoding="async" />
      ) : (
        <>
          <DogIcon size={56} />
          <span>Fotografía por incorporar</span>
        </>
      )}
    </div>
  );
}
function DogCards({
  items,
  source,
  onOpen,
}: {
  items: PortalDog[];
  source: 'portal' | 'trainer' | 'gallery';
  onOpen: (dog: PortalDog) => void;
}) {
  return (
    <div className="portal-grid">
      {items.map((d) => (
        <button className="portal-card" key={d.id} onClick={() => onOpen(d)} aria-label={`Ver ${d.name}`}>
          <Photo dog={d} source={source} />
          <div className="portal-card-content">
            <div className="portal-card-top">
              <span className="eyebrow">{d.breed}</span>
              <Badge value={d.sex} />
            </div>
            <h2>{d.name}</h2>
            <p>{d.publicDescription || `${d.code} · ${labels[d.workStatus] || d.workStatus}`}</p>
            {source === 'gallery' && d.salePrice && (
              <strong className="portal-price">{money(d.salePrice, d.saleCurrency || 'CRC')}</strong>
            )}
            <span className="portal-open">Ver {source === 'gallery' ? 'información' : 'historial'} →</span>
          </div>
        </button>
      ))}
    </div>
  );
}
function OwnedDogs() {
  const [id, setId] = useState<string | null>(null),
    [page, setPage] = useState(1);
  const r = useResource<PageData<PortalDog>>(`/portal/dogs?page=${page}&pageSize=12`);
  if (id) return <HistoryDetail id={id} mode="portal" onBack={() => setId(null)} />;
  return (
    <>
      <PageHeading
        eyebrow="TUS COMPAÑEROS"
        title="Mis perros"
        description="Su historia, su bienestar y cada paso de su entrenamiento."
      />
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox message={r.error} />
      ) : r.data?.items.length ? (
        <>
          <DogCards items={r.data.items} source="portal" onOpen={(d) => setId(d.id)} />
          <Pager page={page} data={r.data} setPage={setPage} />
        </>
      ) : (
        <Empty
          icon={DogIcon}
          title="Tus perros aparecerán aquí"
          description="Administración vincula cada expediente con su propietario. También puedes explorar las publicaciones de la galería."
        />
      )}
    </>
  );
}
function Contact({ value }: { value?: string }) {
  const href =
    value && /^[+\d][\d\s()+-]{5,25}$/.test(value)
      ? `tel:${value.replace(/[^+\d]/g, '')}`
      : value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? `mailto:${value}`
        : null;
  return (
    <div className="portal-contact">
      <span className="eyebrow">CONTACTO PARA APARTAR</span>
      <strong>{value || 'Consulta con administración'}</strong>
      {href && (
        <a className="button button-primary" href={href}>
          Contactar para apartar
        </a>
      )}
      <small>La disponibilidad y las condiciones se confirman con ORYX K9.</small>
    </div>
  );
}
function PublicProfile({
  dog,
  source = 'gallery',
  price = true,
}: {
  dog: PortalDog;
  source?: 'gallery' | 'portal' | 'trainer';
  price?: boolean;
}) {
  const sections = [
    ['Información general', dog.publicDescription],
    ['Logros', dog.achievements],
    ['Pedigrí', dog.pedigreeSummary],
    ['Entrenamiento', dog.trainingSummary],
    ['Funcionalidad y especialidades', dog.functionalities],
    ['Salud publicada', dog.healthSummary],
  ];
  return (
    <div className="portal-profile">
      <Photo dog={dog} source={source} />
      <div>
        <div className="eyebrow">
          {dog.breed} · {labels[dog.sex] || dog.sex}
        </div>
        <h1>{dog.name}</h1>
        <p>{dog.registeredName}</p>
        <div className="badge-row">
          <Badge value={dog.workStatus} />
          <Badge value={dog.availability} />
        </div>
        {dog.birthDate && <p>Nacimiento: {formatDate(dog.birthDate)}</p>}
        {price && dog.salePrice && (
          <p className="portal-price">{money(dog.salePrice, dog.saleCurrency || 'CRC')}</p>
        )}
        {sections
          .filter(([, v]) => v)
          .map(([title, value]) => (
            <section className="portal-copy" key={title}>
              <h3>{title}</h3>
              <p>{value}</p>
            </section>
          ))}
        {price && <Contact value={dog.saleContact} />}
      </div>
    </div>
  );
}
export function Gallery() {
  const contact = useResource<PublicSettings>('/public/settings');
  const [inquiring, setInquiring] = useState(false);
  const [kind, setKind] = useState('dogs'),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<PortalDog | Cross | null>(null),
    [parent, setParent] = useState<PortalDog | null>(null);
  const r = useResource<PageData<PortalDog | Cross>>(`/portal/gallery/${kind}?page=${page}&pageSize=12`);
  if (parent)
    return (
      <>
        <Button variant="secondary" icon={ArrowLeft} onClick={() => setParent(null)}>
          Volver al cruce
        </Button>
        <PublicProfile dog={parent} price={false} />
      </>
    );
  if (selected)
    return (
      <>
        <Button variant="secondary" icon={ArrowLeft} onClick={() => setSelected(null)}>
          Volver a la galería
        </Button>
        {'dam' in selected ? (
          <>
            <PageHeading
              eyebrow={selected.litter ? 'CAMADA DISPONIBLE' : 'RESERVA · CRUCE PROGRAMADO'}
              title={selected.publicTitle}
              description={selected.publicDescription || 'Conoce a los padres de esta futura camada.'}
            />
            <p>Fecha prevista del cruce: {formatDate(selected.plannedDate)}</p>
            <p>
              {selected.litter ? 'Nacimiento' : 'Nacimiento previsto'}:{' '}
              {formatDate(selected.litter?.birthDate || selected.expectedBirthDate)}
            </p>
            <p>Entrega prevista: {formatDate(selected.expectedDeliveryDate)}</p>
            <p className="portal-price">{money(selected.puppyPrice, selected.currency)} por cachorro</p>
            <div className="portal-parents">
              <div>
                <h2>Madre</h2>
                <DogCards items={[selected.dam]} source="gallery" onOpen={setParent} />
              </div>
              <div>
                <h2>Padre</h2>
                <DogCards items={[selected.sire]} source="gallery" onOpen={setParent} />
              </div>
            </div>
            <Contact value={selected.contact} />
            <p className="muted">Las fechas corresponden a la planificación publicada y pueden cambiar.</p>
          </>
        ) : (
          <PublicProfile dog={selected} />
        )}
        <ContactLinks
          settings={contact.data}
          interest={{
            kind: 'dam' in selected ? 'CROSS' : 'DOG',
            id: selected.id,
            label: 'dam' in selected ? selected.publicTitle : selected.name,
          }}
        />
        <Button onClick={() => setInquiring(true)}>Enviar consulta de compra</Button>
        <a
          className="button button-secondary"
          href={`/disponibles?tipo=${'dam' in selected ? 'crosses' : 'dogs'}&id=${selected.id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir enlace público
        </a>
        {inquiring && (
          <InquiryDialog
            kind="PURCHASE"
            interest={{
              kind: 'dam' in selected ? 'CROSS' : 'DOG',
              id: selected.id,
              label: 'dam' in selected ? selected.publicTitle : selected.name,
            }}
            onClose={() => setInquiring(false)}
          />
        )}
      </>
    );
  return (
    <>
      <PageHeading
        eyebrow="EL PRÓXIMO CAPÍTULO"
        title="Encuentra a tu próximo compañero"
        description="Perros disponibles y futuras camadas publicadas por ORYX K9."
      />
      <div className="tabs" role="tablist" aria-label="Tipo de publicación">
        {[
          ['dogs', 'Perros en venta'],
          ['crosses', 'Reservas · Cruces'],
        ].map(([key, label]) => (
          <button
            role="tab"
            aria-selected={key === kind}
            className={key === kind ? 'active' : ''}
            key={key}
            onClick={() => {
              setKind(key);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox message={r.error} />
      ) : r.data?.items.length ? (
        <>
          {kind === 'dogs' ? (
            <DogCards items={r.data.items as PortalDog[]} source="gallery" onOpen={setSelected} />
          ) : (
            <div className="portal-grid">
              {(r.data.items as Cross[]).map((c) => (
                <button className="portal-card cross-card" key={c.id} onClick={() => setSelected(c)}>
                  <div className="cross-photos">
                    <Photo dog={c.dam} source="gallery" />
                    <Photo dog={c.sire} source="gallery" />
                  </div>
                  <div className="portal-card-content">
                    <span className="eyebrow">CRUCE PROGRAMADO</span>
                    <h2>{c.publicTitle}</h2>
                    <p>
                      {c.dam.name} × {c.sire.name}
                    </p>
                    <p>{formatDate(c.plannedDate)}</p>
                    <strong className="portal-price">{money(c.puppyPrice, c.currency)}</strong>
                    <span className="portal-open">Conocer a los padres →</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          <Pager page={page} data={r.data} setPage={setPage} />
        </>
      ) : (
        <Empty
          icon={ShoppingBag}
          title="Nuevas publicaciones próximamente"
          description="Aquí aparecerán únicamente los perros disponibles para venta y los cruces que publique administración."
        />
      )}
    </>
  );
}

const medicalFields: FieldDef[] = [
  { name: 'eventDate', label: 'Fecha', type: 'date', required: true, defaultValue: today(), max: today() },
  {
    name: 'kind',
    label: 'Tipo de registro',
    type: 'select',
    required: true,
    options: ['OBSERVATION', 'CONSULTATION', 'TREATMENT', 'DEWORMING', 'ALLERGY', 'INJURY', 'SURGERY', 'LAB'],
  },
  { name: 'title', label: 'Asunto médico', required: true },
  { name: 'professional', label: 'Profesional responsable' },
  { name: 'diagnosis', label: 'Diagnóstico registrado por el responsable' },
  {
    name: 'clinicalStatus',
    label: 'Estado clínico registrado',
    type: 'select',
    options: [
      { value: 'SUSPECTED', label: 'Sospecha' },
      { value: 'CONFIRMED', label: 'Confirmado' },
      { value: 'RESOLVED', label: 'Resuelto' },
    ],
  },
  { name: 'allergen', label: 'Alérgeno o reacción identificada' },
  {
    name: 'medication',
    label: 'Medicación indicada por el profesional',
    type: 'textarea',
    hint: 'Transcribe la indicación profesional. El sistema no recomienda tratamientos ni dosis.',
  },
  { name: 'notes', label: 'Detalle del registro', type: 'textarea', required: true },
];
export function TrainerWorkspace({ user }: { user: User }) {
  const [id, setId] = useState<string | null>(null),
    [page, setPage] = useState(1);
  const r = useResource<PageData<PortalDog>>(`/trainer/dogs?page=${page}&pageSize=12`);
  if (id)
    return <HistoryDetail id={id} mode="trainer" admin={user.role === 'ADMIN'} onBack={() => setId(null)} />;
  return (
    <>
      <PageHeading
        eyebrow="SEGUIMIENTO Y CUIDADO"
        title={user.role === 'ADMIN' ? 'Entrenamiento e historial médico' : 'Mis perros asignados'}
        description={
          user.role === 'ADMIN'
            ? 'Consulta y registra el seguimiento de cada perro.'
            : 'Añade entrenamientos, observaciones médicas, vacunas y comprobantes. Administración gestiona las correcciones.'
        }
      />
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox message={r.error} />
      ) : r.data?.items.length ? (
        <>
          <DogCards items={r.data.items} source="trainer" onOpen={(d) => setId(d.id)} />
          <Pager page={page} data={r.data} setPage={setPage} />
        </>
      ) : (
        <Empty
          icon={HeartPulse}
          title="No tienes perros asignados"
          description="Administración debe asignarte un perro para comenzar a registrar su seguimiento."
        />
      )}
    </>
  );
}

function HistoryDetail({
  id,
  mode,
  onBack,
  admin = false,
}: {
  id: string;
  mode: 'trainer' | 'portal';
  onBack: () => void;
  admin?: boolean;
}) {
  const r = useResource<PortalDog>(`/${mode}/dogs/${id}`),
    [form, setForm] = useState<string | null>(null),
    [editing, setEditing] = useState<Medical | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    setBusy(true);
    setError('');
    try {
      await api(`/trainer/dogs/${id}/documents`, 'POST', new FormData(f));
      f.reset();
      r.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (r.loading) return <Loading />;
  if (r.error) return <ErrorBox message={r.error} />;
  const d = r.data;
  if (!d) return null;
  const writable = mode === 'trainer';
  return (
    <>
      <Button icon={ArrowLeft} variant="secondary" onClick={onBack}>
        Volver a mis perros
      </Button>
      <PageHeading
        eyebrow={writable ? 'SEGUIMIENTO DEL PERRO' : 'HISTORIAL DE TU PERRO'}
        title={d.name}
        description={`${d.breed} · ${d.code}`}
      />
      {error && <ErrorBox message={error} />}
      <div className="portal-dog-intro">
        <Photo dog={d} source={mode} />
        <Panel title="Identificación y cuidado">
          <dl className="details-list">
            <div>
              <dt>Nacimiento</dt>
              <dd>{formatDate(d.birthDate)}</dd>
            </div>
            <div>
              <dt>Sexo</dt>
              <dd>{labels[d.sex] || d.sex}</dd>
            </div>
            {d.ownerParty && (
              <div>
                <dt>Propietario</dt>
                <dd>{d.ownerParty.name}</dd>
              </div>
            )}
            {d.custodianParty && (
              <div>
                <dt>A cargo de</dt>
                <dd>{d.custodianParty.name}</dd>
              </div>
            )}
            {d.assignedTrainer && (
              <div>
                <dt>Entrenador</dt>
                <dd>{d.assignedTrainer.name}</dd>
              </div>
            )}
            {d.microchip && (
              <div>
                <dt>Microchip</dt>
                <dd>{d.microchip}</dd>
              </div>
            )}
            {d.pedigreeNumber && (
              <div>
                <dt>Pedigrí / registro</dt>
                <dd>
                  {d.pedigreeNumber} · {d.registry}
                </dd>
              </div>
            )}
            <div>
              <dt>Estado</dt>
              <dd>
                <Badge value={d.workStatus} />
              </dd>
            </div>
          </dl>
        </Panel>
      </div>
      {writable && (
        <div className="portal-actions">
          <Button icon={Plus} onClick={() => setForm('training')}>
            Añadir entrenamiento
          </Button>
          <Button variant="secondary" onClick={() => setForm('medical')}>
            Añadir registro médico
          </Button>
          <Button variant="secondary" onClick={() => setForm('vaccinations')}>
            Añadir vacuna
          </Button>
          <Button variant="secondary" onClick={() => setForm('weights')}>
            Añadir peso
          </Button>
        </div>
      )}
      <FollowUp dogId={id} role={admin ? 'ADMIN' : writable ? 'TRAINER' : 'CLIENT'} />
      <RecordEvidence
        key={d.medicalEntries?.map((m) => m.revision).join('-')}
        dogId={id}
        role={admin ? 'ADMIN' : writable ? 'TRAINER' : 'CLIENT'}
      />
      <HistoryPanels
        dog={d}
        mode={mode}
        admin={admin}
        onEdit={(m) => {
          setEditing(m);
          setForm('medical');
        }}
        onArchive={async (m) => {
          if (
            !window.confirm(
              '¿Retirar este registro médico del historial visible? Se conservará archivado internamente.',
            )
          )
            return;
          try {
            await api(`/trainer/medical/${m.id}`, 'DELETE');
            r.reload();
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      />
      {writable && (
        <Panel title="Añadir comprobante médico">
          <form className="upload-form" onSubmit={upload}>
            <input
              name="file"
              aria-label="Comprobante médico"
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              required
            />
            <Button type="submit" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar comprobante'}
            </Button>
          </form>
        </Panel>
      )}
      {form && (
        <Modal
          title={
            form === 'training'
              ? 'Añadir entrenamiento'
              : form === 'medical'
                ? editing
                  ? 'Corregir registro médico'
                  : 'Añadir registro médico'
                : form === 'weights'
                  ? 'Añadir peso'
                  : 'Añadir vacuna'
          }
          onClose={() => {
            setForm(null);
            setEditing(null);
          }}
        >
          <DataForm
            fields={
              form === 'training'
                ? trainingFields
                : form === 'vaccinations'
                  ? vaccinationFields()
                  : form === 'weights'
                    ? [
                        {
                          name: 'date',
                          label: 'Fecha del peso',
                          type: 'date',
                          required: true,
                          defaultValue: today(),
                          max: today(),
                        },
                        {
                          name: 'kg',
                          label: 'Peso (kg)',
                          type: 'number',
                          step: '0.01',
                          min: 0.01,
                          required: true,
                        },
                      ]
                    : [
                        ...medicalFields,
                        ...(editing
                          ? [
                              {
                                name: 'correctionReason',
                                label: 'Motivo de la corrección',
                                required: true,
                              } as FieldDef,
                            ]
                          : []),
                      ].map((f) => ({
                        ...f,
                        defaultValue: editing
                          ? f.name === 'eventDate'
                            ? editing.eventDate.slice(0, 10)
                            : (editing as unknown as Record<string, string>)[f.name]
                          : f.defaultValue,
                      }))
            }
            onCancel={() => {
              setForm(null);
              setEditing(null);
            }}
            onSubmit={async (values) => {
              if (form === 'training') values.occurredAt = localInstant(String(values.occurredAt));
              if (editing) values.revision = editing.revision;
              await api(
                editing ? `/trainer/medical/${editing.id}` : `/trainer/dogs/${id}/${form}`,
                editing ? 'PATCH' : 'POST',
                values,
              );
              setForm(null);
              setEditing(null);
              r.reload();
            }}
            submitLabel="Guardar registro"
          />
        </Modal>
      )}
    </>
  );
}

function HistoryPanels({
  dog,
  mode,
  admin,
  onEdit,
  onArchive,
}: {
  dog: PortalDog;
  mode: 'portal' | 'trainer';
  admin?: boolean;
  onEdit: (m: Medical) => void;
  onArchive: (m: Medical) => void;
}) {
  return (
    <div className="portal-history">
      <Panel title="Historial médico">
        {dog.medicalEntries?.length ? (
          dog.medicalEntries.map((m) => (
            <article className="history-entry" key={m.id}>
              <div className="portal-card-top">
                <Badge value={m.kind} />
                <time>{formatDate(m.eventDate)}</time>
              </div>
              <h3>{m.title}</h3>
              <p>{m.notes}</p>
              {m.professional && <small>Profesional: {m.professional}</small>}
              {admin && (
                <div className="portal-actions">
                  <Button variant="secondary" onClick={() => onEdit(m)}>
                    Corregir
                  </Button>
                  <Button variant="secondary" onClick={() => onArchive(m)}>
                    Retirar
                  </Button>
                </div>
              )}
            </article>
          ))
        ) : (
          <p className="panel-text muted">Sin registros médicos adicionales.</p>
        )}
      </Panel>
      <Panel title="Vacunas">
        {dog.vaccinations?.length ? (
          dog.vaccinations.map((v: Vaccination) => (
            <article className="history-entry" key={v.id}>
              <h3>{v.product}</h3>
              <p>
                Aplicación: {formatDate(v.appliedDate)} · Próxima dosis: {formatDate(v.nextDueDate)}
              </p>
              <p>
                {[
                  v.manufacturer && `Fabricante: ${v.manufacturer}`,
                  v.batch && `Lote: ${v.batch}`,
                  v.professional && `Profesional: ${v.professional}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p>{v.notes}</p>
            </article>
          ))
        ) : (
          <p className="panel-text muted">Sin vacunas registradas.</p>
        )}
      </Panel>
      <Panel title="Historial de entrenamiento">
        {dog.trainingSessions?.length ? (
          dog.trainingSessions.map((t: Training) => (
            <article className="history-entry" key={t.id}>
              <div className="portal-card-top">
                <h3>{t.discipline}</h3>
                <time>{formatDate(t.occurredAt, true)}</time>
              </div>
              <p>
                <strong>{t.objective}</strong>
              </p>
              <p>
                {t.durationMinutes} min · {t.trainerName} {t.location && `· ${t.location}`}
              </p>
              {[
                ['Ejercicios', t.exercises],
                ['Material', t.material],
                ['Dificultad', t.difficulty],
                ['Puntuación', t.score],
                ['Aciertos', t.successes],
                ['Falsas alertas', t.falseAlerts],
                ['Omisiones', t.misses],
                ['Observaciones', t.notes],
              ]
                .filter(([, v]) => v !== undefined && v !== null && v !== '')
                .map(([k, v]) => (
                  <p key={String(k)}>
                    <strong>{k}: </strong>
                    {v}
                  </p>
                ))}
            </article>
          ))
        ) : (
          <p className="panel-text muted">Sin entrenamientos registrados.</p>
        )}
      </Panel>
      <Panel title="Pesos registrados">
        {dog.weights?.length ? (
          <SimpleTable headers={['Fecha', 'Peso']}>
            {dog.weights.map((w: Weight) => (
              <tr key={w.id}>
                <td>{formatDate(w.date)}</td>
                <td>{w.kg} kg</td>
              </tr>
            ))}
          </SimpleTable>
        ) : (
          <p className="panel-text muted">Sin pesos registrados.</p>
        )}
      </Panel>
      {mode === 'portal' && (
        <>
          <Panel title="Citas y controles">
            {dog.appointments?.length ? (
              dog.appointments.map((a: Appointment) => (
                <article className="history-entry" key={a.id}>
                  <h3>{a.title}</h3>
                  <p>
                    {formatDate(a.startsAt, true)} · {labels[a.status]} · {a.professional}
                  </p>
                  <p>{a.location}</p>
                  <p>{a.notes}</p>
                </article>
              ))
            ) : (
              <p className="panel-text muted">Sin citas registradas.</p>
            )}
          </Panel>
          <Panel title="Historial de ubicación y responsable">
            {dog.movements?.length ? (
              dog.movements.map((m: Movement) => (
                <article className="history-entry" key={m.id}>
                  <strong>
                    {formatDate(m.date, true)} · {m.location}
                  </strong>
                  <p>{m.custodian}</p>
                  <p>{m.notes}</p>
                </article>
              ))
            ) : (
              <p className="panel-text muted">Sin movimientos registrados.</p>
            )}
          </Panel>
        </>
      )}
      <Panel title="Fotos y documentos del expediente">
        {dog.documents?.length ? (
          <ul className="business-files">
            {dog.documents.map((f: DocumentRecord) => (
              <li key={f.id}>
                <a href={`${API}/${mode}/documents/${f.id}/download`} target="_blank" rel="noreferrer">
                  {f.name}
                </a>
                <small>
                  {labels[f.category] || f.category} · {formatDate(f.createdAt)}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel-text muted">Sin documentos adjuntos.</p>
        )}
      </Panel>
    </div>
  );
}

export function PartiesPage() {
  const r = useResource<Party[]>('/parties'),
    [editing, setEditing] = useState<Party | 'new' | null>(null);
  const p = editing && editing !== 'new' ? editing : null;
  return (
    <>
      <PageHeading
        eyebrow="PROPIEDAD Y CUSTODIA"
        title="Personas y entidades"
        description="Propietarios y responsables: ORYX K9, particulares, municipalidades y otras organizaciones."
      >
        <Button icon={Plus} onClick={() => setEditing('new')}>
          Registrar persona o entidad
        </Button>
      </PageHeading>
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox message={r.error} />
      ) : (
        <Panel title="Registro de propietarios y responsables">
          <SimpleTable headers={['Nombre', 'Tipo', 'Contacto', 'Acción']}>
            {r.data?.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>
                  <Badge value={p.kind} />
                </td>
                <td>{p.phone || p.email || 'Sin registrar'}</td>
                <td>
                  <Button variant="secondary" onClick={() => setEditing(p)}>
                    Editar
                  </Button>
                </td>
              </tr>
            ))}
          </SimpleTable>
        </Panel>
      )}
      {editing && (
        <BusinessForm
          title={p ? 'Editar persona o entidad' : 'Registrar propietario o responsable'}
          path={p ? `/parties/${p.id}` : '/parties'}
          method={p ? 'PATCH' : 'POST'}
          fields={[
            { name: 'name', label: 'Nombre', required: true, defaultValue: p?.name },
            ...(p?.kind === 'UNIT'
              ? []
              : [
                  {
                    name: 'kind',
                    label: 'Tipo',
                    type: 'select' as const,
                    options: ['PERSON', 'MUNICIPALITY', 'ORGANIZATION'],
                    required: true,
                    defaultValue: p?.kind || 'PERSON',
                  },
                ]),
            { name: 'phone', label: 'Teléfono', defaultValue: p?.phone },
            { name: 'email', label: 'Correo', type: 'email', defaultValue: p?.email },
          ]}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            r.reload();
          }}
        />
      )}
    </>
  );
}

export function CatalogManager() {
  const [page, setPage] = useState(1),
    [editing, setEditing] = useState<Dog | null>(null),
    [preview, setPreview] = useState(false);
  const r = useResource<PageData<Dog>>(`/dogs?includePuppies=true&page=${page}&pageSize=20`);
  const baseFields: FieldDef[] = [
    {
      name: 'availableForSale',
      label: 'Disponible para venta',
      type: 'checkbox',
      hint: 'Se puede combinar con cruza y entrenamiento.',
    },
    {
      name: 'availableForBreeding',
      label: 'Disponible para cruza',
      type: 'checkbox',
      hint: 'Permite seleccionarlo como progenitor en Crianza, aunque también esté en venta o entrenamiento.',
    },
    {
      name: 'salePublished',
      label: 'Publicar este perro en venta',
      type: 'checkbox',
      hint: 'Sólo se muestra si está disponible y tiene precio y contacto.',
    },
    { name: 'salePrice', label: 'Precio de venta', inputMode: 'decimal' },
    { name: 'saleCurrency', label: 'Moneda', type: 'select', required: true, options: ['CRC', 'USD'] },
    {
      name: 'saleContact',
      label: 'Contacto para apartar',
      hint: 'Nombre de la persona responsable y teléfono o correo, por ejemplo María Vargas · +123456789.',
    },
    ...(
      [
        ['publicDescription', 'Información general'],
        ['achievements', 'Logros'],
        ['pedigreeSummary', 'Pedigrí para la galería'],
        ['trainingSummary', 'Entrenamiento publicado'],
        ['functionalities', 'Funcionalidad'],
        ['healthSummary', 'Salud que pueden ver interesados'],
      ] as const
    ).map(([name, label]) => ({ name, label, type: 'textarea' as const, full: true })),
  ];
  const fields = baseFields.map((f) => ({
    ...f,
    defaultValue: editing ? (editing as unknown as Record<string, string | boolean>)[f.name] : undefined,
  }));
  return (
    <>
      <PageHeading
        eyebrow="VENTA Y RESERVAS"
        title="Publicaciones y categorías"
        description="Decide qué perros están disponibles para venta o cruza y qué información ven los interesados."
      >
        <Button variant="secondary" onClick={() => setPreview(!preview)}>
          {preview ? 'Volver a administrar' : 'Vista de clientes'}
        </Button>
      </PageHeading>
      {preview ? (
        <Gallery />
      ) : (
        <>
          {r.loading ? (
            <Loading />
          ) : r.error ? (
            <ErrorBox message={r.error} />
          ) : (
            <Panel
              title="Perros registrados"
              subtitle="Las reservas se publican desde el plan de cruce en Crianza."
            >
              <SimpleTable headers={['Perro', 'Categoría', 'Publicación', 'Acción']}>
                {r.data?.items.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {d.name}
                      <small>{d.code}</small>
                    </td>
                    <td>
                      <div className="badge-group">
                        {d.availableForSale && <Badge value="FOR_SALE" />}
                        {d.availableForBreeding && <Badge value="FOR_BREEDING" />}
                        {!d.availableForSale && !d.availableForBreeding && <Badge value="NOT_LISTED" />}
                        <Badge value={d.workStatus} />
                      </div>
                    </td>
                    <td>
                      {d.salePublished && d.availability === 'AVAILABLE' ? 'En galería' : 'No publicada'}
                    </td>
                    <td>
                      <Button variant="secondary" onClick={() => setEditing(d)}>
                        Configurar publicación
                      </Button>
                    </td>
                  </tr>
                ))}
              </SimpleTable>
              <Pager page={page} data={r.data} setPage={setPage} />
            </Panel>
          )}
        </>
      )}
      {editing && (
        <BusinessForm
          title={`Publicación · ${editing.name}`}
          description="Sólo los textos de este formulario y la identidad básica se muestran a interesados. El historial completo queda reservado al propietario."
          path={`/catalog/dogs/${editing.id}`}
          method="PATCH"
          fields={fields}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            r.reload();
          }}
        />
      )}
    </>
  );
}
