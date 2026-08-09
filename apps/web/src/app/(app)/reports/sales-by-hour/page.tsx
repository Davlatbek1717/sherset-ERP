'use client';

import { type UnconvertedAmountRow, UnconvertedNotice } from '@/components/reports/report-notices';

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

interface HourRow {
  hour: number;
  orderCount: number;
  revenueMinor: string;
  qty: string;
}

interface SalesByHourResponse {
  from: string;
  to: string;
  timezone: string;
  rows: HourRow[];
  peakHour: number | null;
  // moysklad parity (Tier-2): hourly revenue consolidated into the account
  // base (валюта учёта); mixedCurrency flags multi-currency source periods.
  currency: string;
  mixedCurrency: boolean;
  unconvertedByCurrency: UnconvertedAmountRow[];
}

const INPUT_CLASS =
  'h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)] tabular-nums';

export default function SalesByHourReport() {
  const t = useTranslations('pages.report_sales_by_hour');
  const tCommon = useTranslations('common');

  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const { data, isLoading, error, refetch } = useQuery<SalesByHourResponse>({
    queryKey: ['report-sales-by-hour', from, to],
    queryFn: () => api.get<SalesByHourResponse>(`/reports/sales-by-hour?${params.toString()}`),
  });

  const exportCsv = () => {
    if (!data) return;
    const csv = buildCsv(
      [
        { header: t('col_hour'), cellText: (r: HourRow) => `${r.hour}:00` },
        { header: t('col_orders'), cellText: (r: HourRow) => String(r.orderCount) },
        { header: t('col_revenue'), cellText: (r: HourRow) => r.revenueMinor },
        { header: t('col_qty'), cellText: (r: HourRow) => r.qty },
      ],
      data.rows,
    );
    downloadCsv(`sales-by-hour-${csvTimestamp()}.csv`, csv);
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
          data-test-id="hour-mixed-currency-warn"
        >
          {t('currency_mixed_warn')}
        </div>
      )}
      <UnconvertedNotice rows={data?.unconvertedByCurrency} testId="hour-unconverted-warn" />

      {error && (
        <div className="mb-3 rounded border border-[var(--ms-destructive-200)] bg-[var(--ms-destructive-50)] p-3 text-[var(--ms-text-destructive)] text-sm">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <>
          <div className="mb-3 text-[var(--ms-text-muted)] text-sm">
            {t('peak_hour')}: {data.peakHour === null ? '—' : `${data.peakHour}:00`}
          </div>
          <div className="overflow-auto rounded border border-[var(--ms-border-default)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--ms-bg-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left">{t('col_hour')}</th>
                  <th className="px-3 py-2 text-right">{t('col_orders')}</th>
                  <th className="px-3 py-2 text-right">{t('col_revenue')}</th>
                  <th className="px-3 py-2 text-right">{t('col_qty')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr
                    key={r.hour}
                    className="border-[var(--ms-border-subtle)] border-t hover:bg-[var(--ms-bg-muted)]"
                  >
                    <td className="px-3 py-2 font-medium tabular-nums">{`${r.hour}:00`}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.orderCount}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatMoney(BigInt(r.revenueMinor), 'UZS')}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.qty}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-[var(--ms-text-muted)] text-sm">
                      {t('empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Container>
  );
}
