'use client';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Dog as DogIcon,
  Heart,
  MessageCircle,
  Share2,
  UserPlus,
  LogIn,
  Phone,
  Mail,
} from 'lucide-react';
import { API, formatDate, type PageData } from '@/lib/api';
import { useResource } from '@/lib/use-resource';
import { BrandMark } from './brand';
import { Badge, Button, Empty, ErrorBox, Loading, Success } from './ui';
import { money, Pager } from './business-ui';
import {
  ContactLinks,
  whatsappLink,
  InquiryDialog,
  type InquiryInterest,
  type InquiryKind,
  type PublicSettings,
} from './public-contact';

export type CatalogDog = {
  id: string;
  name: string;
  breed: string;
  sex: string;
  photoId?: string;
  birthDate?: string;
  registeredName?: string;
  workStatus: string;
  availability: string;
  publicDescription?: string;
  achievements?: string;
  trainingSummary?: string;
  functionalities?: string;
  healthSummary?: string;
  pedigreeSummary?: string;
  salePrice?: string;
  saleCurrency?: string;
  saleContact?: string;
};
type CatalogCross = {
  id: string;
  publicTitle: string;
  publicDescription?: string;
  plannedDate: string;
  matingDate?: string;
  expectedBirthDate?: string;
  expectedDeliveryDate?: string;
  status: string;
  puppyPrice?: string;
  currency: string;
  contact?: string;
  dam: CatalogDog;
  sire: CatalogDog;
  litter?: { birthDate: string; puppies: CatalogDog[] } | null;
};
type Selection = { kind: 'dogs' | 'crosses'; id: string };
function Photo({ dog }: { dog: CatalogDog }) {
  return (
    <div className="portal-photo">
      {dog.photoId ? (
        <img src={`${API}/public/photos/${dog.photoId}`} alt={dog.name} loading="lazy" decoding="async" />
      ) : (
        <div className="public-photo-placeholder">
          <DogIcon size={48} />
          <span>{dog.name}</span>
        </div>
      )}
    </div>
  );
}
function Profile({ dog }: { dog: CatalogDog }) {
  return (
    <div className="portal-profile">
      <Photo dog={dog} />
      <div>
        <div className="eyebrow">{dog.breed}</div>
        <h2>{dog.name}</h2>
        {dog.registeredName && <p>{dog.registeredName}</p>}
        <div className="badge-row">
          <Badge value={dog.sex} />
          <Badge value={dog.workStatus} />
        </div>
        {dog.birthDate && <p>Nacimiento: {formatDate(dog.birthDate)}</p>}
        {dog.salePrice && <p className="portal-price">{money(dog.salePrice, dog.saleCurrency || 'CRC')}</p>}
        {[
          ['Información general', dog.publicDescription],
          ['Logros', dog.achievements],
          ['Pedigrí', dog.pedigreeSummary],
          ['Entrenamiento', dog.trainingSummary],
          ['Funcionalidad', dog.functionalities],
          ['Salud publicada', dog.healthSummary],
        ]
          .filter(([, value]) => value)
          .map(([title, value]) => (
            <section className="portal-copy" key={title}>
              <h3>{title}</h3>
              <p>{value}</p>
            </section>
          ))}
      </div>
    </div>
  );
}
function Detail({
  selection,
  settings,
  back,
  inquire,
}: {
  selection: Selection;
  settings?: PublicSettings | null;
  back: () => void;
  inquire: (interest: InquiryInterest) => void;
}) {
  const r = useResource<CatalogDog | CatalogCross>(`/public/${selection.kind}/${selection.id}`);
  const [parent, setParent] = useState<CatalogDog | null>(null),
    [copied, setCopied] = useState(false),
    [shareError, setShareError] = useState('');
  async function share() {
    try {
      const url = `${window.location.origin}/?tipo=${selection.kind}&id=${selection.id}#catalogo`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setShareError('');
    } catch {
      setShareError('Copia la dirección de esta página para compartirla.');
    }
  }
  if (parent)
    return (
      <>
        <Button variant="secondary" icon={ArrowLeft} onClick={() => setParent(null)}>
          Volver a la camada
        </Button>
        <Profile dog={parent} />
      </>
    );
  const item = r.data;
  return (
    <>
      <div className="public-detail-actions">
        <Button variant="secondary" icon={ArrowLeft} onClick={back}>
          Volver al catálogo
        </Button>
        <Button variant="secondary" icon={Share2} onClick={share}>
          Copiar enlace
        </Button>
      </div>
      {copied && <Success>Enlace copiado. Se puede abrir sin cuenta.</Success>}
      {shareError && <p role="status">{shareError}</p>}
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox message={r.error} retry={r.reload} />
      ) : item ? (
        <>
          {'dam' in item ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">{item.litter ? 'CAMADA DISPONIBLE' : 'PRÓXIMA CAMADA'}</div>
                  <h2>{item.publicTitle}</h2>
                  <p>{item.publicDescription}</p>
                </div>
              </div>
              <div className="public-dates">
                <div>
                  <span>{item.matingDate ? 'Fecha del cruce' : 'Cruce previsto'}</span>
                  <strong>{formatDate(item.matingDate || item.plannedDate)}</strong>
                </div>
                <div>
                  <span>{item.litter ? 'Nacimiento' : 'Nacimiento previsto'}</span>
                  <strong>{formatDate(item.litter?.birthDate || item.expectedBirthDate)}</strong>
                </div>
                <div>
                  <span>Entrega prevista</span>
                  <strong>{formatDate(item.expectedDeliveryDate)}</strong>
                </div>
              </div>
              {item.puppyPrice && (
                <p className="portal-price">{money(item.puppyPrice, item.currency)} por cachorro</p>
              )}
              <div className="portal-parents">
                {[item.dam, item.sire].map((dog, i) => (
                  <div key={dog.id}>
                    <h3>{i === 0 ? 'Madre' : 'Padre'}</h3>
                    <button
                      className="portal-card"
                      onClick={() => setParent(dog)}
                      aria-label={`Ver ${dog.name}`}
                    >
                      <Photo dog={dog} />
                      <div className="portal-card-content">
                        <h3>{dog.name}</h3>
                        <p>{dog.breed}</p>
                        <span className="portal-open">Conocer su historia →</span>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
              {item.litter && (
                <section className="public-litter-puppies">
                  <h3>Cachorros disponibles de esta camada</h3>
                  <div className="portal-grid">
                    {item.litter.puppies.map((puppy) => (
                      <a className="portal-card" key={puppy.id} href={`/?tipo=dogs&id=${puppy.id}#catalogo`}>
                        <Photo dog={puppy} />
                        <div className="portal-card-content">
                          <h3>{puppy.name}</h3>
                          <p>{puppy.breed}</p>
                          {puppy.salePrice && (
                            <strong className="portal-price">
                              {money(puppy.salePrice, puppy.saleCurrency || 'CRC')}
                            </strong>
                          )}
                          <span className="portal-open">
                            Ver información <ArrowUpRight size={16} />
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                </section>
              )}
              <p className="muted">Las fechas previstas y la disponibilidad se confirman con el equipo.</p>
            </>
          ) : (
            <Profile dog={item} />
          )}
          <div className="public-interest">
            <div>
              <h3>Conversemos sobre tu próximo compañero</h3>
              <p>{'dam' in item ? item.contact : item.saleContact}</p>
            </div>
            <ContactLinks
              settings={settings}
              interest={{
                kind: selection.kind === 'dogs' ? 'DOG' : 'CROSS',
                id: item.id,
                label: 'dam' in item ? item.publicTitle : item.name,
              }}
            />
            <Button
              icon={MessageCircle}
              onClick={() =>
                inquire({
                  kind: selection.kind === 'dogs' ? 'DOG' : 'CROSS',
                  id: item.id,
                  label: 'dam' in item ? item.publicTitle : item.name,
                })
              }
            >
              Enviar consulta de compra
            </Button>
          </div>
        </>
      ) : null}
    </>
  );
}
export function PublicCatalog({
  settings,
  inquire,
}: {
  settings?: PublicSettings | null;
  inquire: (interest: InquiryInterest) => void;
}) {
  const [kind, setKind] = useState<'dogs' | 'crosses'>('dogs'),
    [page, setPage] = useState(1),
    [selection, setSelection] = useState<Selection | null>(null);
  useEffect(() => {
    const read = () => {
      const q = new URLSearchParams(window.location.search);
      const type = q.get('tipo');
      const id = q.get('id');
      setKind(type === 'crosses' ? 'crosses' : 'dogs');
      setPage(1);
      if (id && (type === 'dogs' || type === 'crosses')) {
        setKind(type);
        setSelection({ kind: type, id });
      } else setSelection(null);
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  const r = useResource<PageData<CatalogDog | CatalogCross>>(
    selection ? null : `/public/${kind}?page=${page}&pageSize=12`,
  );
  function open(item: CatalogDog | CatalogCross) {
    setSelection({ kind, id: item.id });
    window.history.pushState(null, '', `/?tipo=${kind}&id=${item.id}#catalogo`);
    document.getElementById('catalogo')?.scrollIntoView({ behavior: 'instant' });
  }
  function back() {
    setSelection(null);
    window.history.pushState(null, '', `/?tipo=${kind}#catalogo`);
  }
  if (selection)
    return (
      <Detail
        key={`${selection.kind}:${selection.id}`}
        selection={selection}
        settings={settings}
        back={back}
        inquire={inquire}
      />
    );
  return (
    <>
      <div className="public-section-heading">
        <div>
          <span className="eyebrow">CONOCE NUESTRA UNIDAD</span>
          <h2>Encuentra a tu próximo compañero</h2>
          <p>Perros disponibles y camadas publicadas por ORYX K9.</p>
        </div>
        <Heart size={30} />
      </div>
      <div className="tabs" role="tablist" aria-label="Catálogo público">
        {(
          [
            ['dogs', 'Perros en venta'],
            ['crosses', 'Camadas y preventa'],
          ] as const
        ).map(([id, label]) => (
          <button
            role="tab"
            key={id}
            aria-selected={kind === id}
            className={kind === id ? 'active' : ''}
            onClick={() => {
              setKind(id);
              setPage(1);
              window.history.pushState(null, '', `/?tipo=${id}#catalogo`);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox message={r.error} retry={r.reload} />
      ) : r.data?.items.length ? (
        <>
          <div className="portal-grid">
            {r.data.items.map((item) => (
              <button
                className="portal-card"
                key={item.id}
                onClick={() => open(item)}
                aria-label={`Ver ${'dam' in item ? item.publicTitle : item.name}`}
              >
                {'dam' in item ? (
                  <div className="cross-photos">
                    <Photo dog={item.dam} />
                    <Photo dog={item.sire} />
                  </div>
                ) : (
                  <Photo dog={item} />
                )}
                <div className="portal-card-content">
                  <div className="eyebrow">
                    {'dam' in item
                      ? item.litter
                        ? 'CAMADA DISPONIBLE'
                        : 'PREVENTA · CRUCE PROGRAMADO'
                      : item.breed}
                  </div>
                  <h3>{'dam' in item ? item.publicTitle : item.name}</h3>
                  <p>{'dam' in item ? `${item.dam.name} × ${item.sire.name}` : item.publicDescription}</p>
                  <strong className="portal-price">
                    {'dam' in item
                      ? item.puppyPrice
                        ? money(item.puppyPrice, item.currency)
                        : 'Consultar precio'
                      : item.salePrice
                        ? money(item.salePrice, item.saleCurrency || 'CRC')
                        : 'Consultar precio'}
                  </strong>
                  <span className="portal-open">
                    {'dam' in item ? 'Ver camada y padres' : 'Ver información'} <ArrowUpRight size={16} />
                  </span>
                </div>
              </button>
            ))}
          </div>
          <Pager data={r.data} page={page} setPage={setPage} />
        </>
      ) : (
        <Empty
          icon={DogIcon}
          title="Nuevas publicaciones próximamente"
          description="Contáctanos para conocer las próximas incorporaciones a nuestra unidad."
        />
      )}
    </>
  );
}
export function PublicLanding() {
  const settings = useResource<PublicSettings>('/public/settings');
  const [dialog, setDialog] = useState<{ kind: InquiryKind; interest?: InquiryInterest } | null>(null);
  return (
    <div className="public-site" id="top">
      <a className="skip-link" href="#catalogo">
        Saltar al catálogo
      </a>
      <header className="public-header">
        <a className="public-brand" href="/" aria-label="ORYX K9 · Inicio">
          <BrandMark />
          <span>
            ORYX K9<small>UNIDAD CANINA</small>
          </span>
        </a>
        <nav aria-label="Navegación pública">
          <a href="/?tipo=dogs#catalogo">Perros disponibles</a>
          <a href="/?tipo=crosses#catalogo">Camadas</a>
          <a className="button button-primary public-sign-in" href="/acceso">
            <LogIn size={16} /> Iniciar sesión
          </a>
        </nav>
      </header>
      <main>
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
              <a className="button button-primary" href="#catalogo">
                Explorar disponibles <ArrowUpRight size={17} />
              </a>
              <Button variant="secondary" icon={UserPlus} onClick={() => setDialog({ kind: 'ACCOUNT' })}>
                Solicitar cuenta
              </Button>
            </div>
            <span className="public-hero-note">Puedes explorar y contactarnos sin crear una cuenta.</span>
          </div>
          <div className="public-hero-emblem" aria-hidden="true">
            <BrandMark />
            <span>CONFIANZA. DISCIPLINA. PROPÓSITO.</span>
          </div>
        </section>
        <section id="catalogo" className="public-catalog">
          <PublicCatalog
            settings={settings.data}
            inquire={(interest) => setDialog({ kind: 'PURCHASE', interest })}
          />
        </section>
        <section id="contacto" className="public-contact-section">
          <div>
            <span className="eyebrow">ESTAMOS PARA ACOMPAÑARTE</span>
            <h2>Hablemos de lo que buscas.</h2>
            <p>
              Consulta por una camada, un perro o una cuenta para ti o tu municipalidad. Elige el medio de
              contacto que te resulte más cómodo.
            </p>
          </div>
          <div>
            {settings.error && <ErrorBox message={settings.error} retry={settings.reload} />}
            {settings.data?.contactName && <p className="public-contact-name">{settings.data.contactName}</p>}
            <ContactLinks settings={settings.data} />
            <div className="public-contact-links">
              <Button icon={MessageCircle} onClick={() => setDialog({ kind: 'CONTACT' })}>
                Enviar solicitud de contacto
              </Button>
              <Button variant="secondary" icon={UserPlus} onClick={() => setDialog({ kind: 'ACCOUNT' })}>
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
          </div>
        </section>
      </main>
      <footer className="public-footer" id="pie-de-pagina">
        <div className="public-footer-grid">
          <div className="public-footer-brand">
            <a className="public-brand" href="/" aria-label="ORYX K9 · Inicio">
              <BrandMark />
              <span>
                ORYX K9<small>UNIDAD CANINA</small>
              </span>
            </a>
            <p>Crianza responsable, entrenamiento y un vínculo para toda la vida.</p>
            <span className="public-footer-location">Costa Rica</span>
          </div>
          <nav aria-label="Explorar ORYX K9">
            <h2>Explora</h2>
            <a href="/?tipo=dogs#catalogo">Perros disponibles</a>
            <a href="/?tipo=crosses#catalogo">Camadas y preventa</a>
            <a href="/#contacto">Contacto</a>
            <a href="/acceso">Iniciar sesión</a>
          </nav>
          <div className="public-footer-contact">
            <h2>Hablemos</h2>
            {settings.data?.phone && (
              <a href={`tel:${settings.data.phone.replace(/[^+\d]/g, '')}`}>
                <Phone size={16} />
                {settings.data.phone}
              </a>
            )}
            {settings.data?.whatsappNumber && (
              <a
                href={whatsappLink(
                  settings.data.whatsappNumber,
                  'Hola, quisiera información sobre los perros y camadas de ORYX K9.',
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle size={16} />
                Escribir por WhatsApp
              </a>
            )}
            {settings.data?.email && (
              <a href={`mailto:${settings.data.email}`}>
                <Mail size={16} />
                {settings.data.email}
              </a>
            )}
            <button type="button" onClick={() => setDialog({ kind: 'CONTACT' })}>
              Enviar una consulta <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="public-footer-community">
            <h2>Tu cuenta ORYX K9</h2>
            <p>Consulta el seguimiento de tus perros y mantente cerca de nuestra unidad.</p>
            <button
              className="public-footer-account"
              type="button"
              onClick={() => setDialog({ kind: 'ACCOUNT' })}
            >
              Solicita tu cuenta <ArrowUpRight size={15} />
            </button>
            <div className="public-footer-socials">
              {[
                ['Instagram', settings.data?.instagramUrl],
                ['Facebook', settings.data?.facebookUrl],
                ['TikTok', settings.data?.tiktokUrl],
              ]
                .filter(([, url]) => url)
                .map(([name, url]) => (
                  <a key={name} href={url!} target="_blank" rel="noopener noreferrer">
                    {name} <ArrowUpRight size={13} />
                  </a>
                ))}
            </div>
          </div>
        </div>
        <div className="public-footer-bottom">
          <span>© {new Date().getFullYear()} ORYX K9 · Unidad Canina</span>
          <span>Confianza. Disciplina. Propósito.</span>
          <a href="#top">Volver arriba ↑</a>
        </div>
      </footer>
      {dialog && <InquiryDialog {...dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}
