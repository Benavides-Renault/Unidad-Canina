'use client';
import { useState } from 'react';
import { API, api, errorMessage } from '@/lib/api';
import { useResource } from '@/lib/use-resource';
import { Button, ErrorBox, Loading, Panel, type FieldDef } from './ui';
import { BusinessForm } from './business-ui';
export type CertificateTemplate = {
  id: string;
  name: string;
  kind: string;
  title: string;
  issuer: string;
  body: string;
  revision: number;
};
export function TemplatesPanel() {
  const r = useResource<CertificateTemplate[]>('/templates');
  const [form, setForm] = useState<CertificateTemplate | 'new' | null>(null),
    [error, setError] = useState(''),
    [filter, setFilter] = useState('ALL'),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1);
  const matches = (r.data || []).filter(
    (t) =>
      (filter === 'ALL' || t.kind === filter) &&
      `${t.name} ${t.title}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')),
  );
  const kinds: Record<string, string> = {
    TRAINING: 'Entrenamiento',
    BREEDING: 'Crianza',
    CONTRACT: 'Contratos',
    MEDICAL: 'Servicios médicos',
    TALK: 'Charlas',
    MUNICIPAL: 'Servicios municipales',
    EXTRAORDINARY: 'Servicios extraordinarios',
    SERVICE: 'Otros servicios',
  };
  const fields: FieldDef[] = [
    { name: 'name', label: 'Nombre de la plantilla', required: true },
    {
      name: 'kind',
      label: 'Uso',
      type: 'select',
      options: Object.entries(kinds).map(([value, label]) => ({ value, label })),
      required: true,
    },
    { name: 'title', label: 'Título del documento', required: true },
    { name: 'issuer', label: 'Entidad emisora', required: true },
    {
      name: 'body',
      label: 'Contenido de la plantilla',
      type: 'textarea',
      required: true,
      hint: 'Variables disponibles: {{nombre}}, {{codigo}}, {{fecha}}, {{referencia}} y {{emisor}}.',
    },
  ];
  return (
    <Panel
      className="templates-panel"
      title="Plantillas de documentos"
      subtitle="Planillas, evaluaciones y acuerdos listos para completar"
      action={<Button onClick={() => setForm('new')}>Nueva plantilla</Button>}
    >
      <div className="panel-body">
        <div className="template-toolbar">
          <label>
            Filtrar por uso{' '}
            <select
              aria-label="Filtrar por uso"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">Todos los usos</option>
              {Object.entries(kinds).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <input
            aria-label="Buscar plantilla"
            className="template-search"
            placeholder="Buscar plantilla…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <span className="muted">{r.data?.length || 0} plantillas disponibles</span>
        </div>
        {error && <ErrorBox message={error} />}
        {r.loading ? (
          <Loading />
        ) : r.error ? (
          <ErrorBox message={r.error} />
        ) : r.data?.length ? (
          <div className="template-grid">
            {matches.slice((page - 1) * 6, page * 6).map((t) => (
              <article key={t.id} className="template-card">
                <span className="template-kind">{kinds[t.kind] || t.kind}</span>
                <h3>
                  {t.name} · v{t.revision}
                </h3>
                <p>
                  {t.title} · {t.issuer}
                </p>
                <details className="template-preview">
                  <summary>Ver contenido</summary>
                  <p>{t.body}</p>
                </details>
                <div className="row-actions">
                  <a className="button button-secondary" href={`${API}/templates/${t.id}/pdf`} download>
                    Descargar planilla
                  </a>
                  <Button variant="secondary" onClick={() => setForm(t)}>
                    Editar plantilla
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      if (!window.confirm('¿Archivar esta plantilla? Los documentos emitidos se conservan.'))
                        return;
                      try {
                        await api(`/templates/${t.id}`, 'DELETE');
                        setPage(1);
                        r.reload();
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
          <p className="panel-text muted">
            Crea una plantilla para reutilizar sus datos al emitir documentos.
          </p>
        )}
        {!r.loading && !r.error && (
          <div className="pagination">
            <span>
              {matches.length} resultados · Página {page} de {Math.max(1, Math.ceil(matches.length / 6))}
            </span>
            <div>
              <Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
                Anterior
              </Button>
              <Button
                variant="secondary"
                disabled={page * 6 >= matches.length}
                onClick={() => setPage(page + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </div>
      {form && (
        <BusinessForm
          title={form === 'new' ? 'Nueva plantilla' : 'Editar plantilla'}
          path={form === 'new' ? '/templates' : `/templates/${form.id}`}
          method={form === 'new' ? 'POST' : 'PATCH'}
          fields={fields.map((f) => ({
            ...f,
            defaultValue:
              form !== 'new'
                ? (form as unknown as Record<string, string>)[f.name]
                : f.name === 'issuer'
                  ? 'ORYX K9 · Unidad Canina'
                  : undefined,
          }))}
          extra={form !== 'new' ? { revision: form.revision } : undefined}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            setForm(null);
            setFilter('ALL');
            setSearch(String(saved.name || ''));
            setPage(1);
            r.reload();
          }}
        />
      )}
    </Panel>
  );
}
