'use client';
import { useState } from 'react';
import { Search, BookOpen } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useResource } from '@/lib/use-resource';
import { Button, Empty, ErrorBox, Loading, Panel } from './ui';
import { BusinessForm } from './business-ui';
type Breed = {
  id: string;
  name: string;
  group?: string;
  notes?: string;
  standardNumber?: number;
  sourceUrl?: string;
};
export function BreedsPanel() {
  const r = useResource<Breed[]>('/breeds');
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [form, setForm] = useState<Breed | 'new' | null>(null),
    [error, setError] = useState('');
  const normal = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  const found = (r.data || []).filter((b) => normal(`${b.name} ${b.group || ''}`).includes(normal(search)));
  return (
    <Panel
      title="Registro de razas"
      subtitle="Catálogo de referencia y variedades de la unidad"
      className="breeds-panel"
      action={<Button onClick={() => setForm('new')}>Añadir raza</Button>}
    >
      <div className="panel-body">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Buscar raza en el catálogo"
            placeholder="Busca una raza o grupo…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <p className="muted catalog-count">
          {found.length} razas y variedades ·{' '}
          <a href="https://www.fci.be/es/Nomenclature/" target="_blank" rel="noreferrer">
            Referencia FCI
          </a>
        </p>
        {error && <ErrorBox message={error} />}
        {r.loading ? (
          <Loading />
        ) : r.error ? (
          <ErrorBox message={r.error} retry={r.reload} />
        ) : found.length ? (
          <div className="breed-list">
            {found.slice((page - 1) * 8, page * 8).map((b) => (
              <article key={b.id} className="breed-row">
                <div>
                  <h3>{b.name}</h3>
                  <p>{b.group || 'Registro de la unidad'}</p>
                  {b.notes && <small>{b.notes}</small>}
                  {b.sourceUrl && (
                    <a href={b.sourceUrl} target="_blank" rel="noreferrer">
                      Estándar FCI {b.standardNumber}
                    </a>
                  )}
                </div>
                <div className="row-actions">
                  <Button variant="secondary" onClick={() => setForm(b)}>
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      if (
                        !confirm(
                          '¿Retirar esta raza del catálogo? Los expedientes existentes conservarán su información.',
                        )
                      )
                        return;
                      try {
                        await api(`/breeds/${b.id}`, 'PATCH', { archived: true });
                        r.reload();
                        setPage(1);
                      } catch (e) {
                        setError(errorMessage(e));
                      }
                    }}
                  >
                    Archivar
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            icon={BookOpen}
            title="Sin coincidencias"
            description="Puedes añadir una raza o una variedad al catálogo."
            compact
          />
        )}
        <div className="pagination">
          <span>
            Página {page} de {Math.max(1, Math.ceil(found.length / 8))}
          </span>
          <div>
            <Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <Button variant="secondary" disabled={page * 8 >= found.length} onClick={() => setPage(page + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
      </div>
      {form && (
        <BusinessForm
          title={form === 'new' ? 'Añadir raza' : 'Editar raza'}
          fields={
            [
              { name: 'name', label: 'Nombre de la raza', required: true },
              { name: 'group', label: 'Grupo o clasificación' },
              { name: 'notes', label: 'Información de referencia', type: 'textarea' },
            ].map((f) => ({
              ...f,
              defaultValue: form === 'new' ? undefined : form[f.name as 'name' | 'group' | 'notes'],
            })) as import('./ui').FieldDef[]
          }
          path={form === 'new' ? '/breeds' : `/breeds/${form.id}`}
          method={form === 'new' ? 'POST' : 'PATCH'}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            r.reload();
          }}
        />
      )}
    </Panel>
  );
}
