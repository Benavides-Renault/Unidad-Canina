'use client';
import { useEffect, useState, type FormEvent } from 'react';
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Dog,
  GraduationCap,
  HeartPulse,
  LayoutDashboard,
  Heart,
  Banknote,
  Package,
  LockKeyhole,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
  Layers3,
  CircleCheck,
  ArrowUpRight,
  FileText,
  ClipboardList,
} from 'lucide-react';
import { api, errorMessage, labels, type User, type Notification, type PageData } from '@/lib/api';
import { useResource } from '@/lib/use-resource';
import { Auth } from '@/components/auth';
import { Dashboard } from '@/components/dashboard';
import { Dogs, DogDetail, DogEditor } from '@/components/dogs';
import { Calendar, AppointmentEditor } from '@/components/calendar';
import { HealthPage, NotificationsPage, TrainingPage } from '@/components/operations';
import { SettingsPage, UsersPage } from '@/components/settings';
import { ErrorBox, Loading, PageHeading, Panel } from '@/components/ui';
import { ContractsPage, ServicesPage } from '@/components/contracts';
import { BreedingPage } from '@/components/breeding';
import { FinancePage, ReservationsPage } from '@/components/finance';
import { InventoryPage } from '@/components/inventory';
import { RestrictedWorkspace, PartiesPage, CatalogManager, TrainerWorkspace } from '@/components/portals';
import { detachBrowserPush } from '@/components/notification-preferences';

