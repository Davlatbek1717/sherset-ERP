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

type GroupBy =
  | 'none'
  | 'day'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'counterparty'
  | 'organization'
  | 'store'
  | 'product'
  | 'owner';

interface ReportRow {
  key: string;
  label: string;
  salesCount: number;
  returnsCount: number;
  sumMinor: string;
  returnsSumMinor: string;
  netSumMinor: string;
  vatSumMinor: string;
  costSumMinor: string;
  profitMinor: string;
  ref?: { id: string; name: string } | null;
}

interface SalesReport {
  filter: {
    dateFrom: string;
    dateTo: string;
    groupBy: GroupBy;
  };
  totals: ReportRow;
  groups: ReportRow[];
  // moysklad parity (Tier-2): revenue consolidated into the account base
  // (валюта учёта); mixedCurrency flags multi-currency source periods.
  currency: string;
  mixedCurrency: boolean;
}

const SELECT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)]';

const INPUT_CLASS =
  'w-full h-9 px-3 text-sm bg-[var(--ms-bg-surface)] border border-[var(--ms-border-default)] rounded-[var(--ms-radius-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1 hover:border-[var(--ms-border-strong)] tabular-nums';

const GROUPS: GroupBy[] = [
  'none',
  'day',
  'week',
  'month',
  'quarter',
  'year',
  'counterparty',
  'organization',
  'store',
  'product',
  'owner',
];

function defaultDateFrom(): string {
  // First day of current year
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}

function defaultDateTo(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function SalesReportPage() {
  const t = useTranslations('pages.report_sales');
  const tParent = useTranslations('pages.reports');

  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const [appliedFilter, setAppliedFilter] = useState({
    dateFrom: dateFrom,
    dateTo: dateTo,
    groupBy: groupBy,
  });

  const { data, isLoading, error, refetch } = useQuery<SalesReport>({
    queryKey: ['report-sales', appliedFilter],
    queryFn: () => {
      const qs = new URLSearchParams({
        dateFrom: appliedFilter.dateFrom,
        dateTo: appliedFilter.dateTo,
        groupBy: appliedFilter.groupBy,
      });
      return api.get<SalesReport>(`/reports/sales?${qs.toString()}`);
    },
  });

  const apply = () => {
    setAppliedFilter({ dateFrom, dateTo, groupBy });
  };

  const exportCsv = () => {
    if (!data) return;
    const rows: ReportRow[] = [...data.groups, data.totals];
    const csv = buildCsv<ReportRow>(
      [
        { header: t('label'), cellText: (r) => r.label },
        { header: t('sales_count'), cellText: (r) => String(r.salesCount) },
        { header: t('returns_count'), cellText: (r) => String(r.returnsCount) },
        { header: t('sales_sum'), cellText: (r) => formatMoney(BigInt(r.sumMinor), 'UZS') },
        {
          header: t('returns_sum'),
          cellText: (r) => formatMoney(BigInt(r.returnsSumMinor), 'UZS'),
        },
        { header: t('net_sum'), cellText: (r) => formatMoney(BigInt(r.netSumMinor), 'UZS') },
        { header: t('vat_sum'), cellText: (r) => formatMoney(BigInt(r.vatSumMinor), 'UZS') },
        { header: t('cost_sum'), cellText: (r) => formatMoney(BigInt(r.costSumMinor), 'UZS') },
        { header: t('profit'), cellText: (r) => formatMoney(BigInt(r.profitMinor), 'UZS') },
      ],
      rows,
    );
    downloadCsv(csv, `sales-report-${csvTimestamp()}.csv`);
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
              htmlFor="sales-date-from"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('date_from')}
            </label>
            <Input
              id="sales-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={INPUT_CLASS}
              data-test-id="filter-date-from"
            />
          </div>
          <div>
            <label
              htmlFor="sales-date-to"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('date_to')}
            </label>
            <Input
              id="sales-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={INPUT_CLASS}
              data-test-id="filter-date-to"
            />
          </div>
          <div>
            <label
              htmlFor="sales-group-by"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('group_by')}
            </label>
            <NativeSelect
              id="sales-group-by"
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

      {data?.mixedCurrency && (
        <div
          className="mt-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-warning,#d97706)] bg-[var(--ms-bg-warning,#fffbeb)] px-3 py-1.5 text-[var(--ms-text-warning,#92400e)] text-xs"
          data-test-id="sales-mixed-currency-warn"
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
                <th className="h-9 w-24 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('sales_count')}
                </th>
                <th className="h-9 w-24 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('returns_count')}
                </th>
                <th className="h-9 w-36 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('sales_sum')}
                </th>
                <th className="h-9 w-36 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('returns_sum')}
                </th>
                <th className="h-9 w-36 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('net_sum')}
                </th>
                <th className="h-9 w-32 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('vat_sum')}
                </th>
                <th className="h-9 w-32 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('cost_sum')}
                </th>
                <th className="h-9 w-32 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('profit')}
                </th>
              </tr>
            </thead>
            <tbody data-test-id="report-rows">
              {data.groups.length === 0 && data.totals.salesCount === 0 ? (
                <tr>
                  <td
                    colSpan={9}
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
                      <td className="px-3 py-2 text-right tabular-nums">{row.salesCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.returnsCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(BigInt(row.sumMinor), 'UZS')}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(BigInt(row.returnsSumMinor), 'UZS')}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatMoney(BigInt(row.netSumMinor), 'UZS')}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(BigInt(row.vatSumMinor), 'UZS')}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(BigInt(row.costSumMinor), 'UZS')}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatMoney(BigInt(row.profitMinor), 'UZS')}
                      </td>
                    </tr>
                  ))}
                  <tr
                    className="border-[var(--ms-border-strong)] border-t-2 bg-[var(--ms-bg-muted)]"
                    data-test-id="row-totals"
                  >
                    <td className="px-3 py-2 font-semibold">{t('totals_row')}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {data.totals.salesCount}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {data.totals.returnsCount}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatMoney(BigInt(data.totals.sumMinor), 'UZS')}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatMoney(BigInt(data.totals.returnsSumMinor), 'UZS')}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatMoney(BigInt(data.totals.netSumMinor), 'UZS')}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatMoney(BigInt(data.totals.vatSumMinor), 'UZS')}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatMoney(BigInt(data.totals.costSumMinor), 'UZS')}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatMoney(BigInt(data.totals.profitMinor), 'UZS')}
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
