'use client';

/**
 * «Счета-фактуры полученные» (FactureIn) — moysklad-parity received
 * tax-invoice list. Sprint 6 ships read-only list — the inbound
 * soliq.uz e-facture sync that auto-populates this list lives in a
 * dedicated VAT-integration sprint.
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
  Button,
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
  formatDate,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface FactureInRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  vatSumMinor: string;
  currency: string;
  printed: boolean;
  published: boolean;
  description: string | null;
  moment: string;
  incomingNumber: string | null;
  incomingDate: string | null;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string };
  owner: { id: string; name: string } | null;
  supply: { id: string; name: string } | null;
}

interface ListResponse {
  items: FactureInRow[];
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

/** Tri-state Yes/No/All select for boolean filter fields — mirrors the
 *  invoices-in / purchase-orders gold-standard control (✓ / — / unset). */
function YesNoSelect({
  value,
  onChange,
  testId,
}: {
  value: 'true' | 'false' | undefined;
  onChange: (v: 'true' | 'false' | undefined) => void;
  testId?: string;
}) {
  const tCommon = useTranslations('common');
  return (
    <NativeSelect
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? undefined : (v as 'true' | 'false'));
      }}
      data-test-id={testId}
    >
      <option value="" />
      <option value="false">{tCommon('no')}</option>
      <option value="true">{tCommon('yes')}</option>
    </NativeSelect>
  );
}

/**
 * FactureIn-specific filter-panel fields stored alongside the shared
 * FilterDrawerValues shape (local to this page — the shared
 * `useMoyskladDocFilter` hook is intentionally NOT used here; this mirrors
 * the invoices-in inline gold standard). Only fields with a backing
 * Prisma column are present (Договор / Проект / Склад / Кто изменил are
 * SKIPPED — FactureIn has no such column).
 */
type ExtraFilterFields = {
  applicable?: 'true' | 'false';
  printed?: 'true' | 'false';
  published?: 'true' | 'false';
  ownerId?: string;
  ownerLabel?: string;
  groupId?: string;
  groupLabel?: string;
  agentGroupId?: string;
  agentGroupLabel?: string;
  supplyId?: string;
  supplyLabel?: string;
  incomingDateFrom?: string;
  incomingDateTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
};

