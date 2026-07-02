'use client';

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { DemandBulkActionsDropdown } from '@/components/demands/bulk-actions-dropdown';
import { DemandCreateRelatedDropdown } from '@/components/demands/create-related-dropdown';
import { DemandPrintDropdown } from '@/components/demands/print-dropdown';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
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
  type CsvColumn,
  type DataTableColumn,
  type FilterDrawerValues,
  InlineFilterPanel,
  ListView,
  type ListViewFilter,
  MassEditModal,
  MoneyInput,
  NativeSelect,
  PeriodInputs,
  PeriodShortcuts,
  type PickerItem,
  buildCsv,
  csvTimestamp,
  downloadCsv,
  footerMoneyCells,
  formatDate,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface DemandRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  // moysklad parity (v2.2 audit): backend already returns these scalar
  // fields — surfacing for the missing-default columns.
  payedSumMinor: string;
  currency: string;
  printed: boolean;
  published: boolean;
  description: string | null;
  moment: string;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string };
  store: { id: string; name: string };
  owner: { id: string; name: string } | null;
  customerOrder: { id: string; name: string } | null;
  _count: { positions: number };
}

interface ListResponse {
  items: DemandRow[];
  nextCursor?: string;
  total: number;
}

// Moysklad parity — 100 rows per page (same as CO list).
const LIMIT = 100;

