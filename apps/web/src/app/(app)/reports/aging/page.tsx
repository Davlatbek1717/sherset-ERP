'use client';

import { type UnconvertedAmountRow, UnconvertedNotice } from '@/components/reports/report-notices';

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
  formatIso,
  formatMoney,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type Side = 'receivables' | 'payables';

interface AgingBucket {
  key: string;
  fromDays: number;
  toDays: number | null;
  amountMinor: string;
  invoiceCount: number;
}

interface AgingRow {
  counterpartyId: string;
  counterpartyName: string;
  totalMinor: string;
  buckets: AgingBucket[];
  oldestDays: number;
}

/**
 * Mirrors the API's response (apps/api/src/modules/report/aging.service.ts)
 * EXACTLY. The page originally declared an imagined `{filter, buckets, totals}`
 * wrapper — `data.buckets`/`data.totals` were always undefined, so the report
 * WHITE-SCREENED once data arrived (abc-analysis contract-drift sibling, found
 * by the 2026-06-10 report-module contract sweep). `totalsByBucket` carries the
 * full bucket definitions + per-bucket totals; the grand totals are derived
 * client-side. Locked by abc-report-contract.test.ts.
 */
interface AgingReport {
  side: Side;
  asOf: string;
  bucketLabels: string[];
  totalsByBucket: AgingBucket[];
  rows: AgingRow[];
  // moysklad parity (Tier-2): debt amounts consolidated into the account
  // base (валюта учёта); mixedCurrency flags multi-currency source data.
  currency: string;
  mixedCurrency: boolean;
  unconvertedByCurrency: UnconvertedAmountRow[];
}

const INPUT_CLASS =
  'h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)] tabular-nums';

const SELECT_CLASS = INPUT_CLASS;

function bucketLabel(b: AgingBucket): string {
  if (b.toDays === null) return `${b.fromDays}+`;
  return `${b.fromDays}–${b.toDays}`;
}

export default function AgingReport() {
  const t = useTranslations('pages.report_aging');
  const tCommon = useTranslations('common');

  const [side, setSide] = useState<Side>('receivables');
  const [asOf, setAsOf] = useState<string>(() => formatIso(new Date()));

  const params = new URLSearchParams({ side, asOf });

  const { data, isLoading, error, refetch } = useQuery<AgingReport>({
    queryKey: ['report-aging', side, asOf],
    queryFn: () => api.get<AgingReport>(`/reports/aging?${params.toString()}`),
  });

  // Bucket definitions + per-bucket totals come as ONE array; grand totals
  // are sums over it (the API sends no pre-aggregated totals object).
  const buckets = data?.totalsByBucket ?? [];
  const grandTotalMinor = buckets.reduce((acc, b) => acc + BigInt(b.amountMinor), 0n);
  const grandInvoiceCount = buckets.reduce((acc, b) => acc + b.invoiceCount, 0);

  const exportCsv = () => {
    if (!data) return;
    const bucketCols = buckets.map((b) => ({
      header: bucketLabel(b),
      cellText: (r: AgingRow) => r.buckets.find((rb) => rb.key === b.key)?.amountMinor ?? '0',
    }));
    const csv = buildCsv(
      [
        { header: t('col_counterparty'), cellText: (r: AgingRow) => r.counterpartyName },
        { header: t('col_total'), cellText: (r: AgingRow) => r.totalMinor },
        ...bucketCols,
        { header: t('col_oldest'), cellText: (r: AgingRow) => String(r.oldestDays) },
      ],
      data.rows,
    );
    downloadCsv(`aging-${side}-${csvTimestamp()}.csv`, csv);
  };

  return (
    <Container size="md" className="py-4">
      <Breadcrumb
        items={[{ label: tCommon('reports'), href: '/reports' }, { label: t('title') }]}
      />
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('field_side')}</div>
          <NativeSelect
            value={side}
            onChange={(e) => setSide(e.target.value as Side)}
            className={SELECT_CLASS}
          >
            <option value="receivables">{t('side_receivables')}</option>
            <option value="payables">{t('side_payables')}</option>
          </NativeSelect>
        </div>
        <div>
          <div className="mb-1 text-[var(--ms-text-muted)] text-xs">{t('field_as_of')}</div>
          <Input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
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
          data-test-id="aging-mixed-currency-warn"
        >
          {t('currency_mixed_warn')}
        </div>
      )}
      <UnconvertedNotice rows={data?.unconvertedByCurrency} testId="aging-unconverted-warn" />

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
                <th className="px-3 py-2 text-left">{t('col_counterparty')}</th>
                <th className="px-3 py-2 text-right">{t('col_total')}</th>
                {buckets.map((b) => (
                  <th key={b.key} className="px-3 py-2 text-right">
                    {bucketLabel(b)}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">{t('col_oldest')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr
                  key={r.counterpartyId}
                  className="border-[var(--ms-border-subtle)] border-t hover:bg-[var(--ms-bg-muted)]"
                >
                  <td className="px-3 py-2 font-medium">{r.counterpartyName}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatMoney(BigInt(r.totalMinor), 'UZS')}
                  </td>
                  {buckets.map((b) => {
                    const cell = r.buckets.find((rb) => rb.key === b.key);
                    const amount = cell?.amountMinor ?? '0';
                    const isZero = amount === '0';
                    return (
                      <td
                        key={b.key}
                        className={`px-3 py-2 text-right tabular-nums ${
                          isZero ? 'text-[var(--ms-text-muted)]' : ''
                        }`}
                      >
                        {isZero ? '—' : formatMoney(BigInt(amount), 'UZS')}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right text-[var(--ms-text-muted)] tabular-nums">
                    {r.oldestDays} {t('days_short')}
                  </td>
                </tr>
              ))}
              {data.rows.length > 0 && (
                <tr className="bg-[var(--ms-bg-muted)] font-semibold">
                  <td className="px-3 py-2">{t('row_total')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(grandTotalMinor, 'UZS')}
                  </td>
                  {buckets.map((b) => (
                    <td key={b.key} className="px-3 py-2 text-right tabular-nums">
                      {b.amountMinor === '0' ? '—' : formatMoney(BigInt(b.amountMinor), 'UZS')}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right text-[var(--ms-text-muted)]">
                    {grandInvoiceCount} {t('invoices_short')}
                  </td>
                </tr>
              )}
              {data.rows.length === 0 && !isLoading && (
                <tr>
                  <td
                    colSpan={2 + buckets.length + 1}
                    className="p-6 text-center text-[var(--ms-text-muted)] text-sm"
                  >
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
