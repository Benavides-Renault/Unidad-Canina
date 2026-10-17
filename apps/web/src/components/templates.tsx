'use client';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
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
    [error, setError] = useState('');
  const fields: FieldDef[] = [
    { name: 'name', label: 'Nombre de la plantilla', required: true },
    {
      name: 'kind',
      label: 'Uso',
      type: 'select',
      options: [
        { value: 'TRAINING', label: 'Entrenamiento' },
        { value: 'BREEDING', label: 'Crianza' },
        { value: 'CONTRACT', label: 'Contrato' },
      ],
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
      title="Plantillas de documentos"
      subtitle="Acreditaciones internas de entrenamiento, crianza y cláusulas contractuales"
      action={<Button onClick={() => setForm('new')}>Nueva plantilla</Button>}
    >
      {error && <ErrorBox message={error} />}
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox message={r.error} />
      ) : r.data?.length ? (
        r.data.map((t) => (
          <article key={t.id} className="history-entry">
            <h3>
              {t.name} · v{t.revision}
            </h3>
            <p>
              {t.title} · {t.issuer}
            </p>
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
                  r.reload();
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              Archivar
            </Button>
          </article>
        ))
      ) : (
        <p className="panel-text muted">Crea una plantilla para reutilizar sus datos al emitir documentos.</p>
      )}
      {form && (
        <BusinessForm
          title={form === 'new' ? 'Nueva plantilla' : 'Editar plantilla'}
          path={form === 'new' ? '/templates' : `/templates/${form.id}`}
          method={form === 'new' ? 'POST' : 'PATCH'}
          fields={fields.map((f) => ({
            ...f,
            defaultValue: form !== 'new' ? (form as unknown as Record<string, string>)[f.name] : undefined,
          }))}
          extra={form !== 'new' ? { revision: form.revision } : undefined}
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
