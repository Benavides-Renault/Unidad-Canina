'use client';
import type { CertificateTemplate } from './templates';
import { useState, type FormEvent } from 'react';
import { ArrowLeft, Building2, FileText, Plus, Pencil, Upload, ClipboardList } from 'lucide-react';
import {
  api,
  API,
  errorMessage,
  formatDate,
  localInstant,
  today,
  type Dog,
  type PageData,
  type User,
} from '@/lib/api';
import { useResource, useCatalog } from '@/lib/use-resource';
import { Badge, Button, Empty, ErrorBox, Loading, PageHeading, Panel, type FieldDef } from './ui';
import { BusinessForm, choice, money, Pager, SimpleTable } from './business-ui';
type Contact = { id: string; name: string; position?: string; email?: string; phone?: string };
type Institution = {
  id: string;
  name: string;
  kind: string;
  taxId?: string;
  address?: string;
  notes?: string;
  contacts: Contact[];
};
type Assignment = {
  id: string;
  contractId: string;
  dogId: string;
  role: string;
  startDate: string;
  endDate: string;
  releasedOn?: string;
  releaseReason?: string;
  overlapReason?: string;
  dog: { id: string; name: string; code: string };
  handler: { name: string };
  contract?: { id: string; number: string; title: string; status: string; institution: { name: string } };
};
type Service = {
  id: string;
  occurredAt: string;
  endsAt: string;
  location: string;
  publicSummary: string;
  internalNotes?: string;
  contract?: { number: string; title: string };
  recorder?: { name: string };
};
type Contract = {
  renewedFromId?: string;
  id: string;
  number: string;
  institutionId: string;
  institution: Institution;
  title: string;
  amount: string;
  currency: string;
  periodicity: string;
  startDate: string;
  endDate: string;
  status: string;
  responsible: string;
  clauses?: string;
  notes?: string;
  revision: number;
  assignments: Assignment[];
  files: { id: string; name: string; version: number; size: number }[];
  services: Service[];
  versions: {
    id: string;
    revision: number;
    createdAt: string;
    snapshot: { title: string; endDate: string; amount: string; currency: string; status: string };
  }[];
};
const institutionFields: FieldDef[] = [
  { name: 'name', label: 'Institución / cliente', required: true },
  {
    name: 'kind',
    label: 'Tipo de institución',
    required: true,
    type: 'select',
    options: ['Municipalidad', 'Empresa', 'Persona', 'Otra'],
  },
  { name: 'taxId', label: 'Identificación tributaria' },
  { name: 'address', label: 'Dirección', full: true },
  { name: 'notes', label: 'Observaciones internas', type: 'textarea' },
];
const contactFields: FieldDef[] = [
  { name: 'name', label: 'Nombre del contacto', required: true },
  { name: 'position', label: 'Cargo' },
  { name: 'email', label: 'Correo de contacto', type: 'email' },
  { name: 'phone', label: 'Teléfono' },
];
function contractFields(institutions: Institution[], value?: Contract): FieldDef[] {
  const fields: FieldDef[] = [
    { name: 'number', label: 'Número de contrato', required: true },
    ...(!value
      ? [
          {
            name: 'institutionId',
            label: 'Institución',
            type: 'select',
            required: true,
            options: choice(institutions),
          } as FieldDef,
        ]
      : []),
    { name: 'title', label: 'Objeto del contrato', required: true, full: true },
    {
      name: 'amount',
      label: 'Monto del contrato',
      required: true,
      hint: 'Usa punto decimal, sin separadores de miles.',
    },
    {
      name: 'currency',
      label: 'Moneda',
      type: 'select',
      options: ['CRC', 'USD'],
      required: true,
      defaultValue: 'CRC',
    },
    {
      name: 'periodicity',
      label: 'Periodicidad',
      type: 'select',
      options: ['Pago único', 'Mensual', 'Trimestral', 'Anual', 'Según servicios'],
      required: true,
    },
    { name: 'startDate', label: 'Fecha de inicio', type: 'date', required: true, defaultValue: today() },
    { name: 'endDate', label: 'Fecha de vencimiento', type: 'date', required: true },
    {
      name: 'status',
      label: 'Estado del contrato',
      type: 'select',
      options: ['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
      required: true,
      defaultValue: 'DRAFT',
    },
    { name: 'responsible', label: 'Responsable del contrato', required: true },
    { name: 'clauses', label: 'Cláusulas resumidas (privadas)', type: 'textarea' },
    { name: 'notes', label: 'Notas internas', type: 'textarea' },
  ];
  return fields.map((f) => ({
    ...f,
    defaultValue: value ? (value as unknown as Record<string, string>)[f.name] : f.defaultValue,
  }));
}
export function ContractsPage({ user, openDog }: { user: User; openDog: (id: string) => void }) {
  const [id, setId] = useState<string | null>(null),
    [tab, setTab] = useState('contracts'),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [form, setForm] = useState<'institution' | 'contract' | null>(null);
  const canEdit = ['ADMIN'].includes(user.role);
  const listing = useResource<PageData<Contract>>(
    `/contracts?page=${page}&pageSize=20&search=${encodeURIComponent(search)}&status=${status}`,
  );
  const institutions = useCatalog<Institution>('/institutions');
  const templates = useResource<CertificateTemplate[]>('/templates');
  if (id)
    return (
      <ContractDetail
        id={id}
        user={user}
        onBack={() => {
          setId(null);
          listing.reload();
        }}
        openDog={openDog}
      />
    );
  return (
    <>
      <PageHeading
        eyebrow="RELACIONES Y COMPROMISOS"
        title="Contratos e instituciones"
        description="Acuerdos privados, responsables y servicios de la unidad."
      >
        {canEdit && (
          <Button icon={Plus} onClick={() => setForm(tab === 'contracts' ? 'contract' : 'institution')}>
            {tab === 'contracts' ? 'Nuevo contrato' : 'Nueva institución'}
          </Button>
        )}
      </PageHeading>
      <div className="tabs" role="tablist" aria-label="Contratos e instituciones">
        <button
          role="tab"
          aria-selected={tab === 'contracts'}
          className={tab === 'contracts' ? 'active' : ''}
          onClick={() => setTab('contracts')}
        >
          Contratos
        </button>
        <button
          role="tab"
          aria-selected={tab === 'institutions'}
          className={tab === 'institutions' ? 'active' : ''}
          onClick={() => setTab('institutions')}
        >
          Instituciones
        </button>
      </div>
      {tab === 'contracts' ? (
        <Panel
          title="Acuerdos registrados"
          subtitle="Los vencimientos generan recordatorios para administración y finanzas"
        >
          <div className="directory-toolbar">
            <input
              aria-label="Buscar contratos"
              placeholder="Buscar número u objeto…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <select
              aria-label="Filtrar contratos"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos los estados</option>
              <option value="ACTIVE">Activos</option>
              <option value="DRAFT">Borradores</option>
              <option value="COMPLETED">Finalizados</option>
              <option value="CANCELLED">Cancelados</option>
            </select>
          </div>
          {listing.loading ? (
            <Loading />
          ) : listing.error ? (
            <ErrorBox message={listing.error} retry={listing.reload} />
          ) : listing.data?.items.length ? (
            <SimpleTable headers={['Contrato', 'Institución', 'Monto', 'Vencimiento', 'Estado', 'Detalle']}>
              {listing.data.items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.number}</strong>
                    <small>{c.title}</small>
                  </td>
                  <td>{c.institution.name}</td>
                  <td>{money(c.amount, c.currency)}</td>
                  <td>{formatDate(c.endDate)}</td>
                  <td>
                    <Badge value={c.status} />
                  </td>
                  <td>
                    <Button variant="secondary" onClick={() => setId(c.id)}>
                      Abrir contrato
                    </Button>
                  </td>
                </tr>
              ))}
            </SimpleTable>
          ) : (
            <Empty
              icon={FileText}
              title="Tus acuerdos, en un solo lugar"
              description="Registra una institución y crea el primer contrato."
            />
          )}
          <Pager data={listing.data} page={page} setPage={setPage} />
        </Panel>
      ) : (
        <Institutions resource={institutions} canEdit={canEdit} />
      )}
      {form === 'institution' && (
        <BusinessForm
          title="Nueva institución"
          fields={institutionFields}
          path="/institutions"
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            institutions.reload();
          }}
        />
      )}
      {form === 'contract' &&
        (institutions.data?.items.length ? (
          <BusinessForm
            title="Nuevo contrato"
            fields={[
              {
                name: 'templateId',
                label: 'Plantilla contractual opcional',
                type: 'select',
                options: choice(templates.data?.filter((t) => t.kind === 'CONTRACT')),
                hint: 'Se usa para las cláusulas cuando dejas ese campo vacío.',
              },
              ...contractFields(institutions.data.items),
            ]}
            path="/contracts"
            onClose={() => setForm(null)}
            onSaved={(value) => {
              setForm(null);
              setId(String(value.id));
              listing.reload();
            }}
          />
        ) : (
          <Panel>
            <p className="panel-text">Primero registra la institución con la que realizarás el contrato.</p>
            <Button onClick={() => setForm('institution')}>Registrar institución</Button>
            <Button variant="ghost" onClick={() => setForm(null)}>
              Cancelar
            </Button>
          </Panel>
        ))}
    </>
  );
}
function Institutions({
  resource,
  canEdit,
}: {
  resource: ReturnType<typeof useResource<PageData<Institution>>>;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<Institution | null>(null),
    [editingContact, setEditingContact] = useState<{ institutionId: string; contact: Contact } | null>(null),
    [contact, setContact] = useState<Institution | null>(null),
    [page, setPage] = useState(1);
  return (
    <>
      <Panel title="Instituciones y contactos">
        {resource.loading ? (
          <Loading />
        ) : resource.error ? (
          <ErrorBox message={resource.error} />
        ) : resource.data?.items.length ? (
          <SimpleTable headers={['Institución', 'Tipo', 'Contactos', 'Acciones']}>
            {resource.data.items.slice((page - 1) * 20, page * 20).map((i) => (
              <tr key={i.id}>
                <td>
                  <strong>{i.name}</strong>
                  <small>{i.taxId || 'Sin identificación registrada'}</small>
                </td>
                <td>{i.kind}</td>
                <td>
                  {i.contacts.map((c) => (
                    <div key={c.id}>
                      <strong>{c.name}</strong>
                      <small>{[c.position, c.email, c.phone].filter(Boolean).join(' · ')}</small>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          onClick={() => setEditingContact({ institutionId: i.id, contact: c })}
                        >
                          Editar contacto
                        </Button>
                      )}
                    </div>
                  ))}
                </td>
                <td>
                  {canEdit && (
                    <>
                      <Button variant="ghost" icon={Pencil} onClick={() => setEditing(i)}>
                        Editar
                      </Button>
                      <Button variant="secondary" onClick={() => setContact(i)}>
                        Añadir contacto
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </SimpleTable>
        ) : (
          <Empty
            icon={Building2}
            title="Sin instituciones"
            description="Añade municipalidades, empresas y contactos autorizados."
          />
        )}
      </Panel>
      <Pager data={resource.data ? { ...resource.data, pageSize: 20 } : null} page={page} setPage={setPage} />
      {editing && (
        <BusinessForm
          title="Editar institución"
          path={`/institutions/${editing.id}`}
          method="PATCH"
          fields={institutionFields.map((f) => ({
            ...f,
            defaultValue: (editing as unknown as Record<string, string>)[f.name],
          }))}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            resource.reload();
          }}
        />
      )}
      {editingContact && (
        <BusinessForm
          title="Editar contacto"
          path={`/institutions/${editingContact.institutionId}/contacts/${editingContact.contact.id}`}
          method="PATCH"
          fields={[
            ...contactFields.map((f) => ({
              ...f,
              defaultValue: (editingContact.contact as unknown as Record<string, string>)[f.name],
            })),
            { name: 'active', label: 'Contacto activo', type: 'checkbox', defaultValue: true },
          ]}
          onClose={() => setEditingContact(null)}
          onSaved={() => {
            setEditingContact(null);
            resource.reload();
          }}
        />
      )}
      {contact && (
        <BusinessForm
          title="Nuevo contacto"
          description={contact.name}
          fields={contactFields}
          path={`/institutions/${contact.id}/contacts`}
          onClose={() => setContact(null)}
          onSaved={() => {
            setContact(null);
            resource.reload();
          }}
        />
      )}
    </>
  );
}
function ContractDetail({
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
  const { data: c, error, loading, reload } = useResource<Contract>(`/contracts/${id}`);
  const [form, setForm] = useState<'edit' | 'assign' | 'renew' | Assignment | null>(null),
    [uploadError, setUploadError] = useState(''),
    [busy, setBusy] = useState(false);
  const canEdit = ['ADMIN'].includes(user.role);
  const dogs = useCatalog<Dog>(canEdit ? '/dogs' : null),
    handlers = useResource<{ id: string; name: string }[]>(canEdit ? '/operations/handlers' : null);
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setUploadError('');
    const element = e.currentTarget;
    try {
      await api(`/contracts/${id}/files`, 'POST', new FormData(element));
      element.reset();
      reload();
    } catch (err) {
      setUploadError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (error || !c) return <ErrorBox message={error || 'Contrato no encontrado.'} retry={reload} />;
  return (
    <>
      <Button variant="ghost" icon={ArrowLeft} onClick={onBack}>
        Volver a contratos
      </Button>
      <PageHeading eyebrow={c.institution.name} title={c.number} description={c.title}>
        {canEdit && c.status !== 'CANCELLED' && (
          <Button variant="secondary" onClick={() => setForm('renew')}>
            Renovar contrato
          </Button>
        )}
        {canEdit && (
          <Button icon={Pencil} onClick={() => setForm('edit')}>
            Editar contrato
          </Button>
        )}
        <a
          className="button secondary"
          href={`${API}/contracts/${id}/client-report.pdf`}
          target="_blank"
          rel="noreferrer"
        >
          Informe para cliente PDF
        </a>
      </PageHeading>
      {c.renewedFromId && (
        <p className="inline-notice">
          Renovación vinculada al contrato anterior. Referencia: {c.renewedFromId}
        </p>
      )}
      <div className="detail-grid">
        <div className="detail-stack">
          <Panel title="Condiciones y vigencia">
            <dl className="details-list">
              <div>
                <dt>Estado</dt>
                <dd>
                  <Badge value={c.status} />
                </dd>
              </div>
              <div>
                <dt>Monto</dt>
                <dd>
                  {money(c.amount, c.currency)} · {c.periodicity}
                </dd>
              </div>
              <div>
                <dt>Vigencia</dt>
                <dd>
                  {formatDate(c.startDate)} → {formatDate(c.endDate)}
                </dd>
              </div>
              <div>
                <dt>Responsable</dt>
                <dd>{c.responsible}</dd>
              </div>
              <div>
                <dt>Versión</dt>
                <dd>{c.revision}</dd>
              </div>
            </dl>
            {c.clauses && <p className="panel-text">{c.clauses}</p>}
            {c.notes && <p className="panel-text">Notas internas: {c.notes}</p>}
          </Panel>
          <Panel
            title="Asignaciones e historial"
            action={
              canEdit && c.status === 'ACTIVE' ? (
                <Button icon={Plus} onClick={() => setForm('assign')}>
                  Asignar perro
                </Button>
              ) : undefined
            }
          >
            {c.assignments.length ? (
              <SimpleTable headers={['Perro / responsable', 'Periodo', 'Estado', 'Acción']}>
                {c.assignments.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <button className="text-link" onClick={() => openDog(a.dogId)}>
                        {a.dog.name}
                      </button>
                      <small>
                        {a.handler.name} · {a.role}
                      </small>
                    </td>
                    <td>
                      {formatDate(a.startDate)}
                      <small>Hasta {formatDate(a.endDate)}</small>
                    </td>
                    <td>
                      {a.releasedOn
                        ? `Retirada ${formatDate(a.releasedOn)}`
                        : a.endDate < today()
                          ? 'Periodo finalizado'
                          : 'Programada / vigente'}
                      {a.overlapReason && <small>Excepción: {a.overlapReason}</small>}
                    </td>
                    <td>
                      {canEdit && !a.releasedOn && (
                        <Button variant="secondary" onClick={() => setForm(a)}>
                          Retirar asignación
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </SimpleTable>
            ) : (
              <p className="panel-text muted">Todavía no hay perros asignados a este contrato.</p>
            )}
          </Panel>
          <Panel
            title="Servicios registrados"
            subtitle="El PDF incluye únicamente fecha y resumen para el cliente"
          >
            {c.services.length ? (
              <SimpleTable headers={['Fecha / lugar', 'Resumen para cliente', 'Notas internas']}>
                {c.services.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {formatDate(s.occurredAt, true)}
                      <small>{s.location}</small>
                    </td>
                    <td className="business-wrap">{s.publicSummary}</td>
                    <td className="business-wrap">{s.internalNotes || '—'}</td>
                  </tr>
                ))}
              </SimpleTable>
            ) : (
              <p className="panel-text muted">Registra turnos y servicios desde Operaciones.</p>
            )}
          </Panel>
        </div>
        <div className="detail-stack">
          <Panel title="Archivos privados" subtitle="Cada carga conserva las versiones anteriores">
            {c.files.map((f) => (
              <p className="panel-text" key={f.id}>
                <a
                  className="text-link"
                  href={`${API}/contracts/${id}/files/${f.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Versión {f.version} · {f.name}
                </a>
                <small>{Math.ceil(f.size / 1024)} KB</small>
              </p>
            ))}
            {!c.files.length && <p className="panel-text muted">Sin archivos cargados.</p>}
            {canEdit && (
              <form className="panel-text" onSubmit={upload}>
                <label className="field">
                  Archivo del contrato
                  <input name="file" type="file" accept="application/pdf,image/png,image/jpeg" required />
                </label>
                <p>PDF, PNG o JPEG · máximo 10 MB</p>
                {uploadError && <ErrorBox message={uploadError} />}
                <Button type="submit" icon={Upload} disabled={busy}>
                  {busy ? 'Cargando…' : 'Subir versión'}
                </Button>
              </form>
            )}
          </Panel>
          <Panel title="Versiones del contrato">
            {c.versions.map((v) => (
              <div className="panel-text" key={v.id}>
                <strong>
                  Versión {v.revision} · {formatDate(v.createdAt, true)}
                </strong>
                <p>{v.snapshot.title}</p>
                <small>
                  {money(v.snapshot.amount, v.snapshot.currency)} · Vence{' '}
                  {formatDate(v.snapshot.endDate.slice(0, 10))}
                </small>
              </div>
            ))}
          </Panel>
        </div>
      </div>
      {form === 'renew' && (
        <BusinessForm
          title="Renovar contrato"
          description="Se crea otro contrato enlazado y se conserva el historial anterior. Las asignaciones se registran en el nuevo periodo."
          path={`/contracts/${id}/renew`}
          fields={contractFields([], c).map((f) => ({
            ...f,
            defaultValue: ['number', 'startDate', 'endDate'].includes(f.name)
              ? ''
              : f.name === 'status'
                ? 'DRAFT'
                : f.defaultValue,
          }))}
          extra={{ expectedRevision: c.revision }}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            onBack();
          }}
        />
      )}
      {form === 'edit' && (
        <BusinessForm
          title="Editar contrato"
          description="Cada cambio conserva una versión. Retira las asignaciones antes de finalizar."
          path={`/contracts/${id}`}
          method="PATCH"
          extra={{ expectedRevision: c.revision }}
          fields={contractFields([], c)}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            reload();
          }}
        />
      )}
      {form === 'assign' && (
        <BusinessForm
          title="Asignar perro"
          fields={[
            {
              name: 'dogId',
              label: 'Perro',
              type: 'select',
              required: true,
              options: choice(dogs.data?.items),
            },
            {
              name: 'handlerId',
              label: 'Responsable operativo',
              type: 'select',
              required: true,
              options: choice(handlers.data),
            },
            { name: 'role', label: 'Función en el contrato', required: true },
            { name: 'startDate', label: 'Desde', type: 'date', required: true, defaultValue: c.startDate },
            { name: 'endDate', label: 'Hasta', type: 'date', required: true, defaultValue: c.endDate },
            {
              name: 'overlapReason',
              label: 'Justificación de excepción (opcional)',
              type: 'textarea',
              hint: 'Solo completa si autorizas una asignación que se solapa con otra.',
            },
          ]}
          path={`/contracts/${id}/assignments`}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            reload();
          }}
        />
      )}
      {form && typeof form === 'object' && (
        <BusinessForm
          title="Retirar asignación"
          description={`${form.dog.name} · Se conservará todo el historial.`}
          fields={[
            {
              name: 'releasedOn',
              label: 'Fecha de retiro',
              type: 'date',
              required: true,
              defaultValue: today(),
            },
            { name: 'reason', label: 'Motivo del retiro', required: true },
          ]}
          path={`/contracts/${id}/assignments/${form.id}/release`}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            reload();
          }}
        />
      )}
    </>
  );
}
export function ServicesPage() {
  const [page, setPage] = useState(1),
    [assignmentPage, setAssignmentPage] = useState(1),
    [create, setCreate] = useState(false),
    [error, setError] = useState('');
  const assignments = useCatalog<Assignment>('/operations/assignments');
  const services = useResource<PageData<Service>>(`/operations/services?page=${page}`);
  const contracts = [
    ...new Map(
      (assignments.data?.items || [])
        .filter((a) => a.contract?.status === 'ACTIVE')
        .map((a) => [
          a.contractId,
          { id: a.contractId, name: `${a.contract?.number} · ${a.contract?.title}` },
        ]),
    ).values(),
  ];
  return (
    <>
      <PageHeading
        eyebrow="TRABAJO EN CAMPO"
        title="Operaciones"
        description="Asignaciones, turnos y bitácora de servicios."
      >
        <Button icon={Plus} onClick={() => setCreate(true)}>
          Registrar servicio
        </Button>
      </PageHeading>
      {error && <ErrorBox message={error} />}
      <Panel title="Asignaciones autorizadas">
        {assignments.loading ? (
          <Loading />
        ) : assignments.error ? (
          <ErrorBox message={assignments.error} />
        ) : assignments.data?.items.length ? (
          <SimpleTable headers={['Perro', 'Contrato', 'Responsable', 'Periodo', 'Estado']}>
            {assignments.data.items.slice((assignmentPage - 1) * 20, assignmentPage * 20).map((a) => (
              <tr key={a.id}>
                <td>
                  <strong>{a.dog.name}</strong>
                  <small>{a.role}</small>
                </td>
                <td>
                  {a.contract?.number}
                  <small>{a.contract?.institution.name}</small>
                </td>
                <td>{a.handler.name}</td>
                <td>
                  {formatDate(a.startDate)}
                  <small>{formatDate(a.endDate)}</small>
                </td>
                <td>
                  {a.releasedOn ? 'Retirada' : a.endDate < today() ? 'Finalizada' : 'Programada / vigente'}
                </td>
              </tr>
            ))}
          </SimpleTable>
        ) : (
          <Empty
            icon={ClipboardList}
            title="Sin asignaciones"
            description="Administración puede asignar perros y responsables desde un contrato activo."
          />
        )}
      </Panel>
      <Pager
        data={assignments.data ? { ...assignments.data, pageSize: 20 } : null}
        page={assignmentPage}
        setPage={setAssignmentPage}
      />
      <Panel title="Bitácora de servicios">
        {services.loading ? (
          <Loading />
        ) : services.error ? (
          <ErrorBox message={services.error} />
        ) : services.data?.items.length ? (
          <SimpleTable headers={['Contrato', 'Fecha', 'Lugar', 'Resumen']}>
            {services.data.items.map((s) => (
              <tr key={s.id}>
                <td>{s.contract?.number}</td>
                <td>
                  {formatDate(s.occurredAt, true)}
                  <small>{formatDate(s.endsAt, true)}</small>
                </td>
                <td>{s.location}</td>
                <td className="business-wrap">
                  {s.publicSummary}
                  <small>{s.recorder?.name}</small>
                </td>
              </tr>
            ))}
          </SimpleTable>
        ) : (
          <p className="panel-text muted">Sin servicios registrados.</p>
        )}
        <Pager data={services.data} page={page} setPage={setPage} />
      </Panel>
      {create && (
        <BusinessServiceForm
          contracts={contracts}
          onClose={() => setCreate(false)}
          onSaved={() => {
            setCreate(false);
            services.reload();
            setError('');
          }}
        />
      )}
    </>
  );
}
function BusinessServiceForm({
  contracts,
  onClose,
  onSaved,
}: {
  contracts: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const fields: FieldDef[] = [
    {
      name: 'contractId',
      label: 'Contrato asignado',
      type: 'select',
      required: true,
      options: choice(contracts),
    },
    { name: 'occurredAt', label: 'Inicio del servicio · Costa Rica', type: 'datetime-local', required: true },
    { name: 'endsAt', label: 'Fin del servicio · Costa Rica', type: 'datetime-local', required: true },
    { name: 'location', label: 'Lugar del servicio', required: true },
    {
      name: 'publicSummary',
      label: 'Resumen para el cliente',
      type: 'textarea',
      required: true,
      hint: 'Este texto aparecerá en el informe exportado.',
    },
    {
      name: 'internalNotes',
      label: 'Incidencias / notas internas',
      type: 'textarea',
      hint: 'No se incluyen en el informe para cliente.',
    },
  ];
  return <ServiceModal fields={fields} onClose={onClose} onSaved={onSaved} />;
}
import { DataForm, Modal } from './ui';
function ServiceModal({
  fields,
  onClose,
  onSaved,
}: {
  fields: FieldDef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Modal title="Registrar servicio" onClose={onClose}>
      <DataForm
        fields={fields}
        onCancel={onClose}
        onSubmit={async (v) => {
          await api('/operations/services', 'POST', {
            ...v,
            occurredAt: localInstant(String(v.occurredAt)),
            endsAt: localInstant(String(v.endsAt)),
          });
          onSaved();
        }}
      />
    </Modal>
  );
}