/** Tri-state ✓ / — / (unset) select — mirrors customer-order's YesNoSelect
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

export default function DemandsPage() {
  const t = useTranslations('pages.demands');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tStates = useTranslations('states.demand');
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
    | 'agentAccount'
    | 'orgAccount'
    | 'salesChannel'
    | 'group'
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
  // (moysklad «Отгрузки» parity: Оплата / Проект / Договор / Счёт
  // организации/контрагента / Группа контрагента / Канал продаж / Статус /
  // Заказ покупателя / Владелец-отдел / Проведено / Напечатано / Отправлено /
  // Когда изменен).
  const [extFilter, setExtFilter] = useState<{
    paymentStatus?: 'unpaid' | 'partial' | 'paid';
    state?: string;
    projectId?: string;
    projectLabel?: string;
    organizationAccountId?: string;
    organizationAccountLabel?: string;
    contractId?: string;
    contractLabel?: string;
    agentGroupId?: string;
    agentGroupLabel?: string;
    agentAccountId?: string;
    agentAccountLabel?: string;
    salesChannelId?: string;
    salesChannelLabel?: string;
    groupId?: string;
    groupLabel?: string;
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
  if (extFilter.paymentStatus) paramsRecord.paymentStatus = extFilter.paymentStatus;
  if (extFilter.state) paramsRecord.state = extFilter.state;
  if (extFilter.projectId) paramsRecord.projectId = extFilter.projectId;
  if (extFilter.contractId) paramsRecord.contractId = extFilter.contractId;
  if (extFilter.agentGroupId) paramsRecord.agentGroupId = extFilter.agentGroupId;
  if (extFilter.agentAccountId) paramsRecord.agentAccountId = extFilter.agentAccountId;
  if (extFilter.salesChannelId) paramsRecord.salesChannelId = extFilter.salesChannelId;
  if (extFilter.groupId) paramsRecord.groupId = extFilter.groupId;
  if (extFilter.customerOrderId) paramsRecord.customerOrderId = extFilter.customerOrderId;
  if (extFilter.organizationAccountId)
    paramsRecord.organizationAccountId = extFilter.organizationAccountId;
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
    payedSumMinor: string;
    currencies: string[];
  }>({
    queryKey: ['demands-totals', totalsQs],
    queryFn: () => api.get(`/demands/aggregate/totals${totalsQs ? `?${totalsQs}` : ''}`),
    staleTime: 30_000,
  });
  // Pinned footer money cells (keys match the sum/payedSum column keys);
  // footerMoneyCells shows «—» when the filtered set mixes currencies.
  const footerRow = footerMoneyCells(totals, {
    sum: totals?.sumMinor ?? '0',
    payedSum: totals?.payedSumMinor ?? '0',
  });

  const listQueryKey = [
    'demands',
    search,
    cursor,
    sortKey,
    sortDir,
    filterValues,
    extFilter,
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/demands?${params.toString()}`),
  });

  // Toolbar dropdowns supersede the bottom BulkActionBar; we keep the
  // hook only for selection state. Each transition target now lives in
  // DemandBulkActionsDropdown which sends the correct verb-style slug
  // (`post`/`unpost`/`cancel`) per Demand's DemandTransitionSchema.
  const bulk = useBulkDocumentActions('demands', listQueryKey, {
    hasFSM: false,
    hasBulkPrint: true,
    onMassEditClick: (ids) => {
      setMassEditIds(ids);
      setMassEditOwner(null);
      setMassEditProject(null);
      setMassEditOpen(true);
    },
  });

  // postedCount drives the Provedeno / Snyat-provedenie gating in the
  // toolbar dropdown — disable Provedeno when every selected row is
  // already posted (mirrors moysklad's gwt-MenuItem-disabled behaviour).
  const postedCount = useMemo(() => {
    if (!data?.items?.length) return 0;
    let n = 0;
    for (const d of data.items) {
      if (bulk.selectedIds.has(d.id) && d.state === 'posted') n++;
    }
    return n;
  }, [data?.items, bulk.selectedIds]);

  // Programmatic CSV export — reused by PrintDropdown's "Список отгрузок".
  const handleListExport = () => {
    const items = data?.items ?? [];
    const active = columns
      .filter((c) => cols.visibleKeys.has(c.key))
      .filter((c) => typeof c.cellText === 'function');
    if (active.length === 0 || items.length === 0) return;
    const csvCols: CsvColumn<DemandRow>[] = active.map((c) => ({
      header: c.headerText ?? (typeof c.header === 'string' ? c.header : c.key),
      // biome-ignore lint/style/noNonNullAssertion: filtered above
      cellText: c.cellText!,
    }));
    const csv = buildCsv(csvCols, items);
    downloadCsv(`demands_${csvTimestamp()}.csv`, csv);
  };
  // moysklad parity (A2 audit, 2026-05-21): /demand default columns
  // are № · Время · Со склада · Контрагент · Организация · Сумма ·
  // Валюта · Оплачено · Отправлено · Напечатано · Комментарий. Backend
  // returns all scalar fields by default (Prisma findMany returns all
  // columns) — added currency/payedSum/published/printed/description
  // columns to surface them on the list.
  const cols = useColumnVisibility('demands', [
    'all',
    'draft',
    'posted',
    'cancelled',
    'name',
    'moment',
    'store',
    'agent',
    'organization',
    'sum',
    'payedSum',
    'published',
    'printed',
    'description',
  ]);

  // moysklad parity: column-width persistence per user (Tour 5 D7).
  const colWidths = useColumnWidths('demands');

  // Round 1 patron — status filter belongs in toolbar dropdown.
  const filters: ListViewFilter[] = [];

  const columns: DataTableColumn<DemandRow>[] = [
    {
      key: 'name',
      header: tFields('number'),
      width: '140px',
      sortable: true,
      cell: (d) => (
        <a
          href={`/demands/${d.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {d.name}
        </a>
      ),
      cellText: (r: DemandRow) => r.name,
    },
    {
      key: 'moment',
      header: tFields('time'),
      width: '120px',
      sortable: true,
      cell: (d) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(d.moment)}</span>
      ),
      cellText: (r: DemandRow) => formatDate(r.moment),
    },
    {
      // moysklad parity: «Со склада» column shown between Время and
      // Контрагент on /demand (verified A2 audit). Already in DemandRow.
      key: 'store',
      header: tFields('store_from'),
      width: '160px',
      sortable: true,
      cell: (d) => <span className="max-w-[160px] truncate text-sm">{d.store?.name ?? '—'}</span>,
      cellText: (r: DemandRow) => r.store?.name ?? '',
    },
    {
      key: 'agent',
      header: tFields('agent'),
      width: '220px',
      sortable: true,
      cell: (d) => (
        <div>
          <div className="max-w-[300px] truncate font-medium">{d.agent.name}</div>
          {d.agent.legalTitle && (
            <div className="max-w-[300px] truncate text-[var(--ms-text-muted)] text-xs">
              {d.agent.legalTitle}
            </div>
          )}
        </div>
      ),
      cellText: (r: DemandRow) =>
        r.agent?.legalTitle ? `${r.agent.name} (${r.agent.legalTitle})` : (r.agent?.name ?? ''),
    },
    {
      // moysklad parity: «Организация» column on /demand. Already in
      // DemandRow.
      key: 'organization',
      header: tFields('organization'),
      width: '180px',
      sortable: true,
      cell: (d) => (
        <span className="max-w-[180px] truncate text-sm">{d.organization?.name ?? '—'}</span>
      ),
      cellText: (r: DemandRow) => r.organization?.name ?? '',
    },
    {
      key: 'customer_order',
      header: tFields('linked_order'),
      width: '150px',
      cell: (d) =>
        d.customerOrder ? (
          <a
            href={`/customer-orders/${d.customerOrder.id}`}
            className="text-[var(--ms-text-brand)] text-sm underline-offset-2 hover:underline"
          >
            {d.customerOrder.name}
          </a>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">{tCommon('none')}</span>
        ),
    },
    {
      key: 'state',
      header: tFields('state'),
      width: '150px',
      cell: (d) => (
        <Badge tone={documentStateTone(d.state)}>
          {tStates(d.state as 'draft' | 'posted' | 'cancelled')}
        </Badge>
      ),
      cellText: (r: DemandRow) => r.state,
    },
    {
      key: 'sum',
      sortField: 'sumMinor',
      header: tFields('sum'),
      align: 'right',
      width: '180px',
      sortable: true,
      cell: (d) => (
        <span className="font-medium tabular-nums">
          {formatMoney(d.sumMinor, 'UZS', { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: DemandRow) => (r.sumMinor ? formatMoney(r.sumMinor, r.currency) : ''),
    },
    {
      key: 'positions',
      header: tFields('positions_count'),
      width: '70px',
      align: 'right',
      cell: (d) => (
        <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">
          {d._count.positions}
        </span>
      ),
      cellText: (r: DemandRow) => String(r._count?.positions ?? ''),
    },
    // moysklad parity (v2.2 audit): «Валюта» — 3-letter code badge.
    {
      key: 'currency',
      header: tFields('currency'),
      width: '90px',
      align: 'center',
      cell: (d) => (
        <span className="text-[var(--ms-text-muted)] text-xs uppercase">{d.currency}</span>
      ),
      cellText: (r: DemandRow) => r.currency,
    },
    // moysklad parity: «Оплачено» payment progress against sum.
    {
      key: 'payedSum',
      sortField: 'payedSumMinor',
      header: tFields('paid'),
      align: 'right',
      width: '160px',
      sortable: true,
      cell: (d) => (
        <span className="font-medium tabular-nums">
          {formatMoney(d.payedSumMinor, d.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: DemandRow) => formatMoney(r.payedSumMinor, r.currency),
    },
    // moysklad parity: «Отправлено» / «Напечатано» boolean badges.
    {
      key: 'published',
      header: tFields('published'),
      width: '120px',
      align: 'center',
      cell: (d) => (d.published ? <Badge tone="info">{tCommon('yes')}</Badge> : <span>—</span>),
      cellText: (r: DemandRow) => (r.published ? 'yes' : ''),
    },
    {
      key: 'printed',
      header: tFields('printed'),
      width: '120px',
      align: 'center',
      cell: (d) => (d.printed ? <Badge tone="info">{tCommon('yes')}</Badge> : <span>—</span>),
      cellText: (r: DemandRow) => (r.printed ? 'yes' : ''),
    },
    // moysklad parity: «Комментарий».
    {
      key: 'description',
      header: tFields('description'),
      width: '220px',
      cell: (d) => (
        <span className="block max-w-[220px] truncate text-[var(--ms-text-muted)] text-xs">
          {d.description ?? ''}
        </span>
      ),
      cellText: (r: DemandRow) => r.description ?? '',
    },
  ];

  const hasFilter = !!search || !!extFilter.state;

  return (
    <>
      <ListView
        testId="demands-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        onHelp={() => window.open('/help/demands', '_blank')}
        selectionCount={bulk.selectedIds.size}
        createHref="/demands/new"
        createLabel={t('create_button')}
        createPosition="start"
        search={searchInput}
        onSearchChange={(v) => {
          setSearchInput(v);
          setCursor(undefined);
        }}
        searchPlaceholder={t('search_placeholder')}
        filters={filters}
        columns={columns}
        rows={data?.items ?? []}
        keyField="id"
        rowTestId={(d) => `demand-row-${d.id}`}
        rowActions={(d) => bulk.rowDelete(d.id)}
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
        richEmpty={{
          // All strings sourced from screenshots/00-clean-default.png
          // (demand re-capture, 2026-04-30 — defaults pass).
          heading: t('empty_rich_heading'),
          cta: { label: t('empty_rich_cta'), href: '/demands/new' },
          // Helper points at the EDO settings page; demands themselves
          // gain the «ЭДО» button on each detail card per the moysklad
          // copy. Fall through to /settings/integrations until the EDO
          // module ships.
          helper: { label: t('empty_rich_helper'), href: '/settings/integrations' },
          resources: [
            { label: t('empty_resource_guide'), href: '/help/demands' },
            { label: t('empty_resource_video'), href: '/help/demands/video' },
            { label: t('empty_resource_course'), href: '/help/demands/course' },
          ],
        }}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          setCursor(undefined);
        }}
        {...bulk.listViewProps}
        // bulkActionBar omitted — toolbar dropdowns replace the sticky bar.
        visibleColumnKeys={cols.visibleKeys}
        headerSlot={
          /* Inline filter panel — moysklad «Отгрузки» parity (~18 fields),
             ordered to match the demand filter reference (01-default.html):
             Период · Контрагент · Группа контрагента · Договор ·
             Организация · Счёт организации · Склад · Проект · Статус ·
             Заказ покупателя · Проведено · Напечатано · Отправлено · Оплата ·
             Канал продаж · Владелец-сотрудник · Владелец-отдел · Сумма ·
             Когда изменен. */
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
                entity="demand"
                currentQueryString={params.toString()}
                onApply={(qs) => {
                  setFilterValues(filterFromQueryString(qs));
                  setCursor(undefined);
                }}
              />
            }
            testId="demands-inline-filter"
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
            {/* 6. Счёт организации — disabled until organization picked. */}
            <InlineFilterPanel.Field label={tFilters('organization_account')} expandable>
              <CatalogPickerField
                value={
                  extFilter.organizationAccountId
                    ? {
                        id: extFilter.organizationAccountId,
                        label:
                          extFilter.organizationAccountLabel ?? extFilter.organizationAccountId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => filterValues.organizationId && setPickerOpen('orgAccount')}
                onClear={() => {
                  setExtFilter({
                    ...extFilter,
                    organizationAccountId: undefined,
                    organizationAccountLabel: undefined,
                  });
                  setCursor(undefined);
                }}
                disabled={!filterValues.organizationId}
                disabledHint={tFilters('org_account_disabled_hint')}
                testId="filter-org-account"
              />
            </InlineFilterPanel.Field>
            {/* 7. Склад */}
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
            {/* 8. Проект */}
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
            {/* 9. Статус — FSM state filter. */}
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
                    {tStates(s as 'draft' | 'posted' | 'cancelled')}
                  </option>
                ))}
              </NativeSelect>
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
            {/* 14. Оплата — payment progress (payedSumMinor vs sumMinor). */}
            <InlineFilterPanel.Field label={tFilters('payment_status')} expandable>
              <NativeSelect
                value={extFilter.paymentStatus ?? ''}
                onChange={(e) => {
                  setExtFilter({
                    ...extFilter,
                    paymentStatus: (e.target.value || undefined) as
                      | 'unpaid'
                      | 'partial'
                      | 'paid'
                      | undefined,
                  });
                  setCursor(undefined);
                }}
                data-test-id="filter-payment-status"
              >
                <option value="" />
                <option value="unpaid">{tFilters('payment_unpaid')}</option>
                <option value="partial">{tFilters('payment_partial')}</option>
                <option value="paid">{tFilters('payment_paid')}</option>
              </NativeSelect>
            </InlineFilterPanel.Field>
            {/* 15. Канал продаж */}
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
            {/* 16. Владелец-сотрудник */}
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
            {/* 17. Владелец-отдел */}
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
            {/* 18. Сумма — from / to bounds. */}
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
            {/* 19. Когда изменен — updatedAt range. */}
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
            {/* «Кто изменил» (modifiedById) SKIPPED — Demand has no
                updatedById column (backend schema note). «Резерв» /
                «Отгрузка» not applicable to a shipment doc. */}
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
          // moysklad parity: toolbar carries only the 3 dropdowns; gear
          // for column visibility lives on the table header via headerEndSlot.
          <>
            <DemandBulkActionsDropdown
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
            <DemandCreateRelatedDropdown selectedIds={bulk.selectedIds} />
            <DemandPrintDropdown selectedIds={bulk.selectedIds} onExportList={handleListExport} />
          </>
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
      {/* Filter picker mounts — opened from <InlineFilterPanel.Field>. */}
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
        open={pickerOpen === 'agentAccount'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('agent_account')}
        fetcher={async (q): Promise<PickerItem[]> => {
          if (!filterValues.agentId) return [];
          // moysklad parity: counterparty bank accounts have only the nested
          // /counterparties/:id/bank-accounts route (raw array, no search param) —
          // mirror the detail-form agentAccountFetcher and client-filter by search.
          const d = await api.get<
            Array<{ id: string; accountNumber: string; bankName: string | null }>
          >(`/counterparties/${filterValues.agentId}/bank-accounts`);
          const k = q.trim().toLowerCase();
          return d
            .filter(
              (x) =>
                !k ||
                x.accountNumber.toLowerCase().includes(k) ||
                (x.bankName ?? '').toLowerCase().includes(k),
            )
            .map((x) => ({
              id: x.id,
              primary: x.accountNumber,
              secondary: x.bankName ?? undefined,
            }));
        }}
        onSelect={(item) => {
          setExtFilter({
            ...extFilter,
            agentAccountId: item.id,
            agentAccountLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'orgAccount'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('organization_account')}
        fetcher={async (q): Promise<PickerItem[]> => {
          if (!filterValues.organizationId) return [];
          // moysklad parity: organization accounts come from the flat
          // /organization-accounts?organizationId= route (mirror the detail-form
          // organizationAccountFetcher). Default accounts have accountNumber=null,
          // so fall back to the account name for the headline.
          const params = new URLSearchParams({ search: q, limit: '50' });
          params.set('organizationId', filterValues.organizationId);
          const r = await api.get<{
            items: {
              id: string;
              name: string;
              accountNumber: string | null;
              bankName: string | null;
            }[];
          }>(`/organization-accounts?${params.toString()}`);
          return r.items.map((x) => ({
            id: x.id,
            primary: x.accountNumber || x.name,
            secondary: x.bankName ?? undefined,
          }));
        }}
        onSelect={(item) => {
          setExtFilter({
            ...extFilter,
            organizationAccountId: item.id,
            organizationAccountLabel: String(item.primary),
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
