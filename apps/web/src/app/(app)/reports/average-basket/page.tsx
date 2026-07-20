'use client';

import { api } from '@/lib/api-client';
import {
  Breadcrumb,
  Button,
  Container,
  Input,
  NativeSelect,
  PageHeader,
  buildCsv,
  csvTimestamp,
  downloadCsv,
  formatMoney,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type Granularity = 'day' | 'week' | 'month';

interface BasketRow {
  bucket: string;
  orderCount: number;
  revenueMinor: string;
  averageBasketMinor: string;
  totalQty: string;
  averageItemsPerOrder: number;
}

interface AverageBasketResponse {
  from: string;
  to: string;
  granularity: Granularity;
  totals: {
    orderCount: number;
    revenueMinor: string;
    averageBasketMinor: string;
    totalQty: string;
    averageItemsPerOrder: number;
  };
  rows: BasketRow[];
  // moysklad parity (Tier-2): revenue/basket consolidated into the account
  // base (валюта учёта); mixedCurrency flags multi-currency source periods.
  currency: string;
  mixedCurrency: boolean;
}

const INPUT_CLASS =
  'h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)] tabular-nums';

const SELECT_CLASS = INPUT_CLASS;

export default function AverageBasketReport() {
  const t = useTranslations('pages.report_average_basket');
  const tCommon = useTranslations('common');

  const [granularity, setGranularity] = useState<Granularity>('day');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  const params = new URLSearchParams({ granularity });
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const { data, isLoading, error, refetch } = useQuery<AverageBasketResponse>({
    queryKey: ['report-average-basket', granularity, from, to],
    queryFn: () => api.get<AverageBasketResponse>(`/reports/average-basket?${params.toString()}`),
  });

  const exportCsv = () => {
    if (!data) return;
    const csv = buildCsv(
      [
        { header: t('col_bucket'), cellText: (r: BasketRow) => r.bucket.slice(0, 10) },
        { header: t('col_orders'), cellText: (r: BasketRow) => String(r.orderCount) },
        { header: t('col_revenue'), cellText: (r: BasketRow) => r.revenueMinor },
        {
          header: t('col_avg_basket'),
          cellText: (r: BasketRow) => r.averageBasketMinor,
        },
        { header: t('col_total_qty'), cellText: (r: BasketRow) => r.totalQty },
        {
          header: t('col_avg_items'),
          cellText: (r: BasketRow) => r.averageItemsPerOrder.toFixed(2),
        },
      ],
      data.rows,
    );
    downloadCsv(`average-basket-${csvTimestamp()}.csv`, csv);
  };

  return (
    <Container size="full" className="py-4">
      <Breadcrumb
        items={[{ label: tCommon('reports'), href: '/reports' }, { label: t('title') }]}
      />
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('field_from')}</div>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('field_to')}</div>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('field_granularity')}</div>
          <NativeSelect
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as Granularity)}
            className={SELECT_CLASS}
          >
            <option value="day">{t('gran_day')}</option>
            <option value="week">{t('gran_week')}</option>
            <option value="month">{t('gran_month')}</option>
          </NativeSelect>
        </div>
        <Button type="button" variant="primary" onClick={() => refetch()} loading={isLoading}>
          {tCommon('apply')}
        </Button>
        <Button type="button" variant="tertiary" onClick={exportCsv} disabled={!data}>
          {tCommon('export_csv')}
        </Button>
      </div>

      {data?.mixedCurrency && (
        <div
          className="mb-3 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-warning,#d97706)] bg-[var(--ms-bg-warning,#fffbeb)] px-3 py-1.5 text-[var(--ms-text-warning,#92400e)] text-xs"
          data-test-id="basket-mixed-currency-warn"
        >
          {t('currency_mixed_warn')}
        </div>
      )}

      {error && (
        <div className="mb-3 rounded border border-[var(--ms-destructive-200)] bg-[var(--ms-destructive-50)] p-3 text-[var(--ms-text-destructive)] text-sm">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <div className="overflow-auto rounded border border-[var(--ms-border-default)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-muted)]">
              <tr>
                <th className="px-3 py-2 text-left">{t('col_bucket')}</th>
                <th className="px-3 py-2 text-right">{t('col_orders')}</th>
                <th className="px-3 py-2 text-right">{t('col_revenue')}</th>
                <th className="px-3 py-2 text-right">{t('col_avg_basket')}</th>
                <th className="px-3 py-2 text-right">{t('col_total_qty')}</th>
                <th className="px-3 py-2 text-right">{t('col_avg_items')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr
                  key={r.bucket}
                  className="border-[var(--ms-border-subtle)] border-t hover:bg-[var(--ms-bg-muted)]"
                >
                  <td className="px-3 py-2 font-medium tabular-nums">{r.bucket.slice(0, 10)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.orderCount}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatMoney(BigInt(r.revenueMinor), 'UZS')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(BigInt(r.averageBasketMinor), 'UZS')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.totalQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.averageItemsPerOrder.toFixed(2)}
                  </td>
                </tr>
              ))}
              {data.rows.length > 0 && (
                <tr className="bg-[var(--ms-bg-muted)] font-semibold">
                  <td className="px-3 py-2">{t('row_total')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{data.totals.orderCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(BigInt(data.totals.revenueMinor), 'UZS')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(BigInt(data.totals.averageBasketMinor), 'UZS')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{data.totals.totalQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {data.totals.averageItemsPerOrder.toFixed(2)}
                  </td>
                </tr>
              )}
              {data.rows.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-[var(--ms-text-muted)] text-sm">
                    {t('empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
