'use client';

import { api } from '@/lib/api-client';
import { Button, Input, formatDateOnly, formatMoney, useConfirm } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

interface Partner {
  id: string;
  name: string;
  fullname: string | null;
  phones: string | null;
  inn: string | null;
}
interface Stats {
  purchasedQty: number;
  soldQty: number;
  purchasedCost: number;
  soldCost: number;
  purchasedSaleValue: number;
  soldValue: number;
  soldShare: number;
  lastPurchaseAt: string | null;
  lastSaleAt: string | null;
}
interface AnalysisProduct {
  id: string;
  code: string | null;
  name: string;
  unitName: string | null;
  buyPrice: number;
  sellPrice: number;
  soldQty: number;
  purchasedQty: number;
  finalStock: number;
}
interface AnalysisResponse {
  partner: Partner;
  stats: Stats;
  products: AnalysisProduct[];
  range: { from: string; to: string };
}

function fmtQty(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}
function toISODate(d: Date): string {
  // For <input type="date"> value: LOCAL YYYY-MM-DD (toISOString() is UTC and
  // shifts the date by a day in +5/Tashkent, breaking the period filter).
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function defaultRange(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 30);
  return { from, to };
}

export default function AnalitikaCounterpartyAnalysisPage() {
  const t = useTranslations('pages.analitika_counterparties');
  const router = useRouter();
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [range, setRange] = useState(() => defaultRange());
  const [orderQty, setOrderQty] = useState<Record<string, number>>({});

  const { data, isLoading } = useQuery<AnalysisResponse>({
    queryKey: ['analitika', 'cp-analysis', id, range.from.toISOString(), range.to.toISOString()],
    queryFn: () =>
      api.get<AnalysisResponse>(
        `/analitika/counterparties/${id}/analysis?from=${range.from.toISOString()}&to=${range.to.toISOString()}`,
      ),
    enabled: !!id,
    placeholderData: (prev) => prev,
  });

  const products = data?.products ?? [];
  const totals = useMemo(() => {
    let count = 0;
    let total = 0;
    for (const p of products) {
      const qty = orderQty[p.id] ?? 0;
      if (qty > 0) {
        count += 1;
        total += qty * p.buyPrice;
      }
    }
    return { count, total };
  }, [products, orderQty]);

  const createOrder = useMutation({
    mutationFn: () => {
      const lines = Object.entries(orderQty)
        .filter(([, qty]) => qty > 0)
        .map(([productId, qty]) => ({ productId, qty }));
      return api.post<{ id: string; number: string }>('/analitika/orders', {
        counterpartyId: id,
        lines,
      });
    },
    onSuccess: (created) => {
      setOrderQty({});
      qc.invalidateQueries({ queryKey: ['analitika', 'orders'] });
      if (created?.id) router.push(`/analitika/buyurtmalar/${created.id}`);
    },
  });

  const handleClear = async () => {
    if (totals.count === 0) return;
    const ok = await confirm({
      title: t('clear_btn'),
      description: t('clear_confirm'),
      confirmLabel: t('clear_btn'),
      tone: 'destructive',
    });
    if (ok) setOrderQty({});
  };

  return (
    <div className="space-y-4 p-6 pb-28">
      <a
        href="/analitika/kontragentlar"
        className="text-[var(--ms-text-brand)] text-sm hover:underline"
      >
        {t('back')}
      </a>

      {data && (
        <>
          {/* Header */}
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">
              {data.partner.name}
            </h1>
            {data.partner.fullname && (
              <span className="text-[var(--ms-text-muted)] text-sm">{data.partner.fullname}</span>
            )}
            {data.partner.phones && (
              <span className="text-[var(--ms-text-muted)] text-xs">· {data.partner.phones}</span>
            )}
            {data.partner.inn && (
              <span className="text-[var(--ms-text-muted)] text-xs">
                · {t('col_inn')}: {data.partner.inn}
              </span>
            )}
          </div>

          {/* Filter panel */}
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--ms-border)] bg-white p-4">
            <div className="space-y-1.5">
              <label
                htmlFor="cp-from"
                className="block font-medium text-[var(--ms-text-primary)] text-sm"
              >
                {t('period_label')} →
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="cp-from"
                  type="date"
                  value={toISODate(range.from)}
                  onChange={(e) =>
                    setRange((r) => ({
                      ...r,
                      from: e.target.value ? new Date(e.target.value) : r.from,
                    }))
                  }
                  className="w-44"
                />
                <span className="text-[var(--ms-text-muted)] text-xs">→</span>
                <Input
                  type="date"
                  value={toISODate(range.to)}
                  onChange={(e) =>
                    setRange((r) => ({
                      ...r,
                      to: e.target.value ? new Date(e.target.value) : r.to,
                    }))
                  }
                  className="w-44"
                />
              </div>
            </div>
            <span className="text-[var(--ms-text-muted)] text-xs">{t('period_30d')}</span>
          </div>

          {/* Stats cards */}
          <StatsCards stats={data.stats} t={t} />

          {/* Products table */}
          <ProductsTable
            products={products}
            orderQty={orderQty}
            onChangeQty={(pid, q) => setOrderQty((prev) => ({ ...prev, [pid]: q }))}
            t={t}
          />

          {/* Sticky order bar */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-[var(--ms-border)] border-t bg-white px-6 py-3 shadow-lg">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
              <div>
                <div className="text-[10px] text-[var(--ms-text-muted)] uppercase tracking-wider">
                  {t('order_total_label')}
                </div>
                <div className="font-bold text-[var(--ms-text-brand)] text-xl tabular-nums">
                  {formatMoney(totals.total)}
                </div>
                <div className="text-[10px] text-[var(--ms-text-muted)]">
                  {totals.count} {t('order_count_suffix')}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={handleClear}
                  disabled={totals.count === 0 || createOrder.isPending}
                >
                  {t('clear_btn')}
                </Button>
                <Button
                  onClick={() => createOrder.mutate()}
                  disabled={totals.count === 0 || createOrder.isPending}
                >
                  {t('form_order_btn')}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {isLoading && !data && <p className="text-[var(--ms-text-muted)] text-sm">{t('loading')}</p>}
    </div>
  );
}

function StatsCards({
  stats,
  t,
}: {
  stats: Stats;
  t: ReturnType<typeof useTranslations>;
}) {
  const cards = [
    { label: t('purchased'), value: fmtQty(stats.purchasedQty) },
    { label: t('purchase_cost'), value: formatMoney(stats.purchasedCost) },
    { label: t('purchased_sale_value'), value: formatMoney(stats.purchasedSaleValue) },
    { label: t('sold'), value: fmtQty(stats.soldQty) },
    { label: t('sales_value'), value: formatMoney(stats.soldValue), tone: 'text-emerald-600' },
    { label: t('sales_cost'), value: formatMoney(stats.soldCost) },
    {
      label: t('sold_ratio'),
      value: `${Math.round(stats.soldShare * 100)}%`,
      tone: 'text-[var(--ms-text-brand)]',
    },
    { label: t('last_purchase'), value: formatDateOnly(stats.lastPurchaseAt) },
    { label: t('last_sale'), value: formatDateOnly(stats.lastSaleAt) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-[var(--ms-border)] bg-white p-3">
          <div className="text-[10px] text-[var(--ms-text-muted)] uppercase tracking-wider">
            {c.label}
          </div>
          <div
            className={`mt-1 font-semibold text-base tabular-nums ${c.tone ?? 'text-[var(--ms-text-primary)]'}`}
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function stockClass(stock: number): string {
  if (stock < 0) return 'text-[var(--ms-destructive-500)]';
  if (stock === 0) return 'text-amber-600';
  return 'text-emerald-600';
}

function ProductsTable({
  products,
  orderQty,
  onChangeQty,
  t,
}: {
  products: AnalysisProduct[];
  orderQty: Record<string, number>;
  onChangeQty: (id: string, qty: number) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--ms-border)] bg-white px-6 py-12 text-center">
        <p className="font-medium text-sm">{t('products_empty')}</p>
        <p className="mt-1 text-[var(--ms-text-muted)] text-xs">{t('products_empty_hint')}</p>
      </div>
    );
  }

  const activeCount = Object.values(orderQty).filter((q) => q > 0).length;

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--ms-border)] bg-white">
      <div className="flex items-center justify-between border-[var(--ms-border)] border-b bg-[var(--ms-bg-subtle)] px-4 py-3">
        <div>
          <h3 className="font-semibold text-sm">{t('products_title')}</h3>
          <p className="text-[var(--ms-text-muted)] text-xs">
            {t('products_total', { n: products.length })}
          </p>
        </div>
        {activeCount > 0 && (
          <span className="rounded-full bg-[var(--ms-text-brand)]/10 px-2.5 py-1 font-semibold text-[var(--ms-text-brand)] text-xs">
            {t('selected_count', { n: activeCount })}
          </span>
        )}
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-[var(--ms-border)] lg:hidden">
        {products.map((p) => {
          const qty = orderQty[p.id] ?? 0;
          const isActive = qty > 0;
          return (
            <li key={p.id} className={`p-4 ${isActive ? 'bg-[var(--ms-text-brand)]/5' : ''}`}>
              <p className="font-medium">{p.name}</p>
              <p className="mt-0.5 font-mono text-[11px] text-[var(--ms-text-muted)]">
                #{p.code ?? '—'} {p.unitName && `· ${p.unitName}`}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <Field label={t('col_buy_price')} value={formatMoney(p.buyPrice)} />
                <Field
                  label={t('col_sell_price')}
                  value={formatMoney(p.sellPrice)}
                  tone="text-emerald-600"
                />
                <Field label={t('col_sold_qty')} value={fmtQty(p.soldQty)} />
                <Field
                  label={t('col_final_stock')}
                  value={fmtQty(p.finalStock)}
                  tone={stockClass(p.finalStock)}
                />
              </div>
              <div className="mt-3">
                <p className="mb-1 text-[10px] text-[var(--ms-text-muted)] uppercase">
                  {t('col_order_qty')}
                </p>
                <QtyInput value={qty} onChange={(q) => onChangeQty(p.id, q)} />
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead className="bg-[var(--ms-bg-subtle)] text-[10px] text-[var(--ms-text-muted)] uppercase">
            <tr>
              <th className="w-24 px-3 py-2 text-left">{t('col_code')}</th>
              <th className="px-3 py-2 text-left">{t('col_name')}</th>
              <th className="w-32 px-3 py-2 text-right">{t('col_buy_price')}</th>
              <th className="w-32 px-3 py-2 text-right">{t('col_sell_price')}</th>
              <th className="w-24 px-3 py-2 text-right">{t('col_sold_qty')}</th>
              <th className="w-32 px-3 py-2 text-right">{t('col_final_stock')}</th>
              <th className="w-40 px-3 py-2 text-right">{t('col_order_qty')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ms-border)]">
            {products.map((p) => {
              const qty = orderQty[p.id] ?? 0;
              const isActive = qty > 0;
              return (
                <tr
                  key={p.id}
                  className={`hover:bg-[var(--ms-bg-subtle)] ${isActive ? 'bg-[var(--ms-text-brand)]/5' : ''}`}
                >
                  <td className="px-3 py-2 font-mono text-xs">{p.code ?? '—'}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{p.name}</div>
                    {p.unitName && (
                      <div className="text-[10px] text-[var(--ms-text-muted)]">{p.unitName}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(p.buyPrice)}</td>
                  <td className="px-3 py-2 text-right text-emerald-600 tabular-nums">
                    {formatMoney(p.sellPrice)}
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--ms-text-muted)] tabular-nums">
                    {fmtQty(p.soldQty)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${stockClass(p.finalStock)}`}
                  >
                    {fmtQty(p.finalStock)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <QtyInput value={qty} onChange={(q) => onChangeQty(p.id, q)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[10px] text-[var(--ms-text-muted)] uppercase">{label}</p>
      <p className={`mt-0.5 font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
    </div>
  );
}

function QtyInput({ value, onChange }: { value: number; onChange: (q: number) => void }) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      min={0}
      step={1}
      value={value === 0 ? '' : String(value)}
      placeholder="0"
      onChange={(e) => {
        const v = e.target.value;
        const n = v === '' ? 0 : Number.parseFloat(v);
        onChange(Number.isFinite(n) && n >= 0 ? n : 0);
      }}
      className="w-24 text-right"
    />
  );
}
