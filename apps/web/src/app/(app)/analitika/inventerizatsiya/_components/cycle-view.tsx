'use client';

import { api } from '@/lib/api-client';
import { abcClassTone, inventoryPriorityTone } from '@/lib/domain-status-tone';
import { Badge, StickyHScroll } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { fmtMoney } from '../_lib/format';

interface CycleItem {
  productId: string;
  productCode: string | null;
  productName: string;
  groupName: string | null;
  abcClass: 'A' | 'B' | 'C';
  salesValueMinor: string;
  intervalDays: number;
  lastCountedAt: string | null;
  dueAt: string;
  overdueDays: number;
  priority: 'overdue' | 'due_today' | 'due_soon';
}

interface CycleResponse {
  total: number;
  overdue: number;
  dueToday: number;
  dueSoon: number;
  items: CycleItem[];
  windowFrom: string;
  windowTo: string;
}

function formatDate(iso: string | null, locale = 'ru-RU'): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function CycleView() {
  const t = useTranslations('pages.analitika_inventory');
  const { data, isLoading, isError, error } = useQuery<CycleResponse>({
    queryKey: ['analitika', 'cycle', 'today'],
    queryFn: () => api.get<CycleResponse>('/analitika/cycle/today'),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-[var(--ms-text-primary)] text-lg">{t('cycle_title')}</h2>
        <p className="mt-1 text-[var(--ms-text-muted)] text-sm">
          {t('cycle_subtitle', { days: 90 })}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label={t('cycle_kpi_total')} value={data?.total ?? 0} tone="default" />
        <Kpi label={t('cycle_kpi_overdue')} value={data?.overdue ?? 0} tone="red" />
        <Kpi label={t('cycle_kpi_due_today')} value={data?.dueToday ?? 0} tone="amber" />
        <Kpi label={t('cycle_kpi_due_soon')} value={data?.dueSoon ?? 0} tone="blue" />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--ms-border)] bg-white p-3 text-xs">
        <Badge tone={abcClassTone('A')}>{t('cycle_legend_a')}</Badge>
        <Badge tone={abcClassTone('B')}>{t('cycle_legend_b')}</Badge>
        <Badge tone={abcClassTone('C')}>{t('cycle_legend_c')}</Badge>
      </div>

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800 text-sm">
          {(error as Error)?.message ?? 'Error'}
        </div>
      )}

      {isLoading && (
        <div className="rounded-lg border border-[var(--ms-border)] bg-white p-6 text-center text-[var(--ms-text-muted)] text-sm">
          …
        </div>
      )}

      {data && data.items.length === 0 && !isLoading && (
        <div className="rounded-lg border border-[var(--ms-border)] border-dashed bg-white p-8 text-center text-[var(--ms-text-muted)] text-sm">
          {t('cycle_empty')}
        </div>
      )}

      {data && data.items.length > 0 && (
        <StickyHScroll className="rounded-lg border border-[var(--ms-border)] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-subtle)] text-[var(--ms-text-muted)] text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">{t('cycle_col_priority')}</th>
                <th className="px-3 py-2 text-left font-semibold">{t('cycle_col_product')}</th>
                <th className="px-3 py-2 text-left font-semibold">{t('cycle_col_group')}</th>
                <th className="px-3 py-2 text-center font-semibold">{t('cycle_col_class')}</th>
                <th className="px-3 py-2 text-center font-semibold">{t('cycle_col_interval')}</th>
                <th className="px-3 py-2 text-left font-semibold">{t('cycle_col_last')}</th>
                <th className="px-3 py-2 text-left font-semibold">{t('cycle_col_due')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('cycle_col_overdue')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('cycle_col_sales')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('cycle_col_action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ms-border)]">
              {data.items.map((it) => (
                <tr key={it.productId} className="hover:bg-[var(--ms-bg-subtle)]/40">
                  <td className="px-3 py-2">
                    <Badge tone={inventoryPriorityTone(it.priority)}>
                      {t(`cycle_priority_${it.priority}`)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-[var(--ms-text-primary)]">
                      {it.productName}
                    </div>
                    {it.productCode && (
                      <div className="font-mono text-[10px] text-[var(--ms-text-muted)]">
                        {it.productCode}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                    {it.groupName ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Badge tone={abcClassTone(it.abcClass)}>{it.abcClass}</Badge>
                  </td>
                  <td className="px-3 py-2 text-center text-[var(--ms-text-muted)] text-xs">
                    {t('cycle_days_short', { n: it.intervalDays })}
                  </td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                    {it.lastCountedAt ? formatDate(it.lastCountedAt) : t('cycle_never_counted')}
                  </td>
                  <td className="px-3 py-2 text-xs">{formatDate(it.dueAt)}</td>
                  <td className="px-3 py-2 text-right">
                    {it.overdueDays > 0 ? (
                      <span className="font-semibold text-red-600 tabular-nums">
                        {t('cycle_days_short', { n: it.overdueDays })}
                      </span>
                    ) : (
                      <span className="text-[var(--ms-text-muted)] text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">
                    {fmtMoney(it.salesValueMinor)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/analitika/inventerizatsiya/count?productId=${it.productId}`}
                      className="rounded border border-[var(--ms-border)] bg-white px-2 py-1 font-medium text-[var(--ms-text-brand)] text-xs hover:bg-[var(--ms-bg-subtle)]"
                    >
                      {t('cycle_count_now')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </StickyHScroll>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'default' | 'red' | 'amber' | 'blue';
}) {
  const toneClass = {
    default: 'text-[var(--ms-text-primary)]',
    red: 'text-[var(--ms-text-destructive)]',
    amber: 'text-[var(--ms-text-warning)]',
    blue: 'text-[var(--ms-info-700)]',
  }[tone];
  return (
    <div className="rounded-lg border border-[var(--ms-border)] bg-white p-3">
      <div className="text-[var(--ms-text-muted)] text-xs">{label}</div>
      <div className={`mt-1 font-bold text-2xl tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}
