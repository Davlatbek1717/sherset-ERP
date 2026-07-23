'use client';

import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { balanceSideTone } from '@/lib/domain-status-tone';
import {
  Badge,
  Breadcrumb,
  Button,
  Checkbox,
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

type SignFilter = 'all' | 'nonzero' | 'debtors' | 'creditors';
type GroupBy = 'none' | 'counterparty';
type Side = 'debtor' | 'creditor' | 'settled';

interface CpBalanceRow {
  counterpartyId: string;
  counterpartyName: string;
  legalTitle: string | null;
  companyType: string;
  currency: string;
  balanceMinor: string;
  amountAbsMinor: string;
  side: Side;
  archived: boolean;
  updatedAt: string | null;
}

interface CpBalanceReport {
  filter: { signFilter: SignFilter; groupBy: GroupBy };
  items: CpBalanceRow[];
  total: number;
  summaries: {
    rowCount: number;
    debtorCount: number;
    creditorCount: number;
    totalDebtMinor: string;
    totalCreditMinor: string;
    netMinor: string;
    /** Account base (валюта учёта) the totals are consolidated into. */
    currency: string;
    /** True when balances span >1 currency (totals are base-converted). */
    mixedCurrency: boolean;
  };
}

const SIGN_FILTERS: SignFilter[] = ['all', 'nonzero', 'debtors', 'creditors'];

function formatDateOnly(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function CounterpartyBalanceReportPage() {
  const t = useTranslations('pages.report_counterparty_balance');
  const tParent = useTranslations('pages.reports');
  const tCommon = useTranslations('common');

  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState<string>('');
  // Currency filter options = the account's REAL currencies (Настройки → Валюты),
  // not a hardcoded list (no phantom EUR/RUB the account doesn't have).
  const { data: currenciesData } = useQuery<{ items: Array<{ isoCode: string }> }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
  });
  const currencyOptions = currenciesData?.items ?? [];
  const [signFilter, setSignFilter] = useState<SignFilter>('nonzero');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [appliedFilter, setAppliedFilter] = useState({
    search,
    currency,
    signFilter,
    includeArchived,
    groupBy,
  });

  const { data, isLoading, error, refetch } = useQuery<CpBalanceReport>({
    queryKey: ['report-cp-balance', appliedFilter],
    queryFn: () => {
      const qs = new URLSearchParams({
        signFilter: appliedFilter.signFilter,
        groupBy: appliedFilter.groupBy,
        ...(appliedFilter.search ? { search: appliedFilter.search } : {}),
        ...(appliedFilter.currency ? { currency: appliedFilter.currency } : {}),
        ...(appliedFilter.includeArchived ? { includeArchived: 'true' } : {}),
        limit: '500',
      });
      return api.get<CpBalanceReport>(`/reports/counterparty-balance?${qs.toString()}`);
    },
  });

  const apply = () => {
    setAppliedFilter({ search, currency, signFilter, includeArchived, groupBy });
  };

  const exportCsv = () => {
    if (!data) return;
    const csv = buildCsv<CpBalanceRow>(
      [
        { header: t('counterparty'), cellText: (r) => r.legalTitle ?? r.counterpartyName },
        { header: t('type'), cellText: (r) => r.companyType },
        { header: t('currency'), cellText: (r) => r.currency },
        {
          header: t('balance'),
          cellText: (r) => formatMoney(BigInt(r.balanceMinor), r.currency),
        },
        { header: t('side'), cellText: (r) => t(`sides.${r.side}`) },
        { header: t('updated_at'), cellText: (r) => formatDateOnly(r.updatedAt) },
      ],
      data.items,
    );
    downloadCsv(csv, `counterparty-balance-${csvTimestamp()}.csv`);
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
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-5" data-test-id="filter-bar">
          <div className="md:col-span-2">
            <label
              htmlFor="cb-search"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('search_placeholder')}
            </label>
            <Input
              id="cb-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('search_placeholder')}
              data-test-id="filter-search"
            />
          </div>
          <div>
            <label
              htmlFor="cb-currency"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('currency')}
            </label>
            <NativeSelect
              id="cb-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              data-test-id="filter-currency"
            >
              <option value="">{t('all_currencies')}</option>
              {currencyOptions.map((c) => (
                <option key={c.isoCode} value={c.isoCode}>
                  {c.isoCode}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <label
              htmlFor="cb-sign"
              className="mb-1 block font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide"
            >
              {t('sign_filter')}
            </label>
            <NativeSelect
              id="cb-sign"
              value={signFilter}
              onChange={(e) => setSignFilter(e.target.value as SignFilter)}
              data-test-id="filter-sign"
            >
              {SIGN_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {t(`signs.${s}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button onClick={apply} loading={isLoading} data-test-id="apply-button">
            {t('apply')}
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label
            htmlFor="includeArchived"
            className="inline-flex cursor-pointer items-center gap-2 text-sm"
          >
            <Checkbox
              id="includeArchived"
              checked={includeArchived}
              onCheckedChange={(v) => setIncludeArchived(!!v)}
              data-test-id="filter-include-archived"
            />
            <span>{t('include_archived')}</span>
          </label>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
              {t('group_by')}:
            </span>
            <NativeSelect
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              data-test-id="filter-group-by"
            >
              <option value="none">{t('groups.none')}</option>
              <option value="counterparty">{t('groups.counterparty')}</option>
            </NativeSelect>
          </div>
        </div>
      </div>

      {data && (
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
          {[
            {
              label: t('totals_rows'),
              value: String(data.summaries.rowCount),
              tone: 'neutral' as const,
            },
            {
              label: t('totals_debtors'),
              value: String(data.summaries.debtorCount),
              tone: 'success' as const,
            },
            {
              label: t('totals_creditors'),
              value: String(data.summaries.creditorCount),
              tone: 'destructive' as const,
            },
            {
              label: t('totals_debt'),
              value: formatMoney(BigInt(data.summaries.totalDebtMinor), data.summaries.currency),
              tone: 'success' as const,
            },
            {
              label: t('totals_credit'),
              value: formatMoney(BigInt(data.summaries.totalCreditMinor), data.summaries.currency),
              tone: 'destructive' as const,
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-2"
            >
              <div className="text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                {s.label}
              </div>
              <div
                className={`font-semibold text-base tabular-nums ${
                  s.tone === 'success'
                    ? 'text-[var(--ms-text-success,#15803d)]'
                    : s.tone === 'destructive'
                      ? 'text-[var(--ms-text-destructive)]'
                      : ''
                }`}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {data?.summaries.mixedCurrency && (
        <div
          className="mt-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-warning,#d97706)] bg-[var(--ms-bg-warning,#fffbeb)] px-3 py-1.5 text-[var(--ms-text-warning,#92400e)] text-xs"
          data-test-id="cp-balance-mixed-currency-warn"
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
                  {t('counterparty')}
                </th>
                <th className="h-9 w-32 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('currency')}
                </th>
                <th className="h-9 w-44 px-3 text-right font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('balance')}
                </th>
                <th className="h-9 w-32 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('side')}
                </th>
                <th className="h-9 w-32 px-3 text-left font-medium text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
                  {t('updated_at')}
                </th>
              </tr>
            </thead>
            <tbody data-test-id="report-rows">
              {data.items.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-12 text-center text-[var(--ms-text-muted)] text-sm"
                    data-test-id="report-empty"
                  >
                    {t('empty_state')}
                  </td>
                </tr>
              ) : (
                data.items.map((row, idx) => (
                  <tr
                    key={`${row.counterpartyId}::${row.currency}::${idx}`}
                    className="border-[var(--ms-border-default)] border-t"
                  >
                    <td className="px-3 py-2 font-medium">
                      <a
                        href={`/counterparties/${row.counterpartyId}`}
                        className="underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
                      >
                        {row.legalTitle ?? row.counterpartyName}
                      </a>
                      {row.archived && (
                        <Badge tone={archivedTone(row.archived)} className="ml-2">
                          {tCommon('archived')}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{row.currency}</td>
                    <td
                      className={`px-3 py-2 text-right font-semibold tabular-nums ${
                        row.side === 'debtor'
                          ? 'text-[var(--ms-text-success,#15803d)]'
                          : row.side === 'creditor'
                            ? 'text-[var(--ms-text-destructive)]'
                            : 'text-[var(--ms-text-muted)]'
                      }`}
                    >
                      {formatMoney(BigInt(row.balanceMinor), row.currency)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={balanceSideTone(row.side)}>{t(`sides.${row.side}`)}</Badge>
                    </td>
                    <td className="px-3 py-2 text-[var(--ms-text-muted)] text-[12px] tabular-nums">
                      {formatDateOnly(row.updatedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </StickyHScroll>
      )}
    </Container>
  );
}
