'use client';

/**
 * «Отчёт комиссионера» (CommissionReportOut) — moysklad-parity
 * commission-settlement list. Sprint 7 ships read-only — the
 * create/post flow joins the dedicated consignment FSM sprint.
 *
 * The IN-side mirror lives at /commission-reports-in (separate route
 * because the accounting impact is opposite — one is our liability,
 * the other a receivable).
 */

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
import { filterFromQueryString } from '@/lib/filter-from-query';
import {
  Badge,
  CatalogPicker,
  CatalogPickerField,
  type DataTableColumn,
  type FilterDrawerValues,
  InlineFilterPanel,
  ListView,
  MoneyInput,
  NativeSelect,
  PeriodInputs,
  PeriodShortcuts,
  type PickerItem,
  footerMoneyCells,
  formatDate,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface CommissionReportRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  vatSumMinor: string;
  rewardSumMinor: string;
  payedSumMinor: string;
  currency: string;
  printed: boolean;
  description: string | null;
  moment: string;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string };
  owner: { id: string; name: string } | null;
  contract: { id: string; name: string } | null;
}

interface ListResponse {
  items: CommissionReportRow[];
  nextCursor?: string;
  total: number;
}

const CURRENCY_LABEL: Record<string, string> = {
  UZS: 'сум',
  USD: 'доллар',
  EUR: 'евро',
  RUB: 'руб',
};
const LIMIT = 100;

function StatusBadge({ on, label }: { on: boolean; label: string }) {
  if (!on) return null;
  return (
    <span
      className="inline-block whitespace-nowrap rounded-sm px-1.5 py-0.5 font-medium text-[11px] text-white"
      style={{ backgroundColor: '#00bfe6' }}
    >
      {label}
    </span>
  );
}

