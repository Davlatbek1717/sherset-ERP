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
  StickyHScroll,
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
  | 'channel';

type Channel = 'cash_in' | 'cash_out' | 'payment_in' | 'payment_out';

interface CashFlowRow {
  key: string;
  label: string;
  inflowCount: number;
  inflowSumMinor: string;
  outflowCount: number;
  outflowSumMinor: string;
  netSumMinor: string;
  ref?: { id: string; name: string } | null;
}

interface CashFlowReport {
  filter: { dateFrom: string; dateTo: string; groupBy: GroupBy };
  totals: CashFlowRow;
  groups: CashFlowRow[];
  currency: string;
  mixedCurrency?: boolean;
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
  'channel',
];

const CHANNELS: Channel[] = ['cash_in', 'cash_out', 'payment_in', 'payment_out'];

interface OrgRef {
  id: string;
  name: string;
}

function defaultDateFrom(): string {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}

function defaultDateTo(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function CashFlowReportPage() {
  const t = useTranslations('pages.report_cash_flow');
  const tParent = useTranslations('pages.reports');

  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const [channel, setChannel] = useState<'' | Channel>('');
  const [organizationId, setOrganizationId] = useState<string>('');
  const [appliedFilter, setAppliedFilter] = useState({
    dateFrom,
    dateTo,
    groupBy,
    channel,
    organizationId,
  });

  const { data: orgs } = useQuery<{ items: OrgRef[] }>({
    queryKey: ['organizations-active'],
    queryFn: () => api.get<{ items: OrgRef[] }>('/organizations?limit=50'),
  });

  const { data, isLoading, error, refetch } = useQuery<CashFlowReport>({
    queryKey: ['report-cash-flow', appliedFilter],
    queryFn: () => {
      const qs = new URLSearchParams({
        dateFrom: appliedFilter.dateFrom,
        dateTo: appliedFilter.dateTo,
        groupBy: appliedFilter.groupBy,
        ...(appliedFilter.channel ? { channel: appliedFilter.channel } : {}),
        ...(appliedFilter.organizationId ? { organizationId: appliedFilter.organizationId } : {}),
      });
      return api.get<CashFlowReport>(`/reports/cash-flow?${qs.toString()}`);
    },
  });

  const apply = () => {
    setAppliedFilter({ dateFrom, dateTo, groupBy, channel, organizationId });
  };

  const exportCsv = () => {
    if (!data) return;
    const rows: CashFlowRow[] = [...data.groups, data.totals];
    const csv = buildCsv<CashFlowRow>(
      [
        { header: t('label'), cellText: (r) => r.label },
        { header: t('inflow_count'), cellText: (r) => String(r.inflowCount) },
        { header: t('inflow_sum'), cellText: (r) => formatMoney(BigInt(r.inflowSumMinor), 'UZS') },
        { header: t('outflow_count'), cellText: (r) => String(r.outflowCount) },
        {
          header: t('outflow_sum'),
          cellText: (r) => formatMoney(BigInt(r.outflowSumMinor), 'UZS'),
        },
        { header: t('net_sum'), cellText: (r) => formatMoney(BigInt(r.netSumMinor), 'UZS') },
      ],
      rows,
    );
    downloadCsv(csv, `cash-flow-${csvTimestamp()}.csv`);
  };

  const netClassName = (netStr: string): string => {
    const net = BigInt(netStr);
    if (net > 0n) return 'text-[var(--ms-text-success,#15803d)] font-medium';
    if (net < 0n) return 'text-[var(--ms-text-destructive)] font-medium';
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
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-6" data-test-id="filter-bar">
          <div>
            <label
              htmlFor="cf-date-from"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('date_from')}
            </label>
            <Input
              id="cf-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={INPUT_CLASS}
              data-test-id="filter-date-from"
            />
          </div>
          <div>
            <label
              htmlFor="cf-date-to"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('date_to')}
            </label>
            <Input
              id="cf-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={INPUT_CLASS}
              data-test-id="filter-date-to"
            />
          </div>
          <div>
            <label
              htmlFor="cf-group-by"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('group_by')}
            </label>
            <NativeSelect
              id="cf-group-by"
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
          <div>
            <label
              htmlFor="cf-channel"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('channel_filter')}
            </label>
            <NativeSelect
              id="cf-channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value as '' | Channel)}
              className={SELECT_CLASS}
              data-test-id="filter-channel"
            >
              <option value="">{t('all_channels')}</option>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {t(`channels.${c}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <label
              htmlFor="cf-organization"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('field_organization')}
            </label>
            <NativeSelect
              id="cf-organization"
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              className={SELECT_CLASS}
              data-test-id="filter-organization"
            >
              <option value="">{t('all_organizations')}</option>
              {orgs?.items?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button onClick={apply} loading={isLoading} data-test-id="apply-button">
            {t('apply')}
          </Button>
        </div>
      </div>

      <div className="mt-2 text-[var(--ms-text-muted)] text-xs italic">{t('currency_note')}</div>
      {data?.mixedCurrency && (
        <div
          className="mt-1 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-warning,#d97706)] bg-[var(--ms-bg-warning,#fffbeb)] px-3 py-1.5 text-[var(--ms-text-warning,#92400e)] text-xs"
          data-test-id="cashflow-mixed-currency-warn"
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
        <StickyHScroll className="mt-4 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-muted)]">
              <tr>
                <th className="h-9 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('label')}
                </th>
                <th className="h-9 w-24 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('inflow_count')}
                </th>
                <th className="h-9 w-40 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('inflow_sum')}
                </th>
                <th className="h-9 w-24 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('outflow_count')}
                </th>
                <th className="h-9 w-40 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('outflow_sum')}
                </th>
                <th className="h-9 w-40 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('net_sum')}
                </th>
              </tr>
            </thead>
            <tbody data-test-id="report-rows">
              {data.groups.length === 0 &&
              data.totals.inflowCount === 0 &&
              data.totals.outflowCount === 0 ? (
                <tr>
                  <td
                    colSpan={6}
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
                      <td className="px-3 py-2 text-right tabular-nums">{row.inflowCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(BigInt(row.inflowSumMinor), 'UZS')}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.outflowCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(BigInt(row.outflowSumMinor), 'UZS')}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${netClassName(row.netSumMinor)}`}
                      >
                        {formatMoney(BigInt(row.netSumMinor), 'UZS')}
                      </td>
                    </tr>
                  ))}
                  <tr
                    className="border-[var(--ms-border-strong)] border-t-2 bg-[var(--ms-bg-muted)]"
                    data-test-id="row-totals"
                  >
                    <td className="px-3 py-2 font-semibold">{t('totals_row')}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {data.totals.inflowCount}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatMoney(BigInt(data.totals.inflowSumMinor), 'UZS')}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {data.totals.outflowCount}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatMoney(BigInt(data.totals.outflowSumMinor), 'UZS')}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-semibold tabular-nums ${netClassName(data.totals.netSumMinor)}`}
                    >
                      {formatMoney(BigInt(data.totals.netSumMinor), 'UZS')}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </StickyHScroll>
      )}
    </Container>
  );
}
