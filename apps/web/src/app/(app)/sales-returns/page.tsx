'use client';

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { SalesReturnBulkActionsDropdown } from '@/components/sales-returns/bulk-actions-dropdown';
import { SalesReturnPrintDropdown } from '@/components/sales-returns/print-dropdown';
import {
  type SalesReturnCustomStatus,
  SalesReturnStatusDropdown,
} from '@/components/sales-returns/sales-return-status-dropdown';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { stashBulkEdit } from '@/lib/bulk-edit-nav';
import { filterFromQueryString } from '@/lib/filter-from-query';
import {
  CatalogPicker,
  CatalogPickerField,
  type DataTableColumn,
  type FilterDrawerValues,
  InlineFilterPanel,
  ListView,
  MassEditModal,
  MoneyInput,
  MultiCombobox,
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
import { useRouter } from 'next/navigation';
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
  payedSumMinor: string;
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
  // moysklad «Статус» column = account-defined CUSTOM workflow status (coloured
  // pill), NOT the FSM `state`. The list() service already includes it.
  status: { id: string; name: string; color: string | null } | null;
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

/** Multi-select reference field — moysklad checkbox-dropdown holds {id,label}[]. */
type RefMulti = { id: string; label: string };

export default function SalesReturnsPage() {
  const t = useTranslations('pages.sales_returns');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tStates = useTranslations('states.sales_return');
  const tFilters = useTranslations('filters');
  const tMass = useTranslations('mass_edit_modal');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [cursor, setCursor] = useState<string | undefined>();
  // Click-to-sort headers — moysklad-parity. Default mirrors backend default.
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterValues, setFilterValues] = useState<FilterDrawerValues>({});
  // moysklad-parity «Контрагент» / «Организация» inline multi-select checkbox
  // dropdowns (MultiCombobox) — were single-select modals. Each holds the picked
  // {id,label} pairs; on the wire they go out as agentIds / organizationIds CSV.
  // The «Контрагент» dropdown shows the phone as a sublabel and searches by name
  // OR phone (BE /counterparties?search= already matches both).
  const [agents, setAgents] = useState<RefMulti[]>([]);
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);
  // moysklad parity (#salesreturn default): the list loads with the filter panel
  // COLLAPSED — only the «Фильтр» button shows until clicked (mirror purchasereturn).
  const [filterOpen, setFilterOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<
    | null
    | 'store'
    | 'owner'
    | 'project'
    | 'contract'
    | 'agentGroup'
    | 'salesChannel'
    | 'group'
    | 'demand'
    | 'customerOrder'
    | 'product'
    | 'agentAccount'
    | 'orgAccount'
    | 'agentOwner'
    | 'modifiedBy'
    | 'massEditOwner'
    | 'massEditProject'
  >(null);

  const router = useRouter();

  const [massEditOpen, setMassEditOpen] = useState(false);
  // «Владелец-отдел» (groupId) options for the mass-edit wizard — mirrors losses.
  const { data: massGroupsData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['groups', 'mass-edit'],
    queryFn: () => api.get('/groups?limit=100'),
    enabled: massEditOpen,
    staleTime: 5 * 60 * 1000,
  });
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
    // «Владелец контрагента» — the counterparty's owner (responsible employee)
    agentOwnerId?: string;
    agentOwnerLabel?: string;
    // «Кто изменил» — employee who last updated (auditLog-resolved, no column)
    modifiedById?: string;
    modifiedByLabel?: string;
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
    // «Оплата» — refund payment-state (non-parity useful extra, owner request)
    paymentState?: 'paid' | 'partlyPaid' | 'unpaid';
    // «Товар или группа» — product filter (positions.some.assortmentId)
    productId?: string;
    productLabel?: string;
    // «Счёт контрагента» / «Счёт организации» — BE-ready (SalesReturn.agentAccountId
    // / organizationAccountId). Scoped to the first picked agent / organization.
    agentAccountId?: string;
    agentAccountLabel?: string;
    organizationAccountId?: string;
    organizationAccountLabel?: string;
    // tri-state flag filters ('true' | 'false')
    applicable?: 'true' | 'false';
    printed?: 'true' | 'false';
    published?: 'true' | 'false';
    shared?: 'true' | 'false';
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
  if (agents.length) paramsRecord.agentIds = agents.map((x) => x.id).join(',');
  if (organizations.length) paramsRecord.organizationIds = organizations.map((x) => x.id).join(',');
  if (filterValues.storeId) paramsRecord.storeId = filterValues.storeId;
  if (extFilter.productId) paramsRecord.productId = extFilter.productId;
  if (extFilter.agentAccountId) paramsRecord.agentAccountId = extFilter.agentAccountId;
  if (extFilter.organizationAccountId)
    paramsRecord.organizationAccountId = extFilter.organizationAccountId;
  if (filterValues.ownerId) paramsRecord.ownerId = filterValues.ownerId;
  if (extFilter.state) paramsRecord.state = extFilter.state;
  if (extFilter.paymentState) paramsRecord.paymentState = extFilter.paymentState;
  if (extFilter.agentGroupId) paramsRecord.agentGroupId = extFilter.agentGroupId;
  if (extFilter.agentOwnerId) paramsRecord.agentOwnerId = extFilter.agentOwnerId;
  if (extFilter.modifiedById) paramsRecord.modifiedById = extFilter.modifiedById;
  if (extFilter.contractId) paramsRecord.contractId = extFilter.contractId;
  if (extFilter.projectId) paramsRecord.projectId = extFilter.projectId;
  if (extFilter.salesChannelId) paramsRecord.salesChannelId = extFilter.salesChannelId;
  if (extFilter.groupId) paramsRecord.groupId = extFilter.groupId;
  if (extFilter.demandId) paramsRecord.demandId = extFilter.demandId;
  if (extFilter.customerOrderId) paramsRecord.customerOrderId = extFilter.customerOrderId;
  if (extFilter.applicable) paramsRecord.applicable = extFilter.applicable;
  if (extFilter.printed) paramsRecord.printed = extFilter.printed;
  if (extFilter.published) paramsRecord.published = extFilter.published;
  if (extFilter.shared) paramsRecord.shared = extFilter.shared;
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
    baseSumMinor: string;
  }>({
    queryKey: ['sales-returns-totals', totalsQs],
    queryFn: () => api.get(`/sales-returns/aggregate/totals${totalsQs ? `?${totalsQs}` : ''}`),
    staleTime: 30_000,
  });
  // Pinned footer money cell (key matches the «Сумма» column key): the single-
  // currency total, or — for a mixed-currency filtered set — the base-UZS sum
  // (baseValuesMinor) instead of «—». Mirror the purchasereturn list.
  const footerRow = footerMoneyCells(
    totals,
    { sum: totals?.sumMinor ?? '0' },
    { baseValuesMinor: { sum: totals?.baseSumMinor ?? '0' } },
  );

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

  // moysklad «Статус» dropdown — the account's custom return statuses (State
  // rows, entityType="salesreturn"). archived=false: a retired status must not
  // be OFFERED for assigning. The return FSM («Провести») stays in «Изменить».
  const { data: statusData } = useQuery<{ items: SalesReturnCustomStatus[] }>({
    queryKey: ['states', 'salesreturn'],
    queryFn: () =>
      api.get<{ items: SalesReturnCustomStatus[] }>(
        '/states?entityType=salesreturn&archived=false&limit=250',
      ),
    staleTime: 60_000,
  });
  const salesReturnStatuses = statusData?.items ?? [];

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
    // moysklad default: Сумма · Валюта · Оплачено · Отправлено · Напечатано · Комментарий
    'currency',
    'paid',
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
  const hasFilter =
    !!search ||
    !!extFilter.state ||
    !!extFilter.paymentState ||
    !!extFilter.productId ||
    !!extFilter.agentAccountId ||
    !!extFilter.organizationAccountId ||
    !!extFilter.agentOwnerId ||
    !!extFilter.modifiedById ||
    agents.length > 0 ||
    organizations.length > 0;

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
            <div className="max-w-[300px] truncate text-[11px] text-[var(--ms-text-muted)]">
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
      // moysklad parity: «Статус» column = the account-defined CUSTOM status
      // (coloured pill), NOT the FSM state. Grey «Status» placeholder until one is
      // assigned. Posting lives in «Проведено», not here. Mirror purchase-return.
      key: 'state',
      header: tFields('state'),
      headerText: tFields('state'),
      width: '150px',
      cell: (r) =>
        r.status ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] px-2 py-0.5 font-medium text-white text-xs"
            style={{ backgroundColor: r.status.color ?? 'var(--ms-text-muted)' }}
            data-test-id="sr-status-pill"
          >
            {r.status.name}
          </span>
        ) : (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] bg-[var(--ms-bg-muted)] px-2 py-0.5 text-[var(--ms-text-muted)] text-xs"
            data-test-id="sr-status-placeholder"
          >
            {tFields('custom_status_placeholder')}
          </span>
        ),
      cellText: (r) => r.status?.name ?? '',
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
    // moysklad «Оплачено» — to'langan summa (BE payed_sum_minor). Sotuv-qaytarishда
    // pul qaytarilgan qism; mirror «Сумма» money-cell.
    {
      key: 'paid',
      header: tFields('paid'),
      headerText: tFields('paid'),
      width: '120px',
      align: 'right',
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">
          {formatMoney(r.payedSumMinor, 'UZS', { displayAs: 'none' })}
        </span>
      ),
      cellText: (r) => formatMoney(r.payedSumMinor),
    },
    {
      key: 'published',
      header: tFields('published'),
      headerText: tFields('published'),
      width: '120px',
      // moysklad parity: cyan (#00bfe6) filled pill «Отправлен» when sent, EMPTY
      // otherwise (NOT «Да»/«—»). Live-grounded rgb(0,191,230); mirror CO/demands.
      cell: (r) =>
        r.published ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] bg-[#00bfe6] px-2 py-0.5 font-medium text-white text-xs"
            data-test-id="published-badge"
          >
            {tFields('published_badge')}
          </span>
        ) : null,
      cellText: (r) => (r.published ? tFields('published_badge') : ''),
    },
    {
      key: 'printed',
      header: tFields('printed'),
      headerText: tFields('printed'),
      width: '120px',
      cell: (r) =>
        r.printed ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] bg-[#00bfe6] px-2 py-0.5 font-medium text-white text-xs"
            data-test-id="printed-badge"
          >
            {tFields('printed_badge')}
          </span>
        ) : null,
      cellText: (r) => (r.printed ? tFields('printed_badge') : ''),
    },
    {
      key: 'description',
      header: tFields('description'),
      headerText: tFields('description'),
      width: '220px',
      cell: (r) => (
        <span className="block max-w-[220px] truncate text-[11px] text-[var(--ms-text-muted)]">
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
              setAgents([]);
              setOrganizations([]);
              setCursor(undefined);
            }}
            pills={
              <SavedFiltersPills
                entity="salesreturn"
                currentQueryString={params.toString()}
                onApply={(qs) => {
                  setFilterValues(filterFromQueryString(qs));
                  // Restore the multi-select «Контрагент» / «Организация» arrays from
                  // the saved query string (agentIds / organizationIds CSV). This
                  // simpler saved-filter mechanism stores ids only (no labels), so
                  // chips fall back to the id until re-searched.
                  const usp = qs.startsWith('?')
                    ? new URLSearchParams(qs.slice(1))
                    : new URLSearchParams(qs);
                  const parseCsv = (key: string): RefMulti[] =>
                    (usp.get(key) ?? '')
                      .split(',')
                      .filter(Boolean)
                      .map((id) => ({ id, label: id }));
                  setAgents(parseCsv('agentIds'));
                  setOrganizations(parseCsv('organizationIds'));
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
            {/* 2. Контрагент — moysklad-parity inline multi-select checkbox dropdown
                (was a single-select modal): type a name OR phone, results appear
                inline (each row shows the phone as a sublabel), tick as many as
                needed. On the wire → agentIds CSV. */}
            <InlineFilterPanel.Field label={tFilters('agent')} expandable>
              <MultiCombobox
                value={agents.map((x) => x.id)}
                items={agents.map((x) => ({ value: x.id, label: x.label }))}
                onSearch={async (q) => {
                  const r = await api.get<{
                    items: { id: string; name: string; phone?: string | null }[];
                  }>(`/counterparties?search=${encodeURIComponent(q)}&limit=20`);
                  return r.items.map((x) => ({
                    value: x.id,
                    label: x.name,
                    sublabel: x.phone || undefined,
                  }));
                }}
                onChange={(nextIds, toggled) => {
                  setAgents((prev) =>
                    nextIds.map((id) => {
                      const ex = prev.find((s) => s.id === id);
                      if (ex) return ex;
                      if (toggled?.value === id) return { id, label: String(toggled.label) };
                      return { id, label: id };
                    }),
                  );
                  setCursor(undefined);
                }}
                placeholder=""
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
            {/* 3b. Владелец контрагента — the counterparty's owner (employee). */}
            <InlineFilterPanel.Field label={tFilters('agent_owner')} expandable>
              <CatalogPickerField
                value={
                  extFilter.agentOwnerId
                    ? {
                        id: extFilter.agentOwnerId,
                        label: extFilter.agentOwnerLabel ?? extFilter.agentOwnerId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('agentOwner')}
                onClear={() => {
                  setExtFilter({
                    ...extFilter,
                    agentOwnerId: undefined,
                    agentOwnerLabel: undefined,
                  });
                  setCursor(undefined);
                }}
                testId="filter-agent-owner"
              />
            </InlineFilterPanel.Field>
            {/* 3c. Кто изменил — employee who last updated (auditLog-resolved). */}
            <InlineFilterPanel.Field label={tFilters('modified_by')} expandable>
              <CatalogPickerField
                value={
                  extFilter.modifiedById
                    ? {
                        id: extFilter.modifiedById,
                        label: extFilter.modifiedByLabel ?? extFilter.modifiedById,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('modifiedBy')}
                onClear={() => {
                  setExtFilter({
                    ...extFilter,
                    modifiedById: undefined,
                    modifiedByLabel: undefined,
                  });
                  setCursor(undefined);
                }}
                testId="filter-modified-by"
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
            {/* 5. Организация — moysklad-parity inline multi-select checkbox
                dropdown (was a single-select modal). On the wire → organizationIds CSV. */}
            <InlineFilterPanel.Field label={tFilters('organization')} expandable>
              <MultiCombobox
                value={organizations.map((x) => x.id)}
                items={organizations.map((x) => ({ value: x.id, label: x.label }))}
                onSearch={async (q) => {
                  const r = await api.get<{ items: { id: string; name: string }[] }>(
                    `/organizations?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return r.items.map((x) => ({ value: x.id, label: x.name }));
                }}
                onChange={(nextIds, toggled) => {
                  setOrganizations((prev) =>
                    nextIds.map((id) => {
                      const ex = prev.find((s) => s.id === id);
                      if (ex) return ex;
                      if (toggled?.value === id) return { id, label: String(toggled.label) };
                      return { id, label: id };
                    }),
                  );
                  setCursor(undefined);
                }}
                placeholder=""
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
            {/* 6b. Товар или группа — returns containing this product (mirror PR). */}
            <InlineFilterPanel.Field label={tFilters('product_or_group')} expandable>
              <CatalogPickerField
                value={
                  extFilter.productId
                    ? {
                        id: extFilter.productId,
                        label: extFilter.productLabel ?? extFilter.productId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('product')}
                onClear={() => {
                  setExtFilter({
                    ...extFilter,
                    productId: undefined,
                    productLabel: undefined,
                  });
                  setCursor(undefined);
                }}
                testId="filter-product"
              />
            </InlineFilterPanel.Field>
            {/* 6c. Счёт контрагента — BE-ready; scoped to the first picked agent. */}
            <InlineFilterPanel.Field label={tFilters('agent_account')} expandable>
              <CatalogPickerField
                value={
                  extFilter.agentAccountId
                    ? {
                        id: extFilter.agentAccountId,
                        label: extFilter.agentAccountLabel ?? extFilter.agentAccountId,
                      }
                    : null
                }
                placeholder=""
                onPick={() => agents[0]?.id && setPickerOpen('agentAccount')}
                inlineFetcher={async (q): Promise<PickerItem[]> => {
                  const agentId = agents[0]?.id;
                  if (!agentId) return [];
                  const d = await api.get<
                    Array<{ id: string; accountNumber: string; bankName: string | null }>
                  >(`/counterparties/${agentId}/bank-accounts`);
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
                onInlineSelect={(item) => {
                  setExtFilter({
                    ...extFilter,
                    agentAccountId: item.id,
                    agentAccountLabel: String(item.primary),
                  });
                  setCursor(undefined);
                }}
                onClear={() => {
                  setExtFilter({
                    ...extFilter,
                    agentAccountId: undefined,
                    agentAccountLabel: undefined,
                  });
                  setCursor(undefined);
                }}
                disabled={!agents[0]?.id}
                disabledHint={tFilters('agent_account_disabled_hint')}
                testId="filter-agent-account"
              />
            </InlineFilterPanel.Field>
            {/* 6d. Счёт организации — BE-ready; scoped to the first picked organization. */}
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
                onPick={() => organizations[0]?.id && setPickerOpen('orgAccount')}
                inlineFetcher={async (q): Promise<PickerItem[]> => {
                  const organizationId = organizations[0]?.id;
                  if (!organizationId) return [];
                  const p = new URLSearchParams({ search: q, limit: '50' });
                  p.set('organizationId', organizationId);
                  const r = await api.get<{
                    items: {
                      id: string;
                      name: string;
                      accountNumber: string | null;
                      bankName: string | null;
                    }[];
                  }>(`/organization-accounts?${p.toString()}`);
                  return r.items.map((x) => ({
                    id: x.id,
                    primary: x.accountNumber || x.name,
                    secondary: x.bankName ?? undefined,
                  }));
                }}
                onInlineSelect={(item) => {
                  setExtFilter({
                    ...extFilter,
                    organizationAccountId: item.id,
                    organizationAccountLabel: String(item.primary),
                  });
                  setCursor(undefined);
                }}
                onClear={() => {
                  setExtFilter({
                    ...extFilter,
                    organizationAccountId: undefined,
                    organizationAccountLabel: undefined,
                  });
                  setCursor(undefined);
                }}
                disabled={!organizations[0]?.id}
                disabledHint={tFilters('org_account_disabled_hint')}
                testId="filter-org-account"
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
            {/* 8b. Оплата — refund payment-state tri-state. NON-parity useful extra
              (moysklad returns list has no «Оплата»), kept at owner request to
              pair with the «Оплачено» column. */}
            <InlineFilterPanel.Field label={tFilters('payment_status')} expandable>
              <NativeSelect
                value={extFilter.paymentState ?? ''}
                onChange={(e) => {
                  setExtFilter({
                    ...extFilter,
                    paymentState: (e.target.value as 'paid' | 'partlyPaid' | 'unpaid') || undefined,
                  });
                  setCursor(undefined);
                }}
                data-test-id="filter-payment-state"
              >
                <option value="" />
                <option value="paid">{tFilters('payment_paid')}</option>
                <option value="partlyPaid">{tFilters('payment_partial')}</option>
                <option value="unpaid">{tFilters('payment_unpaid')}</option>
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
            {/* 13b. Общий доступ — shared flag (moysklad list filter). */}
            <InlineFilterPanel.Field label={tFilters('shared')} expandable>
              <YesNoSelect
                value={extFilter.shared}
                onChange={(v) => {
                  setExtFilter({ ...extFilter, shared: v });
                  setCursor(undefined);
                }}
                testId="filter-shared"
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
                stashBulkEdit({
                  entity: 'sales-returns',
                  ids:
                    bulk.selectedIds.size > 0
                      ? Array.from(bulk.selectedIds)
                      : (data?.items ?? []).map((r) => r.id),
                  from: '/sales-returns',
                });
                router.push('/bulk-edit');
              }}
            />
            {/* moysklad toolbar order: Изменить · Статус · Печать */}
            <SalesReturnStatusDropdown
              selectedIds={bulk.selectedIds}
              listQueryKey={listQueryKey}
              onClearSelection={bulk.clearSelection}
              customStatuses={salesReturnStatuses}
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
        open={pickerOpen === 'product'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('product_or_group')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/products?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setExtFilter({
            ...extFilter,
            productId: item.id,
            productLabel: String(item.primary),
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
        open={pickerOpen === 'agentOwner'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('agent_owner')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/employees?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setExtFilter({
            ...extFilter,
            agentOwnerId: item.id,
            agentOwnerLabel: String(item.primary),
          });
          setCursor(undefined);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'modifiedBy'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('modified_by')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/employees?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setExtFilter({
            ...extFilter,
            modifiedById: item.id,
            modifiedByLabel: String(item.primary),
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
        groupOptions={(massGroupsData?.items ?? []).map((g) => ({ value: g.id, label: g.name }))}
        showShared
        labels={{
          title: t('mass_edit_title'),
          ownerLabel: tFilters('owner_employee'),
          projectLabel: tFilters('project'),
          descriptionLabel: t('mass_edit_description_label'),
          apply: t('mass_edit_apply'),
          cancel: t('mass_edit_cancel'),
          hint: t('mass_edit_hint', { count: massEditIds.length }),
          groupLabel: tMass('group_label'),
          sharedLabel: tMass('shared_label'),
          sharedYes: tMass('shared_yes'),
          sharedNo: tMass('shared_no'),
        }}
        onSubmit={async (patch) => {
          await bulk.massEdit.mutateAsync({ ids: massEditIds, ...patch });
          setMassEditOpen(false);
        }}
      />
    </>
  );
}