const navigation = [
  { id: 'home', label: 'Inicio', icon: LayoutDashboard },
  { id: 'dogs', label: 'Nuestra unidad', icon: Dog },
  { id: 'health', label: 'Salud y bienestar', icon: HeartPulse },
  { id: 'training', label: 'Entrenamiento', icon: GraduationCap },
  { id: 'calendar', label: 'Calendario', icon: CalendarDays },
];
const pageNames: Record<string, string> = {
  home: 'Inicio',
  dogs: 'Nuestra unidad',
  health: 'Salud y bienestar',
  training: 'Entrenamiento',
  calendar: 'Calendario',
  contracts: 'Contratos e instituciones',
  services: 'Operaciones',
  breeding: 'Crianza',
  reservations: 'Apartados',
  finance: 'Finanzas',
  inventory: 'Inventario',
  notifications: 'Notificaciones',
  users: 'Usuarios',
  settings: 'Configuración',
  roadmap: 'Guía de módulos',
  parties: 'Personas y entidades',
  catalog: 'Publicaciones y categorías',
  care: 'Seguimiento médico',
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  const [page, setPage] = useState('home');
  const [dogId, setDogId] = useState<string | undefined>();
  const [accountId, setAccountId] = useState<string | undefined>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createDog, setCreateDog] = useState(false);
  const [appointment, setAppointment] = useState<{ dogId?: string } | null>(null);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [offline, setOffline] = useState(false);
  const notifications = useResource<PageData<Notification>>(
    user && (!user.mfaRequired || user.mfaEnabled) ? '/notifications' : null,
  );
  const unread = notifications.data?.items.filter((item) => !item.readAt).length || 0;
  const authenticate = () => {
    setChecking(true);
    setConnectionError('');
    api<User>('/auth/me')
      .then(setUser)
      .catch((error) => {
        if (error.status !== 401) setConnectionError(errorMessage(error));
      })
      .finally(() => setChecking(false));
  };
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('token')) setChecking(false);
    else authenticate();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);
  const navigate = (next: string, id?: string) => {
    setPage(next);
    setDogId(id);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const logout = async () => {
    try {
      await detachBrowserPush().catch(() => undefined);
      await api('/auth/logout', 'POST');
      setUser(null);
      sessionStorage.removeItem('valkyr-search');
      sessionStorage.removeItem('valkyr-status');
      setPage('home');
      setDogId(undefined);
    } catch (err) {
      setConnectionError(errorMessage(err));
    }
  };
  const searchDogs = (event: FormEvent) => {
    event.preventDefault();
    sessionStorage.setItem('valkyr-search', search);
    setRevision((value) => value + 1);
    navigate('dogs');
  };
  if (checking)
    return (
      <div className="boot-screen">
        <img src="/valkyr-logo-original.png" width="84" height="96" alt="VALKYR Unidad Canina" />
        <Loading />
      </div>
    );
  if (!user)
    return (
      <>
        {connectionError && (
          <div className="connection-banner">
            <ErrorBox message={connectionError} retry={authenticate} />
          </div>
        )}
        <Auth
          onLogin={(next) => {
            setUser(next);
            setConnectionError('');
          }}
        />
      </>
    );
  if (user.role !== 'ADMIN') return <RestrictedWorkspace user={user} logout={logout} />;
  if (user.mfaRequired && !user.mfaEnabled)
    return (
      <main className="main-content">
        <SettingsPage user={user} refreshUser={async () => setUser(await api<User>('/auth/me'))} />
      </main>
    );
  const financeOnly = false;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      {sidebarOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Cerrar navegación"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Navegación principal">
        <div className="sidebar-brand">
          <img src="/valkyr-logo-original.png" width="52" height="59" alt="VALKYR Unidad Canina" />
          <div>
            <strong>VALKYR</strong>
            <span>UNIDAD CANINA</span>
          </div>
          <button
            className="mobile-close icon-button"
            aria-label="Cerrar menú"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={19} />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-dot" /> ESPACIO DE TRABAJO PRIVADO
        </div>
        <div className="sidebar-scroll">
          <div className="nav-group-label">GESTIÓN DE LA UNIDAD</div>
          <nav>
            {!financeOnly &&
              navigation.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={`nav-item ${page === id ? 'active' : ''}`}
                  onClick={() => navigate(id)}
                  aria-current={page === id ? 'page' : undefined}
                >
                  <Icon size={19} strokeWidth={1.7} />
                  <span>{label}</span>
                  {page === id && <span className="active-mark" />}
                </button>
              ))}
            <button
              className={`nav-item ${page === 'notifications' ? 'active' : ''}`}
              onClick={() => navigate('notifications')}
              aria-current={page === 'notifications' ? 'page' : undefined}
            >
              <Bell size={19} strokeWidth={1.7} />
              <span>Notificaciones</span>
              {unread > 0 && <span className="nav-count">{unread}</span>}
            </button>
          </nav>
          <nav aria-label="Gestión administrativa">
            <button
              className={`nav-item ${page === 'catalog' ? 'active' : ''}`}
              onClick={() => navigate('catalog')}
            >
              <Dog size={19} />
              <span>Venta y preventa</span>
            </button>
            <button
              className={`nav-item ${page === 'care' ? 'active' : ''}`}
              onClick={() => navigate('care')}
            >
              <HeartPulse size={19} />
              <span>Seguimiento médico</span>
            </button>
            <button
              className={`nav-item ${page === 'parties' ? 'active' : ''}`}
              onClick={() => navigate('parties')}
            >
              <Users size={19} />
              <span>Personas y entidades</span>
            </button>
            {[
              { id: 'breeding', label: 'Crianza', icon: Heart, roles: ['SUPERADMIN', 'ADMIN', 'VET'] },
              {
                id: 'reservations',
                label: 'Apartados',
                icon: Heart,
                roles: ['SUPERADMIN', 'ADMIN', 'FINANCE'],
              },
              { id: 'finance', label: 'Finanzas', icon: Banknote, roles: ['SUPERADMIN', 'ADMIN', 'FINANCE'] },
              {
                id: 'inventory',
                label: 'Inventario',
                icon: Package,
                roles: ['SUPERADMIN', 'ADMIN', 'FINANCE'],
              },
            ]
              .filter((item) => item.roles.includes(user.role))
              .map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={`nav-item ${page === id ? 'active' : ''}`}
                  onClick={() => {
                    setAccountId(undefined);
                    navigate(id);
                  }}
                >
                  <Icon size={19} />
                  <span>{label}</span>
                </button>
              ))}
            {['SUPERADMIN', 'ADMIN', 'TRAINER'].includes(user.role) && (
              <button
                className={`nav-item ${page === 'services' ? 'active' : ''}`}
                onClick={() => navigate('services')}
              >
                <ClipboardList size={19} />
                <span>Operaciones</span>
              </button>
            )}
            {['SUPERADMIN', 'ADMIN', 'FINANCE'].includes(user.role) && (
              <button
                className={`nav-item ${page === 'contracts' ? 'active' : ''}`}
                onClick={() => navigate('contracts')}
              >
                <FileText size={19} />
                <span>Contratos</span>
              </button>
            )}
          </nav>
          <div className="nav-group-label administration">ADMINISTRACIÓN</div>
          <nav>
            {user.role === 'ADMIN' && (
              <button
                className={`nav-item ${page === 'users' ? 'active' : ''}`}
                onClick={() => navigate('users')}
              >
                <Users size={19} strokeWidth={1.7} />
                <span>Usuarios</span>
              </button>
            )}
            <button
              className={`nav-item ${page === 'settings' ? 'active' : ''}`}
              onClick={() => navigate('settings')}
            >
              <Settings size={19} strokeWidth={1.7} />
              <span>Configuración</span>
            </button>
            <button
              className={`nav-item ${page === 'roadmap' ? 'active' : ''}`}
              onClick={() => navigate('roadmap')}
            >
              <Layers3 size={19} strokeWidth={1.7} />
              <span>Guía de módulos</span>
            </button>
          </nav>
        </div>
        <div className="sidebar-bottom">
          <div className="private-note">
            <ShieldCheck size={20} />
            <div>
              <strong>Una unidad. Un propósito.</strong>
              <span>Información interna y protegida.</span>
            </div>
          </div>
          <div className="sidebar-user">
            <button className="user-profile" onClick={() => navigate('settings')}>
              <div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div>
              <div>
                <strong>{user.name}</strong>
                <span>{labels[user.role]}</span>
              </div>
            </button>
            <button
              className="logout-button"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              onClick={logout}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Abrir navegación"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            <span>Espacio de trabajo</span>
            <ChevronRight size={13} />
            <strong>{pageNames[page]}</strong>
          </div>
          {!financeOnly && (
            <form className="global-search" onSubmit={searchDogs}>
              <Search size={17} />
              <input
                aria-label="Buscar en expedientes"
                placeholder="Buscar en la unidad…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <kbd>↵</kbd>
            </form>
          )}
          <div className="topbar-date">
            {new Intl.DateTimeFormat('es-CR', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              timeZone: 'America/Costa_Rica',
            }).format(new Date())}
          </div>
          <button
            className="header-bell"
            aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ''}`}
            onClick={() => navigate('notifications')}
          >
            <Bell size={19} />
            {unread > 0 && <span />}
          </button>
        </header>
        <main id="main-content" className="main-content">
          {offline && (
            <ErrorBox message="Sin conexión. Esta aplicación requiere acceso al servidor para consultar o guardar datos." />
          )}
          {connectionError && <ErrorBox message={connectionError} />}
          {financeOnly &&
          ![
            'notifications',
            'settings',
            'roadmap',
            'contracts',
            'reservations',
            'finance',
            'inventory',
          ].includes(page) ? (
            <FinancePage />
          ) : (
            <>
              {page === 'home' && (
                <Dashboard user={user} navigate={navigate} createDog={() => setCreateDog(true)} />
              )}
              {page === 'dogs' &&
                (dogId ? (
                  <DogDetail
                    id={dogId}
                    key={dogId}
                    user={user}
                    onBack={() => {
                      setDogId(undefined);
                      setRevision((value) => value + 1);
                    }}
                    onAppointment={(id) => setAppointment({ dogId: id })}
                  />
                ) : (
                  <Dogs
                    key={revision}
                    user={user}
                    openDog={(id) => navigate('dogs', id)}
                    createDog={() => setCreateDog(true)}
                    revision={revision}
                  />
                ))}
              {page === 'health' && <HealthPage openDog={(id) => navigate('dogs', id)} navigate={navigate} />}
              {page === 'training' && (
                <TrainingPage openDog={(id) => navigate('dogs', id)} navigate={navigate} />
              )}
              {page === 'calendar' && (
                <Calendar
                  user={user}
                  openDog={(id) => navigate('dogs', id)}
                  revision={revision}
                  createAppointment={() => setAppointment({})}
                />
              )}
              {page === 'notifications' && <NotificationsPage onRead={notifications.reload} />}
              {page === 'users' && <UsersPage current={user} />}
              {page === 'parties' && <PartiesPage />}
              {page === 'catalog' && <CatalogManager />}
              {page === 'care' && <TrainerWorkspace user={user} />}
              {page === 'contracts' && ['SUPERADMIN', 'ADMIN', 'FINANCE'].includes(user.role) && (
                <ContractsPage user={user} openDog={(id) => navigate('dogs', id)} />
              )}
              {page === 'services' && ['SUPERADMIN', 'ADMIN', 'TRAINER'].includes(user.role) && (
                <ServicesPage />
              )}
              {page === 'breeding' && ['SUPERADMIN', 'ADMIN', 'VET'].includes(user.role) && (
                <BreedingPage user={user} openDog={(id) => navigate('dogs', id)} />
              )}
              {page === 'reservations' && ['SUPERADMIN', 'ADMIN', 'FINANCE'].includes(user.role) && (
                <ReservationsPage
                  user={user}
                  openAccount={(id) => {
                    setAccountId(id);
                    navigate('finance');
                  }}
                />
              )}
              {page === 'finance' && ['SUPERADMIN', 'ADMIN', 'FINANCE'].includes(user.role) && (
                <FinancePage
                  key={accountId || 'all'}
                  initialId={accountId}
                  onBackToList={() => setAccountId(undefined)}
                />
              )}
              {page === 'inventory' && ['SUPERADMIN', 'ADMIN', 'FINANCE'].includes(user.role) && (
                <InventoryPage />
              )}
              {page === 'settings' && (
                <SettingsPage user={user} refreshUser={async () => setUser(await api<User>('/auth/me'))} />
              )}
              {page === 'roadmap' && <Roadmap />}
            </>
          )}
          <footer className="app-footer">
            <span>
              VALKYR MANAGER <span>·</span> Unidad Canina
            </span>
            <span>
              Operación privada <LockKeyhole size={12} />
            </span>
          </footer>
        </main>
      </div>
      {createDog && (
        <DogEditor
          onClose={() => setCreateDog(false)}
          onSaved={(dog) => {
            setCreateDog(false);
            setRevision((value) => value + 1);
            navigate('dogs', dog.id);
          }}
        />
      )}
      {appointment && (
        <AppointmentEditor
          dogId={appointment.dogId}
          onClose={() => setAppointment(null)}
          onSaved={() => {
            setAppointment(null);
            setRevision((value) => value + 1);
            navigate('calendar');
          }}
        />
      )}
    </div>
  );
}

function Roadmap() {
  return (
    <>
      <PageHeading
        eyebrow="VALKYR · UNIDAD CANINA"
        title="Guía de módulos"
        description="Organiza el trabajo del equipo y consulta toda la actividad de la unidad."
      />
      <div className="roadmap-grid">
        <Panel>
          <div className="roadmap-number active">
            <CircleCheck size={27} />
          </div>
          <div className="eyebrow">ACCESO Y EXPEDIENTES</div>
          <h2>La unidad, conectada</h2>
          <p>
            Acceso privado, expedientes, salud, archivos, citas, entrenamiento con objetivos y
            certificaciones. Portales de entrenadores y clientes según sus perros.
          </p>
          <span className="roadmap-status">Disponible según permisos</span>
        </Panel>
        <Panel>
          <div className="roadmap-number">02</div>
          <div className="eyebrow">RELACIONES INSTITUCIONALES</div>
          <h2>Contratos y servicios</h2>
          <p>
            Instituciones, contactos, contratos, renovaciones, asignación de perros y servicios realizados.
          </p>
          <span className="roadmap-status">Disponible según permisos</span>
        </Panel>
        <Panel>
          <div className="roadmap-number">03</div>
          <div className="eyebrow">CRIANZA Y FINANZAS</div>
          <h2>Crianza y administración</h2>
          <p>
            Pedigrí, cruces, camadas, reservas y ventas. Proveedores, pagos, conciliación, cierres e
            inventario.
          </p>
          <span className="roadmap-status">Disponible según permisos</span>
        </Panel>
        <Panel>
          <div className="roadmap-number">04</div>
          <div className="eyebrow">CONTINUIDAD DEL SERVICIO</div>
          <h2>Control de la instalación</h2>
          <p>
            Calendario, preferencias de avisos, recuperación de acceso, respaldos cifrados y estado de los
            servicios.
          </p>
          <span className="roadmap-status">Consulta el estado en Configuración</span>
        </Panel>
      </div>
      <div className="inline-notice">
        <ArrowUpRight size={19} />
        <span>
          Administración gestiona los módulos y los accesos. Entrenadores y clientes cuentan con un portal
          según los perros vinculados a su cuenta.
        </span>
      </div>
    </>
  );
}
