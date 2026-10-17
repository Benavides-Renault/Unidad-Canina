'use client';
import { FinanceControl, type Supplier } from './finance-control';
import { useState, type FormEvent } from 'react';
import { ArrowLeft, Banknote, Plus, Upload } from 'lucide-react';
import { api, API, errorMessage, formatDate, today, type PageData, type User } from '@/lib/api';
import { useResource } from '@/lib/use-resource';
import { Badge, Button, Empty, ErrorBox, Loading, PageHeading, Panel, type FieldDef } from './ui';
import { BusinessForm, choice, money, Pager, SimpleTable } from './business-ui';
export type Account = {
  id: string;
  direction: string;
  party: string;
  concept: string;
  category: string;
  costCenter?: string;
  amount: string;
  currency: string;
  paid: string;
  balance: string;
  status: string;
  dueDate: string;
  issueDate: string;
  exchangeRate?: string;
  exchangeDate?: string;
  notes?: string;
  reservationId?: string;
  cancelledAt?: string;
  cancelReason?: string;
  payments: {
    id: string;
    kind: string;
    amount: string;
    paidDate: string;
    method: string;
    reference?: string;
    notes?: string;
  }[];
  files: { id: string; name: string; size: number }[];
};
type Refs = {
  dogs: { id: string; name: string; code: string }[];
  litters: { id: string; code: string }[];
  contracts: { id: string; number: string }[];
};
const currencyField: FieldDef = {
  name: 'currency',
  label: 'Moneda',
  type: 'select',
  required: true,
  options: ['CRC', 'USD'],
  defaultValue: 'CRC',
};
const amountField: FieldDef = {
  name: 'amount',
  label: 'Importe total',
  required: true,
  hint: 'Usa punto decimal, sin separadores de miles. Ejemplo: 12500.50.',
};
export function FinancePage({ initialId, onBackToList }: { initialId?: string; onBackToList?: () => void }) {
  const [control, setControl] = useState(false);
  const suppliers = useResource<Supplier[]>('/finance-control/suppliers');
  const [id, setId] = useState<string | null>(initialId || null),
    [page, setPage] = useState(1),
    [direction, setDirection] = useState(''),
    [search, setSearch] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [contractId, setContractId] = useState(''),
    [dogId, setDogId] = useState(''),
    [form, setForm] = useState(false);
  const refs = useResource<Refs>('/finance/references');
  const params = new URLSearchParams({ direction, search, from, to, contractId, dogId }).toString();
  const accounts = useResource<PageData<Account>>(`/finance/accounts?page=${page}&${params}`);
  const summary = useResource<{
    totals: {
      currency: string;
      direction: string;
      amount: string;
      paid: string;
      balance: string;
      overdue: string;
    }[];
  }>(`/finance/summary?${params}`);
  if (id)
    return (
      <AccountDetail
        id={id}
        onBack={() => {
          setId(null);
          accounts.reload();
          summary.reload();
          onBackToList?.();
        }}
      />
    );
  if (control)
    return (
      <FinanceControl
        onBack={() => {
          setControl(false);
          suppliers.reload();
        }}
      />
    );
  const fields: FieldDef[] = [
    {
      name: 'supplierId',
      label: 'Proveedor del catálogo (sólo cuentas por pagar)',
      type: 'select',
      options: choice(suppliers.data?.filter((s) => s.active)),
    },
    {
      name: 'direction',
      label: 'Tipo de cuenta',
      type: 'select',
      required: true,
      options: ['PAYABLE', 'RECEIVABLE'],
      defaultValue: direction || 'PAYABLE',
    },
    { name: 'party', label: 'Cliente / proveedor', required: true },
    { name: 'concept', label: 'Concepto', required: true, full: true },
    { name: 'category', label: 'Categoría', required: true },
    { name: 'costCenter', label: 'Centro de costo' },
    amountField,
    currencyField,
    { name: 'issueDate', label: 'Fecha de emisión', type: 'date', required: true, defaultValue: today() },
    { name: 'dueDate', label: 'Vencimiento de la cuenta', type: 'date', required: true },
    {
      name: 'exchangeRate',
      label: 'Tipo de cambio CRC por USD',
      hint: 'Opcional. Se conserva como referencia, sin sumar monedas distintas.',
    },
    { name: 'exchangeDate', label: 'Fecha del tipo de cambio', type: 'date' },
    { name: 'dogId', label: 'Perro asociado', type: 'select', options: choice(refs.data?.dogs) },
    {
      name: 'litterId',
      label: 'Camada asociada',
      type: 'select',
      options: refs.data?.litters.map((l) => ({ value: l.id, label: l.code })),
    },
    {
      name: 'contractId',
      label: 'Contrato asociado',
      type: 'select',
      options: refs.data?.contracts.map((c) => ({ value: c.id, label: c.number })),
    },
    { name: 'notes', label: 'Notas de la cuenta', type: 'textarea' },
  ];
  return (
    <>
      <PageHeading
        eyebrow="CONTROL INTERNO"
        title="Finanzas"
        description="Cuentas por pagar y cobrar, abonos y saldos por moneda."
      >
        <Button variant="secondary" onClick={() => setControl(true)}>
          Proveedores, caja y cierres
        </Button>
        <Button icon={Plus} onClick={() => setForm(true)}>
          Nueva cuenta
        </Button>
        <a className="button button-secondary" href={`${API}/finance/export.csv?${params}`}>
          Exportar CSV
        </a>
      </PageHeading>
      <Panel
        title="Resumen de cuentas"
        subtitle="Los filtros usan la fecha de emisión. Cada moneda conserva sus propios totales."
      >
        {summary.error ? (
          <ErrorBox message={summary.error} />
        ) : (
          <SimpleTable headers={['Moneda / tipo', 'Importe', 'Abonado neto', 'Pendiente', 'Vencido']}>
            {summary.data?.totals.map((s) => (
              <tr key={`${s.currency}-${s.direction}`}>
                <td>
                  {s.currency} · {s.direction === 'PAYABLE' ? 'Por pagar' : 'Por cobrar'}
                </td>
                <td>{money(s.amount, s.currency)}</td>
                <td>{money(s.paid, s.currency)}</td>
                <td>
                  <strong>{money(s.balance, s.currency)}</strong>
                </td>
                <td>{money(s.overdue, s.currency)}</td>
              </tr>
            ))}
          </SimpleTable>
        )}
      </Panel>
      <Panel title="Cuentas registradas">
        <div className="business-filters">
          <label>
            Buscar
            <input
              value={search}
              placeholder="Persona o concepto"
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            Tipo
            <select
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas</option>
              <option value="PAYABLE">Por pagar</option>
              <option value="RECEIVABLE">Por cobrar</option>
            </select>
          </label>
          <label>
            Desde
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            Contrato
            <select
              value={contractId}
              onChange={(e) => {
                setContractId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {refs.data?.contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number}
                </option>
              ))}
            </select>
          </label>
          <label>
            Perro
            <select
              value={dogId}
              onChange={(e) => {
                setDogId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {refs.data?.dogs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {accounts.loading ? (
          <Loading />
        ) : accounts.error ? (
          <ErrorBox message={accounts.error} retry={accounts.reload} />
        ) : !accounts.data?.items.length ? (
          <Empty
            icon={Banknote}
            title="Sin cuentas registradas"
            description="Registra un compromiso de pago o de cobro para controlar sus abonos."
          />
        ) : (
          <>
            <SimpleTable headers={['Cuenta', 'Tipo', 'Total', 'Saldo', 'Vencimiento', 'Estado', 'Detalle']}>
              {accounts.data.items.map((a) => (
                <tr key={a.id}>
                  <td className="business-wrap">
                    <strong>{a.concept}</strong>
                    <small>{a.party}</small>
                  </td>
                  <td>
                    <Badge value={a.direction} />
                  </td>
                  <td>{money(a.amount, a.currency)}</td>
                  <td>{money(a.balance, a.currency)}</td>
                  <td>{formatDate(a.dueDate)}</td>
                  <td>
                    <Badge value={a.status} />
                  </td>
                  <td>
                    <Button variant="secondary" onClick={() => setId(a.id)}>
                      Abrir cuenta
                    </Button>
                  </td>
                </tr>
              ))}
            </SimpleTable>
            <Pager data={accounts.data} page={page} setPage={setPage} />
          </>
        )}
      </Panel>
      <p className="muted panel-text">
        Registros de control interno. No se emiten facturas electrónicas oficiales.
      </p>
      {form && (
        <BusinessForm
          title="Nueva cuenta interna"
          fields={fields}
          path="/finance/accounts"
          onClose={() => setForm(false)}
          onSaved={(a) => {
            setForm(false);
            setId(String(a.id));
            accounts.reload();
            summary.reload();
          }}
        />
      )}
    </>
  );
}
export function AccountDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const r = useResource<Account>(`/finance/accounts/${id}`);
  const [form, setForm] = useState<{ kind: 'PAYMENT' | 'REFUND' | 'CANCEL'; requestId: string } | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const el = e.currentTarget;
    setError('');
    setBusy(true);
    try {
      await api(`/finance/accounts/${id}/files`, 'POST', new FormData(el));
      el.reset();
      r.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (r.loading) return <Loading />;
  if (r.error || !r.data) return <ErrorBox message={r.error || 'Cuenta no encontrada.'} retry={r.reload} />;
  const a = r.data;
  return (
    <>
      <Button icon={ArrowLeft} variant="ghost" onClick={onBack}>
        Volver a finanzas
      </Button>
      <PageHeading
        eyebrow={a.direction === 'PAYABLE' ? 'CUENTA POR PAGAR' : 'CUENTA POR COBRAR'}
        title={a.concept}
        description={a.party}
      >
        {!a.cancelledAt && (
          <>
            <Button onClick={() => setForm({ kind: 'PAYMENT', requestId: crypto.randomUUID() })}>
              Registrar abono
            </Button>
            <Button
              variant="secondary"
              onClick={() => setForm({ kind: 'REFUND', requestId: crypto.randomUUID() })}
            >
              Registrar devolución
            </Button>
            {!a.reservationId && (
              <Button
                variant="ghost"
                onClick={() => setForm({ kind: 'CANCEL', requestId: crypto.randomUUID() })}
              >
                Anular cuenta
              </Button>
            )}
          </>
        )}
        <a
          className="button button-secondary"
          target="_blank"
          rel="noreferrer"
          href={`${API}/finance/accounts/${id}/report.pdf`}
        >
          Estado de cuenta PDF
        </a>
      </PageHeading>
      {error && <ErrorBox message={error} />}
      <div className="detail-grid">
        <div className="detail-stack">
          <Panel title="Saldo y condiciones">
            <dl className="details-list">
              <div>
                <dt>Total</dt>
                <dd>{money(a.amount, a.currency)}</dd>
              </div>
              <div>
                <dt>Abonado neto</dt>
                <dd>{money(a.paid, a.currency)}</dd>
              </div>
              <div>
                <dt>Saldo pendiente</dt>
                <dd>
                  <strong>{money(a.balance, a.currency)}</strong>
                </dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>
                  <Badge value={a.status} />
                </dd>
              </div>
              <div>
                <dt>Vencimiento</dt>
                <dd>{formatDate(a.dueDate)}</dd>
              </div>
              <div>
                <dt>Categoría</dt>
                <dd>{a.category}</dd>
              </div>
              {a.exchangeRate && (
                <div>
                  <dt>Cambio de referencia</dt>
                  <dd>
                    {a.exchangeRate} CRC/USD · {formatDate(a.exchangeDate)}
                  </dd>
                </div>
              )}
            </dl>
            <p className="panel-text">{a.notes || a.cancelReason}</p>
          </Panel>
          <Panel title="Abonos y devoluciones">
            {a.payments.length ? (
              <SimpleTable headers={['Fecha', 'Movimiento', 'Importe', 'Referencia']}>
                {a.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.paidDate)}</td>
                    <td>
                      <Badge value={p.kind} />
                      <small>{p.method}</small>
                    </td>
                    <td>{money(p.amount, a.currency)}</td>
                    <td className="business-wrap">
                      {p.reference || 'Sin referencia'}
                      <small>{p.notes}</small>
                    </td>
                  </tr>
                ))}
              </SimpleTable>
            ) : (
              <p className="panel-text muted">Todavía no se registran abonos.</p>
            )}
          </Panel>
        </div>
        <Panel title="Comprobantes y adjuntos">
          <p className="panel-text">
            PDF, PNG o JPEG de hasta 10 MB. Acceso exclusivo de administración y finanzas.
          </p>
          <form className="upload-form" onSubmit={upload}>
            <input
              aria-label="Adjunto financiero"
              name="file"
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              required
            />
            <Button type="submit" icon={Upload} disabled={busy}>
              {busy ? 'Subiendo…' : 'Guardar comprobante'}
            </Button>
          </form>
          <ul className="business-files">
            {a.files.map((f) => (
              <li key={f.id}>
                <a
                  href={`${API}/finance/accounts/${id}/files/${f.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {f.name}
                </a>
                <small>{Math.ceil(f.size / 1024)} KB</small>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      {form && (
        <BusinessForm
          title={
            form.kind === 'CANCEL'
              ? 'Anular cuenta'
              : form.kind === 'PAYMENT'
                ? 'Registrar abono'
                : 'Registrar devolución'
          }
          description={
            form.kind === 'CANCEL'
              ? 'La cuenta debe tener cero abonos netos.'
              : `Moneda de la cuenta: ${a.currency}. Saldo actual: ${money(a.balance, a.currency)}.`
          }
          path={`/finance/accounts/${id}/${form.kind === 'CANCEL' ? 'cancel' : 'payments'}`}
          extra={form.kind === 'CANCEL' ? undefined : { kind: form.kind, requestId: form.requestId }}
          fields={
            form.kind === 'CANCEL'
              ? [{ name: 'reason', label: 'Motivo de anulación', required: true }]
              : [
                  { ...amountField, label: 'Importe del movimiento' },
                  {
                    name: 'paidDate',
                    label: 'Fecha del movimiento',
                    type: 'date',
                    required: true,
                    defaultValue: today(),
                  },
                  {
                    name: 'method',
                    label: 'Medio de pago',
                    type: 'select',
                    required: true,
                    options: ['Transferencia', 'Efectivo', 'Tarjeta', 'Otro'],
                  },
                  { name: 'reference', label: 'Referencia / comprobante' },
                  { name: 'notes', label: 'Notas del movimiento', type: 'textarea' },
                ]
          }
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            r.reload();
          }}
        />
      )}
    </>
  );
}
type Reservation = {
  id: string;
  litterId: string;
  dogId?: string;
  customer: string;
  customerPartyId?: string;
  contact?: string;
  reservedDate: string;
  expiresDate: string;
  conditions?: string;
  status: string;
  closeReason?: string;
  litter: { code: string };
  dog?: { name: string };
  account: Account;
};
type ReserveOption = {
  id: string;
  code: string;
  liveBorn: number;
  puppies: { id: string; name: string; availability: string }[];
};
export function ReservationsPage({ user, openAccount }: { user: User; openAccount: (id: string) => void }) {
  const parties = useResource<{ id: string; name: string; kind: string }[]>('/parties');
  const [page, setPage] = useState(1),
    [status, setStatus] = useState(''),
    [form, setForm] = useState<{ kind: 'new' | 'allocate' | 'close'; item?: Reservation } | null>(null);
  const r = useResource<PageData<Reservation>>(`/reservations?page=${page}&status=${status}`),
    options = useResource<ReserveOption[]>('/reservations/options');
  const [litterId, setLitterId] = useState('');
  const selected = options.data?.find((l) => l.id === (form?.item?.litterId || litterId));
  const fields: FieldDef[] =
    form?.kind === 'new'
      ? [
          {
            name: 'dogId',
            label: 'Cachorro específico (opcional)',
            type: 'select',
            options: choice(selected?.puppies.filter((d) => d.availability === 'AVAILABLE')),
          },
          { name: 'customer', label: 'Persona interesada', required: true },
          {
            name: 'customerPartyId',
            label: 'Propietario cliente',
            type: 'select',
            required: true,
            options: choice(parties.data?.filter((p) => p.kind !== 'UNIT')),
            hint: 'Al entregar, el perro y su historial aparecerán en el portal de este propietario.',
          },
          { name: 'contact', label: 'Contacto de la persona' },
          {
            name: 'reservedDate',
            label: 'Fecha del apartado',
            type: 'date',
            required: true,
            defaultValue: today(),
          },
          { name: 'expiresDate', label: 'Vencimiento del apartado', type: 'date', required: true },
          amountField,
          currencyField,
          { name: 'conditions', label: 'Condiciones del apartado', type: 'textarea' },
        ]
      : form?.kind === 'allocate'
        ? [
            {
              name: 'dogId',
              label: 'Cachorro disponible',
              type: 'select',
              required: true,
              options: choice(selected?.puppies.filter((d) => d.availability === 'AVAILABLE')),
            },
          ]
        : [
            {
              name: 'customerPartyId',
              label: 'Propietario para entrega',
              type: 'select',
              options: choice(parties.data?.filter((p) => p.kind !== 'UNIT')),
              defaultValue: form?.item?.customerPartyId,
            },
            {
              name: 'status',
              label: 'Acción de cierre',
              type: 'select',
              required: true,
              options: ['DELIVERED', 'CANCELLED', 'EXPIRED'],
            },
            {
              name: 'closedDate',
              label: 'Fecha de cierre',
              type: 'date',
              required: true,
              defaultValue: today(),
            },
            { name: 'reason', label: 'Motivo / constancia de entrega', required: true },
          ];
  return (
    <>
      <PageHeading
        eyebrow="COMPROMISOS DE CRIANZA"
        title="Apartados"
        description="Reservas por cachorro o camada, anticipos y entregas."
      >
        <Button icon={Plus} disabled={!litterId} onClick={() => setForm({ kind: 'new' })}>
          Nuevo apartado
        </Button>
      </PageHeading>
      <Panel title="Camada para un nuevo apartado">
        <div className="business-filters">
          <label>
            Seleccionar camada
            <select value={litterId} onChange={(e) => setLitterId(e.target.value)}>
              <option value="">Selecciona una camada</option>
              {options.data?.map((l) => (
                <option value={l.id} key={l.id}>
                  {l.code} · {l.liveBorn} nacidos vivos
                </option>
              ))}
            </select>
          </label>
          <label>
            Filtrar estado
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              <option value="ACTIVE">Activos</option>
              <option value="DELIVERED">Entregados</option>
              <option value="CANCELLED">Cancelados</option>
              <option value="EXPIRED">Vencidos y cerrados</option>
            </select>
          </label>
        </div>
        {options.error && <ErrorBox message={options.error} />}
        <p className="panel-text muted">
          Los anticipos se registran como abonos de la cuenta asociada. Las cancelaciones conservan el
          historial y requieren devolver los abonos.
        </p>
      </Panel>
      <Panel title="Reservas e historial">
        {r.loading ? (
          <Loading />
        ) : r.error ? (
          <ErrorBox message={r.error} retry={r.reload} />
        ) : !r.data?.items.length ? (
          <Empty
            icon={HeartIcon}
            title="Sin apartados"
            description="Selecciona una camada y registra el primer compromiso."
          />
        ) : (
          <>
            <SimpleTable
              headers={[
                'Persona / contacto',
                'Camada / cachorro',
                'Estado / vencimiento',
                'Total / saldo',
                'Acciones',
              ]}
            >
              {r.data.items.map((item) => (
                <tr key={item.id}>
                  <td className="business-wrap">
                    <strong>{item.customer}</strong>
                    <small>{item.contact}</small>
                    <small>{item.conditions}</small>
                  </td>
                  <td>
                    {item.litter.code}
                    <small>{item.dog?.name || 'Cachorro por asignar'}</small>
                  </td>
                  <td>
                    <Badge value={item.status} />
                    <small>
                      {formatDate(item.expiresDate)}
                      {item.status === 'ACTIVE' && item.expiresDate < today() ? ' · Requiere revisión' : ''}
                    </small>
                    <small>{item.closeReason}</small>
                  </td>
                  <td>
                    {money(item.account.amount, item.account.currency)}
                    <small>Saldo: {money(item.account.balance, item.account.currency)}</small>
                  </td>
                  <td>
                    <Button variant="secondary" onClick={() => openAccount(item.account.id)}>
                      Cuenta y abonos
                    </Button>
                    {item.status === 'ACTIVE' && (
                      <>
                        {!item.dogId && (
                          <Button variant="ghost" onClick={() => setForm({ kind: 'allocate', item })}>
                            Asignar cachorro
                          </Button>
                        )}
                        {['ADMIN'].includes(user.role) && (
                          <Button variant="ghost" onClick={() => setForm({ kind: 'close', item })}>
                            Entrega / cierre
                          </Button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </SimpleTable>
            <Pager data={r.data} page={page} setPage={setPage} />
          </>
        )}
      </Panel>
      {form && (
        <BusinessForm
          title={
            form.kind === 'new'
              ? 'Nuevo apartado'
              : form.kind === 'allocate'
                ? 'Asignar cachorro'
                : 'Cerrar apartado'
          }
          description={selected?.code}
          path={form.kind === 'new' ? '/reservations' : `/reservations/${form.item!.id}/${form.kind}`}
          extra={form.kind === 'new' ? { litterId } : undefined}
          fields={fields}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            r.reload();
            options.reload();
          }}
        />
      )}
    </>
  );
}
import { Heart as HeartIcon } from 'lucide-react';
