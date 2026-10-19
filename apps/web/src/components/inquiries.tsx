'use client';
import { useEffect, useState } from 'react';
import { Inbox, UserPlus, ExternalLink } from 'lucide-react';
import { api, formatDate, type PageData, type User } from '@/lib/api';
import { useResource } from '@/lib/use-resource';
import {
  Button,
  DataForm,
  Empty,
  ErrorBox,
  Loading,
  Modal,
  PageHeading,
  Panel,
  Success,
  type FieldDef,
} from './ui';
import { BusinessForm, Pager } from './business-ui';
import { type PublicSettings, whatsappLink } from './public-contact';
type Inquiry = {
  id: string;
  kind: string;
  status: string;
  name: string;
  email?: string;
  phone?: string;
  preferredContact: string;
  organization?: string;
  partyKind: string;
  message: string;
  interestLabel?: string;
  interestKind?: string;
  interestId?: string;
  adminNotes?: string;
  createdAt: string;
  consentAt: string;
  approvedUser?: { username: string } | null;
};
const kinds: Record<string, string> = {
  CONTACT: 'Contacto',
  PURCHASE: 'Compra',
  ACCOUNT: 'Solicitud de cuenta',
};
const statuses: Record<string, string> = {
  NEW: 'Nueva',
  IN_PROGRESS: 'En seguimiento',
  CLOSED: 'Atendida',
  APPROVED: 'Cuenta aprobada',
  REJECTED: 'Rechazada',
};
const methods: Record<string, string> = {
  EMAIL: 'Correo electrónico',
  PHONE: 'Llamada telefónica',
  WHATSAPP: 'WhatsApp',
};
export function InquirySummary({ onOpen }: { onOpen: () => void }) {
  const r = useResource<{ pending: number }>('/inquiries/summary');
  useEffect(() => {
    const timer = window.setInterval(r.reload, 30000);
    return () => window.clearInterval(timer);
  }, [r.reload]);
  return (
    <div className="inquiry-summary">
      <div>
        <Inbox size={23} />
        <span>
          <strong>Solicitudes de contacto y cuentas</strong>
          <small>
            {r.data
              ? `${r.data.pending} pendientes de atención`
              : 'Revisa los mensajes recibidos desde la portada pública.'}
          </small>
        </span>
      </div>
      <Button variant="secondary" onClick={onOpen}>
        Ver solicitudes
      </Button>
    </div>
  );
}
function PublicContactSettings() {
  const r = useResource<PublicSettings>('/inquiries/settings');
  const [saved, setSaved] = useState(false);
  const fields: FieldDef[] = [
    { name: 'contactName', label: 'Nombre de contacto', required: true, defaultValue: r.data?.contactName },
    {
      name: 'phone',
      label: 'Teléfono público',
      defaultValue: r.data?.phone || '',
      hint: 'Incluye el código de país. Ejemplo: +506 7032 7517.',
    },
    {
      name: 'whatsappNumber',
      label: 'WhatsApp',
      defaultValue: r.data?.whatsappNumber || '',
      hint: 'Número internacional sin espacios. Ejemplo: +50670327517.',
    },
    { name: 'email', label: 'Correo público', type: 'email', defaultValue: r.data?.email || '' },
    {
      name: 'instagramUrl',
      label: 'Instagram',
      defaultValue: r.data?.instagramUrl || '',
      hint: 'Enlace HTTPS del perfil.',
    },
    { name: 'facebookUrl', label: 'Facebook', defaultValue: r.data?.facebookUrl || '' },
    { name: 'tiktokUrl', label: 'TikTok', defaultValue: r.data?.tiktokUrl || '' },
  ];
  return (
    <Panel
      title="Contacto y redes de la portada"
      subtitle="Los campos vacíos no aparecen al público. WhatsApp abre un chat con un mensaje preparado."
    >
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox message={r.error} retry={r.reload} />
      ) : (
        <div className="public-settings-form">
          {saved && <Success>Contacto público actualizado.</Success>}
          <DataForm
            key={JSON.stringify(r.data)}
            fields={fields}
            clearOptional
            submitLabel="Guardar contacto público"
            onSubmit={async (values) => {
              await api('/inquiries/settings', 'PATCH', values);
              setSaved(true);
              r.reload();
            }}
          />
        </div>
      )}
    </Panel>
  );
}
export function InquiriesPage({ user }: { user: User }) {
  const [status, setStatus] = useState(''),
    [kind, setKind] = useState(''),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<Inquiry | null>(null),
    [approve, setApprove] = useState<Inquiry | null>(null),
    [message, setMessage] = useState('');
  const r = useResource<PageData<Inquiry>>(
    `/inquiries?page=${page}&pageSize=15&status=${status}&kind=${kind}`,
  );
  const parties = useResource<{ id: string; name: string; kind: string }[]>(approve ? '/parties' : null);
  function reload() {
    r.reload();
    setSelected(null);
  }
  return (
    <>
      <PageHeading
        eyebrow="ATENCIÓN AL CLIENTE"
        title="Solicitudes"
        description="Consultas de compra, contactos y cuentas pendientes de revisión."
      >
        <a className="button button-secondary" href="/catalogo" target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} />
          Ver portada pública
        </a>
      </PageHeading>
      {message && <Success>{message}</Success>}
      <div className="inquiry-filters">
        <label>
          Estado
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los estados</option>
            {Object.entries(statuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas las solicitudes</option>
            {Object.entries(kinds).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" onClick={r.reload}>
          Actualizar solicitudes
        </Button>
      </div>
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox message={r.error} retry={r.reload} />
      ) : r.data?.items.length ? (
        <>
          <div className="inquiry-list">
            {r.data.items.map((item) => (
              <button className="inquiry-row" key={item.id} onClick={() => setSelected(item)}>
                <div>
                  <span className="eyebrow">{kinds[item.kind]}</span>
                  <h2>{item.name}</h2>
                  <p>{item.interestLabel || item.organization || item.message.slice(0, 110)}</p>
                  <small>
                    {formatDate(item.createdAt, true)} · {methods[item.preferredContact]}
                  </small>
                </div>
                <span className={`inquiry-status inquiry-status-${item.status.toLowerCase()}`}>
                  {statuses[item.status]}
                </span>
              </button>
            ))}
          </div>
          <Pager data={r.data} page={page} setPage={setPage} />
        </>
      ) : (
        <Empty
          icon={Inbox}
          title="Sin solicitudes en esta vista"
          description="Las consultas enviadas desde la portada aparecerán aquí."
        />
      )}
      <PublicContactSettings />
      {selected && (
        <Modal
          title={`${kinds[selected.kind]} · ${selected.name}`}
          description={statuses[selected.status]}
          onClose={() => setSelected(null)}
        >
          <div className="inquiry-detail">
            <p>
              <strong>Medio preferido:</strong> {methods[selected.preferredContact]}
            </p>
            {selected.email && (
              <p>
                <a href={`mailto:${selected.email}`}>{selected.email}</a>
              </p>
            )}
            {selected.phone && (
              <p>
                <a href={`tel:${selected.phone.replace(/[^+\d]/g, '')}`}>{selected.phone}</a>
              </p>
            )}
            {selected.organization && (
              <p>
                <strong>Entidad:</strong> {selected.organization}
              </p>
            )}
            {selected.interestLabel && (
              <p>
                <strong>Interés:</strong> {selected.interestLabel}{' '}
                <a
                  href={`/catalogo?tipo=${selected.interestKind === 'DOG' ? 'dogs' : 'crosses'}&id=${selected.interestId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ver publicación
                </a>
              </p>
            )}
            <blockquote>{selected.message}</blockquote>
            <small>Autorización de contacto: {formatDate(selected.consentAt, true)}</small>
            {selected.preferredContact === 'WHATSAPP' && selected.phone && (
              <p>
                <a
                  className="button button-secondary"
                  href={whatsappLink(
                    selected.phone,
                    `Hola ${selected.name}, te contactamos desde ORYX K9 sobre tu solicitud.`,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Responder por WhatsApp
                </a>
              </p>
            )}
            {selected.approvedUser ? (
              <Success>
                Cuenta creada: {selected.approvedUser.username}. Gestiona sus accesos desde Usuarios.
              </Success>
            ) : (
              <>
                <DataForm
                  fields={[
                    {
                      name: 'status',
                      label: 'Estado de seguimiento',
                      type: 'select',
                      required: true,
                      defaultValue: selected.status,
                      options: Object.entries(statuses)
                        .filter(([value]) => value !== 'APPROVED')
                        .map(([value, label]) => ({ value, label })),
                    },
                    {
                      name: 'adminNotes',
                      label: 'Notas internas',
                      type: 'textarea',
                      defaultValue: selected.adminNotes,
                      full: true,
                    },
                  ]}
                  clearOptional
                  submitLabel="Guardar seguimiento"
                  onSubmit={async (values) => {
                    await api(`/inquiries/${selected.id}`, 'PATCH', values);
                    reload();
                  }}
                />
                {selected.kind === 'ACCOUNT' && ['NEW', 'IN_PROGRESS'].includes(selected.status) && (
                  <Button
                    icon={UserPlus}
                    onClick={() => {
                      setApprove(selected);
                      setSelected(null);
                    }}
                  >
                    Aprobar y crear cuenta
                  </Button>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
      {approve && (
        <BusinessForm
          title={`Crear cuenta para ${approve.name}`}
          description="Se creará una cuenta de cliente. Entrega las credenciales por el medio acordado después de verificar la identidad del solicitante."
          path={`/inquiries/${approve.id}/approve`}
          fields={[
            { name: 'username', label: 'Usuario', required: true, minLength: 3 },
            {
              name: 'password',
              label: 'Contraseña inicial',
              type: 'password',
              required: true,
              minLength: user.passwordMinLength || 12,
            },
            {
              name: 'partyId',
              label: 'Propietario o entidad existente (opcional)',
              type: 'select',
              options: (parties.data || [])
                .filter((p) => p.kind !== 'UNIT')
                .map((p) => ({ value: p.id, label: p.name })),
              hint: 'Déjalo vacío para crear un propietario nuevo. Vincular uno existente concede acceso a sus perros.',
            },
          ]}
          submitLabel="Crear cuenta de cliente"
          onClose={() => setApprove(null)}
          onSaved={(value) => {
            setMessage(`Cuenta ${String(value.username)} creada. Comunica las credenciales al solicitante.`);
            setApprove(null);
            r.reload();
          }}
        />
      )}
    </>
  );
}
