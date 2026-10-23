'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { catalogHref, type CatalogRoute } from '@/lib/public-routes';
import { ArrowLeft, ArrowUpRight, Dog as DogIcon, Heart, MessageCircle, Share2 } from 'lucide-react';
import { API, formatDate, type PageData } from '@/lib/api';
import { useResource } from '@/lib/use-resource';
import { Badge, Button, Empty, ErrorBox, Loading, Success } from './ui';
import { money, Pager } from './business-ui';
import { type InquiryInterest } from './public-contact';

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
type Selection = CatalogRoute & { id: string };
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
        <h1>{dog.name}</h1>
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
  inquire,
}: {
  selection: Selection;
  inquire: (interest: InquiryInterest) => void;
}) {
  const r = useResource<CatalogDog | CatalogCross>(
    `/public/${selection.kind}/${encodeURIComponent(selection.id)}`,
  );
  const [copied, setCopied] = useState(false),
    [shareError, setShareError] = useState('');
  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.origin + catalogHref(selection));
      setCopied(true);
      setShareError('');
    } catch {
      setShareError('Copia la dirección de esta página para compartirla.');
    }
  }
  const item = r.data;
  const parent = selection.parent && item && 'dam' in item ? item[selection.parent] : null;
  if (parent)
    return (
      <>
        <Link className="button button-secondary" href={catalogHref({ ...selection, parent: undefined })}>
          <ArrowLeft size={16} /> Volver a la camada
        </Link>
        <Profile dog={parent} />
      </>
    );
  return (
    <>
      <div className="public-detail-actions">
        <Link
          className="button button-secondary"
          href={catalogHref({ kind: selection.kind, page: selection.page })}
        >
          <ArrowLeft size={16} /> Volver al catálogo
        </Link>
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
                  <h1>{item.publicTitle}</h1>
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
                    <Link
                      className="portal-card"
                      href={catalogHref({ ...selection, parent: i === 0 ? 'dam' : 'sire' })}
                      aria-label={`Ver ${dog.name}`}
                    >
                      <Photo dog={dog} />
                      <div className="portal-card-content">
                        <h3>{dog.name}</h3>
                        <p>{dog.breed}</p>
                        <span className="portal-open">Conocer su historia →</span>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
              {item.litter && (
                <section className="public-litter-puppies">
                  <h3>Cachorros disponibles de esta camada</h3>
                  <div className="portal-grid">
                    {item.litter.puppies.map((puppy) => (
                      <Link
                        className="portal-card"
                        key={puppy.id}
                        href={catalogHref({ kind: 'dogs', id: puppy.id })}
                      >
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
                      </Link>
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
              <h2>¿Te interesa {'dam' in item ? 'esta camada' : item.name}?</h2>
              <p>Consulta la disponibilidad y las condiciones directamente con nuestro equipo.</p>
            </div>
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
              Consultar disponibilidad
            </Button>
          </div>
        </>
      ) : null}
    </>
  );
}
export function PublicCatalog({
  route,
  inquire,
}: {
  route: CatalogRoute;
  inquire: (interest: InquiryInterest) => void;
}) {
  const router = useRouter();
  const { kind, page, id } = route;
  const r = useResource<PageData<CatalogDog | CatalogCross>>(
    id ? null : `/public/${kind}?page=${page}&pageSize=12`,
  );
  useEffect(() => {
    document.getElementById('catalogo')?.focus({ preventScroll: true });
  }, [id, route.parent]);
  function changeTab(next: 'dogs' | 'crosses') {
    router.push(catalogHref({ kind: next }), { scroll: false });
  }
  if (id) return <Detail key={catalogHref(route)} selection={{ ...route, id }} inquire={inquire} />;
  return (
    <>
      <div className="public-section-heading">
        <div>
          <span className="eyebrow">CONOCE NUESTRA UNIDAD</span>
          <h1>Perros disponibles y camadas</h1>
          <p>Perros disponibles y camadas publicadas por ORYX K9.</p>
        </div>
        <Heart size={30} />
      </div>
      <div className="tabs" role="tablist" aria-label="Catálogo público">
        {(
          [
            ['dogs', 'Perros en venta'],
            ['crosses', 'Camadas y reservas'],
          ] as const
        ).map(([id, label]) => (
          <button
            role="tab"
            key={id}
            aria-selected={kind === id}
            className={kind === id ? 'active' : ''}
            id={`catalog-tab-${id}`}
            aria-controls="catalog-results"
            tabIndex={kind === id ? 0 : -1}
            onClick={() => changeTab(id)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 'dogs'
                  : event.key === 'End'
                    ? 'crosses'
                    : kind === 'dogs'
                      ? 'crosses'
                      : 'dogs';
              changeTab(next);
              document.getElementById(`catalog-tab-${next}`)?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="catalog-results" aria-labelledby={`catalog-tab-${kind}`} tabIndex={0}>
        {r.loading ? (
          <Loading />
        ) : r.error ? (
          <ErrorBox message={r.error} retry={r.reload} />
        ) : r.data?.items.length ? (
          <>
            <div className="portal-grid">
              {r.data.items.map((item) => (
                <Link
                  className="portal-card"
                  key={item.id}
                  href={catalogHref({ kind, page, id: item.id })}
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
                          : 'RESERVAS · CRUCE PROGRAMADO'
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
                </Link>
              ))}
            </div>
            <Pager
              data={r.data}
              page={page}
              setPage={(next) => router.push(catalogHref({ kind, page: next }))}
            />
          </>
        ) : (
          <Empty
            icon={DogIcon}
            title="Nuevas publicaciones próximamente"
            description="Contáctanos para conocer las próximas incorporaciones a nuestra unidad."
          />
        )}
      </div>
    </>
  );
}
