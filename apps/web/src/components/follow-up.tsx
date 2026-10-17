'use client';
import { useState } from 'react';
import { API, api, errorMessage, formatDate, today } from '@/lib/api';
import type { CertificateTemplate } from './templates';
import { useResource } from '@/lib/use-resource';
import { Button, DataForm, Empty, ErrorBox, Loading, Modal, Panel, type FieldDef } from './ui';
import { Award, Target } from 'lucide-react';

type Evaluation = { id: string; eventDate: string; score: number; notes: string; recorder: { name: string } };
type Goal = { id: string; title: string; criterion: string; targetScore: number; evaluations: Evaluation[] };
type Plan = {
  id: string;
  title: string;
  discipline: string;
  startDate: string;
  dueDate: string;
  status: string;
  revision: number;
  goals: Goal[];
};
type Certificate = {
  id: string;
  title: string;
  issuer: string;
  reference?: string;
  issueDate: string;
  expiresDate?: string;
  notes?: string;
};

export function FollowUp({ dogId, role }: { dogId: string; role: string }) {
  const r = useResource<{ plans: Plan[]; certificates: Certificate[] }>(`/follow-up/dogs/${dogId}`);
  const [form, setForm] = useState<'plan' | 'certificate' | null>(null),
    [goal, setGoal] = useState<Goal | null>(null),
    [editing, setEditing] = useState<Plan | null>(null),
    [goals, setGoals] = useState(1),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const writable = role === 'ADMIN' || role === 'TRAINER';
  const templates = useResource<CertificateTemplate[]>(writable ? '/templates' : null);
  const [templateId, setTemplateId] = useState('');
  const close = () => {
    setForm(null);
    setGoal(null);
    setEditing(null);
    setGoals(1);
    setTemplateId('');
  };
  async function archive(path: string) {
    if (!window.confirm('¿Archivar este registro? Se conservará internamente con su historial.')) return;
    setBusy(true);
    setError('');
    try {
      await api(path, 'DELETE');
      r.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const goalFields: FieldDef[] = Array.from({ length: goals }, (_, i) => [
    { name: `goal${i}`, label: `Objetivo ${i + 1}`, required: true },
    {
      name: `target${i}`,
      label: `Meta ${i + 1} / 100`,
      type: 'number' as const,
      min: 1,
      max: 100,
      defaultValue: 80,
      required: true,
    },
    {
      name: `criterion${i}`,
      label: `Criterio de evaluación ${i + 1}`,
      type: 'textarea' as const,
      required: true,
      hint: 'Describe cómo se calcula el resultado: por ejemplo, porcentaje de respuestas correctas en 10 intentos.',
    },
  ]).flat();
  return (
    <section className="follow-up" aria-label="Planes y certificaciones">
      {error && <ErrorBox message={error} />}
      <Panel
        title="Planes y objetivos"
        subtitle="Metas medibles y evolución del entrenamiento"
        action={writable && <Button onClick={() => setForm('plan')}>Nuevo plan</Button>}
      >
        {r.loading ? (
          <Loading />
        ) : r.error ? (
          <ErrorBox message={r.error} retry={r.reload} />
        ) : !r.data?.plans.length ? (
          <Empty
            compact
            icon={Target}
            title="Sin planes registrados"
            description="Define objetivos y registra evaluaciones para seguir el progreso."
          />
        ) : (
          r.data.plans.map((plan) => (
            <article className="training-plan" key={plan.id}>
              <div className="heading-actions">
                <h3>{plan.title}</h3>
                <span className="eyebrow">{plan.status === 'COMPLETED' ? 'Completado' : 'En curso'}</span>
              </div>
              <p>
                {plan.discipline} · {formatDate(plan.startDate)} → {formatDate(plan.dueDate)}
              </p>
              {plan.goals.map((g) => {
                const latest = g.evaluations[0];
                return (
                  <div className="training-goal" key={g.id}>
                    <h4>{g.title}</h4>
                    <p>{g.criterion}</p>
                    <div className="goal-progress">
                      <progress max={100} value={latest?.score || 0} aria-label={`Resultado de ${g.title}`} />
                      <strong>
                        {latest ? latest.score : '—'} / 100 · Meta {g.targetScore}
                      </strong>
                    </div>
                    {latest && (
                      <small>
                        {latest.score >= g.targetScore ? 'Meta alcanzada' : 'En progreso'} · Última
                        evaluación: {formatDate(latest.eventDate)}
                      </small>
                    )}
                    {writable && plan.status === 'ACTIVE' && (
                      <Button variant="secondary" onClick={() => setGoal(g)}>
                        Evaluar {g.title}
                      </Button>
                    )}
                    {!!g.evaluations.length && (
                      <details>
                        <summary>Historial de evaluaciones ({g.evaluations.length})</summary>
                        {g.evaluations.map((e) => (
                          <div className="evaluation" key={e.id}>
                            <strong>
                              {formatDate(e.eventDate)} · {e.score}/100 · {e.recorder.name}
                            </strong>
                            <p>{e.notes}</p>
                          </div>
                        ))}
                      </details>
                    )}
                  </div>
                );
              })}
              {role === 'ADMIN' && (
                <div className="heading-actions">
                  <Button variant="secondary" onClick={() => setEditing(plan)}>
                    Estado y plazo
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => archive(`/follow-up/plans/${plan.id}`)}
                  >
                    Archivar plan
                  </Button>
                </div>
              )}
            </article>
          ))
        )}
      </Panel>
      <Panel
        title="Certificaciones"
        subtitle="Emisor, referencia y vigencia de cada acreditación"
        action={writable && <Button onClick={() => setForm('certificate')}>Registrar certificación</Button>}
      >
        {!r.loading && !r.error && !r.data?.certificates.length && (
          <Empty
            compact
            icon={Award}
            title="Sin certificaciones registradas"
            description="Registra las acreditaciones obtenidas y sus fechas de renovación."
          />
        )}
        {r.data?.certificates.map((c) => (
          <article className="training-plan" key={c.id}>
            <h3>{c.title}</h3>
            <p>
              {c.issuer}
              {c.reference && ` · ${c.reference}`}
            </p>
            <p>
              Emisión: {formatDate(c.issueDate)} ·{' '}
              {c.expiresDate
                ? `Vence: ${formatDate(c.expiresDate)}${c.expiresDate < today() ? ' · Vencida' : ''}`
                : 'Sin vencimiento indicado'}
            </p>
            {c.notes && <p>{c.notes}</p>}
            <a className="button secondary" href={`${API}/follow-up/certificates/${c.id}/report.pdf`}>
              Descargar certificado interno
            </a>
            {role === 'ADMIN' && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => archive(`/follow-up/certificates/${c.id}`)}
              >
                Archivar certificación
              </Button>
            )}
          </article>
        ))}
      </Panel>
      {(form || goal || editing) && (
        <Modal
          title={
            goal
              ? `Evaluar: ${goal.title}`
              : editing
                ? 'Estado y plazo del plan'
                : form === 'plan'
                  ? 'Nuevo plan de entrenamiento'
                  : 'Registrar certificación'
          }
          onClose={close}
        >
          {form === 'plan' && (
            <div className="heading-actions">
              <Button variant="secondary" disabled={goals >= 12} onClick={() => setGoals((n) => n + 1)}>
                Añadir objetivo
              </Button>
              <Button variant="secondary" disabled={goals <= 1} onClick={() => setGoals((n) => n - 1)}>
                Quitar último objetivo
              </Button>
            </div>
          )}
          {form === 'certificate' && (
            <div className="field">
              <label htmlFor="certificate-template">Plantilla opcional</label>
              <select
                id="certificate-template"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="">Sin plantilla</option>
                {templates.data
                  ?.filter((t) => t.kind !== 'CONTRACT')
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <DataForm
            key={templateId}
            fields={
              goal
                ? [
                    {
                      name: 'eventDate',
                      label: 'Fecha de evaluación',
                      type: 'date',
                      required: true,
                      defaultValue: today(),
                    },
                    {
                      name: 'score',
                      label: 'Resultado / 100',
                      type: 'number',
                      min: 0,
                      max: 100,
                      required: true,
                    },
                    { name: 'notes', label: 'Observaciones y evidencia', type: 'textarea', required: true },
                  ]
                : editing
                  ? [
                      {
                        name: 'status',
                        label: 'Estado',
                        type: 'select',
                        required: true,
                        defaultValue: editing.status,
                        options: [
                          { value: 'ACTIVE', label: 'En curso' },
                          { value: 'COMPLETED', label: 'Completado' },
                        ],
                        hint: 'Para completar el plan, todos los objetivos deben alcanzar su meta en la última evaluación.',
                      },
                      {
                        name: 'dueDate',
                        label: 'Fecha objetivo',
                        type: 'date',
                        required: true,
                        defaultValue: editing.dueDate,
                      },
                    ]
                  : form === 'plan'
                    ? [
                        { name: 'title', label: 'Nombre del plan', required: true },
                        { name: 'discipline', label: 'Disciplina', required: true },
                        {
                          name: 'startDate',
                          label: 'Fecha de inicio',
                          type: 'date',
                          required: true,
                          defaultValue: today(),
                        },
                        { name: 'dueDate', label: 'Fecha objetivo', type: 'date', required: true },
                        ...goalFields,
                      ]
                    : [
                        {
                          name: 'title',
                          label: 'Nombre de la certificación',
                          required: true,
                          defaultValue: templates.data?.find((t) => t.id === templateId)?.title,
                        },
                        {
                          name: 'issuer',
                          label: 'Entidad emisora',
                          required: true,
                          defaultValue: templates.data?.find((t) => t.id === templateId)?.issuer,
                        },
                        { name: 'reference', label: 'Número o referencia' },
                        {
                          name: 'issueDate',
                          label: 'Fecha de emisión',
                          type: 'date',
                          required: true,
                          defaultValue: today(),
                        },
                        { name: 'expiresDate', label: 'Fecha de vencimiento', type: 'date' },
                        { name: 'notes', label: 'Observaciones', type: 'textarea' },
                      ]
            }
            onCancel={close}
            onSubmit={async (values) => {
              if (goal) await api(`/follow-up/goals/${goal.id}/evaluations`, 'POST', values);
              else if (editing)
                await api(`/follow-up/plans/${editing.id}`, 'PATCH', {
                  ...values,
                  revision: editing.revision,
                });
              else if (form === 'certificate')
                await api(`/follow-up/dogs/${dogId}/certificates`, 'POST', {
                  ...values,
                  ...(templateId ? { templateId } : {}),
                });
              else {
                const { title, discipline, startDate, dueDate } = values;
                await api(`/follow-up/dogs/${dogId}/plans`, 'POST', {
                  title,
                  discipline,
                  startDate,
                  dueDate,
                  goals: Array.from({ length: goals }, (_, i) => ({
                    title: values[`goal${i}`],
                    targetScore: values[`target${i}`],
                    criterion: values[`criterion${i}`],
                  })),
                });
              }
              close();
              r.reload();
            }}
          />
        </Modal>
      )}
    </section>
  );
}
