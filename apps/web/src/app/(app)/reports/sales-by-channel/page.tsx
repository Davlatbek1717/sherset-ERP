'use client';

import { api } from '@/lib/api-client';
import {
  Breadcrumb,
  Button,
  Container,
  Input,
  PageHeader,
  buildCsv,
  csvTimestamp,
  downloadCsv,
  formatMoney,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface ChannelRow {
  channelId: string | null;
  channelName: string;
  channelType: string | null;
  orderCount: number;
  revenueMinor: string;
  qty: string;
  averageBasketMinor: string;
}

interface SalesByChannelResponse {
  from: string;
  to: string;
  totalRevenueMinor: string;
  totalOrderCount: number;
  rows: ChannelRow[];
  // moysklad parity (Tier-2): channel revenue consolidated into the account
  // base (валюта учёта); mixedCurrency flags multi-currency source periods.
  currency: string;
  mixedCurrency: boolean;
}

const INPUT_CLASS =
  'h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)] tabular-nums';

export default function SalesByChannelReport() {
  const t = useTranslations('pages.report_sales_by_channel');
  const tCommon = useTranslations('common');

  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const { data, isLoading, error, refetch } = useQuery<SalesByChannelResponse>({
    queryKey: ['report-sales-by-channel', from, to],
    queryFn: () =>
      api.get<SalesByChannelResponse>(`/reports/sales-by-channel?${params.toString()}`),
  });

  const exportCsv = () => {
    if (!data) return;
    const csv = buildCsv(
      [
        {
          header: t('col_channel'),
          cellText: (r: ChannelRow) => (r.channelId === null ? t('direct_label') : r.channelName),
        },
        { header: t('col_type'), cellText: (r: ChannelRow) => r.channelType ?? '' },
        { header: t('col_orders'), cellText: (r: ChannelRow) => String(r.orderCount) },
        { header: t('col_revenue'), cellText: (r: ChannelRow) => r.revenueMinor },
        { header: t('col_qty'), cellText: (r: ChannelRow) => r.qty },
        {
          header: t('col_avg_basket'),
          cellText: (r: ChannelRow) => r.averageBasketMinor,
        },
      ],
      data.rows,
    );
    downloadCsv(`sales-by-channel-${csvTimestamp()}.csv`, csv);
  };

  return (
    <Container size="md" className="py-4">
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
          data-test-id="channel-mixed-currency-warn"
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
                <th className="px-3 py-2 text-left">{t('col_channel')}</th>
                <th className="px-3 py-2 text-left">{t('col_type')}</th>
                <th className="px-3 py-2 text-right">{t('col_orders')}</th>
                <th className="px-3 py-2 text-right">{t('col_revenue')}</th>
                <th className="px-3 py-2 text-right">{t('col_qty')}</th>
                <th className="px-3 py-2 text-right">{t('col_avg_basket')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr
                  key={r.channelId ?? 'direct'}
                  className="border-[var(--ms-border-subtle)] border-t hover:bg-[var(--ms-bg-muted)]"
                >
                  <td className="px-3 py-2 font-medium">
                    {r.channelId === null ? t('direct_label') : r.channelName}
                  </td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)]">{r.channelType ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.orderCount}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatMoney(BigInt(r.revenueMinor), 'UZS')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.qty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(BigInt(r.averageBasketMinor), 'UZS')}
                  </td>
                </tr>
              ))}
              {data.rows.length > 0 && (
                <tr className="bg-[var(--ms-bg-muted)] font-semibold">
                  <td className="px-3 py-2">{t('row_total')}</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right tabular-nums">{data.totalOrderCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(BigInt(data.totalRevenueMinor), 'UZS')}
                  </td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
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
