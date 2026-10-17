'use client';
import { BrandMark } from '@/components/brand';
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Dog as DogIcon,
  GraduationCap,
  MapPin,
  Plus,
  ShieldCheck,
  Syringe,
} from 'lucide-react';
import { useResource } from '@/lib/use-resource';
import { formatDate, canManageDogs, canAppointments, type DashboardData, type User } from '@/lib/api';
import { Badge, Button, Empty, ErrorBox, Loading, PageHeading, Panel, TextLink } from './ui';

export function Dashboard({
  user,
  navigate,
  createDog,
}: {
  user: User;
  navigate: (page: string, id?: string) => void;
  createDog: () => void;
}) {
  const { data, error, loading, reload } = useResource<DashboardData>('/dashboard');
  const greeting = new Intl.DateTimeFormat('es-CR', {
    hour: 'numeric',
    hour12: false,
    timeZone: 'America/Costa_Rica',
  }).format(new Date());
  const hour = Number(greeting);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No se pudo cargar el resumen.'} retry={reload} />;
  const metrics = [
    {
      label: 'Total de perros',
      value: data.totalDogs,
      icon: DogIcon,
      detail: 'Expedientes activos',
      tone: 'copper',
    },
    {
      label: 'En servicio',
      value: data.operationalDogs,
      icon: ShieldCheck,
      detail: 'Estado operativo',
      tone: 'green',
    },
    {
      label: 'En formación',
      value: data.trainingDogs,
      icon: GraduationCap,
      detail: 'Desarrollo y aprendizaje',
      tone: 'blue',
    },
    {
      label: 'Disponibles',
      value: data.availableDogs,
      icon: Activity,
      detail: 'Disponibilidad registrada',
      tone: 'sand',
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="PANORAMA DE LA UNIDAD"
        title={`${hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'}, ${user.name.split(' ')[0]}`}
        description="Todo lo importante para cuidar y coordinar a tu equipo."
      >
        {canManageDogs(user.role) && (
          <Button icon={Plus} onClick={createDog}>
            Nuevo perro
          </Button>
        )}
      </PageHeading>
      <div className="welcome-band">
        <div>
          <span className="welcome-label">
            <span /> TU UNIDAD, AL DÍA
          </span>
          <h2>
            Cada perro cuenta una historia.
            <br />
            <span>Mantengámosla en orden.</span>
          </h2>
          <p>Expedientes, bienestar y entrenamiento en un mismo lugar.</p>
          <Button variant="secondary" icon={ArrowUpRight} onClick={() => navigate('dogs')}>
            Ver la unidad
          </Button>
        </div>
        <div className="welcome-emblem">
          <BrandMark />
        </div>
        <span className="welcome-outline" aria-hidden="true">
          O
        </span>
      </div>
      <div className="metrics-grid">
        {metrics.map(({ label, value, icon: Icon, detail, tone }) => (
          <div className="metric" key={label}>
            <div className="metric-top">
              <span>{label}</span>
              <div className={`metric-icon ${tone}`}>
                <Icon size={19} />
              </div>
            </div>
            <strong>{value.toLocaleString('es-CR')}</strong>
            <p>{detail}</p>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <Panel
          title="Próximas citas"
          subtitle="Atención y seguimiento de la unidad"
          action={<TextLink onClick={() => navigate('calendar')}>Ver calendario</TextLink>}
        >
          {data.upcomingAppointments.length ? (
            <div className="event-list">
              {data.upcomingAppointments.slice(0, 5).map((appointment) => (
                <button
                  className="event-row"
                  key={appointment.id}
                  onClick={() => navigate('dogs', appointment.dogId)}
                >
                  <div className="event-icon">
                    <CalendarDays size={20} />
                  </div>
                  <div>
                    <strong>{appointment.title}</strong>
                    <p>
                      {appointment.dog?.name || 'Expediente canino'} ·{' '}
                      {formatDate(appointment.startsAt, true)}
                    </p>
                    {appointment.location && (
                      <small>
                        <MapPin size={12} />
                        {appointment.location}
                      </small>
                    )}
                  </div>
                  <Badge value={appointment.status} />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              compact
              icon={CalendarDays}
              title="Tu agenda está despejada"
              description="Las próximas citas de la unidad aparecerán aquí."
              action={
                canAppointments(user.role) ? (
                  <TextLink onClick={() => navigate('calendar')}>Programar una cita</TextLink>
                ) : undefined
              }
            />
          )}
        </Panel>
        <Panel
          title="Medicina preventiva"
          subtitle="Vacunas con próxima dosis registrada"
          action={<span className="count-pill">{data.upcomingVaccinations.length}</span>}
        >
          {data.upcomingVaccinations.length ? (
            <div className="event-list">
              {data.upcomingVaccinations.slice(0, 5).map((vaccine) => (
                <button
                  className="event-row"
                  key={vaccine.id}
                  onClick={() => vaccine.dog && navigate('dogs', vaccine.dog.id)}
                >
                  <div className="event-icon copper">
                    <Syringe size={20} />
                  </div>
                  <div>
                    <strong>{vaccine.product}</strong>
                    <p>{vaccine.dog?.name || 'Expediente canino'}</p>
                  </div>
                  <span className="date-chip">{formatDate(vaccine.nextDueDate)}</span>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              compact
              icon={Syringe}
              title="Sin próximas dosis registradas"
              description="Añade vacunas al expediente de cada perro para dar seguimiento a sus fechas."
            />
          )}
        </Panel>
      </div>
      <Panel
        title="Actividad de entrenamiento"
        subtitle={`${data.trainingCount.toLocaleString('es-CR')} sesiones registradas en la unidad`}
        action={<TextLink onClick={() => navigate('training')}>Ver bitácora</TextLink>}
      >
        {data.recentTraining.length ? (
          <div className="training-recent">
            {data.recentTraining.slice(0, 4).map((session) => (
              <button
                className="training-mini"
                key={session.id}
                onClick={() => session.dog && navigate('dogs', session.dog.id)}
              >
                <div className="training-mini-top">
                  <GraduationCap size={20} />
                  <span>{formatDate(session.occurredAt)}</span>
                </div>
                <h3>{session.dog?.name || 'Sesión registrada'}</h3>
                <p>{session.discipline}</p>
                <small>
                  <Clock3 size={13} />
                  {session.durationMinutes} min
                </small>
              </button>
            ))}
          </div>
        ) : (
          <Empty
            compact
            icon={GraduationCap}
            title="El progreso empieza con una sesión"
            description="Registra objetivos, resultados y observaciones desde el expediente canino."
          />
        )}
      </Panel>
      <div className="dashboard-note">
        <ShieldCheck size={16} />
        <span>Información interna de ORYX K9 · Actualizada desde los registros de tu unidad</span>
      </div>
    </>
  );
}
