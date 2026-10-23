'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Heart,
  Dog,
  ShieldCheck,
  MessageCircle,
  UserPlus,
  LogIn,
  ArrowRight,
} from 'lucide-react';
import { useResource } from '@/lib/use-resource';
import { catalogHref, type CatalogRoute } from '@/lib/public-routes';
import { BrandMark } from './brand';
import { Button, ErrorBox, Loading } from './ui';
import { PublicCatalog } from './public-catalog';
import {
  ContactLinks,
  InquiryDialog,
  type InquiryInterest,
  type InquiryKind,
  type PublicSettings,
} from './public-contact';

const services = [
  {
    icon: Heart,
    title: 'Crianza y camadas',
    text: 'Conoce los cruces publicados, sus padres y las fechas previstas. Consulta las condiciones para reservar un cachorro.',
  },
  {
    icon: Dog,
    title: 'Entrenamiento',
    text: 'Obediencia, socialización y preparación canina según las necesidades de cada perro y su responsable.',
  },
  {
    icon: ShieldCheck,
    title: 'Seguimiento cercano',
    text: 'Información sobre tus perros, sus entrenamientos y sus cuidados, disponible desde tu cuenta.',
  },
];

function Services() {
  return (
    <div className="public-services">
      {services.map(({ icon: Icon, title, text }) => (
        <article key={title}>
          <span className="public-service-icon">
            <Icon size={25} />
          </span>
          <h3>{title}</h3>
          <p>{text}</p>
        </article>
      ))}
    </div>
  );
}

function HomeContent() {
  return (
    <>
      <section className="public-hero">
        <div>
          <span className="eyebrow">CRIANZA · ENTRENAMIENTO · COMPAÑÍA</span>
          <h1>
            Cada gran vínculo
            <br />
            comienza con <em>una historia.</em>
          </h1>
          <p>
            Conoce nuestros perros y próximas camadas. Descubre su origen, su preparación y el compañero que
            encaja contigo.
          </p>
          <div className="public-hero-actions">
            <Link className="button button-primary" href="/disponibles">
              Explorar disponibles <ArrowUpRight size={17} />
            </Link>
            <Link className="button button-secondary" href="/quienes-somos">
              Conoce ORYX K9 <ArrowRight size={17} />
            </Link>
          </div>
          <span className="public-hero-note">Puedes explorar y contactarnos sin crear una cuenta.</span>
        </div>
        <div className="public-hero-emblem" aria-hidden="true">
          <BrandMark />
          <span>CONFIANZA. DISCIPLINA. PROPÓSITO.</span>
        </div>
      </section>
      <section className="public-home-intro public-page-width" aria-labelledby="home-unit-title">
        <div className="public-section-heading">
          <div>
            <span className="eyebrow">UNA UNIDAD, UN PROPÓSITO</span>
            <h2 id="home-unit-title">
              Más que encontrar un perro.
              <br />
              Construir un vínculo.
            </h2>
          </div>
          <p>
            Acompañamos a personas, familias e instituciones de todo el país. Conoce nuestra unidad y
            encuentra la información que necesitas para dar el siguiente paso.
          </p>
        </div>
        <Services />
      </section>
      <section className="public-home-banner public-page-width">
        <div>
          <span className="eyebrow">TU PRÓXIMO COMPAÑERO</span>
          <h2>Perros y camadas en un solo lugar.</h2>
          <p>Explora las fichas, conoce a los padres y consulta las opciones de reserva.</p>
        </div>
        <Link className="button button-primary" href="/disponibles">
          Ver perros y camadas <ArrowUpRight size={17} />
        </Link>
      </section>
    </>
  );
}

