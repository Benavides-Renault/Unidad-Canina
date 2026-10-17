'use client';
import { useState } from 'react';
import { API, formatDate, today } from '@/lib/api';
import { useResource } from '@/lib/use-resource';
import { Button, ErrorBox, Loading, PageHeading, Panel, type FieldDef } from './ui';
import { BusinessForm, money, SimpleTable } from './business-ui';
export type Supplier = {
  id: string;
  name: string;
  taxId?: string;
  contact?: string;
  email?: string;
  phone?: string;
  notes?: string;
  active: boolean;
  revision: number;
};
type Payment = {
  id: string;
  kind: string;
  amount: string;
  paidDate: string;
  method: string;
  reference?: string;
  account: { concept: string; party: string; currency: string; direction: string };
  reconciliation?: { statementReference: string };
};
type Flow = {
  totals: { currency: string; income: string; expense: string; net: string }[];
  payments: Payment[];
};
export function FinanceControl({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState('cashflow'),
    [from, setFrom] = useState(today().slice(0, 7) + '-01'),
    [to, setTo] = useState(today()),
    [form, setForm] = useState<Supplier | 'supplier' | 'close' | Payment | null>(null);
  const suppliers = useResource<Supplier[]>('/finance-control/suppliers'),
    closes =
      useResource<{ id: string; month: string; notes: string; snapshot: Flow }[]>('/finance-control/closes');
  const params = new URLSearchParams({ from, to }),
    flow = useResource<Flow>(`/finance-control/cashflow?${params}`);
  const supplierFields: FieldDef[] = [
    { name: 'name', label: 'Nombre del proveedor', required: true },
    { name: 'taxId', label: 'Identificación' },
    { name: 'contact', label: 'Persona de contacto' },
    { name: 'email', label: 'Correo electrónico', type: 'email' },
    { name: 'phone', label: 'Teléfono' },
    { name: 'notes', label: 'Notas', type: 'textarea' },
    { name: 'active', label: 'Proveedor activo', type: 'checkbox', defaultValue: true },
  ];
  const isSupplier = typeof form === 'object' && form && 'revision' in form ? form : null,
    isPayment = typeof form === 'object' && form && 'paidDate' in form ? form : null;
  return (
    <>
      <PageHeading
        title="Control financiero"
        eyebrow="REGISTROS INTERNOS"
        description="Proveedores, conciliación y cierre mensual por moneda"
      >
        <Button variant="secondary" onClick={onBack}>
          Volver a cuentas
        </Button>
      </PageHeading>
      <div className="heading-actions">
        {[
          ['cashflow', 'Flujo de caja'],
          ['suppliers', 'Proveedores'],
          ['closes', 'Cierres mensuales'],
        ].map(([id, title]) => (
          <Button key={id} variant={tab === id ? 'primary' : 'secondary'} onClick={() => setTab(id)}>
            {title}
          </Button>
        ))}
      </div>
      {tab === 'suppliers' ? (
        <Panel
          title="Proveedores"
          action={<Button onClick={() => setForm('supplier')}>Nuevo proveedor</Button>}
        >
          {suppliers.loading ? (
            <Loading />
          ) : suppliers.error ? (
            <ErrorBox message={suppliers.error} />
          ) : (
            <SimpleTable headers={['Proveedor', 'Contacto', 'Estado', 'Acciones']}>
              {suppliers.data?.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.name}
                    <small>{s.taxId}</small>
                  </td>
                  <td>{[s.contact, s.email, s.phone].filter(Boolean).join(' · ')}</td>
                  <td>{s.active ? 'Activo' : 'Inactivo'}</td>
                  <td>
                    <Button variant="secondary" onClick={() => setForm(s)}>
                      Editar proveedor
                    </Button>
                  </td>
                </tr>
              ))}
            </SimpleTable>
          )}
        </Panel>
      ) : tab === 'closes' ? (
        <Panel
          title="Cierres mensuales"
          subtitle="Sólo meses finalizados y totalmente conciliados. El cierre conserva una copia inmutable e impide pagos retroactivos en ese mes."
          action={<Button onClick={() => setForm('close')}>Cerrar mes</Button>}
        >
          {closes.error ? (
            <ErrorBox message={closes.error} />
          ) : closes.loading ? (
            <Loading />
          ) : closes.data?.length ? (
            closes.data.map((c) => (
              <details key={c.id} className="history-entry">
                <summary>
                  {c.month} · {c.notes}
                </summary>
                {c.snapshot.totals.map((t) => (
                  <p key={t.currency}>
                    {t.currency} · Ingresos {money(t.income, t.currency)} · Egresos{' '}
                    {money(t.expense, t.currency)} · Flujo neto {money(t.net, t.currency)}
                  </p>
                ))}
                <p>{c.snapshot.payments.length} movimientos conservados.</p>
              </details>
            ))
          ) : (
            <p className="panel-text muted">No hay meses cerrados.</p>
          )}
        </Panel>
      ) : (
        <Panel
          title="Flujo por fecha de pago"
          subtitle="Los reintegros reducen el flujo de su dirección original. CRC y USD se presentan separados."
        >
          <div className="form-grid">
            <div className="field">
              <label htmlFor="cash-from">Desde</label>
              <input id="cash-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="cash-to">Hasta</label>
              <input id="cash-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          {flow.loading ? (
            <Loading />
          ) : flow.error ? (
            <ErrorBox message={flow.error} />
          ) : (
            <>
              <div className="heading-actions">
                <a className="button secondary" href={`${API}/finance-control/cashflow/export?${params}`}>
                  Exportar flujo CSV
                </a>
                <a
                  className="button secondary"
                  href={`${API}/finance-control/cashflow/export?${params}&format=pdf`}
                >
                  Exportar flujo PDF
                </a>
              </div>
              {flow.data?.totals.map((t) => (
                <p key={t.currency}>
                  <strong>{t.currency}</strong> · Ingresos {money(t.income, t.currency)} · Egresos{' '}
                  {money(t.expense, t.currency)} · Neto {money(t.net, t.currency)}
                </p>
              ))}
              <SimpleTable headers={['Fecha', 'Concepto', 'Movimiento', 'Importe', 'Conciliación']}>
                {flow.data?.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.paidDate)}</td>
                    <td>
                      {p.account.concept}
                      <small>{p.account.party}</small>
                    </td>
                    <td>
                      {p.account.direction === 'RECEIVABLE' ? 'Cobro' : 'Pago'}
                      {p.kind === 'REFUND' ? ' · reintegro' : ''}
                    </td>
                    <td>{money(p.amount, p.account.currency)}</td>
                    <td>
                      {p.reconciliation ? (
                        p.reconciliation.statementReference
                      ) : (
                        <Button variant="secondary" onClick={() => setForm(p)}>
                          Conciliar movimiento
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </SimpleTable>
            </>
          )}
        </Panel>
      )}
      {(form === 'supplier' || isSupplier) && (
        <BusinessForm
          title={isSupplier ? 'Editar proveedor' : 'Nuevo proveedor'}
          path={isSupplier ? `/finance-control/suppliers/${isSupplier.id}` : '/finance-control/suppliers'}
          method={isSupplier ? 'PATCH' : 'POST'}
          extra={isSupplier ? { revision: isSupplier.revision } : undefined}
          fields={supplierFields.map((f) => ({
            ...f,
            defaultValue: isSupplier
              ? (isSupplier as unknown as Record<string, string | boolean>)[f.name]
              : f.defaultValue,
          }))}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            suppliers.reload();
          }}
        />
      )}
      {isPayment && (
        <BusinessForm
          title="Conciliar movimiento"
          description={`${isPayment.account.concept} · ${money(isPayment.amount, isPayment.account.currency)}. Verifica el importe contra el comprobante o extracto; el registro será permanente.`}
          path={`/finance-control/payments/${isPayment.id}/reconcile`}
          fields={[
            { name: 'amount', label: 'Importe verificado', required: true },
            { name: 'statementReference', label: 'Referencia del extracto o comprobante', required: true },
            { name: 'notes', label: 'Notas de verificación', type: 'textarea' },
          ]}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            flow.reload();
          }}
        />
      )}
      {form === 'close' && (
        <BusinessForm
          title="Cerrar mes"
          path="/finance-control/closes"
          fields={[
            {
              name: 'month',
              label: 'Mes (AAAA-MM)',
              required: true,
              hint: 'Ejemplo: 2026-09. Debe haber finalizado.',
            },
            { name: 'notes', label: 'Observaciones del cierre', required: true, type: 'textarea' },
          ]}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            closes.reload();
          }}
        />
      )}
    </>
  );
}
