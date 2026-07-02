'use client';

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { SalesReturnBulkActionsDropdown } from '@/components/sales-returns/bulk-actions-dropdown';
import { SalesReturnPrintDropdown } from '@/components/sales-returns/print-dropdown';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
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
  MassEditModal,
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
import { useMemo, useState } from 'react';

interface SalesReturnRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  // moysklad parity (v2.2 audit): backend already returns these scalar
  // fields by default; surfaced for parity with moysklad's «Возвраты
  // покупателей» default columns.
  currency: string;
  printed: boolean;
  published: boolean;
  description: string | null;
  moment: string;
  reason: string | null;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string };
  store: { id: string; name: string };
  owner: { id: string; name: string } | null;
  demand: { id: string; name: string } | null;
  customerOrder: { id: string; name: string } | null;
  _count: { positions: number };
}

interface ListResponse {
  items: SalesReturnRow[];
  nextCursor?: string;
  total: number;
}

// Moysklad parity — 100 rows per page.
const LIMIT = 100;

/** Tri-state ✓ / — / (unset) select — mirrors the invoice-out gold standard
 *  for the boolean flag filters (Проведено / Напечатано / Отправлено). The
 *  empty option clears the filter exactly like moysklad. */
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

export default function SalesReturnsPage() {
  const t = useTranslations('pages.sales_returns');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tStates = useTranslations('states.sales_return');
  const tFilters = useTranslations('filters');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [cursor, setCursor] = useState<string | undefined>();
  // Click-to-sort headers — moysklad-parity. Default mirrors backend default.
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterValues, setFilterValues] = useState<FilterDrawerValues>({});
  const [filterOpen, setFilterOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState<
    | null
    | 'agent'
    | 'org'
    | 'store'
    | 'owner'
    | 'project'
    | 'contract'
    | 'agentGroup'
    | 'salesChannel'
    | 'group'
    | 'demand'
    | 'customerOrder'
    | 'massEditOwner'
    | 'massEditProject'
  >(null);

  const [massEditOpen, setMassEditOpen] = useState(false);
  const [massEditIds, setMassEditIds] = useState<string[]>([]);
  const [massEditOwner, setMassEditOwner] = useState<{ id: string; label: string } | null>(null);
  const [massEditProject, setMassEditProject] = useState<{ id: string; label: string } | null>(
    null,
  );
  // Extended filter state — fields beyond what FilterDrawerValues covers
  // (moysklad «Возвраты покупателей» parity: Статус / Группа контрагента /
  // Договор / Проект / Отгрузка / Заказ покупателя / Канал продаж /
  // Владелец-отдел / Проведено / Напечатано / Отправлено / Когда изменен).
  const [extFilter, setExtFilter] = useState<{
    state?: string;
    agentGroupId?: string;
    agentGroupLabel?: string;
    contractId?: string;
    contractLabel?: string;
    projectId?: string;
    projectLabel?: string;
    salesChannelId?: string;
    salesChannelLabel?: string;
    groupId?: string;
    groupLabel?: string;
    demandId?: string;
    demandLabel?: string;
    customerOrderId?: string;
    customerOrderLabel?: string;
    // tri-state flag filters ('true' | 'false')
    applicable?: 'true' | 'false';
    printed?: 'true' | 'false';
    published?: 'true' | 'false';
    // «Когда изменен» period
    updatedFrom?: string;
    updatedTo?: string;
  }>({});

  const paramsRecord: Record<string, string> = { limit: String(LIMIT), sortBy: sortKey, sortDir };
  if (search) paramsRecord.search = search;
  if (cursor) paramsRecord.cursor = cursor;
  if (filterValues.momentFrom) paramsRecord.momentFrom = filterValues.momentFrom;
  if (filterValues.momentTo) paramsRecord.momentTo = filterValues.momentTo;
  if (filterValues.sumMinorFrom !== undefined)
    paramsRecord.sumMinorFrom = String(filterValues.sumMinorFrom);
  if (filterValues.sumMinorTo !== undefined)
    paramsRecord.sumMinorTo = String(filterValues.sumMinorTo);
  if (filterValues.agentId) paramsRecord.agentId = filterValues.agentId;
  if (filterValues.organizationId) paramsRecord.organizationId = filterValues.organizationId;
  if (filterValues.storeId) paramsRecord.storeId = filterValues.storeId;
  if (filterValues.ownerId) paramsRecord.ownerId = filterValues.ownerId;
  if (extFilter.state) paramsRecord.state = extFilter.state;
  if (extFilter.agentGroupId) paramsRecord.agentGroupId = extFilter.agentGroupId;
  if (extFilter.contractId) paramsRecord.contractId = extFilter.contractId;
  if (extFilter.projectId) paramsRecord.projectId = extFilter.projectId;
  if (extFilter.salesChannelId) paramsRecord.salesChannelId = extFilter.salesChannelId;
  if (extFilter.groupId) paramsRecord.groupId = extFilter.groupId;
  if (extFilter.demandId) paramsRecord.demandId = extFilter.demandId;
  if (extFilter.customerOrderId) paramsRecord.customerOrderId = extFilter.customerOrderId;
  if (extFilter.applicable) paramsRecord.applicable = extFilter.applicable;
  if (extFilter.printed) paramsRecord.printed = extFilter.printed;
  if (extFilter.published) paramsRecord.published = extFilter.published;
  if (extFilter.updatedFrom) paramsRecord.updatedFrom = extFilter.updatedFrom;
  if (extFilter.updatedTo) paramsRecord.updatedTo = extFilter.updatedTo;
  const params = new URLSearchParams(paramsRecord);

  // moysklad list footer «Итого» — totals across the WHOLE filtered set (not just
  // the visible page); same filter params minus pagination/sort. Mirror invoices-out.
  const totalsParams = new URLSearchParams(params);
  for (const k of ['cursor', 'limit', 'sortBy', 'sortDir']) totalsParams.delete(k);
  const totalsQs = totalsParams.toString();
  const { data: totals } = useQuery<{
    count: number;
    sumMinor: string;
    currencies: string[];
  }>({
    queryKey: ['sales-returns-totals', totalsQs],
    queryFn: () => api.get(`/sales-returns/aggregate/totals${totalsQs ? `?${totalsQs}` : ''}`),
    staleTime: 30_000,
  });
  // Pinned footer money cell (key matches the «Сумма» column key);
  // footerMoneyCells shows «—» when the filtered set mixes currencies.
  const footerRow = footerMoneyCells(totals, { sum: totals?.sumMinor ?? '0' });

  const listQueryKey = [
    'sales-returns',
    search,
    cursor,
    sortKey,
    sortDir,
    filterValues,
    extFilter,
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/sales-returns?${params.toString()}`),
  });

  const bulk = useBulkDocumentActions('sales-returns', listQueryKey, {
    hasFSM: true,
    hasBulkPrint: true,
    onMassEditClick: (ids) => {
      setMassEditIds(ids);
      setMassEditOwner(null);
      setMassEditProject(null);
      setMassEditOpen(true);
    },
  });

  // postedCount drives the Provedeno / Snyat-provedenie gating in the
  // SalesReturnBulkActionsDropdown — disable Provedeno when every selected
  // row is already posted (mirrors moysklad's gwt-MenuItem-disabled).
  const postedCount = useMemo(() => {
    if (!data?.items?.length) return 0;
    let n = 0;
    for (const r of data.items) {
      if (bulk.selectedIds.has(r.id) && r.state === 'posted') n++;
    }
    return n;
  }, [data?.items, bulk.selectedIds]);
  // moysklad parity (A4 audit, 2026-05-21): /salesreturn default
  // columns are № · Время · На склад · Контрагент · Организация · Сумма
  // · Валюта · Отправлено · Напечатано · Комментарий. demand / state /
  // positions kept available via the table-header ⚙ but removed from
  // defaults to match moysklad. currency/published/printed/description
  // surfaced from Prisma scalar fields (backend already returns them).
  const cols = useColumnVisibility('sales-returns', [
    'name',
    'moment',
    'store',
    'agent',
    'organization',
    'sum',
    'published',
    'printed',
    'description',
  ]);

  // moysklad parity: column-width persistence per user (Tour 5 D7).
  const colWidths = useColumnWidths('sales-returns');

  // moysklad's "Возвраты покупателей" list does NOT use pill sub-tabs
  // for the status quick-filter (shared GWT list chrome — the only
  // segment control is the icon-only view-mode toggle, verified on the
  // invoiceout DOM capture). Status filtering is a "Статус" select in
  // the inline filter panel below, matching the customer-orders gold
  // standard.
  const hasFilter = !!search || !!extFilter.state;

  const columns: DataTableColumn<SalesReturnRow>[] = [
    {
      key: 'name',
      header: tFields('number'),
      headerText: tFields('number'),
      width: '140px',
      sortable: true,
      cell: (r) => (
        <a
          href={`/sales-returns/${r.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {r.name}
        </a>
      ),
      cellText: (r) => r.name,
    },
    {
      key: 'moment',
      header: tFields('time'),
      headerText: tFields('time'),
      width: '120px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(r.moment)}</span>
      ),
      cellText: (r) => formatDate(r.moment),
    },
    {
      // moysklad parity: «На склад» column on /salesreturn (verified
      // A4 audit). SalesReturnRow already carries `store`.
      key: 'store',
      header: tFields('store_to'),
      headerText: tFields('store_to'),
      width: '160px',
      sortable: true,
      cell: (r) => <span className="max-w-[160px] truncate text-sm">{r.store?.name ?? '—'}</span>,
      cellText: (r) => r.store?.name ?? '',
    },
    {
      key: 'agent',
      header: tFields('agent'),
      headerText: tFields('agent'),
      width: '220px',
      sortable: true,
      cell: (r) => (
        <div>
          <div className="max-w-[300px] truncate font-medium">{r.agent.name}</div>
          {r.agent.legalTitle && (
            <div className="max-w-[300px] truncate text-[var(--ms-text-muted)] text-xs">
              {r.agent.legalTitle}
            </div>
          )}
        </div>
      ),
      cellText: (r) =>
        r.agent.legalTitle ? `${r.agent.name} (${r.agent.legalTitle})` : r.agent.name,
    },
    {
      // moysklad parity: «Организация» column on /salesreturn. Already
      // in SalesReturnRow.
      key: 'organization',
      header: tFields('organization'),
      headerText: tFields('organization'),
      width: '180px',
      sortable: true,
      cell: (r) => (
        <span className="max-w-[180px] truncate text-sm">{r.organization?.name ?? '—'}</span>
      ),
      cellText: (r) => r.organization?.name ?? '',
    },
    {
      key: 'demand',
      header: tFields('linked_demand'),
      headerText: tFields('linked_demand'),
      width: '130px',
      cell: (r) =>
        r.demand ? (
          <a
            href={`/demands/${r.demand.id}`}
            className="text-[var(--ms-text-brand)] text-sm underline-offset-2 hover:underline"
          >
            {r.demand.name}
          </a>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">{tCommon('none')}</span>
        ),
      cellText: (r) => r.demand?.name ?? '',
    },
    {
      key: 'state',
      header: tFields('state'),
      headerText: tFields('state'),
      width: '150px',
      cell: (r) => (
        <Badge tone={documentStateTone(r.state)}>
          {tStates(r.state as 'draft' | 'posted' | 'cancelled')}
        </Badge>
      ),
      cellText: (r) => tStates(r.state as 'draft' | 'posted' | 'cancelled'),
    },
    {
      key: 'sum',
      sortField: 'sumMinor',
      header: tFields('sum'),
      headerText: tFields('sum'),
      align: 'right',
      width: '180px',
      sortable: true,
      cell: (r) => (
        <span className="font-medium tabular-nums">
          {formatMoney(r.sumMinor, 'UZS', { displayAs: 'none' })}
        </span>
      ),
      cellText: (r) => formatMoney(r.sumMinor),
    },
    {
      key: 'positions',
      header: tFields('positions_count'),
      headerText: tFields('positions_count'),
      width: '70px',
      align: 'right',
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">
          {r._count.positions}
        </span>
      ),
      cellText: (r) => String(r._count.positions),
    },
    // moysklad parity (v2.2 audit): «Валюта» / «Отправлено» / «Напечатано»
    // / «Комментарий» — backend already surfaces all four scalar fields.
    {
      key: 'currency',
      header: tFields('currency'),
      headerText: tFields('currency'),
      width: '90px',
      align: 'center',
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs uppercase">{r.currency}</span>
      ),
      cellText: (r) => r.currency,
    },
    {
      key: 'published',
      header: tFields('published'),
      headerText: tFields('published'),
      width: '120px',
      align: 'center',
      cell: (r) => (r.published ? <Badge tone="info">{tCommon('yes')}</Badge> : <span>—</span>),
      cellText: (r) => (r.published ? 'yes' : ''),
    },
    {
      key: 'printed',
      header: tFields('printed'),
      headerText: tFields('printed'),
      width: '120px',
      align: 'center',
      cell: (r) => (r.printed ? <Badge tone="info">{tCommon('yes')}</Badge> : <span>—</span>),
      cellText: (r) => (r.printed ? 'yes' : ''),
    },
    {
      key: 'description',
      header: tFields('description'),
      headerText: tFields('description'),
      width: '220px',
      cell: (r) => (
        <span className="block max-w-[220px] truncate text-[var(--ms-text-muted)] text-xs">
          {r.description ?? ''}
        </span>
      ),
      cellText: (r) => r.description ?? '',
    },
  ];

  return (
    <>
      <ListView
        testId="sales-returns-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        onHelp={() => window.open('/help/sales-returns', '_blank')}
        selectionCount={bulk.selectedIds.size}
        createHref="/sales-returns/new"
        createLabel={t('create_button')}
        createPosition="start"
        search={searchInput}
        onSearchChange={(v) => {
          setSearchInput(v);
          setCursor(undefined);
        }}
        searchPlaceholder={t('search_placeholder')}
        columns={columns}
        rows={data?.items ?? []}
        keyField="id"
        rowTestId={(r) => `sales-return-row-${r.id}`}
        rowActions={(r) => bulk.rowDelete(r.id)}
        total={data?.total ?? 0}
        footerRow={footerRow}
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
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          setCursor(undefined);
        }}
        {...bulk.listViewProps}
        // bulkActionBar omitted — toolbar dropdowns replace it.
        visibleColumnKeys={cols.visibleKeys}
        headerSlot={
          /* Inline filter panel — moysklad «Возвраты покупателей» parity
             (~17 fields), ordered to match the salesreturn filter reference:
             Период · Контрагент · Группа контрагента · Договор · Организация ·
             Склад · Проект · Статус · Отгрузка · Заказ покупателя · Проведено ·
             Напечатано · Отправлено · Канал продаж · Владелец-сотрудник ·
             Владелец-отдел · Сумма · Когда изменен. */
          <InlineFilterPanel
            hidden={!filterOpen}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onClear={() => {
              setFilterValues({});
              setExtFilter({});
              setCursor(undefined);
            }}
            pills={
              <SavedFiltersPills
                entity="salesreturn"
                currentQueryString={params.toString()}
                onApply={(qs) => {
                  setFilterValues(filterFromQueryString(qs));
                  setCursor(undefined);
                }}
              />
            }
            testId="sales-returns-inline-filter"
          >
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
            <InlineFilterPanel.Field label={tFilters('agent_group')} expandable>
              <CatalogPickerField
                value={
                  extFilter.agentGroupId
                    ? {
                        id: extFilter.agentGroupId,
                        label: extFilter.agentGroupLabel ?? extFilter.agentGroupId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('agentGroup')}
                onClear={() => {
                  setExtFilter({
                    ...extFilter,
                    agentGroupId: undefined,
                    agentGroupLabel: undefined,
                  });
                  setCursor(undefined);
                }}
                testId="filter-agent-group"
              />
            </InlineFilterPanel.Field>
            {/* 4. Договор */}
            <InlineFilterPanel.Field label={tFilters('contract')} expandable>
              <CatalogPickerField
                value={
                  extFilter.contractId
                    ? {
                        id: extFilter.contractId,
                        label: extFilter.contractLabel ?? extFilter.contractId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('contract')}
                onClear={() => {
                  setExtFilter({ ...extFilter, contractId: undefined, contractLabel: undefined });
                  setCursor(undefined);
                }}
                testId="filter-contract"
              />
            </InlineFilterPanel.Field>
            {/* 5. Организация */}
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
            {/* 6. Склад */}
            <InlineFilterPanel.Field label={tFilters('store')} expandable>
              <CatalogPickerField
                value={
                  filterValues.storeId
                    ? {
                        id: filterValues.storeId,
                        label: filterValues.storeLabel ?? filterValues.storeId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('store')}
                onClear={() => {
                  setFilterValues({ ...filterValues, storeId: undefined, storeLabel: undefined });
                  setCursor(undefined);
                }}
                testId="filter-store"
              />
            </InlineFilterPanel.Field>
            {/* 7. Проект */}
            <InlineFilterPanel.Field label={tFilters('project')} expandable>
              <CatalogPickerField
                value={
                  extFilter.projectId
                    ? {
                        id: extFilter.projectId,
                        label: extFilter.projectLabel ?? extFilter.projectId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('project')}
                onClear={() => {
                  setExtFilter({ ...extFilter, projectId: undefined, projectLabel: undefined });
                  setCursor(undefined);
                }}
                testId="filter-project"
              />
            </InlineFilterPanel.Field>
            {/* 8. Статус — FSM state filter (moysklad surfaces this as a
              dropdown inside the filter panel, not pill sub-tabs). */}
            <InlineFilterPanel.Field label={tFilters('state')} expandable>
              <NativeSelect
                value={extFilter.state ?? ''}
                onChange={(e) => {
                  setExtFilter({ ...extFilter, state: e.target.value || undefined });
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
            {/* 9. Отгрузка — back-link to the original Demand. */}
            <InlineFilterPanel.Field label={tFields('linked_demand')} expandable>
              <CatalogPickerField
                value={
                  extFilter.demandId
                    ? {
                        id: extFilter.demandId,
                        label: extFilter.demandLabel ?? extFilter.demandId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('demand')}
                onClear={() => {
                  setExtFilter({ ...extFilter, demandId: undefined, demandLabel: undefined });
                  setCursor(undefined);
                }}
                testId="filter-demand"
              />
            </InlineFilterPanel.Field>
            {/* 10. Заказ покупателя */}
            <InlineFilterPanel.Field label={tFields('linked_order')} expandable>
              <CatalogPickerField
                value={
                  extFilter.customerOrderId
                    ? {
                        id: extFilter.customerOrderId,
                        label: extFilter.customerOrderLabel ?? extFilter.customerOrderId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('customerOrder')}
                onClear={() => {
                  setExtFilter({
                    ...extFilter,
                    customerOrderId: undefined,
                    customerOrderLabel: undefined,
                  });
                  setCursor(undefined);
                }}
                testId="filter-customer-order"
              />
            </InlineFilterPanel.Field>
            {/* 11. Проведено */}
            <InlineFilterPanel.Field label={tFilters('applicable')} expandable>
              <YesNoSelect
                value={extFilter.applicable}
                onChange={(v) => {
                  setExtFilter({ ...extFilter, applicable: v });
                  setCursor(undefined);
                }}
                testId="filter-applicable"
              />
            </InlineFilterPanel.Field>
            {/* 12. Напечатано */}
            <InlineFilterPanel.Field label={tFilters('printed')} expandable>
              <YesNoSelect
                value={extFilter.printed}
                onChange={(v) => {
                  setExtFilter({ ...extFilter, printed: v });
                  setCursor(undefined);
                }}
                testId="filter-printed"
              />
            </InlineFilterPanel.Field>
            {/* 13. Отправлено */}
            <InlineFilterPanel.Field label={tFilters('published')} expandable>
              <YesNoSelect
                value={extFilter.published}
                onChange={(v) => {
                  setExtFilter({ ...extFilter, published: v });
                  setCursor(undefined);
                }}
                testId="filter-published"
              />
            </InlineFilterPanel.Field>
            {/* 14. Канал продаж */}
            <InlineFilterPanel.Field label={tFilters('sales_channel')} expandable>
              <CatalogPickerField
                value={
                  extFilter.salesChannelId
                    ? {
                        id: extFilter.salesChannelId,
                        label: extFilter.salesChannelLabel ?? extFilter.salesChannelId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('salesChannel')}
                onClear={() => {
                  setExtFilter({
                    ...extFilter,
                    salesChannelId: undefined,
                    salesChannelLabel: undefined,
                  });
                  setCursor(undefined);
                }}
                testId="filter-sales-channel"
              />
            </InlineFilterPanel.Field>
            {/* 15. Владелец-сотрудник */}
            <InlineFilterPanel.Field label={tFilters('owner_employee')} expandable>
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
            {/* 16. Владелец-отдел */}
            <InlineFilterPanel.Field label={tFilters('owner_group')} expandable>
              <CatalogPickerField
                value={
                  extFilter.groupId
                    ? {
                        id: extFilter.groupId,
                        label: extFilter.groupLabel ?? extFilter.groupId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('group')}
                onClear={() => {
                  setExtFilter({ ...extFilter, groupId: undefined, groupLabel: undefined });
                  setCursor(undefined);
                }}
                testId="filter-group"
              />
            </InlineFilterPanel.Field>
            {/* 17. Сумма — from / to bounds. */}
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
            {/* 18. Когда изменен — updatedAt range. */}
            <InlineFilterPanel.Field
              label={tFilters('updated_period')}
              inlineSuffix={
                <PeriodShortcuts
                  onChange={({ from, to }) => {
                    setExtFilter({ ...extFilter, updatedFrom: from, updatedTo: to });
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
                from={extFilter.updatedFrom}
                to={extFilter.updatedTo}
                onChange={({ from, to }) => {
                  setExtFilter({ ...extFilter, updatedFrom: from, updatedTo: to });
                  setCursor(undefined);
                }}
                testId="filter-updated"
              />
            </InlineFilterPanel.Field>
            {/* «Кто изменил» (modifiedById) SKIPPED — SalesReturn has no
                updatedById column (backend schema note). «Счёт контрагента» /
                «Счёт организации» are wired in the backend filter; not surfaced
                as their own moysklad list fields. */}
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
          <>
            <SalesReturnBulkActionsDropdown
              selectedIds={bulk.selectedIds}
              listQueryKey={listQueryKey}
              onClearSelection={bulk.clearSelection}
              postedCount={postedCount}
              onMassEdit={() => {
                setMassEditIds(Array.from(bulk.selectedIds));
                setMassEditOwner(null);
                setMassEditProject(null);
                setMassEditOpen(true);
              }}
            />
            {/* no page-level CSV exporter yet — list_export stays disabled */}
            <SalesReturnPrintDropdown selectedIds={bulk.selectedIds} />
          </>
        }
        headerEndSlot={
          <ColumnSettings
            columns={columns.map((c) => ({
              key: c.key,
              label: c.header,
              alwaysVisible: c.key === 'name',
            }))}
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
        open={pickerOpen === 'store'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('store')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/stores?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            storeId: item.id,
            storeLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'owner'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('owner_employee')}
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
        open={pickerOpen === 'project'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('project')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/projects?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setExtFilter({
            ...extFilter,
            projectId: item.id,
            projectLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'contract'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('contract')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/contracts?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setExtFilter({
            ...extFilter,
            contractId: item.id,
            contractLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'agentGroup'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('agent_group')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/groups?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setExtFilter({
            ...extFilter,
            agentGroupId: item.id,
            agentGroupLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'salesChannel'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('sales_channel')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/sales-channels?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setExtFilter({
            ...extFilter,
            salesChannelId: item.id,
            salesChannelLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'group'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('owner_group')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/groups?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setExtFilter({
            ...extFilter,
            groupId: item.id,
            groupLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'demand'}
        onClose={() => setPickerOpen(null)}
        title={tFields('linked_demand')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/demands?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setExtFilter({
            ...extFilter,
            demandId: item.id,
            demandLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'customerOrder'}
        onClose={() => setPickerOpen(null)}
        title={tFields('linked_order')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/customer-orders?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setExtFilter({
            ...extFilter,
            customerOrderId: item.id,
            customerOrderLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />

      <CatalogPicker
        open={pickerOpen === 'massEditOwner'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('owner_employee')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/employees?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setMassEditOwner({ id: item.id, label: String(item.primary) });
          setPickerOpen(null);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'massEditProject'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('project')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/projects?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setMassEditProject({ id: item.id, label: String(item.primary) });
          setPickerOpen(null);
        }}
      />

      <MassEditModal
        open={massEditOpen}
        onOpenChange={setMassEditOpen}
        selectedCount={massEditIds.length}
        submitting={bulk.massEdit.isPending}
        ownerValue={massEditOwner}
        onOwnerPick={() => setPickerOpen('massEditOwner')}
        onOwnerClear={() => setMassEditOwner(null)}
        projectValue={massEditProject}
        onProjectPick={() => setPickerOpen('massEditProject')}
        onProjectClear={() => setMassEditProject(null)}
        labels={{
          title: t('mass_edit_title'),
          ownerLabel: tFilters('owner_employee'),
          projectLabel: tFilters('project'),
          descriptionLabel: t('mass_edit_description_label'),
          apply: t('mass_edit_apply'),
          cancel: t('mass_edit_cancel'),
          hint: t('mass_edit_hint', { count: massEditIds.length }),
        }}
        onSubmit={async (patch) => {
          await bulk.massEdit.mutateAsync({ ids: massEditIds, ...patch });
          setMassEditOpen(false);
        }}
      />
    </>
  );
}