export default function FacturesInPage() {
  const t = useTranslations('pages.factures_in');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tStates = useTranslations('states.facture');
  const tFilters = useTranslations('filters');
  const tPo = useTranslations('pages.purchase_orders');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterValues, setFilterValues] = useState<FilterDrawerValues & ExtraFilterFields>({});
  const [filterOpen, setFilterOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState<
    null | 'agent' | 'org' | 'generate' | 'agentGroup' | 'owner' | 'group' | 'supply'
  >(null);

  // moysklad parity (C5 audit, 2026-05-21): /facturein defaults are
  // № · Дата · Входящий номер · Контрагент · Организация · Сумма ·
  // НДС · Валюта · Приёмка · Напечатано. state removed from defaults
  // (available via gear).
  const cols = useColumnVisibility('factures-in', [
    'name',
    'moment',
    'incomingNumber',
    'agent',
    'organization',
    'sum',
    'vatSum',
    'supply',
    'printed',
  ]);
  const colWidths = useColumnWidths('factures-in');

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
    ...(filterValues.agentGroupId ? { agentGroupId: filterValues.agentGroupId } : {}),
    ...(filterValues.organizationId ? { organizationId: filterValues.organizationId } : {}),
    ...(filterValues.ownerId ? { ownerId: filterValues.ownerId } : {}),
    ...(filterValues.groupId ? { groupId: filterValues.groupId } : {}),
    ...(filterValues.supplyId ? { supplyId: filterValues.supplyId } : {}),
    ...(filterValues.applicable ? { applicable: filterValues.applicable } : {}),
    ...(filterValues.printed ? { printed: filterValues.printed } : {}),
    ...(filterValues.published ? { published: filterValues.published } : {}),
    ...(filterValues.incomingDateFrom ? { incomingDateFrom: filterValues.incomingDateFrom } : {}),
    ...(filterValues.incomingDateTo ? { incomingDateTo: filterValues.incomingDateTo } : {}),
    ...(filterValues.updatedFrom ? { updatedFrom: filterValues.updatedFrom } : {}),
    ...(filterValues.updatedTo ? { updatedTo: filterValues.updatedTo } : {}),
  });

  const listQueryKey = [
    'factures-in',
    search,
    stateFilter,
    cursor,
    sortKey,
    sortDir,
    filterValues,
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/factures-in?${params.toString()}`),
  });

  // Generate a draft Счёт-фактура полученный from a Supply (moysklad
  // parity: the receipt is the basis; idempotent server-side — one
  // Supply → one FactureIn). New draft appears in the refreshed list.
  const generateMut = useMutation({
    mutationFn: (supplyId: string) =>
      api.post<{ id: string }>('/factures-in/generate', { supplyId }),
    onSuccess: () => {
      setCursor(undefined);
      void refetch();
    },
  });

  // moysklad's "Счета-фактуры полученные" list has no status pill
  // sub-tabs (shared GWT list chrome). Status + period/agent/org/sum
  // filtering is surfaced through the inline filter panel below, backed
  // by FactureInFilterSchema. Matches the customer-orders gold standard.

  const columns: DataTableColumn<FactureInRow>[] = [
    {
      key: 'name',
      header: '№',
      width: '120px',
      sortable: true,
      cell: (o) => (
        <a
          href={`/factures-in/${o.id}`}
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
      key: 'incomingNumber',
      header: t('col_incoming_number'),
      width: '150px',
      cell: (o) => (
        <div className="text-sm">
          <div className="font-medium">{o.incomingNumber ?? '—'}</div>
          {o.incomingDate && (
            <div className="text-[var(--ms-text-muted)] text-xs tabular-nums">
              {formatDate(o.incomingDate)}
            </div>
          )}
        </div>
      ),
      cellText: (r) =>
        r.incomingNumber
          ? `${r.incomingNumber}${r.incomingDate ? ` (${formatDate(r.incomingDate)})` : ''}`
          : '',
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
      sortable: true,
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
      key: 'vatSum',
      header: tFields('vat_sum'),
      align: 'right',
      width: '120px',
      cell: (o) => (
        <span className="text-[var(--ms-text-muted)] tabular-nums">
          {formatMoney(o.vatSumMinor, o.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (r) => formatMoney(r.vatSumMinor, r.currency, { displayAs: 'none' }),
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
      key: 'supply',
      header: t('col_supply'),
      width: '120px',
      cell: (o) =>
        o.supply ? (
          <a
            href={`/supplies/${o.supply.id}`}
            className="text-[var(--ms-text-brand)] text-sm hover:underline"
          >
            {o.supply.name}
          </a>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-sm">—</span>
        ),
      cellText: (r) => r.supply?.name ?? '',
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

  const footerRow: Record<string, React.ReactNode> = (() => {
    const items = data?.items ?? [];
    const total = (key: keyof FactureInRow) =>
      items.reduce((acc, r) => acc + BigInt(String(r[key] ?? '0')), 0n);
    const fmt = (v: bigint) => formatMoney(v, 'UZS', { displayAs: 'none' });
    return {
      sum: <span className="font-semibold tabular-nums">{fmt(total('sumMinor'))}</span>,
      vatSum: <span className="font-semibold tabular-nums">{fmt(total('vatSumMinor'))}</span>,
    };
  })();

  const hasFilter = !!search || !!stateFilter || Object.keys(filterValues).length > 0;

  return (
    <>
      <ListView
        testId="factures-in-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        selectionCount={0}
        // Create flow deferred to a dedicated soliq-integration sprint;
        // until then there's no «+ Schyot-faktura» CTA — list is read-only.
        search={searchInput}
        onSearchChange={(v) => {
          setSearchInput(v);
          setCursor(undefined);
        }}
        searchPlaceholder={t('search_placeholder')}
        columns={columns}
        rows={data?.items ?? []}
        keyField="id"
        rowTestId={(o) => `facture-in-row-${o.id}`}
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
                entity="facturein"
                currentQueryString={params.toString()}
                onApply={(qs) => {
                  setFilterValues(filterFromQueryString(qs));
                  setCursor(undefined);
                }}
              />
            }
            testId="factures-in-inline-filter"
          >
            {/* moysklad-parity inline filter panel — fields ordered as the
              captured DOM at docs/moysklad-reference/visual-captures/
              02-module/facturein/dom/01-default.html: Период · Контрагент ·
              Группа контрагента · Организация · Статус · Приёмка · Дата
              добавления · Проведено · Напечатано · Отправлено ·
              Владелец-сотрудник · Владелец-отдел · Сумма · Когда изменен.
              SKIPPED (no backing column on FactureIn): Договор · Проект ·
              Склад · Кто изменил. */}
            {/* 1. Период */}
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
            {/* 2. Контрагент */}
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
            {/* 3. Группа контрагента */}
            <InlineFilterPanel.Field label={tPo('filter_agent_group')} expandable>
              <CatalogPickerField
                value={
                  filterValues.agentGroupId
                    ? {
                        id: filterValues.agentGroupId,
                        label: filterValues.agentGroupLabel ?? filterValues.agentGroupId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('agentGroup')}
                onClear={() => {
                  setFilterValues({
                    ...filterValues,
                    agentGroupId: undefined,
                    agentGroupLabel: undefined,
                  });
                  setCursor(undefined);
                }}
                testId="filter-agent-group"
              />
            </InlineFilterPanel.Field>
            {/* 4. Организация */}
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
            {/* 5. Статус */}
            <InlineFilterPanel.Field label={tPo('filter_status_multi')} expandable>
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
            {/* 6. Приёмка (linked Supply) */}
            <InlineFilterPanel.Field label={tFields('linked_supply')} expandable>
              <CatalogPickerField
                value={
                  filterValues.supplyId
                    ? {
                        id: filterValues.supplyId,
                        label: filterValues.supplyLabel ?? filterValues.supplyId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('supply')}
                onClear={() => {
                  setFilterValues({ ...filterValues, supplyId: undefined, supplyLabel: undefined });
                  setCursor(undefined);
                }}
                testId="filter-supply"
              />
            </InlineFilterPanel.Field>
            {/* 7. Дата добавления (supplier paper date — incomingDate range) */}
            <InlineFilterPanel.Field
              label={tFields('incoming_date')}
              inlineSuffix={
                <PeriodShortcuts
                  onChange={({ from, to }) => {
                    setFilterValues({
                      ...filterValues,
                      incomingDateFrom: from,
                      incomingDateTo: to,
                    });
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
                from={filterValues.incomingDateFrom}
                to={filterValues.incomingDateTo}
                onChange={({ from, to }) => {
                  setFilterValues({
                    ...filterValues,
                    incomingDateFrom: from,
                    incomingDateTo: to,
                  });
                  setCursor(undefined);
                }}
                testId="filter-incoming-date"
              />
            </InlineFilterPanel.Field>
            {/* 8. Проведено */}
            <InlineFilterPanel.Field label={tFields('applicable')} expandable>
              <YesNoSelect
                value={filterValues.applicable}
                onChange={(v) => {
                  setFilterValues({ ...filterValues, applicable: v });
                  setCursor(undefined);
                }}
                testId="filter-applicable"
              />
            </InlineFilterPanel.Field>
            {/* 9. Напечатано */}
            <InlineFilterPanel.Field label={tFields('printed')} expandable>
              <YesNoSelect
                value={filterValues.printed}
                onChange={(v) => {
                  setFilterValues({ ...filterValues, printed: v });
                  setCursor(undefined);
                }}
                testId="filter-printed"
              />
            </InlineFilterPanel.Field>
            {/* 10. Отправлено */}
            <InlineFilterPanel.Field label={tFields('published')} expandable>
              <YesNoSelect
                value={filterValues.published}
                onChange={(v) => {
                  setFilterValues({ ...filterValues, published: v });
                  setCursor(undefined);
                }}
                testId="filter-published"
              />
            </InlineFilterPanel.Field>
            {/* 11. Владелец-сотрудник */}
            <InlineFilterPanel.Field label={tPo('filter_owner_employee')} expandable>
              <CatalogPickerField
                value={
                  filterValues.ownerId
                    ? {
                        id: filterValues.ownerId,
                        label: filterValues.ownerLabel ?? filterValues.ownerId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('owner')}
                onClear={() => {
                  setFilterValues({ ...filterValues, ownerId: undefined, ownerLabel: undefined });
                  setCursor(undefined);
                }}
                testId="filter-owner"
              />
            </InlineFilterPanel.Field>
            {/* 12. Владелец-отдел */}
            <InlineFilterPanel.Field label={tPo('filter_owner_group')} expandable>
              <CatalogPickerField
                value={
                  filterValues.groupId
                    ? {
                        id: filterValues.groupId,
                        label: filterValues.groupLabel ?? filterValues.groupId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('group')}
                onClear={() => {
                  setFilterValues({ ...filterValues, groupId: undefined, groupLabel: undefined });
                  setCursor(undefined);
                }}
                testId="filter-group"
              />
            </InlineFilterPanel.Field>
            {/* 13. Сумма (from) */}
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
            {/* 14. Сумма (to) */}
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
            {/* 15. Когда изменен (updatedAt range) */}
            <InlineFilterPanel.Field
              label={tPo('filter_updated_period')}
              inlineSuffix={
                <PeriodShortcuts
                  onChange={({ from, to }) => {
                    setFilterValues({ ...filterValues, updatedFrom: from, updatedTo: to });
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
                from={filterValues.updatedFrom}
                to={filterValues.updatedTo}
                onChange={({ from, to }) => {
                  setFilterValues({ ...filterValues, updatedFrom: from, updatedTo: to });
                  setCursor(undefined);
                }}
                testId="filter-updated"
              />
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
        extraActions={
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setPickerOpen('generate')}
            loading={generateMut.isPending}
            data-test-id="generate-facture-in"
          >
            {t('generate_button')}
          </Button>
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
      <CatalogPicker
        open={pickerOpen === 'agentGroup'}
        onClose={() => setPickerOpen(null)}
        title={tPo('filter_agent_group')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/groups?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            agentGroupId: item.id,
            agentGroupLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'supply'}
        onClose={() => setPickerOpen(null)}
        title={tFields('linked_supply')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/supplies?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            supplyId: item.id,
            supplyLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'owner'}
        onClose={() => setPickerOpen(null)}
        title={tPo('filter_owner_employee')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/employees?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            ownerId: item.id,
            ownerLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'group'}
        onClose={() => setPickerOpen(null)}
        title={tPo('filter_owner_group')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/groups?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            groupId: item.id,
            groupLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'generate'}
        onClose={() => setPickerOpen(null)}
        title={t('generate_picker_title')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/supplies?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          generateMut.mutate(item.id);
        }}
      />
    </>
  );
}
