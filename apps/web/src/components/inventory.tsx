'use client';
import { useState } from 'react';
import { ArrowLeft, Package, Plus } from 'lucide-react';
import { formatDate, today, type PageData } from '@/lib/api';
import { useDebouncedValue, useResource } from '@/lib/use-resource';
import { Badge, Button, Empty, ErrorBox, Loading, PageHeading, Panel, type FieldDef } from './ui';
import { BusinessForm, choice, money, Pager, SimpleTable } from './business-ui';
type Lot = {
  id: string;
  batch: string;
  expiresDate?: string;
  quantity: string;
  unitCost: string;
  currency: string;
};
type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  minimum: string;
  stock: string;
  usable: string;
  lowStock: boolean;
  expiredLots: number;
  lots: Lot[];
};
type Movement = {
  id: string;
  kind: string;
  quantity: string;
  movementDate: string;
  reason: string;
  area?: string;
  dog?: { name: string };
  recorder: { name: string };
  lot: { batch: string };
};
const productFields: FieldDef[] = [
  { name: 'sku', label: 'Código del producto', required: true },
  { name: 'name', label: 'Nombre del producto', required: true },
  {
    name: 'category',
    label: 'Categoría del producto',
    type: 'select',
    required: true,
    options: [
      'Alimento',
      'Medicamento',
      'Insumo veterinario',
      'Equipo de entrenamiento',
      'Protección personal',
      'Higiene y limpieza',
      'Transporte',
      'Documentación',
      'Otro',
    ],
  },
  {
    name: 'unit',
    label: 'Unidad de medida',
    type: 'select',
    required: true,
    options: ['kg', 'g', 'L', 'mL', 'unidad', 'caja', 'saco'],
  },
  {
    name: 'minimum',
    label: 'Existencia mínima',
    required: true,
    defaultValue: '0',
    hint: 'Usa punto decimal; hasta tres decimales. Se compara con existencias no vencidas.',
  },
];
export function InventoryPage() {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [id, setId] = useState<string | null>(null),
    [form, setForm] = useState(false);
  const searchQuery = useDebouncedValue(search);
  const r = useResource<PageData<Product>>(
    `/inventory/products?page=${page}&search=${encodeURIComponent(searchQuery)}`,
  );
  if (id)
    return (
      <ProductDetail
        id={id}
        onBack={() => {
          setId(null);
          r.reload();
        }}
      />
    );
  return (
    <>
      <PageHeading
        eyebrow="RECURSOS DE LA UNIDAD"
        title="Inventario"
        description="Lotes, vencimientos, existencias y consumos trazables."
      >
        <Button icon={Plus} onClick={() => setForm(true)}>
          Nuevo producto
        </Button>
      </PageHeading>
      <Panel title="Productos y existencias">
        <div className="business-filters">
          <label>
            Buscar producto
            <input
              value={search}
              placeholder="Nombre o código"
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        {r.loading ? (
          <Loading />
        ) : r.error ? (
          <ErrorBox message={r.error} retry={r.reload} />
        ) : !r.data?.items.length ? (
          <Empty
            icon={Package}
            title="Inventario por registrar"
            description="Crea un producto, agrega su lote y registra la entrada de existencias."
          />
        ) : (
          <>
            <SimpleTable
              headers={['Producto', 'Categoría', 'Existencia total', 'Utilizable', 'Alertas', 'Detalle']}
            >
              {r.data.items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    <small>{p.sku}</small>
                  </td>
                  <td>{p.category}</td>
                  <td>
                    {p.stock} {p.unit}
                  </td>
                  <td>
                    {p.usable} {p.unit}
                    <small>Mínimo: {p.minimum}</small>
                  </td>
                  <td>
                    {p.lowStock && <Badge value="LOW_STOCK" />}
                    {p.expiredLots > 0 && <small>{p.expiredLots} lotes vencidos</small>}
                    {!p.lowStock && !p.expiredLots && 'Sin alertas'}
                  </td>
                  <td>
                    <Button variant="secondary" onClick={() => setId(p.id)}>
                      Abrir producto
                    </Button>
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
          title="Nuevo producto"
          fields={productFields}
          path="/inventory/products"
          onClose={() => setForm(false)}
          onSaved={(p) => {
            setForm(false);
            setId(String(p.id));
            r.reload();
          }}
        />
      )}
    </>
  );
}
function ProductDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const r = useResource<Product>(`/inventory/products/${id}`),
    refs = useResource<{ dogs: { id: string; name: string }[] }>('/finance/references');
  const [page, setPage] = useState(1),
    [form, setForm] = useState<{ kind: 'lot' | 'move'; lot?: Lot; requestId?: string } | null>(null);
  const movements = useResource<PageData<Movement>>(`/inventory/movements?productId=${id}&page=${page}`);
  if (r.loading) return <Loading />;
  if (r.error || !r.data) return <ErrorBox message={r.error || 'Producto no encontrado.'} retry={r.reload} />;
  const p = r.data;
  const lotFields: FieldDef[] = [
    { name: 'batch', label: 'Número de lote', required: true },
    { name: 'expiresDate', label: 'Caducidad del lote', type: 'date' },
    {
      name: 'unitCost',
      label: `Costo por ${p.unit}`,
      required: true,
      hint: 'Usa punto decimal, hasta dos decimales.',
    },
    { name: 'currency', label: 'Moneda del costo', type: 'select', required: true, options: ['CRC', 'USD'] },
  ];
  const moveFields: FieldDef[] = [
    {
      name: 'kind',
      label: 'Tipo de movimiento',
      type: 'select',
      required: true,
      options: ['IN', 'OUT', 'DISPOSAL'],
    },
    {
      name: 'quantity',
      label: `Cantidad (${p.unit})`,
      required: true,
      hint: 'Hasta tres decimales. La cantidad siempre es positiva.',
    },
    {
      name: 'movementDate',
      label: 'Fecha del movimiento',
      type: 'date',
      required: true,
      defaultValue: today(),
    },
    { name: 'reason', label: 'Motivo del movimiento', required: true },
    { name: 'area', label: 'Área / destino' },
    { name: 'dogId', label: 'Perro asociado al consumo', type: 'select', options: choice(refs.data?.dogs) },
  ];
  return (
    <>
      <Button variant="ghost" icon={ArrowLeft} onClick={onBack}>
        Volver a inventario
      </Button>
      <PageHeading
        eyebrow={`${p.sku} · ${p.category}`}
        title={p.name}
        description={`Unidad: ${p.unit} · Mínimo: ${p.minimum}`}
      >
        <Button icon={Plus} onClick={() => setForm({ kind: 'lot' })}>
          Agregar lote
        </Button>
      </PageHeading>
      <Panel
        title="Lotes y caducidad"
        subtitle="Cada lote comienza en cero; registra entradas, consumos y bajas para conservar el historial."
      >
        {p.lots.length ? (
          <SimpleTable headers={['Lote', 'Caducidad', 'Existencia', 'Costo unitario', 'Movimiento']}>
            {p.lots.map((l) => (
              <tr key={l.id}>
                <td>
                  <strong>{l.batch}</strong>
                </td>
                <td>
                  {formatDate(l.expiresDate)}
                  {l.expiresDate && l.expiresDate < today() && <small>Vencido · Sólo baja o entrada</small>}
                </td>
                <td>
                  {l.quantity} {p.unit}
                </td>
                <td>{money(l.unitCost, l.currency)}</td>
                <td>
                  <Button
                    variant="secondary"
                    onClick={() => setForm({ kind: 'move', lot: l, requestId: crypto.randomUUID() })}
                  >
                    Registrar movimiento
                  </Button>
                </td>
              </tr>
            ))}
          </SimpleTable>
        ) : (
          <Empty
            compact
            icon={Package}
            title="Agrega el primer lote"
            description="El costo, la moneda y la caducidad se conservan por lote."
          />
        )}
      </Panel>
      <Panel title="Historial de movimientos">
        {movements.loading ? (
          <Loading />
        ) : movements.error ? (
          <ErrorBox message={movements.error} />
        ) : (
          <>
            <SimpleTable headers={['Fecha', 'Lote / tipo', 'Cantidad', 'Motivo / destino', 'Registrado por']}>
              {movements.data?.items.map((m) => (
                <tr key={m.id}>
                  <td>{formatDate(m.movementDate)}</td>
                  <td>
                    {m.lot.batch}
                    <small>
                      <Badge value={m.kind} />
                    </small>
                  </td>
                  <td>
                    {m.quantity} {p.unit}
                  </td>
                  <td className="business-wrap">
                    {m.reason}
                    <small>
                      {m.area} {m.dog?.name}
                    </small>
                  </td>
                  <td>{m.recorder.name}</td>
                </tr>
              ))}
            </SimpleTable>
            <Pager data={movements.data} page={page} setPage={setPage} />
          </>
        )}
      </Panel>
      {form && (
        <BusinessForm
          title={form.kind === 'lot' ? 'Agregar lote' : 'Registrar movimiento'}
          description={
            form.lot ? `${form.lot.batch} · Existencia actual: ${form.lot.quantity} ${p.unit}` : undefined
          }
          fields={form.kind === 'lot' ? lotFields : moveFields}
          path={
            form.kind === 'lot'
              ? `/inventory/products/${id}/lots`
              : `/inventory/lots/${form.lot!.id}/movements`
          }
          extra={form.kind === 'move' ? { requestId: form.requestId } : undefined}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            r.reload();
            movements.reload();
          }}
        />
      )}
    </>
  );
}
