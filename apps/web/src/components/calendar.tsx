'use client';
import { useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, MapPin, Search, X } from 'lucide-react';
import {
  api,
  canAppointments,
  errorMessage,
  formatDate,
  localInstant,
  today,
  type Dog,
  type PageData,
  type User,
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
} from './ui';

const eventLabels: Record<string, string> = {
  ALL: 'Todos los eventos',
  APPOINTMENT: 'Citas',
  VACCINATION: 'Vacunas',
  TRAINING_PLAN: 'Objetivos de entrenamiento',
  CERTIFICATION: 'Certificaciones',
  BREEDING: 'Cruzas',
  CONTRACT: 'Contratos',
  RESERVATION: 'Reservas',
  ACCOUNT: 'Cobros y pagos',
};
type CalendarEvent = {
  id: string;
  sourceId: string;
  type: string;
  title: string;
  startsAt: string;
  allDay: boolean;
  status: string;
  dogId?: string;
  dog?: { name: string };
  location?: string;
  professional?: string;
  notes?: string;
};

export function AppointmentEditor({
  dogId,
  onClose,
  onSaved,
}: {
  dogId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState('');
  const { data, error } = useResource<PageData<Dog>>(
    `/dogs?search=${encodeURIComponent(search)}&pageSize=100`,
  );
  return (
    <Modal
      title="Programar una cita"
      description="Las fechas y horas se registran en horario de Costa Rica (UTC −6)."
      onClose={onClose}
    >
      <div className="field field-spacing">
        <label htmlFor="appointment-dog-search">Buscar perro</label>
        <div className="search-field">
          <Search size={17} />
          <input
            id="appointment-dog-search"
            placeholder="Nombre, código o microchip"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <small>Se muestran hasta 100 coincidencias. Usa el buscador para localizar otro expediente.</small>
      </div>
      {error && <ErrorBox message={error} />}
      {data && (
        <DataForm
          key={dogId || 'new'}
          fields={[
            {
              name: 'dogId',
              label: 'Perro',
              type: 'select',
              required: true,
              defaultValue: dogId,
              options: [
                { value: '', label: 'Selecciona un expediente' },
                ...data.items.map((dog) => ({ value: dog.id, label: `${dog.name} · ${dog.code}` })),
              ],
              full: true,
            },
            { name: 'title', label: 'Motivo de la cita', required: true },
            { name: 'startsAt', label: 'Fecha y hora · Costa Rica', type: 'datetime-local', required: true },
            { name: 'location', label: 'Lugar' },
            { name: 'professional', label: 'Profesional responsable' },
            {
              name: 'remindBeforeHours',
              label: 'Recordar con anticipación (horas)',
              type: 'number',
              min: 0,
              max: 720,
              defaultValue: 24,
              hint: 'Recordatorio interno; correo si SMTP está configurado.',
            },
            { name: 'notes', label: 'Observaciones', type: 'textarea' },
          ]}
          onCancel={onClose}
          submitLabel="Programar cita"
          onSubmit={async (values) => {
            values.startsAt = localInstant(String(values.startsAt));
            await api('/appointments', 'POST', values);
            onSaved();
          }}
        />
      )}
    </Modal>
  );
}
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const noon = (day: string) => new Date(`${day}T12:00:00Z`);
function shift(day: string, amount: number) {
  const date = noon(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return isoDay(date);
}

type CalendarProps = {
  user: User;
  openDog: (id: string) => void;
  revision: number;
  createAppointment: () => void;
};
export function Calendar(props: CalendarProps) {
  const r = useResource<{ calendarView: 'day' | 'week' | 'month'; calendarType: string }>('/preferences');
  if (r.loading) return <Loading />;
  if (r.error) return <ErrorBox message={r.error} retry={r.reload} />;
  return <CalendarBoard {...props} initial={r.data!} />;
}
function CalendarBoard({
  user,
  openDog,
  revision,
  createAppointment,
  initial,
}: {
  user: User;
  openDog: (id: string) => void;
  revision: number;
  createAppointment: () => void;
  initial: { calendarView: 'day' | 'week' | 'month'; calendarType: string };
}) {
  const [selected, setSelected] = useState(today());
  const [eventType, setEventType] = useState(initial.calendarType);
  const [view, setView] = useState<'month' | 'week' | 'day'>(initial.calendarView);
  const [saving, setSaving] = useState(false);
  async function preference(change: { calendarView?: 'day' | 'week' | 'month'; calendarType?: string }) {
    setSaving(true);
    setActionError('');
    try {
      await api('/preferences', 'PATCH', change);
      if (change.calendarView) setView(change.calendarView);
      if (change.calendarType) setEventType(change.calendarType);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  const [actionError, setActionError] = useState('');
  const date = noon(selected);
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
  const weekOffset = (date.getUTCDay() + 6) % 7;
  const start =
    view === 'month'
      ? shift(isoDay(monthStart), -((monthStart.getUTCDay() + 6) % 7))
      : view === 'week'
        ? shift(selected, -weekOffset)
        : selected;
  const length = view === 'month' ? 42 : view === 'week' ? 7 : 1;
  const end = shift(start, length);
  const { data, error, loading, reload } = useResource<{ items: CalendarEvent[]; total: number }>(
    `/calendar/events?${new URLSearchParams({ from: start, to: end, type: eventType })}`,
    revision,
  );
  const appointments = data?.items || [];
  const dayFor = (instant: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Costa_Rica',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(instant));
  const selectedItems = appointments
    .filter((item) => dayFor(item.startsAt) === selected)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const navigate = (direction: number) => {
    if (view === 'month') {
      const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + direction, 1, 12));
      setSelected(isoDay(target));
    } else setSelected(shift(selected, direction * (view === 'week' ? 7 : 1)));
  };
  async function update(id: string, status: string) {
    setActionError('');
    try {
      await api(`/appointments/${id}`, 'PATCH', { status });
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="PLANIFICACIÓN Y CUIDADO"
        title="Calendario"
        description="Citas, vacunas, objetivos, certificaciones y compromisos de la unidad."
      >
        {canAppointments(user.role) && <AddButton onClick={createAppointment}>Programar cita</AddButton>}
      </PageHeading>
      {actionError && <ErrorBox message={actionError} />}
      <Panel className="calendar-panel">
        <div className="field calendar-filter">
          <label htmlFor="calendar-type">Tipo de evento</label>
          <select
            id="calendar-type"
            value={eventType}
            disabled={saving}
            onChange={(e) => preference({ calendarType: e.target.value })}
          >
            {Object.entries(eventLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="calendar-toolbar">
          <div className="calendar-title">
            <button className="icon-button" aria-label="Periodo anterior" onClick={() => navigate(-1)}>
              <ChevronLeft size={19} />
            </button>
            <h2>
              {new Intl.DateTimeFormat('es-CR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
                date,
              )}
            </h2>
            <button className="icon-button" aria-label="Periodo siguiente" onClick={() => navigate(1)}>
              <ChevronRight size={19} />
            </button>
            <Button variant="secondary" onClick={() => setSelected(today())}>
              Hoy
            </Button>
          </div>
          <div className="segmented-control" aria-label="Vista del calendario">
            {(
              [
                { id: 'day', label: 'Día' },
                { id: 'week', label: 'Semana' },
                { id: 'month', label: 'Mes' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                disabled={saving}
                aria-pressed={view === item.id}
                onClick={() => preference({ calendarView: item.id })}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} retry={reload} />
        ) : (
          <>
            {view !== 'day' && (
              <div className={`calendar-grid ${view === 'week' ? 'calendar-week' : ''}`}>
                <div className="calendar-weekdays">
                  {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                <div className="calendar-days">
                  {Array.from({ length }, (_, index) => shift(start, index)).map((day) => {
                    const items = appointments.filter((item) => dayFor(item.startsAt) === day);
                    return (
                      <button
                        key={day}
                        className={`calendar-cell ${day === selected ? 'selected' : ''} ${day === today() ? 'today' : ''} ${noon(day).getUTCMonth() !== date.getUTCMonth() ? 'outside' : ''}`}
                        onClick={() => setSelected(day)}
                        aria-label={`${formatDate(day)}, ${items.length} eventos`}
                        aria-pressed={day === selected}
                      >
                        <span className="calendar-number">{noon(day).getUTCDate()}</span>
                        {items.slice(0, 2).map((item) => (
                          <span className={`calendar-event ${item.status.toLowerCase()}`} key={item.id}>
                            {item.title}
                          </span>
                        ))}
                        {items.length > 2 && (
                          <span className="calendar-more">+{items.length - 2} eventos</span>
                        )}
                        {items.length > 0 && <span className="mobile-event-dot" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="agenda-heading">
              <h3>{formatDate(selected)}</h3>
              <span>{selectedItems.length} eventos · Costa Rica</span>
            </div>
            {selectedItems.length ? (
              <div className="agenda-list">
                {selectedItems.map((appointment) => (
                  <div className="agenda-item" key={appointment.id}>
                    <div className="agenda-time">
                      <Clock3 size={16} />
                      <strong>
                        {appointment.allDay
                          ? 'Todo el día'
                          : new Intl.DateTimeFormat('es-CR', {
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'America/Costa_Rica',
                            }).format(new Date(appointment.startsAt))}
                      </strong>
                    </div>
                    <div className="agenda-info">
                      <h3>{appointment.title}</h3>
                      <div className="agenda-meta">
                        <small>{eventLabels[appointment.type]}</small>
                        {appointment.dogId && (
                          <>
                            <span aria-hidden="true">·</span>
                            <button className="inline-link" onClick={() => openDog(appointment.dogId!)}>
                              {appointment.dog?.name || 'Ver expediente'}
                            </button>
                          </>
                        )}
                      </div>
                      {appointment.location && (
                        <p>
                          <MapPin size={13} />
                          {appointment.location}
                        </p>
                      )}
                      {appointment.professional && <p>{appointment.professional}</p>}
                      {appointment.notes && <p>{appointment.notes}</p>}
                    </div>
                    <div className="agenda-actions">
                      <Badge value={appointment.status} />
                      {canAppointments(user.role) &&
                        appointment.type === 'APPOINTMENT' &&
                        appointment.status === 'SCHEDULED' && (
                          <div>
                            <button
                              className="icon-button"
                              aria-label={`Completar cita ${appointment.title}`}
                              onClick={() => update(appointment.sourceId, 'COMPLETED')}
                            >
                              <Check size={18} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Cancelar cita ${appointment.title}`}
                              onClick={() => {
                                if (window.confirm('¿Cancelar esta cita?'))
                                  update(appointment.sourceId, 'CANCELLED');
                              }}
                            >
                              <X size={18} />
                            </button>
                          </div>
                        )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                compact
                icon={CalendarDays}
                title="Un día sin eventos registrados"
                description="Selecciona otra fecha, cambia el filtro o programa una nueva cita."
              />
            )}
          </>
        )}
      </Panel>
      <div className="dashboard-note">
        <CalendarDays size={16} />
        <span>
          Los vencimientos se muestran como eventos de todo el día. Las citas conservan su hora en Costa Rica.
        </span>
      </div>
    </>
  );
}
