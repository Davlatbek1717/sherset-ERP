'use client';

/**
 * HR Reports — period selector + metric toggle (sales | messages) + BarChart
 * (daily series) + top-counterparty PieChart. Money rendered in so'm; counts
 * raw. Recharts BarChart/PieChart.
 */

import { type HrReport, type HrReportMetric, hrReportsApi } from '@/lib/hr-api';
import { Button, EmptyState, Input, Skeleton } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const TZ = 'Asia/Tashkent';
const PIE_COLORS = ['#9fcf6a', '#6aa9cf', '#cf9f6a', '#cf6a9f', '#9f6acf'];

/** so'm display: value is tiyin (sales) or raw count (messages). */
function toDisplay(value: string, metric: HrReportMetric): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return metric === 'sales' ? Math.round(n / 100) : n;
}

export default function HrReportsPage() {
  const t = useTranslations('pages.hrReports');

  const today = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
  const weekAgo = formatInTimeZone(
    new Date(Date.now() - 29 * 24 * 60 * 60 * 1000),
    TZ,
    'yyyy-MM-dd',
  );
  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo, setDateTo] = useState(today);
  const [metric, setMetric] = useState<HrReportMetric>('sales');

  const query = useQuery<HrReport>({
    queryKey: ['hr-reports', dateFrom, dateTo, metric],
    queryFn: () => hrReportsApi.report(dateFrom, dateTo, metric),
  });

  const barData = useMemo(
    () =>
      (query.data?.series ?? []).map((p) => ({
        date: p.date.slice(5),
        value: toDisplay(p.value, metric),
      })),
    [query.data, metric],
  );
  const pieData = useMemo(
    () =>
      (query.data?.topCounterparties ?? []).map((c) => ({
        name: c.name,
        value: toDisplay(c.value, metric),
      })),
    [query.data, metric],
  );

  return (
    <div className="space-y-4">
      <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="hr-rep-from" className="text-[var(--ms-text-muted)] text-xs">
            {t('date_from')}
          </label>
          <Input
            id="hr-rep-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-auto"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="hr-rep-to" className="text-[var(--ms-text-muted)] text-xs">
            {t('date_to')}
          </label>
          <Input
            id="hr-rep-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-auto"
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={metric === 'sales' ? 'primary' : 'secondary'}
            onClick={() => setMetric('sales')}
            data-test-id="hr-reports-metric-sales"
          >
            {t('metric_sales')}
          </Button>
          <Button
            size="sm"
            variant={metric === 'messages' ? 'primary' : 'secondary'}
            onClick={() => setMetric('messages')}
            data-test-id="hr-reports-metric-messages"
          >
            {t('metric_messages')}
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-96" />
      ) : query.data?.series.some((s) => Number(s.value) > 0) ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-[var(--ms-radius-lg)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4 lg:col-span-2">
            <div className="mb-3 font-medium text-[var(--ms-text-strong)] text-sm">
              {t('daily_chart')}
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ms-border-default)" />
                  <XAxis dataKey="date" fontSize={11} stroke="var(--ms-text-muted)" />
                  <YAxis allowDecimals={false} fontSize={11} stroke="var(--ms-text-muted)" />
                  <Tooltip />
                  <Bar dataKey="value" fill="#9fcf6a" stroke="#6fa83f" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-[var(--ms-radius-lg)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
            <div className="mb-3 font-medium text-[var(--ms-text-strong)] text-sm">
              {t('top_counterparties')}
            </div>
            {pieData.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={(e: { name?: string }) => e.name ?? ''}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-[var(--ms-text-muted)] text-sm">{t('top_empty')}</div>
            )}
          </div>
        </div>
      ) : (
        <EmptyState title={t('empty')} description={t('empty_hint')} />
      )}
    </div>
  );
}
