'use client';
import { useState, type FormEvent } from 'react';
import { API, api, errorMessage, formatDate } from '@/lib/api';
import { useResource } from '@/lib/use-resource';
import { Button, ErrorBox, Loading, Modal, Panel } from './ui';
const labels: Record<string, string> = {
  MEDICAL: 'Registro médico',
  VACCINATION: 'Vacuna',
  TRAINING: 'Sesión',
  EVALUATION: 'Evaluación',
  CERTIFICATION: 'Certificación',
  BREEDING: 'Crianza',
};
type Evidence = {
  attachments: { id: string; document: { id: string; name: string; size: number } }[];
  targets: { id: string; type: string; label: string }[];
  medical: {
    id: string;
    title: string;
    revision: number;
    diagnosis?: string;
    allergen?: string;
    medication?: string;
    clinicalStatus?: string;
  }[];
};
type Version = {
  id: string;
  revision: number;
  reason: string;
  createdAt: string;
  snapshot: Record<string, unknown>;
};
function Versions({ id, onClose }: { id: string; onClose: () => void }) {
  const r = useResource<Version[]>(`/records/medical/${id}/versions`);
  return (
    <Modal title="Historial de correcciones" onClose={onClose} confirmClose={false}>
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox message={r.error} />
      ) : (
        r.data?.map((v) => (
          <article key={v.id} className="history-entry">
            <h3>
              Versión {v.revision} · {formatDate(v.createdAt, true)}
            </h3>
            <p>{v.reason}</p>
            {['title', 'notes', 'diagnosis', 'allergen', 'medication', 'professional', 'clinicalStatus'].map(
              (key) =>
                v.snapshot[key] ? (
                  <p key={key}>
                    <strong>
                      {
                        (
                          {
                            title: 'Asunto',
                            notes: 'Detalle',
                            diagnosis: 'Diagnóstico registrado',
                            allergen: 'Alérgeno',
                            medication: 'Medicamento registrado',
                            professional: 'Profesional',
                            clinicalStatus: 'Estado',
                          } as Record<string, string>
                        )[key]
                      }
                      :{' '}
                    </strong>
                    {String(v.snapshot[key])}
                  </p>
                ) : null,
            )}
          </article>
        ))
      )}
    </Modal>
  );
}
export function RecordEvidence({ dogId, role }: { dogId: string; role: string }) {
  const r = useResource<Evidence>(`/records/dogs/${dogId}`);
  const [upload, setUpload] = useState(false),
    [version, setVersion] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      data = new FormData(form),
      [type, id] = String(data.get('target')).split(':');
    data.delete('target');
    setBusy(true);
    setError('');
    try {
      await api(`/records/${type}/${id}/files`, 'POST', data);
      setUpload(false);
      r.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title="Comprobantes e historial clínico"
      subtitle="Archivos vinculados al registro y correcciones trazables"
      action={
        role !== 'CLIENT' && (
          <Button
            onClick={() => {
              r.reload();
              setUpload(true);
            }}
          >
            Vincular comprobante
          </Button>
        )
      }
    >
      {error && <ErrorBox message={error} />}
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox message={r.error} retry={r.reload} />
      ) : (
        <>
          {r.data?.medical.map((m) => (
            <article key={m.id} className="history-entry">
              <strong>{m.title}</strong>
              {m.diagnosis && <p>Diagnóstico registrado: {m.diagnosis}</p>}
              {m.allergen && <p>Alérgeno registrado: {m.allergen}</p>}
              {m.medication && <p>Medicación registrada: {m.medication}</p>}
              {m.clinicalStatus && (
                <p>
                  Estado:{' '}
                  {{
                    SUSPECTED: 'Sospecha registrada',
                    CONFIRMED: 'Confirmado por el responsable',
                    RESOLVED: 'Resuelto',
                  }[m.clinicalStatus as 'SUSPECTED'] || m.clinicalStatus}
                </p>
              )}
              <Button variant="ghost" onClick={() => setVersion(m.id)}>
                Ver {m.revision} {m.revision === 1 ? 'versión' : 'versiones'}
              </Button>
            </article>
          ))}
          {!r.data?.attachments.length && <p className="panel-text muted">No hay comprobantes vinculados.</p>}
          {r.data?.attachments.map((a) => (
            <div key={a.id} className="history-entry">
              <a href={`${API}/records/files/${a.document.id}/download`} className="inline-link">
                {a.document.name}
              </a>
              <small> · {Math.ceil(a.document.size / 1024)} KB</small>
              {role === 'ADMIN' && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    if (!window.confirm('¿Archivar este adjunto? Se conservará internamente.')) return;
                    try {
                      await api(`/records/files/${a.document.id}`, 'DELETE');
                      r.reload();
                    } catch (e) {
                      setError(errorMessage(e));
                    }
                  }}
                >
                  Archivar adjunto
                </Button>
              )}
            </div>
          ))}
        </>
      )}
      {version && <Versions id={version} onClose={() => setVersion(null)} />}
      {upload && (
        <Modal title="Vincular comprobante" onClose={() => setUpload(false)}>
          {error && <ErrorBox message={error} />}
          {r.error && <ErrorBox message={r.error} retry={r.reload} />}
          {r.loading ? (
            <Loading />
          ) : (
            <form onSubmit={send} className="form-grid">
              <div className="field full">
                <label htmlFor="record-target">Registro relacionado</label>
                <select id="record-target" name="target" required defaultValue="">
                  <option value="" disabled>
                    Selecciona un registro
                  </option>
                  {r.data?.targets.map((t) => (
                    <option key={t.type + t.id} value={`${t.type}:${t.id}`}>
                      {labels[t.type]} · {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field full">
                <label htmlFor="record-file">Comprobante</label>
                <input
                  id="record-file"
                  name="file"
                  type="file"
                  required
                  accept="application/pdf,image/png,image/jpeg,video/mp4"
                />
                <small>PDF, PNG o JPEG. MP4 sólo para sesiones y evaluaciones. Máximo 25 MB.</small>
              </div>
              <Button type="submit" disabled={busy}>
                {busy ? 'Guardando…' : 'Guardar comprobante vinculado'}
              </Button>
            </form>
          )}
        </Modal>
      )}
    </Panel>
  );
}
