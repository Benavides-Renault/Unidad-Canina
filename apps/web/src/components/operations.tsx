'use client';
import { useState } from 'react';
import { Bell, Check, Dog as DogIcon, GraduationCap, ShieldCheck, Syringe } from 'lucide-react';
import {
  api,
  errorMessage,
  formatDate,
  type DashboardData,
  type Notification,
  type PageData,
  type Training,
} from '@/lib/api';
import { useResource } from '@/lib/use-resource';
import { Button, Empty, ErrorBox, Loading, PageHeading, Panel, TextLink } from './ui';
import { Pager } from './business-ui';
import { TrainingHistory } from './dogs';

export function TrainingPage({
  openDog,
  navigate,
}: {
  openDog: (id: string) => void;
  navigate: (page: string) => void;
}) {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useResource<PageData<Training>>(
    `/training?page=${page}&pageSize=15`,
  );
  return (
    <>
      <PageHeading
        eyebrow="DISCIPLINA Y EVOLUCIÓN"
        title="Entrenamiento"
        description="La bitácora de trabajo de todo el equipo."
      >
        <Button icon={DogIcon} onClick={() => navigate('dogs')}>
          Elegir perro para entrenar
        </Button>
      </PageHeading>
      <Panel title="Sesiones de la unidad" subtitle={`${data?.total || 0} registros de entrenamiento`}>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} retry={reload} />
        ) : data?.items.length ? (
          <>
            {data.items.map((item) => (
              <div className="global-training" key={item.id}>
                <TextLink onClick={() => item.dog && openDog(item.dog.id)}>
                  {item.dog?.name || 'Expediente canino'}
                </TextLink>
                <TrainingHistory items={[item]} />
              </div>
            ))}
            <div className="pagination">
              <span>Página {page}</span>
              <div>
                <Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  disabled={page * 15 >= data.total}
                  onClick={() => setPage(page + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </>
        ) : (
          <Empty
            icon={GraduationCap}
            title="El trabajo de hoy, el progreso de mañana"
            description="Selecciona un perro y registra su primera sesión desde la pestaña Entrenamiento de su expediente."
            action={
              <Button variant="secondary" onClick={() => navigate('dogs')}>
                Ir a la unidad
              </Button>
            }
          />
        )}
      </Panel>
    </>
  );
}
export function HealthPage({
  openDog,
  navigate,
}: {
  openDog: (id: string) => void;
  navigate: (page: string) => void;
}) {
  const { data, error, loading, reload } = useResource<DashboardData>('/dashboard');
  return (
    <>
      <PageHeading
        eyebrow="BIENESTAR Y PREVENCIÓN"
        title="Salud de la unidad"
        description="Da seguimiento a las próximas dosis de vacunación."
      >
        <Button variant="secondary" icon={DogIcon} onClick={() => navigate('dogs')}>
          Abrir expedientes
        </Button>
      </PageHeading>
      <Panel title="Próximas vacunas" subtitle="El historial completo está en el expediente de cada perro">
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} retry={reload} />
        ) : data?.upcomingVaccinations.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Perro</th>
                  <th>Producto</th>
                  <th>Aplicación</th>
                  <th>Próxima dosis</th>
                  <th>Profesional</th>
                </tr>
              </thead>
              <tbody>
                {data.upcomingVaccinations.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <button className="inline-link" onClick={() => item.dog && openDog(item.dog.id)}>
                        {item.dog?.name || 'Ver expediente'}
                      </button>
                    </td>
                    <td>{item.product}</td>
                    <td>{formatDate(item.appliedDate)}</td>
                    <td>{formatDate(item.nextDueDate)}</td>
                    <td>{item.professional || 'Sin registrar'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={Syringe}
            title="Sin próximas dosis registradas"
            description="Registra las vacunas y la próxima dosis en la ficha de salud de cada perro."
            action={
              <Button variant="secondary" onClick={() => navigate('dogs')}>
                Ver expedientes
              </Button>
            }
          />
        )}
      </Panel>
      <div className="dashboard-note">
        <ShieldCheck size={16} />
        <span>Consulta el historial de cada perro para revisar sus vacunas, controles y próximas citas.</span>
      </div>
    </>
  );
}
export function NotificationsPage({ onRead }: { onRead: () => void }) {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useResource<PageData<Notification>>(
    `/notifications?page=${page}&pageSize=20`,
  );
  const [actionError, setActionError] = useState('');
  async function mark(id: string) {
    setActionError('');
    try {
      await api(`/notifications/${id}/read`, 'PATCH');
      reload();
      onRead();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="SEGUIMIENTO DE LA UNIDAD"
        title="Notificaciones"
        description="Recordatorios generados por el servidor, incluso cuando la aplicación está cerrada."
      />
      {actionError && <ErrorBox message={actionError} />}
      <Panel>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} retry={reload} />
        ) : data?.items.length ? (
          <div className="notifications-list">
            {data.items.map((item) => (
              <article key={item.id} className={`notification-row ${!item.readAt ? 'unread' : ''}`}>
                <div className="notification-icon">
                  <Bell size={21} />
                </div>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  <small>{formatDate(item.createdAt, true)}</small>
                </div>
                {!item.readAt ? (
                  <button
                    className="icon-button"
                    aria-label={`Marcar como leída: ${item.title}`}
                    onClick={() => mark(item.id)}
                  >
                    <Check size={18} />
                  </button>
                ) : (
                  <span className="read-label">Leída</span>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Empty
            icon={Bell}
            title="Todo en orden por aquí"
            description="Los recordatorios de citas y vacunas aparecerán en este espacio."
          />
        )}
      </Panel>
      {data && !loading && !error && <Pager page={page} data={data} setPage={setPage} />}
      <p className="footnote">Configura los canales de aviso en tus preferencias de notificaciones.</p>
    </>
  );
}