export default function CommissionReportsPage() {
  const t = useTranslations('pages.commission_reports');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tStates = useTranslations('states.facture');
  const tFilters = useTranslations('filters');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  // Click-to-sort headers — moysklad-parity. Default mirrors backend default.
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterValues, setFilterValues] = useState<FilterDrawerValues>({});
  const [filterOpen, setFilterOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState<null | 'agent' | 'org'>(null);

  // moysklad parity (F-misc audit, 2026-05-21): state removed from
  // defaults (status surfaces via Фильтр).
  const cols = useColumnVisibility('commission-reports', [
    'name',
    'moment',
    'agent',
    'organization',
    'sum',
    'reward',
    'payed',
    'currency',
    'contract',
    'printed',
  ]);
  const colWidths = useColumnWidths('commission-reports');

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(stateFilter ? { state: stateFilter } : {}),
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
    ...(filterValues.momentFrom ? { momentFrom: filterValues.momentFrom } : {}),
    ...(filterValues.momentTo ? { momentTo: filterValues.momentTo } : {}),
    ...(filterValues.sumMinorFrom !== undefined
      ? { sumMinorFrom: String(filterValues.sumMinorFrom) }
      : {}),
    ...(filterValues.sumMinorTo !== undefined
      ? { sumMinorTo: String(filterValues.sumMinorTo) }
      : {}),
    ...(filterValues.agentId ? { agentId: filterValues.agentId } : {}),
    ...(filterValues.organizationId ? { organizationId: filterValues.organizationId } : {}),
    ...(filterValues.ownerId ? { ownerId: filterValues.ownerId } : {}),
  });

  // moysklad list footer «Итого» — totals across the WHOLE filtered set (not just
  // the visible page; the old page-sum under-counted past row 100). Mirror invoices-out.
  const totalsParams = new URLSearchParams(params);
  for (const k of ['cursor', 'limit', 'sortBy', 'sortDir']) totalsParams.delete(k);
  const totalsQs = totalsParams.toString();
  const { data: totals } = useQuery<{
    count: number;
    sumMinor: string;
    rewardSumMinor: string;
    payedSumMinor: string;
    currencies: string[];
  }>({
    queryKey: ['commission-reports-totals', totalsQs],
    queryFn: () => api.get(`/commission-reports/aggregate/totals${totalsQs ? `?${totalsQs}` : ''}`),
    staleTime: 30_000,
  });

  const listQueryKey = [
    'commission-reports',
    search,
    stateFilter,
    cursor,
    sortKey,
    sortDir,
    filterValues,
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/commission-reports?${params.toString()}`),
  });

  // moysklad's "Отчёты комиссионера" list has no status pill sub-tabs
  // (shared GWT list chrome). Status + period/agent/org/sum filtering is
  // surfaced through the inline filter panel below, backed by
  // CommissionReportFilterSchema (state/agentId/organizationId/
  // momentFrom/momentTo/sumMinor*). Matches the customer-orders gold
  // standard.

  const columns: DataTableColumn<CommissionReportRow>[] = [
    {
      key: 'name',
      header: '№',
      width: '120px',
      sortable: true,
      cell: (o) => (
        <a
          href={`/commission-reports/${o.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {o.name}
        </a>
      ),
      cellText: (r) => r.name,
    },
    {
      key: 'moment',
      header: t('col_time'),
      width: '140px',
      sortable: true,
      cell: (o) => (
        <span className="text-[var(--ms-text-muted)] text-xs tabular-nums">
          {formatDate(o.moment)}
        </span>
      ),
      cellText: (r) => formatDate(r.moment),
    },
    {
      key: 'agent',
      header: tFields('agent'),
      width: '220px',
      sortable: true,
      cell: (o) => (
        <div>
          <div className="max-w-[260px] truncate font-medium">{o.agent.name}</div>
          {o.agent.legalTitle && (
            <div className="max-w-[260px] truncate text-[var(--ms-text-muted)] text-xs">
              {o.agent.legalTitle}
            </div>
          )}
        </div>
      ),
      cellText: (r) =>
        r.agent?.legalTitle ? `${r.agent.name} (${r.agent.legalTitle})` : (r.agent?.name ?? ''),
    },
    {
      key: 'organization',
      header: tFields('organization'),
      width: '180px',
      cell: (o) => (
        <div className="max-w-[180px] truncate text-[var(--ms-text-primary)] text-sm">
          {o.organization.name}
        </div>
      ),
      cellText: (r) => r.organization?.name ?? '',
    },
    {
      key: 'sum',
      sortField: 'sumMinor',
      header: tFields('sum'),
      align: 'right',
      width: '140px',
      sortable: true,
      cell: (o) => (
        <span className="font-medium tabular-nums">
          {formatMoney(o.sumMinor, o.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (r) =>
        r.sumMinor ? formatMoney(r.sumMinor, r.currency, { displayAs: 'none' }) : '',
    },
    {
      key: 'reward',
      sortField: 'rewardSumMinor',
      header: t('col_reward'),
      align: 'right',
      width: '140px',
      sortable: true,
      cell: (o) => (
        <span className="font-medium text-[var(--ms-text-success)] tabular-nums">
          {formatMoney(o.rewardSumMinor, o.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (r) => formatMoney(r.rewardSumMinor, r.currency, { displayAs: 'none' }),
    },
    {
      key: 'payed',
      sortField: 'payedSumMinor',
      header: t('col_payed'),
      align: 'right',
      width: '140px',
      sortable: true,
      cell: (o) => {
        const payed = BigInt(o.payedSumMinor);
        const total = BigInt(o.sumMinor);
        const fullyPaid = payed >= total && total > 0n;
        return (
          <span
            className={
              fullyPaid
                ? 'font-medium text-[var(--ms-text-success)] tabular-nums'
                : 'text-[var(--ms-text-muted)] tabular-nums'
            }
          >
            {formatMoney(payed, o.currency, { displayAs: 'none' })}
          </span>
        );
      },
      cellText: (r) => formatMoney(r.payedSumMinor, r.currency, { displayAs: 'none' }),
    },
    {
      key: 'currency',
      header: tFields('currency'),
      width: '70px',
      cell: (o) => (
        <span className="text-[var(--ms-text-muted)] text-sm">
          {CURRENCY_LABEL[o.currency] ?? o.currency}
        </span>
      ),
      cellText: (r) => CURRENCY_LABEL[r.currency] ?? r.currency,
    },
    {
      key: 'contract',
      header: t('col_contract'),
      width: '160px',
      cell: (o) =>
        o.contract ? (
          <span className="text-[var(--ms-text-primary)] text-sm">{o.contract.name}</span>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-sm">—</span>
        ),
      cellText: (r) => r.contract?.name ?? '',
    },
    {
      key: 'state',
      header: tFields('state'),
      width: '120px',
      cell: (o) => (
        <Badge tone={documentStateTone(o.state)}>
          {tStates(o.state as 'draft' | 'posted' | 'cancelled')}
        </Badge>
      ),
      cellText: (r) => r.state,
    },
    {
      key: 'printed',
      header: tFields('printed'),
      width: '110px',
      align: 'left',
      cell: (o) => <StatusBadge on={o.printed} label={tStates('printed_badge')} />,
      cellText: (r) => (r.printed ? '✓' : ''),
    },
    {
      key: 'description',
      header: tFields('description'),
      cell: (o) => (
        <span className="block max-w-[260px] truncate text-[var(--ms-text-muted)] text-sm">
          {o.description ?? ''}
        </span>
      ),
      cellText: (r) => r.description ?? '',
    },
  ];

  // Footer totals (Σ Сумма + Σ Вознаграждение + Σ Оплачено across the WHOLE filtered
  // set); footerMoneyCells keeps moysklad's currency-guard («—» on a mixed-currency
  // set, «…» until loaded).
  const footerRow = footerMoneyCells(totals, {
    sum: totals?.sumMinor ?? '0',
    reward: totals?.rewardSumMinor ?? '0',
    payed: totals?.payedSumMinor ?? '0',
  });

  const hasFilter = !!search || !!stateFilter;

  return (
    <>
      <ListView
        testId="commission-reports-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        selectionCount={0}
        // Create flow deferred to consignment FSM sprint.
        search={searchInput}
        onSearchChange={(v) => {
          setSearchInput(v);
          setCursor(undefined);
        }}
        searchPlaceholder={t('search_placeholder')}
        columns={columns}
        rows={data?.items ?? []}
        keyField="id"
        rowTestId={(o) => `commission-report-row-${o.id}`}
        total={data?.total ?? 0}
        limit={LIMIT}
        hasNext={!!data?.nextCursor}
        hasPrevious={!!cursor}
        onNext={() => setCursor(data?.nextCursor)}
        onPrevious={() => setCursor(undefined)}
        loading={isLoading}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyTitle={hasFilter ? tCommon('no_results') : t('empty_title')}
        hasActiveFilter={hasFilter}
        footerRow={footerRow}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          setCursor(undefined);
        }}
        visibleColumnKeys={cols.visibleKeys}
        headerSlot={
          <InlineFilterPanel
            hidden={!filterOpen}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onClear={() => {
              setFilterValues({});
              setStateFilter(null);
              setCursor(undefined);
            }}
            pills={
              <SavedFiltersPills
                entity="commissionreportout"
                currentQueryString={params.toString()}
                onApply={(qs) => {
                  setFilterValues(filterFromQueryString(qs));
                  setCursor(undefined);
                }}
              />
            }
            testId="commission-reports-inline-filter"
          >
            <InlineFilterPanel.Field
              label={tFilters('period')}
              inlineSuffix={
                <PeriodShortcuts
                  onChange={({ from, to }) => {
                    setFilterValues({ ...filterValues, momentFrom: from, momentTo: to });
                    setCursor(undefined);
                  }}
                  labels={{
                    yesterday: tFilters('period_yesterday'),
                    today: tFilters('period_today'),
                    week: tFilters('period_week'),
                    month: tFilters('period_month'),
                  }}
                />
              }
              expandable
            >
              <PeriodInputs
                from={filterValues.momentFrom}
                to={filterValues.momentTo}
                onChange={({ from, to }) => {
                  setFilterValues({ ...filterValues, momentFrom: from, momentTo: to });
                  setCursor(undefined);
                }}
                testId="filter-period"
              />
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field label={tFilters('agent')} expandable>
              <CatalogPickerField
                value={
                  filterValues.agentId
                    ? {
                        id: filterValues.agentId,
                        label: filterValues.agentLabel ?? filterValues.agentId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('agent')}
                onClear={() => {
                  setFilterValues({ ...filterValues, agentId: undefined, agentLabel: undefined });
                  setCursor(undefined);
                }}
                testId="filter-agent"
              />
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field label={tFilters('organization')} expandable>
              <CatalogPickerField
                value={
                  filterValues.organizationId
                    ? {
                        id: filterValues.organizationId,
                        label: filterValues.organizationLabel ?? filterValues.organizationId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('org')}
                onClear={() => {
                  setFilterValues({
                    ...filterValues,
                    organizationId: undefined,
                    organizationLabel: undefined,
                  });
                  setCursor(undefined);
                }}
                testId="filter-org"
              />
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field label={tFilters('sum_from')} expandable>
              <MoneyInput
                allowEmpty
                valueMinor={
                  filterValues.sumMinorFrom !== undefined ? String(filterValues.sumMinorFrom) : ''
                }
                onChangeMinor={(minor) => {
                  setFilterValues({
                    ...filterValues,
                    sumMinorFrom: minor === '' ? undefined : Number(minor),
                  });
                  setCursor(undefined);
                }}
                data-test-id="filter-sum-from"
              />
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field label={tFilters('sum_to')} expandable>
              <MoneyInput
                allowEmpty
                valueMinor={
                  filterValues.sumMinorTo !== undefined ? String(filterValues.sumMinorTo) : ''
                }
                onChangeMinor={(minor) => {
                  setFilterValues({
                    ...filterValues,
                    sumMinorTo: minor === '' ? undefined : Number(minor),
                  });
                  setCursor(undefined);
                }}
                data-test-id="filter-sum-to"
              />
            </InlineFilterPanel.Field>
            {/* Статус — FSM state filter (moysklad surfaces this as a
              dropdown inside the filter panel, not pill sub-tabs). */}
            <InlineFilterPanel.Field label={tFilters('state')} expandable>
              <NativeSelect
                value={stateFilter ?? ''}
                onChange={(e) => {
                  setStateFilter(e.target.value || null);
                  setCursor(undefined);
                }}
                data-test-id="filter-state"
              >
                <option value="" />
                {['draft', 'posted', 'cancelled'].map((s) => (
                  <option key={s} value={s}>
                    {tStates(s)}
                  </option>
                ))}
              </NativeSelect>
            </InlineFilterPanel.Field>
          </InlineFilterPanel>
        }
        extraActionsLeft={
          <FilterToggleButton
            open={filterOpen}
            onToggle={() => setFilterOpen((v) => !v)}
            label={tFilters('trigger')}
          />
        }
        headerEndSlot={
          <ColumnSettings
            columns={columns.map((c) => ({ key: c.key, label: c.header }))}
            visibleKeys={cols.visibleKeys}
            onChange={cols.setVisibleKeys}
            onReset={cols.reset}
          />
        }
        columnWidths={colWidths.values}
        onColumnResize={colWidths.set}
      />
      <CatalogPicker
        open={pickerOpen === 'agent'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('agent')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/counterparties?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            agentId: item.id,
            agentLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'org'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('organization')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/organizations?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            organizationId: item.id,
            organizationLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />
    </>
  );
}
