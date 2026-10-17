'use client';
import { type ReactNode } from 'react';
import { Button, DataForm, Modal, type FieldDef } from './ui';
import { api, type PageData } from '@/lib/api';
export const money = (value: string | number, currency: string) => {
  const [whole, fraction = ''] = String(value).split('.');
  if (!/^-?\d+$/.test(whole)) return '—';
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .formatToParts(whole === '-0' ? -0 : BigInt(whole))
    .map((part) => (part.type === 'fraction' ? fraction.padEnd(2, '0').slice(0, 2) : part.value))
    .join('');
};
export const choice = (items?: { id: string; name: string }[] | null) =>
  (items || []).map((item) => ({ value: item.id, label: item.name }));
export function Pager({
  data,
  page,
  setPage,
}: {
  data?: PageData<unknown> | null;
  page: number;
  setPage: (n: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        {data?.total || 0} registros · Página {page}
      </span>
      <div>
        <Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
          Anterior
        </Button>
        <Button
          variant="secondary"
          disabled={!data || page * data.pageSize >= data.total}
          onClick={() => setPage(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
export function BusinessForm({
  title,
  description,
  fields,
  path,
  method = 'POST',
  extra,
  onClose,
  onSaved,
  submitLabel = 'Guardar',
}: {
  title: string;
  description?: string;
  fields: FieldDef[];
  path: string;
  method?: string;
  extra?: Record<string, unknown>;
  onClose: () => void;
  onSaved: (value: Record<string, unknown>) => void;
  submitLabel?: string;
}) {
  return (
    <Modal title={title} description={description} onClose={onClose}>
      <DataForm
        fields={fields}
        clearOptional
        onCancel={onClose}
        submitLabel={submitLabel}
        onSubmit={async (values) => {
          const result = await api<Record<string, unknown>>(path, method, { ...values, ...extra });
          onSaved(result);
        }}
      />
    </Modal>
  );
}
export function SimpleTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
