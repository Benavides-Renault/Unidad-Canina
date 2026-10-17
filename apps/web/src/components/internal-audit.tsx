'use client';
import { useState } from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import { api, errorMessage, formatDate } from '@/lib/api';
import { Button, ErrorBox, Panel } from './ui';
type Report = { checkedAt: string; checks: { name: string; issues: number; detail: string }[] };
export function InternalAudit() {
  const [report, setReport] = useState<Report | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Panel
      title="Control interno de datos"
      subtitle="Revisa coherencia de expedientes, publicaciones e inventario"
      className="audit-panel"
      action={
        <Button
          icon={RefreshCw}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              setReport(await api<Report>('/system/audit'));
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Revisando…' : 'Ejecutar revisión'}
        </Button>
      }
    >
      <div className="panel-body">
        {error && <ErrorBox message={error} />}{' '}
        {report ? (
          <>
            <p className="muted">Última revisión: {formatDate(report.checkedAt, true)}</p>
            <div className="audit-checks">
              {report.checks.map((c) => (
                <div key={c.name} className={`audit-check ${c.issues ? 'has-issues' : ''}`}>
                  <ShieldCheck size={20} />
                  <div>
                    <strong>{c.name}</strong>
                    <p>{c.detail}</p>
                  </div>
                  <span>{c.issues ? `${c.issues} por revisar` : 'Correcto'}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="muted">
            Ejecuta la revisión para detectar identificadores repetidos, fechas incoherentes, publicaciones
            incompletas y diferencias de existencias.
          </p>
        )}
      </div>
    </Panel>
  );
}
