'use client';

import { api } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

interface OrderRow {
  id: string;
  number: string;
  counterpartyName: string | null;
  totalMinor: string;
  createdAt: string;
}
interface OrdersResponse {
  items: OrderRow[];
  total: number;
}
interface Summary {
  total: number;
  green: number;
  yellow: number;
  red: number;
  pendingApproval: number;
  netMinor: string;
}
interface CountRow {
  id: string;
  productName: string;
  netQty: number;
  countedAt: string;
}
interface CountListResponse {
  items: CountRow[];
}
interface ReportBucket {
  key: string;
  label: string;
  count: number;
  moneyMinor: string;
}
interface ReportResponse {
  byCounter: ReportBucket[];
}

function fmtMoney(minor: string): string {
  return `${(Number(minor) / 100).toLocaleString('ru-RU')} so'm`;
}
function isThisMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export default function AnalitikaDashboardPage() {
  const t = useTranslations('pages.analitika_dashboard');

  const ordersQuery = useQuery<OrdersResponse>({
    queryKey: ['analitika', 'orders', ''],
    queryFn: () => api.get<OrdersResponse>('/analitika/orders'),
  });
  const summaryQuery = useQuery<Summary>({
    queryKey: ['analitika', 'count-summary'],
    queryFn: () => api.get<Summary>('/analitika/counts/summary'),
  });
  const recentCountsQuery = useQuery<CountListResponse>({
    queryKey: ['analitika', 'counts', 'all'],
    queryFn: () => api.get<CountListResponse>('/analitika/counts?view=all'),
  });
  const reportQuery = useQuery<ReportResponse>({
    queryKey: ['analitika', 'report', 'all'],
    queryFn: () => api.get<ReportResponse>('/analitika/counts/report?period=all'),
  });
  const recentCounts = (recentCountsQuery.data?.items ?? []).slice(0, 5);
  const topCounters = (reportQuery.data?.byCounter ?? []).slice(0, 3);

  const orders = ordersQuery.data?.items ?? [];
  const ordersTotal = ordersQuery.data?.total ?? 0;
  const ordersThisMonth = orders.filter((o) => isThisMonth(o.createdAt)).length;
  const s = summaryQuery.data;

  const cards = [
    { label: t('kpi_orders'), value: String(ordersTotal) },
    { label: t('kpi_orders_month'), value: String(ordersThisMonth) },
    { label: t('kpi_counted'), value: String(s?.total ?? 0) },
    {
      label: t('kpi_net'),
      value: fmtMoney(s?.netMinor ?? '0'),
      tone:
        Number(s?.netMinor ?? '0') < 0
          ? 'text-[var(--ms-destructive-500)]'
          : 'text-[var(--ms-text-primary)]',
    },
  ];

  return (
    <div className="p-6">
      <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">{t('title')}</h1>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-[var(--ms-border)] bg-white p-4">
            <div className="text-[var(--ms-text-muted)] text-xs">{c.label}</div>
            <div
              className={`mt-1 font-semibold text-xl ${c.tone ?? 'text-[var(--ms-text-primary)]'}`}
            >
              {c.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Recent orders */}
        <div className="lg:col-span-2">
          <h2 className="mb-2 font-medium text-[var(--ms-text-primary)]">{t('recent_orders')}</h2>
          <div className="overflow-x-auto rounded-lg border border-[var(--ms-border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--ms-bg-subtle)] text-[var(--ms-text-muted)] text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t('col_number')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('col_counterparty')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('col_total')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ms-border)]">
                {orders.slice(0, 5).map((o) => (
                  <tr key={o.id} className="hover:bg-[var(--ms-bg-subtle)]">
                    <td className="px-3 py-2">
                      <a
                        href={`/analitika/buyurtmalar/${o.id}`}
                        className="font-medium text-[var(--ms-text-brand)] hover:underline"
                      >
                        {o.number}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-[var(--ms-text-muted)]">
                      {o.counterpartyName ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(o.totalMinor)}</td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-[var(--ms-text-muted)]">
                      {t('no_orders')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Counting status */}
        <div>
          <h2 className="mb-2 font-medium text-[var(--ms-text-primary)]">{t('count_status')}</h2>
          <div className="space-y-2 rounded-lg border border-[var(--ms-border)] bg-white p-4 text-sm">
            <Row label={t('green')} value={s?.green ?? 0} dot="bg-[var(--ms-success-500)]" />
            <Row label={t('yellow')} value={s?.yellow ?? 0} dot="bg-[var(--ms-warning-500)]" />
            <Row label={t('red')} value={s?.red ?? 0} dot="bg-[var(--ms-destructive-500)]" />
            <div className="border-[var(--ms-border)] border-t pt-2">
              <Row label={t('pending')} value={s?.pendingApproval ?? 0} />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row — Recent counts + Top counters */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-2 font-medium text-[var(--ms-text-primary)]">{t('recent_counts')}</h2>
          <div className="overflow-x-auto rounded-lg border border-[var(--ms-border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--ms-bg-subtle)] text-[var(--ms-text-muted)] text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t('col_product')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('col_qty')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('col_total')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ms-border)]">
                {recentCounts.map((c) => (
                  <tr key={c.id} className="hover:bg-[var(--ms-bg-subtle)]">
                    <td className="px-3 py-2 text-[var(--ms-text-primary)]">{c.productName}</td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        c.netQty < 0
                          ? 'text-[var(--ms-destructive-500)]'
                          : 'text-[var(--ms-success-600)]'
                      }`}
                    >
                      {c.netQty > 0 ? `+${c.netQty}` : c.netQty}
                    </td>
                    <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                      {new Date(c.countedAt).toLocaleDateString('ru-RU')}
                    </td>
                  </tr>
                ))}
                {recentCounts.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-[var(--ms-text-muted)]">
                      {t('no_counts')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="mb-2 font-medium text-[var(--ms-text-primary)]">{t('top_counters')}</h2>
          <div className="space-y-2 rounded-lg border border-[var(--ms-border)] bg-white p-4 text-sm">
            {topCounters.length === 0 ? (
              <p className="text-[var(--ms-text-muted)]">{t('no_counts')}</p>
            ) : (
              topCounters.map((b) => (
                <div key={b.key} className="flex items-center justify-between">
                  <span className="truncate text-[var(--ms-text-primary)]">{b.label}</span>
                  <span className="text-[var(--ms-text-muted)] text-xs tabular-nums">
                    {b.count} · {fmtMoney(b.moneyMinor)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, dot }: { label: string; value: number; dot?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-[var(--ms-text-muted)]">
        {dot && <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />}
        {label}
      </span>
      <span className="font-medium text-[var(--ms-text-primary)] tabular-nums">{value}</span>
    </div>
  );
}
