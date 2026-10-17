'use client';
import { BreedsPanel } from './breeds';
import { InternalAudit } from './internal-audit';
import { TemplatesPanel } from './templates';
import { NotificationPreferences } from './notification-preferences';
import { useState } from 'react';
import { Check, KeyRound, LockKeyhole, Pencil, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { api, errorMessage, formatDate, type PageData, type User } from '@/lib/api';
import { useDebouncedValue, useResource } from '@/lib/use-resource';
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
  Success,
  type FieldDef,
} from './ui';

const roles = ['ADMIN', 'TRAINER', 'CLIENT'];
export function UsersPage({ current }: { current: User }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const searchQuery = useDebouncedValue(search);
  const { data, error, loading, reload } = useResource<PageData<User>>(
    `/users?page=${page}&pageSize=20&search=${encodeURIComponent(searchQuery)}`,
  );
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const editingUser = editing && editing !== 'new' ? editing : undefined;
  const parties = useResource<{ id: string; name: string; kind: string }[]>('/parties');
  const fields: FieldDef[] = [
    { name: 'name', label: 'Nombre completo', required: true, defaultValue: editingUser?.name },
    {
      name: 'username',
      label: 'Usuario',
      required: true,
      defaultValue: editingUser?.username,
      minLength: 3,
      hint: 'De 3 a 40 caracteres: letras sin acentos, números, puntos o guiones. Ejemplo: socio.juan.',
    },
    {
      name: 'email',
      label: 'Correo electrónico (opcional)',
      type: 'email',
      defaultValue: editingUser?.email,
      hint: 'Solo para recuperación y avisos. El acceso se realiza con el usuario.',
    },
    {
      name: 'password',
      label: editingUser ? 'Nueva contraseña (opcional)' : 'Contraseña inicial',
      type: 'password',
      required: !editingUser,
      minLength: current.passwordMinLength || 12,
      hint: editingUser
        ? `Déjala vacía para conservar la actual. Al cambiarla se cerrarán las sesiones de esta cuenta. Mínimo ${current.passwordMinLength || 12} caracteres.`
        : `Mínimo ${current.passwordMinLength || 12} caracteres.`,
      full: true,
    },
  ];
  fields.push({
    name: 'role',
    label: 'Rol de acceso',
    type: 'select',
    required: true,
    options: roles,
    defaultValue: editingUser?.role || 'CLIENT',
  });
  fields.push({
    name: 'partyId',
    label: 'Persona o entidad vinculada',
    type: 'select',
    options:
      parties.data
        ?.filter((p) => p.kind !== 'UNIT' || editingUser?.role === 'ADMIN')
        .map((p) => ({ value: p.id, label: p.name })) || [],
    defaultValue: editingUser?.partyId,
    hint: 'Los clientes ven los perros de esta entidad. Para una municipalidad se pueden vincular varias cuentas.',
  });
  if (!editingUser)
    fields.push(
      {
        name: 'partyKind',
        label: 'Tipo de cliente nuevo',
        type: 'select',
        options: ['PERSON', 'MUNICIPALITY', 'ORGANIZATION'],
        defaultValue: 'PERSON',
      },
      {
        name: 'partyName',
        label: 'Nombre del propietario o municipalidad',
        hint: 'Si no eliges una entidad existente, se crea una con este nombre o con el nombre de la cuenta.',
      },
    );
  if (editingUser)
    fields.push({
      name: 'active',
      label: 'Cuenta habilitada',
      type: 'checkbox',
      defaultValue: editingUser.active !== false,
    });
  return (
    <>
      <PageHeading
        eyebrow="ACCESO Y RESPONSABILIDADES"
        title="Usuarios"
        description="Administradores, entrenadores y clientes, cada uno con su espacio de trabajo."
      >
        <Button icon={UserPlus} onClick={() => setEditing('new')}>
          Crear usuario
        </Button>
      </PageHeading>
      <Panel title="Equipo autorizado" subtitle="Los permisos se verifican también en el servidor">
        <div className="field field-spacing">
          <label htmlFor="user-search">Buscar por nombre o usuario</label>
          <input
            id="user-search"
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
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
                    <th>Persona</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>MFA</th>
                    <th>
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className="user-cell">
                          <div className="avatar small">{user.name.slice(0, 2).toUpperCase()}</div>
                          <div>
                            <strong>
                              {user.name}
                              {user.id === current.id ? ' (tú)' : ''}
                            </strong>
                            <small>{user.username}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge value={user.role} />
                      </td>
                      <td>
                        <span className={`status-dot ${user.active === false ? 'inactive' : ''}`} />
                        {user.active === false ? 'Deshabilitado' : 'Activo'}
                      </td>
                      <td>{user.mfaEnabled ? 'Activado' : 'Sin activar'}</td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Editar ${user.name}`}
                          onClick={() => setEditing(user)}
                        >
                          <Pencil size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                {data.total} usuarios · Página {page}
              </span>
              <div>
                <Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  disabled={page * 20 >= data.total}
                  onClick={() => setPage(page + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </>
        ) : (
          <Empty
            icon={Users}
            title="Sin usuarios disponibles"
            description="Las cuentas autorizadas aparecerán aquí."
          />
        )}
      </Panel>
      <div className="inline-notice">
        <ShieldCheck size={18} />
        <span>
          Asigna solo los permisos necesarios. Cada persona debe ingresar con su propia cuenta para conservar
          la trazabilidad de sus acciones.
        </span>
      </div>
      {editing && (
        <Modal
          title={editingUser ? 'Editar usuario' : 'Crear acceso privado'}
          description={
            editingUser
              ? editingUser.username
              : 'Asigna un usuario, una contraseña inicial y el rol del socio.'
          }
          onClose={() => setEditing(null)}
        >
          {parties.error ? (
            <ErrorBox message={parties.error} retry={parties.reload} />
          ) : parties.loading ? (
            <Loading />
          ) : (
            <DataForm
              fields={fields}
              clearOptional
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                await api(
                  editingUser ? `/users/${editingUser.id}` : '/users',
                  editingUser ? 'PATCH' : 'POST',
                  values,
                );
                if (editingUser?.id === current.id && values.password) {
                  window.setTimeout(() => window.location.reload(), 0);
                  return;
                }
                setEditing(null);
                if (!editingUser) {
                  setSearch(String(values.username));
                  setPage(1);
                }
                parties.reload();
                reload();
              }}
              submitLabel={editingUser ? 'Guardar cambios' : 'Crear usuario'}
            />
          )}
        </Modal>
      )}
    </>
  );
}

export function SettingsPage({ user, refreshUser }: { user: User; refreshUser: () => Promise<void> }) {
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [disable, setDisable] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null),
    [regenerate, setRegenerate] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function startSetup() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      setSetup(await api('/auth/mfa/setup', 'POST'));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="TU CUENTA"
        title="Seguridad y configuración"
        description="Protege el acceso a la información de la unidad."
      />
      {error && <ErrorBox message={error} />}
      {message && <Success>{message}</Success>}
      <div className="settings-grid">
        <Panel title="Perfil de acceso">
          <div className="profile-settings">
            <div className="avatar large">{user.name.slice(0, 2).toUpperCase()}</div>
            <h3>{user.name}</h3>
            <p>{user.username}</p>
            {user.email && <p>{user.email}</p>}
            <Badge value={user.role} />
          </div>
          <dl className="details-list">
            <div>
              <dt>Organización</dt>
              <dd>ORYX K9 Unidad Canina</dd>
            </div>
            <div>
              <dt>Zona horaria</dt>
              <dd>America/Costa_Rica</dd>
            </div>
            <div>
              <dt>Idioma</dt>
              <dd>Español · Costa Rica</dd>
            </div>
          </dl>
        </Panel>
        <div className="detail-stack">
          {user.role === 'ADMIN' && (
            <Panel
              title="Autenticación de dos factores"
              subtitle="Añade un código temporal al inicio de sesión"
            >
              <div className="security-feature">
                <div className="security-feature-icon">
                  <ShieldCheck size={30} />
                </div>
                <div>
                  <h3>
                    {user.mfaEnabled
                      ? 'Tu cuenta tiene protección adicional'
                      : 'Refuerza la seguridad de tu cuenta'}
                  </h3>
                  <p>
                    Vincula una aplicación autenticadora compatible con TOTP. Disponible para las cuentas de
                    administración de esta instalación.
                  </p>
                  <Button
                    variant={user.mfaEnabled ? 'secondary' : 'primary'}
                    icon={KeyRound}
                    disabled={busy || Boolean(user.mfaEnabled && user.mfaRequired)}
                    onClick={() => (user.mfaEnabled ? setDisable(true) : startSetup())}
                  >
                    {busy
                      ? 'Preparando…'
                      : user.mfaEnabled
                        ? 'Desactivar autenticación'
                        : 'Configurar autenticación'}
                  </Button>
                  {user.mfaRequired && <p>Esta instalación exige MFA para las cuentas administradoras.</p>}
                  {user.mfaEnabled && (
                    <Button variant="secondary" onClick={() => setRegenerate(true)}>
                      Renovar códigos de recuperación
                    </Button>
                  )}
                </div>
              </div>
            </Panel>
          )}
          <Panel title="Acerca de esta instalación">
            <div className="feature-list">
              <p>
                <Check size={16} /> Plataforma privada, sin registro público
              </p>
              <p>
                <LockKeyhole size={16} /> Documentos con verificación de acceso
              </p>
              <p>
                <Check size={16} /> Datos y recordatorios persistentes en el servidor
              </p>
            </div>
            <p className="panel-text muted">
              La aplicación requiere conexión al servidor de ORYX K9. No admite edición sin conexión. La
              instalación como PWA depende del navegador y de un contexto seguro.
            </p>
          </Panel>
          {(!user.mfaRequired || user.mfaEnabled) && <NotificationPreferences />}
          {user.role === 'ADMIN' && (!user.mfaRequired || user.mfaEnabled) && (
            <>
              <SystemStatus />
            </>
          )}
        </div>
      </div>
      {user.role === 'ADMIN' && (!user.mfaRequired || user.mfaEnabled) && (
        <div className="settings-catalogs">
          <InternalAudit />
          <TemplatesPanel />
          <BreedsPanel />
        </div>
      )}
      {setup && (
        <Modal
          title="Vincula tu autenticador"
          description="Añade una cuenta manualmente en tu aplicación autenticadora. No compartas esta clave."
          onClose={() => setSetup(null)}
        >
          <div className="mfa-setup">
            <p>
              Cuenta: <strong>{user.username}</strong>
            </p>
            <label>Clave de configuración TOTP</label>
            <code>{setup.secret}</code>
            <p>Tipo: basada en tiempo · 6 dígitos · intervalo de 30 segundos.</p>
            <a href={setup.uri} className="inline-link">
              Abrir en una aplicación autenticadora compatible
            </a>
          </div>
          <DataForm
            fields={[
              {
                name: 'code',
                label: 'Código de 6 dígitos',
                required: true,
                minLength: 6,
                full: true,
                hint: 'La protección se activa después de verificar este código.',
              },
            ]}
            onCancel={() => setSetup(null)}
            submitLabel="Verificar y activar"
            onSubmit={async (values) => {
              const result = await api<{ recoveryCodes: string[] }>('/auth/mfa/enable', 'POST', values);
              setCodes(result.recoveryCodes);
              setSetup(null);
              setMessage(
                'Autenticación de dos factores activada. Usa tu autenticador en el próximo inicio de sesión.',
              );
            }}
          />
        </Modal>
      )}
      {disable && (
        <Modal
          title="Desactivar autenticación adicional"
          description="Confirma tu contraseña y un código vigente de tu autenticador."
          onClose={() => setDisable(false)}
        >
          <DataForm
            fields={[
              { name: 'password', label: 'Contraseña actual', type: 'password', required: true },
              { name: 'code', label: 'Código de autenticación', required: true, minLength: 6 },
            ]}
            onCancel={() => setDisable(false)}
            submitLabel="Desactivar MFA"
            onSubmit={async (values) => {
              await api('/auth/mfa/disable', 'POST', values);
              setDisable(false);
              await refreshUser();
              setMessage('Autenticación de dos factores desactivada.');
            }}
          />
        </Modal>
      )}
      {codes && (
        <Modal
          title="Guarda tus códigos de recuperación"
          description="Cada código funciona una sola vez junto con tu contraseña. Se muestran sólo ahora. Guárdalos en un lugar privado."
          onClose={() => {
            setCodes(null);
            void refreshUser();
          }}
        >
          <div className="mfa-setup">
            {codes.map((c) => (
              <code key={c}>{c}</code>
            ))}
          </div>
          <Button
            onClick={() => {
              setCodes(null);
              void refreshUser();
            }}
          >
            Ya guardé los códigos
          </Button>
        </Modal>
      )}
      {regenerate && (
        <Modal
          title="Renovar códigos de recuperación"
          description="Los códigos anteriores dejarán de funcionar y se cerrarán las otras sesiones."
          onClose={() => setRegenerate(false)}
        >
          <DataForm
            fields={[
              { name: 'password', label: 'Contraseña actual', type: 'password', required: true },
              { name: 'code', label: 'Código de autenticación', required: true, minLength: 6 },
            ]}
            onCancel={() => setRegenerate(false)}
            onSubmit={async (values) => {
              const result = await api<{ recoveryCodes: string[] }>(
                '/auth/mfa/recovery-codes',
                'POST',
                values,
              );
              setRegenerate(false);
              setCodes(result.recoveryCodes);
            }}
            submitLabel="Generar códigos nuevos"
          />
        </Modal>
      )}
    </>
  );
}

function SystemStatus() {
  const r = useResource<{
    backupEnabled: boolean;
    backupHealthy: boolean;
    backupEncrypted: boolean;
    backupLastSuccess?: string;
    workerHealthy: boolean;
    workerLastSeen?: string;
    pendingReminders: number;
    failedReminders: number;
    overdueReminders: number;
    storageWritable: boolean | null;
    freeMiB: number | null;
    emailConfigured: boolean;
    pushConfigured: boolean;
    scannerConfigured: boolean;
    quarantineMiB: number;
    storageQuotaMiB: number;
  }>('/system/status');
  return (
    <Panel
      className="system-status"
      title="Estado de la instalación"
      action={
        <Button variant="secondary" onClick={r.reload}>
          Actualizar estado
        </Button>
      }
    >
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox message={r.error} />
      ) : (
        r.data && (
          <>
            <dl className="details-list">
              <div>
                <dt>Base de datos</dt>
                <dd>Conectada</dd>
              </div>
              <div>
                <dt>Respaldo local diario</dt>
                <dd>
                  {!r.data.backupEnabled
                    ? 'No configurado'
                    : r.data.backupHealthy
                      ? r.data.backupEncrypted
                        ? 'Copia cifrada y verificada'
                        : 'Copia verificada'
                      : 'Revisar respaldo'}
                  <small>{formatDate(r.data.backupLastSuccess, true)}</small>
                </dd>
              </div>
              <div>
                <dt>Recordatorios</dt>
                <dd>
                  {r.data.workerHealthy ? 'Servicio activo' : 'Revisar servicio'}
                  <small>{formatDate(r.data.workerLastSeen, true)}</small>
                </dd>
              </div>
              <div>
                <dt>En cola</dt>
                <dd>{r.data.pendingReminders}</dd>
              </div>
              <div>
                <dt>Con retraso / fallidos</dt>
                <dd>
                  {r.data.overdueReminders} / {r.data.failedReminders}
                </dd>
              </div>
              <div>
                <dt>Archivos locales</dt>
                <dd>
                  {r.data.storageWritable === null
                    ? 'Almacenamiento externo'
                    : r.data.storageWritable
                      ? 'Escritura disponible'
                      : 'Revisar permisos o carpeta'}
                </dd>
              </div>
              {r.data.freeMiB !== null && (
                <div>
                  <dt>Espacio libre</dt>
                  <dd>{Math.floor(r.data.freeMiB / 1024)} GiB</dd>
                </div>
              )}
              <div>
                <dt>Correo</dt>
                <dd>{r.data.emailConfigured ? 'Configurado' : 'Sólo avisos internos'}</dd>
              </div>
              <div>
                <dt>Notificaciones del navegador</dt>
                <dd>{r.data.pushConfigured ? 'Disponibles para activar' : 'Sin configurar'}</dd>
              </div>
              <div>
                <dt>Cuota de archivos</dt>
                <dd>{r.data.storageQuotaMiB} MiB</dd>
              </div>
              <div>
                <dt>Archivos retenidos</dt>
                <dd>{r.data.quarantineMiB} MiB</dd>
              </div>
              <div>
                <dt>Analizador de archivos</dt>
                <dd>{r.data.scannerConfigured ? 'Configurado' : 'Validación de formato'}</dd>
              </div>
            </dl>
            <p className="panel-text muted">
              Consulta aquí la última copia verificada y el funcionamiento de los recordatorios.
            </p>
          </>
        )
      )}
    </Panel>
  );
}