function AboutContent() {
  return (
    <div className="public-page-width public-about">
      <section className="public-page-intro">
        <span className="eyebrow">ORYX K9 · UNIDAD CANINA</span>
        <h1>Quiénes somos</h1>
        <p className="public-lead">
          Un proyecto dedicado a la crianza, el entrenamiento y el vínculo entre los perros y las personas.
        </p>
        <p>
          En ORYX K9 reunimos información, preparación y seguimiento para acompañarte en cada etapa. Atendemos
          a particulares, clientes institucionales y municipalidades en todo el país.
        </p>
        <span className="public-coverage">
          <ShieldCheck size={18} /> Atención en todo el país
        </span>
      </section>
      <section aria-labelledby="about-work-title">
        <div className="public-section-heading">
          <div>
            <span className="eyebrow">LO QUE HACEMOS</span>
            <h2 id="about-work-title">Cada perro, su propio camino.</h2>
          </div>
        </div>
        <Services />
      </section>
      <section className="public-about-process" aria-labelledby="about-process-title">
        <div>
          <span className="eyebrow">CÓMO EMPEZAR</span>
          <h2 id="about-process-title">Conversemos sobre lo que necesitas.</h2>
          <p>
            La elección de un perro o un programa de entrenamiento comienza con información clara y una
            conversación con el equipo.
          </p>
          <Link className="button button-primary" href="/contacto">
            Contactar al equipo <ArrowUpRight size={17} />
          </Link>
        </div>
        <ol>
          <li>
            <span>01</span>
            <div>
              <h3>Conoce las opciones</h3>
              <p>
                Revisa los perros disponibles y las camadas, sus fichas y la información publicada de los
                padres.
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Resuelve tus dudas</h3>
              <p>
                Consulta disponibilidad, precios, entrenamiento y condiciones de reserva antes de decidir.
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Mantén el seguimiento</h3>
              <p>Solicita una cuenta para acceder a la información de tus perros y su evolución.</p>
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
}

export function PublicLanding({
  view = 'home',
  route = { kind: 'dogs', page: 1 },
  requestAccount = false,
}: {
  view?: 'home' | 'catalog' | 'contact' | 'about';
  route?: CatalogRoute;
  requestAccount?: boolean;
}) {
  const settings = useResource<PublicSettings>(view === 'contact' ? '/public/settings' : null);
  const context = view === 'catalog' ? catalogHref(route) : view;
  const [dialog, setDialog] = useState<{
    kind: InquiryKind;
    interest?: InquiryInterest;
    context: string;
  } | null>(requestAccount ? { kind: 'ACCOUNT', context } : null);
  const openDialog = (next: { kind: InquiryKind; interest?: InquiryInterest }) =>
    setDialog({ ...next, context });
  useEffect(() => {
    setDialog((previous) => (previous?.context !== context ? null : previous));
  }, [context]);
  return (
    <div className={'public-site public-view-' + view} id="top">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="public-header">
        <Link className="public-brand" href="/" aria-label="ORYX K9 · Inicio">
          <BrandMark />
          <span>
            ORYX K9<small>UNIDAD CANINA</small>
          </span>
        </Link>
        <nav aria-label="Navegación pública">
          <Link href="/disponibles" aria-current={view === 'catalog' ? 'page' : undefined}>
            Perros disponibles
          </Link>
          <Link href="/quienes-somos" aria-current={view === 'about' ? 'page' : undefined}>
            Quiénes somos
          </Link>
          <Link href="/contacto" aria-current={view === 'contact' ? 'page' : undefined}>
            Contacto
          </Link>
          <Link className="button button-primary public-sign-in" href="/acceso">
            <LogIn size={16} /> Iniciar sesión
          </Link>
        </nav>
      </header>
      <main id="contenido" tabIndex={-1}>
        {view === 'home' && <HomeContent />}
        {view === 'catalog' && (
          <section id="catalogo" className="public-catalog" tabIndex={-1}>
            <PublicCatalog route={route} inquire={(interest) => openDialog({ kind: 'PURCHASE', interest })} />
          </section>
        )}
        {view === 'about' && <AboutContent />}
        {view === 'contact' && (
          <section className="public-contact-section public-contact-page">
            <div className="public-page-intro">
              <span className="eyebrow">ESTAMOS PARA ACOMPAÑARTE</span>
              <h1>Hablemos de lo que buscas.</h1>
              <p>
                Consulta por un perro, una camada, un entrenamiento o una cuenta. Nuestro equipo atiende
                consultas de todo el país.
              </p>
              <p>No necesitas una cuenta ni WhatsApp para escribirnos.</p>
            </div>
            <div className="public-contact-card">
              <h2>Contacta con ORYX K9</h2>
              {settings.loading && <Loading />}
              {settings.error && <ErrorBox message={settings.error} retry={settings.reload} />}
              {settings.data?.contactName && (
                <p className="public-contact-name">{settings.data.contactName}</p>
              )}
              <ContactLinks settings={settings.data} showWhatsApp={false} />
              <div className="public-contact-actions">
                <Button icon={MessageCircle} onClick={() => openDialog({ kind: 'CONTACT' })}>
                  Enviar solicitud de contacto
                </Button>
                <Button variant="secondary" icon={UserPlus} onClick={() => openDialog({ kind: 'ACCOUNT' })}>
                  Solicitar una cuenta
                </Button>
              </div>
              <div className="public-socials">
                {[
                  ['Instagram', settings.data?.instagramUrl],
                  ['Facebook', settings.data?.facebookUrl],
                  ['TikTok', settings.data?.tiktokUrl],
                ]
                  .filter(([, url]) => url)
                  .map(([name, url]) => (
                    <a key={name} href={url!} target="_blank" rel="noopener noreferrer">
                      {name} <ArrowUpRight size={15} />
                    </a>
                  ))}
              </div>
              {settings.data?.whatsappNumber && (
                <p className="public-contact-note">
                  Si prefieres WhatsApp, utiliza el botón verde de la esquina.
                </p>
              )}
            </div>
          </section>
        )}
      </main>
      <footer className="public-footer" id="pie-de-pagina">
        <div className="public-footer-grid">
          <div className="public-footer-brand">
            <Link className="public-brand" href="/" aria-label="ORYX K9 · Inicio">
              <BrandMark />
              <span>
                ORYX K9<small>UNIDAD CANINA</small>
              </span>
            </Link>
            <p>Crianza, entrenamiento y un vínculo para toda la vida.</p>
            <span className="public-footer-location">Atención en todo el país</span>
          </div>
          <nav aria-label="Explorar ORYX K9">
            <h2>Explora</h2>
            <Link href="/">Inicio</Link>
            <Link href="/disponibles">Perros disponibles</Link>
            <Link href="/quienes-somos">Quiénes somos</Link>
            <Link href="/contacto">Contacto</Link>
          </nav>
          <div className="public-footer-community">
            <h2>Tu cuenta ORYX K9</h2>
            <p>Consulta el seguimiento de tus perros y mantente cerca de nuestra unidad.</p>
            <Link
              className="public-footer-account"
              href="/contacto?solicitud=cuenta"
              onClick={(event) => {
                if (view === 'contact') {
                  event.preventDefault();
                  openDialog({ kind: 'ACCOUNT' });
                }
              }}
            >
              Solicita tu cuenta <ArrowUpRight size={15} />
            </Link>
            <Link className="public-footer-login" href="/acceso">
              Iniciar sesión <LogIn size={15} />
            </Link>
          </div>
        </div>
        <div className="public-footer-bottom">
          <span>© {new Date().getFullYear()} ORYX K9 · Unidad Canina</span>
          <span>Confianza. Disciplina. Propósito.</span>
          <a href="#top">Volver arriba ↑</a>
        </div>
      </footer>
      {dialog?.context === context && <InquiryDialog {...dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}
