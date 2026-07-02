'use client';

import { api } from '@/lib/api-client';
import {
  Breadcrumb,
  Button,
  Container,
  Icons,
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

type GroupBy = 'none' | 'day' | 'week' | 'month' | 'quarter' | 'year';

interface PnlRow {
  key: string;
  label: string;
  revenueMinor: string;
  cogsMinor: string;
  grossProfitMinor: string;
  expensesMinor: string;
  netProfitMinor: string;
  marginPercent: string;
}

interface PnlReport {
  filter: { dateFrom: string; dateTo: string; groupBy: GroupBy };
  totals: PnlRow;
  groups: PnlRow[];
  // moysklad parity (Tier-2): backend consolidates document-currency figures
  // into the account base (валюта учёта) and flags mixed-currency periods.
  currency: string;
  mixedCurrency: boolean;
}

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

const INPUT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)] tabular-nums';

const GROUPS: GroupBy[] = ['none', 'day', 'week', 'month', 'quarter', 'year'];

function defaultDateFrom(): string {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}

function defaultDateTo(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function PnlReportPage() {
  const t = useTranslations('pages.report_pnl');
  const tParent = useTranslations('pages.reports');

  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const [appliedFilter, setAppliedFilter] = useState({ dateFrom, dateTo, groupBy });

  const { data, isLoading, error, refetch } = useQuery<PnlReport>({
    queryKey: ['report-pnl', appliedFilter],
    queryFn: () => {
      const qs = new URLSearchParams({
        dateFrom: appliedFilter.dateFrom,
        dateTo: appliedFilter.dateTo,
        groupBy: appliedFilter.groupBy,
      });
      return api.get<PnlReport>(`/reports/pnl?${qs.toString()}`);
    },
  });

  const apply = () => setAppliedFilter({ dateFrom, dateTo, groupBy });

  const exportCsv = () => {
    if (!data) return;
    const rows: PnlRow[] = [...data.groups, data.totals];
    const csv = buildCsv<PnlRow>(
      [
        { header: t('label'), cellText: (r) => r.label },
        { header: t('revenue'), cellText: (r) => formatMoney(BigInt(r.revenueMinor), 'UZS') },
        { header: t('cogs'), cellText: (r) => formatMoney(BigInt(r.cogsMinor), 'UZS') },
        {
          header: t('gross_profit'),
          cellText: (r) => formatMoney(BigInt(r.grossProfitMinor), 'UZS'),
        },
        { header: t('expenses'), cellText: (r) => formatMoney(BigInt(r.expensesMinor), 'UZS') },
        { header: t('net_profit'), cellText: (r) => formatMoney(BigInt(r.netProfitMinor), 'UZS') },
        { header: t('margin'), cellText: (r) => (r.marginPercent ? `${r.marginPercent}%` : '—') },
      ],
      rows,
    );
    downloadCsv(csv, `pnl-report-${csvTimestamp()}.csv`);
  };

  const profitClassName = (minorStr: string): string => {
    const v = BigInt(minorStr);
    if (v > 0n) return 'text-[var(--ms-text-success,#15803d)] font-medium';
    if (v < 0n) return 'text-[var(--ms-text-destructive)] font-medium';
    return 'text-[var(--ms-text-muted)]';
  };

  return (
    <Container size="md" className="py-4">
      <PageHeader
        title={t('title')}
        breadcrumbs={
          <Breadcrumb
            items={[{ label: tParent('title'), href: '/reports' }, { label: t('title') }]}
          />
        }
        actions={
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!data}>
            <Icons.download className="h-4 w-4" />
            {t('export_csv')}
          </Button>
        }
      />

      <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-4" data-test-id="filter-bar">
          <div>
            <label
              htmlFor="pnl-date-from"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('date_from')}
            </label>
            <Input
              id="pnl-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={INPUT_CLASS}
              data-test-id="filter-date-from"
            />
          </div>
          <div>
            <label
              htmlFor="pnl-date-to"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('date_to')}
            </label>
            <Input
              id="pnl-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={INPUT_CLASS}
              data-test-id="filter-date-to"
            />
          </div>
          <div>
            <label
              htmlFor="pnl-group-by"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('group_by')}
            </label>
            <NativeSelect
              id="pnl-group-by"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              className={SELECT_CLASS}
              data-test-id="filter-group-by"
            >
              {GROUPS.map((g) => (
                <option key={g} value={g}>
                  {t(`groups.${g}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button onClick={apply} loading={isLoading} data-test-id="apply-button">
            {t('apply')}
          </Button>
        </div>
      </div>

      <div className="mt-2 space-y-1 text-[var(--ms-text-muted)] text-xs italic">
        <div>{t('formula_note')}</div>
      </div>
      {data?.mixedCurrency && (
        <div
          className="mt-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-warning,#d97706)] bg-[var(--ms-bg-warning,#fffbeb)] px-3 py-1.5 text-[var(--ms-text-warning,#92400e)] text-xs"
          data-test-id="pnl-mixed-currency-warn"
        >
          {t('currency_mixed_warn')}
        </div>
      )}

      {error && (
        <div
          className="mt-4 rounded border border-[var(--ms-border-destructive,#fecaca)] bg-[var(--ms-bg-destructive-soft,#fef2f2)] px-3 py-2 text-[var(--ms-text-destructive)] text-sm"
          role="alert"
        >
          {(error as Error).message}
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="ml-2">
            ↻
          </Button>
        </div>
      )}

      {data && (
        <div className="mt-4 overflow-x-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-muted)]">
              <tr>
                <th className="h-9 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('label')}
                </th>
                <th className="h-9 w-40 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('revenue')}
                </th>
                <th className="h-9 w-40 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('cogs')}
                </th>
                <th className="h-9 w-40 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('gross_profit')}
                </th>
                <th className="h-9 w-40 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('expenses')}
                </th>
                <th className="h-9 w-40 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('net_profit')}
                </th>
                <th className="h-9 w-24 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('margin')}
                </th>
              </tr>
            </thead>
            <tbody data-test-id="report-rows">
              {data.groups.length === 0 &&
              BigInt(data.totals.revenueMinor) === 0n &&
              BigInt(data.totals.expensesMinor) === 0n ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-12 text-center text-[var(--ms-text-muted)] text-sm"
                    data-test-id="report-empty"
                  >
                    {t('empty_state')}
                  </td>
                </tr>
              ) : (
                <>
                  {data.groups.map((row) => (
                    <tr
                      key={row.key}
                      className="border-[var(--ms-border-default)] border-t"
                      data-test-id={`row-${row.key}`}
                    >
                      <td className="px-3 py-2 font-medium">{row.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(BigInt(row.revenueMinor), 'UZS')}
                      </td>
                      <td className="px-3 py-2 text-right text-[var(--ms-text-muted)] tabular-nums">
                        {formatMoney(BigInt(row.cogsMinor), 'UZS')}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${profitClassName(row.grossProfitMinor)}`}
                      >
                        {formatMoney(BigInt(row.grossProfitMinor), 'UZS')}
                      </td>
                      <td className="px-3 py-2 text-right text-[var(--ms-text-muted)] tabular-nums">
                        {formatMoney(BigInt(row.expensesMinor), 'UZS')}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${profitClassName(row.netProfitMinor)}`}
                      >
                        {formatMoney(BigInt(row.netProfitMinor), 'UZS')}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.marginPercent ? `${row.marginPercent}%` : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr
                    className="border-[var(--ms-border-strong)] border-t-2 bg-[var(--ms-bg-muted)]"
                    data-test-id="row-totals"
                  >
                    <td className="px-3 py-2 font-semibold">{t('totals_row')}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatMoney(BigInt(data.totals.revenueMinor), 'UZS')}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-[var(--ms-text-muted)] tabular-nums">
                      {formatMoney(BigInt(data.totals.cogsMinor), 'UZS')}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-semibold tabular-nums ${profitClassName(data.totals.grossProfitMinor)}`}
                    >
                      {formatMoney(BigInt(data.totals.grossProfitMinor), 'UZS')}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-[var(--ms-text-muted)] tabular-nums">
                      {formatMoney(BigInt(data.totals.expensesMinor), 'UZS')}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-semibold tabular-nums ${profitClassName(data.totals.netProfitMinor)}`}
                    >
                      {formatMoney(BigInt(data.totals.netProfitMinor), 'UZS')}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {data.totals.marginPercent ? `${data.totals.marginPercent}%` : '—'}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
