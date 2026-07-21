'use client';

import { ColumnSettings } from '@/components/column-settings';
import { BulkActionsDropdown } from '@/components/customer-orders/bulk-actions-dropdown';
import { CreateRelatedDropdown } from '@/components/customer-orders/create-related-dropdown';
import { PrintDropdown } from '@/components/customer-orders/print-dropdown';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { StatusChangeDropdown } from '@/components/customer-orders/status-change-dropdown';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { filterFromQueryString } from '@/lib/filter-from-query';
import { pinDefaultCustomer } from '@/lib/pin-default-customer';
import {
  CatalogPicker,
  CatalogPickerField,
  type CsvColumn,
  type DataTableColumn,
  type FilterDrawerValues,
  InlineFilterPanel,
  Input,
  ListView,
  type ListViewFilter,
  MassEditModal,
  MoneyInput,
  MoneyProgress,
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
  subtractMinor,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

interface CustomerOrderRow {
  id: string;
  name: string;
  state: string;
  /** Account-defined custom status (moysklad «Статус», e.g. «Текширилмаган»).
   *  The list «Статус» column shows this when set; falls back to FSM `state`. */
  status: { id: string; name: string; color: string | null } | null;
  applicable: boolean;
  sumMinor: string;
  payedSumMinor: string;
  shippedSumMinor: string;
  invoicedSumMinor: string;
  reservedSumMinor: string;
  /** Document currency code (UZS / USD / RUB / EUR). */
  currency: string;
  moment: string;
  deliveryPlannedMoment: string | null;
  printed: boolean;
  published: boolean;
  description: string | null;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string };
  store: { id: string; name: string };
  owner: { id: string; name: string } | null;
}

interface ListResponse {
  items: CustomerOrderRow[];
  nextCursor?: string;
  total: number;
}

/** Account-defined custom field («Дополнительные поля») definition — drives the
 *  dynamic filter fields after «Статус» (moysklad shows «Уста», «Санаси», … each
 *  as its own filter). Mirrors the AttributeMetadata the /new form loads. */
interface AttrMeta {
  id: string;
  code: string;
  name: string;
  type: string;
  referenceEntity: string | null;
  enumOptions: Array<{ value: string; label: string }> | null;
  position: number;
  archived: boolean;
}

/** Per-attribute filter value: a single `value` (equals/contains) OR a date
 *  `from`/`to` range. `label` holds a reference pick's display name. */
interface AttrFilterValue {
  value?: string;
  label?: string;
  from?: string;
  to?: string;
}

/** Searchable reference entities → list endpoint, so a reference custom-attr
 *  (e.g. «Уста» → Контрагент) filters via an inline typeahead instead of a raw
 *  UUID text box. referenceEntity values come from AttributeMetadata (Prisma
 *  model names). Anything not here falls back to a plain text input. */
const ATTR_REF_ENDPOINT: Record<string, string> = {
  Counterparty: '/counterparties',
  Employee: '/employees',
  Product: '/products',
  Organization: '/organizations',
  Project: '/projects',
  Store: '/stores',
  Contract: '/contracts',
};

// Match moysklad's default — every list page in moysklad.uz paginates
// at 100 rows. The list-view query supports up to 250.
const LIMIT = 100;

/** Tri-state ✓ / — / (unset) select — mirrors purchase-order's YesNoSelect
 *  for the boolean flag filters (Проведено / Напечатано / Отправлено /
 *  Общий доступ). The empty option clears the filter exactly like moysklad. */
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

export default function CustomerOrdersPage() {
  const t = useTranslations('pages.customer_orders');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tForm = useTranslations('form');
  const userDefaults = useUserDefaults();
  // tStates feeds the inline filter's FSM-state dropdown (shown only for
  // accounts that define no custom order statuses).
  const tStates = useTranslations('states.customer_order');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
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
    | 'product'
    | 'massEditOwner'
    | 'massEditProject'
  >(null);

  // Mass-edit state — opens an opt-in modal with owner / project /
  // description rows. Each row's value is held here so the picker
  // callbacks can populate them before the user clicks Apply.
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [massEditIds, setMassEditIds] = useState<string[]>([]);
  const [massEditOwner, setMassEditOwner] = useState<{ id: string; label: string } | null>(null);
  const [massEditProject, setMassEditProject] = useState<{ id: string; label: string } | null>(
    null,
  );
  const [cursor, setCursor] = useState<string | undefined>();
  // Cursor history so "Previous" steps back ONE page instead of jumping to
  // the first page. The list API only returns a forward `nextCursor`, so the
  // cursors of pages already visited are stacked here. Every reset path
  // (filter / sort / search / saved-filter) routes through setCursor(undefined)
  // — the effect below clears the stack centrally so those sites don't each
  // have to know about it. undefined === page 1 (no cursor in the query).
  const [prevCursors, setPrevCursors] = useState<(string | undefined)[]>([]);
  useEffect(() => {
    if (cursor === undefined) setPrevCursors([]);
  }, [cursor]);
  // Click-to-sort headers — moysklad-parity. Default mirrors the backend
  // service default (moment DESC = newest first).
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterValues, setFilterValues] = useState<FilterDrawerValues>({});
  // Extended filter state — fields beyond what FilterDrawerValues
  // covers (moysklad parity: Оплата / Отгружено / Проект / Счёт
  // организации / Статус FSM / Товар).
  const [extFilter, setExtFilter] = useState<{
    paymentStatus?: 'unpaid' | 'partial' | 'paid';
    shippedStatus?: 'unshipped' | 'partial' | 'shipped' | 'overdue';
    reservedStatus?: 'none' | 'partial' | 'full';
    projectId?: string;
    projectLabel?: string;
    organizationAccountId?: string;
    organizationAccountLabel?: string;
    state?: string;
    /** Account custom status (moysklad «Статус»); used instead of `state` when
     *  the account defines custom order statuses. */
    statusId?: string;
    productId?: string;
    productLabel?: string;
    // moysklad-parity FK pickers
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
    // tri-state flag filters ('true' | 'false')
    applicable?: 'true' | 'false';
    printed?: 'true' | 'false';
    published?: 'true' | 'false';
    shared?: 'true' | 'false';
    // «Когда изменен» period
    updatedFrom?: string;
    updatedTo?: string;
  }>({});

  // moysklad «Статус» filter — the account's custom order statuses (e.g.
  // «Текширилмаган»). When present, the «Статус» filter is by statusId (matching
  // the list column); else it falls back to the FSM-state dropdown.
  const { data: statusData } = useQuery<{
    items: Array<{ id: string; name: string; color: string | null }>;
  }>({
    // archived=false: a retired status must not be OFFERED for assigning
    // («Статус ▾») or filtering. The column still shows an order's own status
    // (resolved via its statusId relation), so already-archived statuses on
    // historical orders keep rendering — only the pick/filter lists drop them.
    queryKey: ['states', 'customerorder', 'active'],
    queryFn: () => api.get('/states?entityType=customerorder&archived=false'),
    staleTime: 60_000,
  });
  const customStatuses = statusData?.items ?? [];

  // Account-defined custom fields («Дополнительные поля») → one dynamic filter
  // field each, rendered after «Статус» (moysklad-parity: climart shows «Уста»
  // and «Санаси» here). Same endpoint the /new + detail forms use.
  const { data: attrMetaData } = useQuery<{ items: AttrMeta[] }>({
    queryKey: ['attribute-metadata', 'CustomerOrder'],
    queryFn: () => api.get<{ items: AttrMeta[] }>('/attribute-metadata/entity/CustomerOrder'),
    staleTime: 5 * 60 * 1000,
  });
  const attrMetas = (attrMetaData?.items ?? [])
    .filter((a) => !a.archived)
    .sort((a, b) => a.position - b.position);
  // Per-attribute filter state, keyed by attribute code.
  const [attrFilters, setAttrFilters] = useState<Record<string, AttrFilterValue>>({});
  const setAttr = (code: string, patch: AttrFilterValue) => {
    setAttrFilters((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));
    setCursor(undefined);
  };

  // Sub-tab quick-filters were removed (moysklad uses the toolbar
  // Статус dropdown instead), so stateFilter is no longer maintained
  // here. Status changes flow through bulk-transition.

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
  if (extFilter.shippedStatus) paramsRecord.shippedStatus = extFilter.shippedStatus;
  if (extFilter.reservedStatus) paramsRecord.reservedStatus = extFilter.reservedStatus;
  if (extFilter.projectId) paramsRecord.projectId = extFilter.projectId;
  if (extFilter.contractId) paramsRecord.contractId = extFilter.contractId;
  if (extFilter.agentGroupId) paramsRecord.agentGroupId = extFilter.agentGroupId;
  if (extFilter.agentAccountId) paramsRecord.agentAccountId = extFilter.agentAccountId;
  if (extFilter.salesChannelId) paramsRecord.salesChannelId = extFilter.salesChannelId;
  if (extFilter.groupId) paramsRecord.groupId = extFilter.groupId;
  if (extFilter.organizationAccountId)
    paramsRecord.organizationAccountId = extFilter.organizationAccountId;
  if (extFilter.state) paramsRecord.state = extFilter.state;
  if (extFilter.statusId) paramsRecord.statusId = extFilter.statusId;
  if (extFilter.productId) paramsRecord.productId = extFilter.productId;
  if (extFilter.applicable) paramsRecord.applicable = extFilter.applicable;
  if (extFilter.printed) paramsRecord.printed = extFilter.printed;
  if (extFilter.published) paramsRecord.published = extFilter.published;
  if (extFilter.shared) paramsRecord.shared = extFilter.shared;
  if (extFilter.updatedFrom) paramsRecord.updatedFrom = extFilter.updatedFrom;
  if (extFilter.updatedTo) paramsRecord.updatedTo = extFilter.updatedTo;
  // Custom-attribute (доп.поля) filters → a JSON-encoded `attrs` array of
  // {code, value?|from?/to?} clauses. Date attrs send from/to; everything else
  // sends a single value. Only non-empty clauses are included; the backend maps
  // each to a typed JSON-path WHERE (reference=equals, date=range, …).
  const attrClauses = attrMetas
    .map((a) => {
      const f = attrFilters[a.code];
      if (!f) return null;
      if (a.type === 'date') {
        if (!f.from && !f.to) return null;
        return { code: a.code, ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}) };
      }
      const v = f.value?.trim();
      return v ? { code: a.code, value: v } : null;
    })
    .filter((c): c is { code: string; value?: string; from?: string; to?: string } => c !== null);
  if (attrClauses.length > 0) paramsRecord.attrs = JSON.stringify(attrClauses);
  const params = new URLSearchParams(paramsRecord);

  const listQueryKey = [
    'customer-orders',
    search,
    cursor,
    sortKey,
    sortDir,
    filterValues,
    extFilter,
    attrFilters,
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/customer-orders?${params.toString()}`),
  });

  // moysklad «Итого» grand total — the pinned footer sums the ENTIRE filtered
  // set (all pages), NOT just the current page's 100 rows. Page-independent
  // (pagination + sort dropped) so paging OR re-sorting never refetches it; reuses
  // the same /aggregate/totals endpoint the «Показать итоги» link used. `currencies`
  // lets the footer show «—» when the filtered set mixes document currencies (USD+UZS).
  const aggregateParams = new URLSearchParams(paramsRecord);
  // The all-pages total depends only on the FILTER — strip cursor/limit/sortBy/sortDir
  // so the footer's query key stays stable across paging + sorting (mirrors PO).
  aggregateParams.delete('cursor');
  aggregateParams.delete('limit');
  aggregateParams.delete('sortBy');
  aggregateParams.delete('sortDir');
  // moysklad collapses the all-pages «Итого» strip behind a «Показать итоги»
  // link on big lists (CO has ~31k rows) — the aggregate isn't computed until
  // the user clicks. `showTotals` gates BOTH the query (enabled) and the
  // footer strip; default OFF → the link shows, no aggregate is fetched.
  const [showTotals, setShowTotals] = useState(false);
  const { data: totalsData } = useQuery<{
    count: number;
    sumMinor: string;
    vatSumMinor: string;
    payedSumMinor: string;
    invoicedSumMinor: string;
    shippedSumMinor: string;
    reservedSumMinor: string;
    currencies: string[];
  }>({
    queryKey: ['customer-order-footer-totals', aggregateParams.toString()],
    queryFn: () => api.get(`/customer-orders/aggregate/totals?${aggregateParams.toString()}`),
    staleTime: 30_000,
    enabled: showTotals,
  });

  // moysklad surfaces bulk actions through inline toolbar dropdowns
  // (Изменить / Статус / Создать / Печать), NOT a sticky bottom bar —
  // so we drive selection state via the hook but skip its `bar` and
  // FSM transition prop. Status changes now flow through the
  // StatusChangeDropdown which sends the actual OrderState slug
  // (`confirmed`, `cancelled`, ...) — the previous `transitionTargets:
  // ['confirm', 'cancel']` here failed silently because those verbs
  // are NOT in OrderStateSchema (the controller validates target
  // against the state enum directly). See bulk-actions-dropdown.tsx
  // for the parallel fix.
  const bulk = useBulkDocumentActions('customer-orders', listQueryKey, {
    hasFSM: false,
    hasBulkPrint: true,
    onMassEditClick: (ids) => {
      setMassEditIds(ids);
      setMassEditOwner(null);
      setMassEditProject(null);
      setMassEditOpen(true);
    },
  });
  // Default visible columns mirror moysklad's Заказы покупателей list:
  // №, Время, Контрагент, Организация, Сумма, Выставлено счетов, Оплачено,
  // Отгружено, Зарезервировано, Статус, Отправлено, Напечатано, Комментарий
  const cols = useColumnVisibility('customer-orders', [
    'all',
    'draft',
    'confirmed',
    'closed',
    'name',
    'moment',
    'agent',
    'organization',
    'sum',
    // moysklad live default-visible set (climart capture 2026-06-18,
    // docs/audits/co-live-2026-06-18 grid headers): №·Время·Контрагент·
    // Организация·Сумма·Валюта·Выставлено счетов·Оплачено·Не оплачено·
    // Отгружено·Статус·Отправлено·Напечатано·Комментарий. So «Валюта» AND
    // «Не оплачено» ARE default-visible (corrects the stale 2026-05-21 note);
    // «Зарезервировано» is NOT — kept in the column list for the ⚙ only.
    'currency',
    'invoicedSum',
    'payedSum',
    'unpaidSum',
    'shippedSum',
    'state',
    'published',
    'printed',
    'description',
  ]);

  // moysklad parity: column-width persistence per user (drag handles
  // on the right edge of each header). Tour 5 D7 — wired same way as
  // purchase-orders.
  const colWidths = useColumnWidths('customer-orders');

  // moysklad ⚙ filter field-visibility — the live CO list shows a compact
  // ~10-field set by default, the remaining 14 fields are tucked behind the
  // filter-panel gear. The default array = the keys HIDDEN on first load
  // (useColumnVisibility's `visibleKeys` stores the HIDDEN set here, same as
  // products/purchase-orders use it). Each <InlineFilterPanel.Field> carries a
  // stable, locale-independent `fieldKey`; a key in this set hides that field.
  const filterHidden = useColumnVisibility('customer-orders-filter-hidden', [
    'reserve',
    'agentGroup',
    'agentAccount',
    'contract',
    'applicable',
    'printed',
    'published',
    'shared',
    'salesChannel',
    'ownerEmployee',
    'ownerDept',
    'sumFrom',
    'sumTo',
    'updatedRange',
  ]);

  // moysklad's customer-orders list does NOT use pill sub-tabs for the
  // status quick-filter — instead it surfaces "Статус" as a dropdown in
  // the toolbar (handled by FilterDrawer below) and keeps the row chrome
  // un-tabbed. Removing the sub-tabs here brings the page in line with
  // the moysklad capture (see docs/moysklad-reference/visual-captures/
  // 03-module/customerorder/dom/01-default.html — no `.list-tabs` node).
  const filters: ListViewFilter[] = [];

  const columns: DataTableColumn<CustomerOrderRow>[] = [
    {
      key: 'name',
      header: '№',
      width: '140px',
      sortable: true,
      cell: (o) => (
        <a
          href={`/customer-orders/${o.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {o.name}
        </a>
      ),
      cellText: (r: CustomerOrderRow) => r.name,
    },
    {
      key: 'moment',
      header: tFields('time'),
      width: '140px',
      sortable: true,
      cell: (o) => (
        <span className="text-[var(--ms-text-muted)] text-xs tabular-nums">
          {formatDate(o.moment)}
        </span>
      ),
      cellText: (r: CustomerOrderRow) => formatDate(r.moment),
    },
    {
      key: 'agent',
      header: tFields('agent'),
      width: '220px',
      sortable: true,
      // moysklad «Заказы покупателей» Контрагент cell = a SINGLE counterparty-name
      // link to the counterparty card (no «Полное наименование» sub-line — that
      // lives only on the counterparty card + the document header). Live-grounded
      // co-live-list.yml: `link "Устасизлар" → #Company/edit`. Mirrors the № link.
      cell: (o) => (
        <a
          href={`/counterparties/${o.agent.id}`}
          className="block max-w-[300px] truncate font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {o.agent.name}
        </a>
      ),
      cellText: (r: CustomerOrderRow) => r.agent?.name ?? '',
    },
    {
      key: 'organization',
      header: tFields('organization'),
      width: '180px',
      sortable: true,
      cell: (o) => (
        <span className="max-w-[200px] truncate text-sm">{o.organization?.name ?? '—'}</span>
      ),
      cellText: (r: CustomerOrderRow) => r.organization?.name ?? '',
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
          {formatMoney(o.sumMinor, 'UZS', { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: CustomerOrderRow) =>
        r.sumMinor ? formatMoney(r.sumMinor, r.currency, { displayAs: 'none' }) : '',
    },
    {
      key: 'currency',
      // moysklad shows "Валюта" as a separate column right after Сумма
      // — typically just "сум" / "$" / "₽". We render the ISO code in
      // lowercase to match the captured screenshot ("сум" not "UZS").
      header: tFields('currency'),
      width: '70px',
      align: 'center',
      cell: (o) => (
        <span className="text-[var(--ms-text-muted)] text-xs">
          {o.currency === 'UZS' ? 'сум' : o.currency}
        </span>
      ),
      cellText: (r: CustomerOrderRow) => r.currency,
    },
    {
      key: 'invoicedSum',
      sortField: 'invoicedSumMinor',
      header: tFields('invoiced_sum'),
      align: 'right',
      width: '130px',
      sortable: true,
      cell: (o) => (
        <MoneyProgress valueMinor={o.invoicedSumMinor} totalMinor={o.sumMinor} align="right" />
      ),
      cellText: (r: CustomerOrderRow) =>
        r.invoicedSumMinor
          ? formatMoney(r.invoicedSumMinor, r.currency, { displayAs: 'none' })
          : '',
    },
    {
      key: 'payedSum',
      sortField: 'payedSumMinor',
      header: tFields('payed_sum'),
      align: 'right',
      width: '130px',
      sortable: true,
      cell: (o) => (
        <MoneyProgress valueMinor={o.payedSumMinor} totalMinor={o.sumMinor} align="right" />
      ),
      cellText: (r: CustomerOrderRow) =>
        r.payedSumMinor ? formatMoney(r.payedSumMinor, r.currency, { displayAs: 'none' }) : '',
    },
    {
      // moysklad renders "Не оплачено" = sumMinor − payedSumMinor in
      // a red tone when the order is overpaid (negative). Same formula
      // applied here; cellText for CSV omits the colour.
      key: 'unpaidSum',
      header: tFields('unpaid_sum'),
      align: 'right',
      width: '130px',
      cell: (o) => {
        const unpaid = BigInt(o.sumMinor || '0') - BigInt(o.payedSumMinor || '0');
        const negative = unpaid < 0n;
        return (
          <span
            className={`text-sm tabular-nums ${negative ? 'text-[var(--ms-text-destructive)]' : ''}`}
          >
            {formatMoney(unpaid.toString(), 'UZS', { displayAs: 'none' })}
          </span>
        );
      },
      cellText: (r: CustomerOrderRow) => {
        const unpaid = BigInt(r.sumMinor || '0') - BigInt(r.payedSumMinor || '0');
        return formatMoney(unpaid.toString(), r.currency, { displayAs: 'none' });
      },
    },
    {
      key: 'shippedSum',
      header: tFields('shipped_sum'),
      align: 'right',
      width: '130px',
      cell: (o) => (
        <MoneyProgress valueMinor={o.shippedSumMinor} totalMinor={o.sumMinor} align="right" />
      ),
      cellText: (r: CustomerOrderRow) =>
        r.shippedSumMinor ? formatMoney(r.shippedSumMinor, r.currency, { displayAs: 'none' }) : '',
    },
    {
      key: 'reservedSum',
      header: tFields('reserved_sum'),
      align: 'right',
      width: '130px',
      cell: (o) => (
        <span className="text-sm tabular-nums">
          {formatMoney(o.reservedSumMinor, 'UZS', { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: CustomerOrderRow) =>
        r.reservedSumMinor
          ? formatMoney(r.reservedSumMinor, r.currency, { displayAs: 'none' })
          : '',
    },
    {
      // moysklad's «Статус» column shows ONLY the account's custom status as a
      // FILLED coloured pill (bg = status colour, white text) — e.g. red
      // «Текширилмаган», green «Туланди Накт», orange «Карз колди». It has NO
      // concept of an FSM-state badge: an order with no custom status renders an
      // EMPTY cell (live-grounded on online.moysklad.ru #customerorder, climart —
      // every order carries its account's default status, the lifecycle shows via
      // Оплачено/Отгружено, not here). New orders auto-get the default status
      // backend-side, so a blank cell only appears for legacy null rows.
      key: 'state',
      header: tFields('state'),
      width: '180px',
      cell: (o) =>
        o.status ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] px-2 py-0.5 font-medium text-white text-xs"
            style={{ backgroundColor: o.status.color ?? 'var(--ms-text-muted)' }}
            data-test-id="state-custom-status"
          >
            {o.status.name}
          </span>
        ) : null,
      cellText: (r: CustomerOrderRow) => r.status?.name ?? '',
    },
    {
      key: 'published',
      header: tFields('published'),
      width: '110px',
      // moysklad renders a cyan (#00bfe6) filled pill «Отправлен» when sent, and
      // an empty cell otherwise (NOT a ✓ icon). Colour + word-pill live-grounded
      // on online.moysklad.ru #customerorder (measured rgb(0,191,230)).
      cell: (o) =>
        o.published ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] bg-[#00bfe6] px-2 py-0.5 font-medium text-white text-xs"
            data-test-id="published-badge"
          >
            {tFields('published_badge')}
          </span>
        ) : null,
      cellText: (r: CustomerOrderRow) => (r.published ? tFields('published_badge') : ''),
    },
    {
      key: 'printed',
      header: tFields('printed'),
      width: '110px',
      // moysklad renders a cyan (#00bfe6) filled pill «Напечатан» when printed,
      // and an empty cell otherwise (NOT a ✓ icon). Colour + word-pill live-
      // grounded on online.moysklad.ru #customerorder (measured rgb(0,191,230)).
      cell: (o) =>
        o.printed ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] bg-[#00bfe6] px-2 py-0.5 font-medium text-white text-xs"
            data-test-id="printed-badge"
          >
            {tFields('printed_badge')}
          </span>
        ) : null,
      cellText: (r: CustomerOrderRow) => (r.printed ? tFields('printed_badge') : ''),
    },
    {
      key: 'description',
      header: tFields('description'),
      cell: (o) => (
        <span className="max-w-[200px] truncate text-[var(--ms-text-muted)] text-xs">
          {o.description ?? ''}
        </span>
      ),
      cellText: (r: CustomerOrderRow) => r.description ?? '',
    },
  ];

  // Count selected rows that are already in `confirmed` state — used
  // by BulkActionsDropdown to disable "Провести" when every pick is
  // already confirmed (moysklad's gwt-MenuItem-disabled behaviour for
  // gwt-uid-170 in i-dropdown-izmenit.dom.html). The slug `'confirmed'`
  // matches OrderStateSchema in apps/api/src/modules/customer-order/
  // customer-order.schema.ts — verified at the controller boundary.
  const confirmedCount = useMemo(() => {
    if (!data?.items?.length) return 0;
    let n = 0;
    for (const o of data.items) {
      if (bulk.selectedIds.has(o.id) && o.state === 'confirmed') n++;
    }
    return n;
  }, [data?.items, bulk.selectedIds]);

  // PrintDropdown's "Список заказов" delegates to the same CSV export
  // logic that ExportButton uses, so the dropdown action and the
  // standalone toolbar button produce identical output. Callback is
  // stable per columns/rows so we do not need useCallback for memoisation
  // beyond the inputs being stable already.
  const handleListExport = () => {
    const active = columns
      .filter((c) => cols.visibleKeys.has(c.key))
      .filter((c) => typeof c.cellText === 'function');
    const items = data?.items ?? [];
    if (active.length === 0 || items.length === 0) return;
    const csvCols: CsvColumn<CustomerOrderRow>[] = active.map((c) => ({
      header: c.headerText ?? (typeof c.header === 'string' ? c.header : c.key),
      // biome-ignore lint/style/noNonNullAssertion: filtered above
      cellText: c.cellText!,
    }));
    const csv = buildCsv(csvCols, items);
    downloadCsv(`customer-orders_${csvTimestamp()}.csv`, csv);
  };

  // Footer «Итого» row (moysklad-parity totals strip), pinned at the bottom and
  // computed over the ENTIRE filtered set (all pages) via the aggregate query —
  // NOT just the current 100 visible rows. CRITICAL: a list can mix document
  // currencies (each row has its own `currency`), and sumMinor is stored in the
  // document's OWN currency — never normalised to a base. Adding USD-cents to
  // UZS-tiyin would be a silently-wrong total, so the money footer shows real
  // sums only when the WHOLE filtered set shares ONE currency (backend
  // `currencies`); on a mixed set it shows «—» (moysklad likewise never sums
  // unlike currencies). Until the aggregate loads, fall back to «…».
  const footerRow: Record<string, React.ReactNode> = footerMoneyCells(totalsData, {
    sum: totalsData?.sumMinor ?? '0',
    invoicedSum: totalsData?.invoicedSumMinor ?? '0',
    payedSum: totalsData?.payedSumMinor ?? '0',
    // Не оплачено total = Σ(sum) − Σ(payed), in BigInt (no float drift)
    unpaidSum: totalsData ? subtractMinor(totalsData.sumMinor, totalsData.payedSumMinor) : '0',
    shippedSum: totalsData?.shippedSumMinor ?? '0',
    reservedSum: totalsData?.reservedSumMinor ?? '0',
  });

  return (
    <>
      <ListView
        testId="customer-orders-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        onHelp={() => window.open('/help/customer-orders', '_blank')}
        selectionCount={bulk.selectedIds.size}
        createHref="/customer-orders/new"
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
        rowTestId={(o) => `customer-order-row-${o.id}`}
        rowActions={(o) => bulk.rowDelete(o.id)}
        total={data?.total ?? 0}
        limit={LIMIT}
        headerSlot={
          /* Inline filter panel — moysklad parity (i-default.png).
           Renders below the toolbar; collapsible via the Фильтр
           toolbar button. 8 fields visible on desktop; wraps on
           narrower viewports. */
          <InlineFilterPanel
            hidden={!filterOpen}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onClear={() => {
              setFilterValues({});
              setExtFilter({});
              setAttrFilters({});
              setCursor(undefined);
            }}
            fieldVisibility={{
              hidden: filterHidden.visibleKeys,
              onToggle: (k) => {
                const next = new Set(filterHidden.visibleKeys);
                if (next.has(k)) next.delete(k);
                else next.add(k);
                filterHidden.setVisibleKeys(next);
              },
            }}
            testId="customer-orders-inline-filter"
            pills={
              <SavedFiltersPills
                entity="customerorder"
                currentQueryString={params.toString()}
                onApply={(qs) => {
                  // Fully rehydrate BOTH filter states from the saved query
                  // so applying a pill restores the exact filter set it
                  // encoded — and clears anything not in it. The previous
                  // version only decoded 7 basic fields (dropping ownerId +
                  // every advanced field like paymentStatus/projectId/state,
                  // and leaving stale advanced filters active). The list
                  // query is built from filterValues + extFilter STATE, so
                  // un-restored fields are NOT "re-sent" — they were silently
                  // lost. Basic fields go through the shared decoder (also
                  // gets labels + ownerId); advanced fields are decoded here.
                  const usp = new URLSearchParams(qs);
                  setFilterValues(filterFromQueryString(qs));
                  const pickStr = <T extends string>(k: string): T | undefined =>
                    (usp.get(k) as T | null) ?? undefined;
                  setExtFilter({
                    paymentStatus: pickStr<'unpaid' | 'partial' | 'paid'>('paymentStatus'),
                    shippedStatus: pickStr<'unshipped' | 'partial' | 'shipped' | 'overdue'>(
                      'shippedStatus',
                    ),
                    reservedStatus: pickStr<'none' | 'partial' | 'full'>('reservedStatus'),
                    projectId: pickStr('projectId'),
                    organizationAccountId: pickStr('organizationAccountId'),
                    state: pickStr('state'),
                    // Custom «Статус» (statusId) — was omitted here, so applying
                    // a saved custom-status pill silently dropped it. Restored.
                    statusId: pickStr('statusId'),
                    productId: pickStr('productId'),
                    contractId: pickStr('contractId'),
                    agentGroupId: pickStr('agentGroupId'),
                    agentAccountId: pickStr('agentAccountId'),
                    salesChannelId: pickStr('salesChannelId'),
                    groupId: pickStr('groupId'),
                    applicable: pickStr<'true' | 'false'>('applicable'),
                    printed: pickStr<'true' | 'false'>('printed'),
                    published: pickStr<'true' | 'false'>('published'),
                    shared: pickStr<'true' | 'false'>('shared'),
                    updatedFrom: pickStr('updatedFrom'),
                    updatedTo: pickStr('updatedTo'),
                  });
                  // Restore custom-attribute (доп.поля) filters too, so a saved
                  // pill that encoded «Уста»/«Санаси» re-applies instead of being
                  // silently dropped (the query is rebuilt from attrFilters state).
                  const attrsRaw = usp.get('attrs');
                  if (attrsRaw) {
                    try {
                      const arr = JSON.parse(attrsRaw) as Array<{
                        code: string;
                        value?: string;
                        from?: string;
                        to?: string;
                      }>;
                      const next: Record<string, AttrFilterValue> = {};
                      for (const c of arr)
                        next[c.code] = { value: c.value, from: c.from, to: c.to };
                      setAttrFilters(next);
                    } catch {
                      setAttrFilters({});
                    }
                  } else {
                    setAttrFilters({});
                  }
                  setCursor(undefined);
                }}
              />
            }
          >
            {/* 1. Период */}
            <InlineFilterPanel.Field
              label={tFilters('period')}
              inlineSuffix={
                <PeriodShortcuts
                  onChange={({ from, to }) => {
                    setFilterValues({
                      ...filterValues,
                      momentFrom: from,
                      momentTo: to,
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
                from={filterValues.momentFrom}
                to={filterValues.momentTo}
                onChange={({ from, to }) => {
                  setFilterValues({
                    ...filterValues,
                    momentFrom: from,
                    momentTo: to,
                  });
                  setCursor(undefined);
                }}
                testId="filter-period"
              />
            </InlineFilterPanel.Field>
            {/* 2. Оплата — payment progress (moysklad's "Оплата" filter). */}
            <InlineFilterPanel.Field
              fieldKey="payment"
              label={tFilters('payment_status')}
              expandable={false}
            >
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
            {/* 3. Отгрузка — shipment progress. */}
            <InlineFilterPanel.Field
              fieldKey="shipment"
              label={tFilters('shipped_status')}
              expandable={false}
            >
              <NativeSelect
                value={extFilter.shippedStatus ?? ''}
                onChange={(e) => {
                  setExtFilter({
                    ...extFilter,
                    shippedStatus: (e.target.value || undefined) as
                      | 'unshipped'
                      | 'partial'
                      | 'shipped'
                      | 'overdue'
                      | undefined,
                  });
                  setCursor(undefined);
                }}
                data-test-id="filter-shipped-status"
              >
                <option value="" />
                <option value="shipped">{tFilters('shipped_shipped')}</option>
                <option value="partial">{tFilters('shipped_partial')}</option>
                <option value="unshipped">{tFilters('shipped_unshipped')}</option>
                <option value="overdue">{tFilters('shipped_overdue')}</option>
              </NativeSelect>
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field
              fieldKey="product"
              label={tFilters('product_or_group')}
              expandable
            >
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
                inlineFetcher={async (q): Promise<PickerItem[]> => {
                  const r = await api.get<{
                    items: { id: string; name: string; code: string | null }[];
                  }>(`/products?search=${encodeURIComponent(q)}&limit=20`);
                  return r.items.map((x) => ({
                    id: x.id,
                    primary: x.name,
                    secondary: x.code ?? undefined,
                  }));
                }}
                onInlineSelect={(item) => {
                  setExtFilter({
                    ...extFilter,
                    productId: item.id,
                    productLabel: String(item.primary),
                  });
                  setCursor(undefined);
                }}
                onClear={() => {
                  setExtFilter({ ...extFilter, productId: undefined, productLabel: undefined });
                  setCursor(undefined);
                }}
                testId="filter-product"
              />
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field fieldKey="store" label={tFilters('store')} expandable>
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
                inlineFetcher={async (q): Promise<PickerItem[]> => {
                  const r = await api.get<{ items: { id: string; name: string }[] }>(
                    `/stores?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return r.items.map((x) => ({ id: x.id, primary: x.name }));
                }}
                onInlineSelect={(item) => {
                  setFilterValues({
                    ...filterValues,
                    storeId: item.id,
                    storeLabel: String(item.primary),
                  });
                  setCursor(undefined);
                }}
                onClear={() => {
                  setFilterValues({
                    ...filterValues,
                    storeId: undefined,
                    storeLabel: undefined,
                  });
                  setCursor(undefined);
                }}
                testId="filter-store"
              />
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field fieldKey="project" label={tFilters('project')} expandable>
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
                inlineFetcher={async (q): Promise<PickerItem[]> => {
                  const r = await api.get<{ items: { id: string; name: string }[] }>(
                    `/projects?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return r.items.map((x) => ({ id: x.id, primary: x.name }));
                }}
                onInlineSelect={(item) => {
                  setExtFilter({
                    ...extFilter,
                    projectId: item.id,
                    projectLabel: String(item.primary),
                  });
                  setCursor(undefined);
                }}
                onClear={() => {
                  setExtFilter({ ...extFilter, projectId: undefined, projectLabel: undefined });
                  setCursor(undefined);
                }}
                testId="filter-project"
              />
            </InlineFilterPanel.Field>
            {/* 4. Резерв — reservation progress against reservedSumMinor. */}
            <InlineFilterPanel.Field
              fieldKey="reserve"
              label={tFilters('reserve_status')}
              expandable
            >
              <NativeSelect
                value={extFilter.reservedStatus ?? ''}
                onChange={(e) => {
                  setExtFilter({
                    ...extFilter,
                    reservedStatus: (e.target.value || undefined) as
                      | 'none'
                      | 'partial'
                      | 'full'
                      | undefined,
                  });
                  setCursor(undefined);
                }}
                data-test-id="filter-reserve-status"
              >
                <option value="" />
                <option value="none">{tFilters('reserve_none')}</option>
                <option value="partial">{tFilters('reserve_partial')}</option>
                <option value="full">{tFilters('reserve_full')}</option>
              </NativeSelect>
            </InlineFilterPanel.Field>
            {/* 5. Контрагент */}
            <InlineFilterPanel.Field fieldKey="agent" label={tFilters('agent')} expandable>
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
                inlineFetcher={async (q): Promise<PickerItem[]> => {
                  const r = await api.get<{
                    items: { id: string; name: string; phone?: string }[];
                  }>(`/counterparties?search=${encodeURIComponent(q)}&limit=20`);
                  const items = r.items.map((x) => ({
                    id: x.id,
                    primary: x.name,
                    secondary: x.phone ?? undefined,
                  }));
                  return pinDefaultCustomer(
                    items,
                    userDefaults.data?.defaultCustomer,
                    q,
                    tForm('pinned_default'),
                  );
                }}
                onInlineSelect={(item) => {
                  setFilterValues({
                    ...filterValues,
                    agentId: item.id,
                    agentLabel: String(item.primary),
                  });
                  setCursor(undefined);
                }}
                onClear={() => {
                  setFilterValues({
                    ...filterValues,
                    agentId: undefined,
                    agentLabel: undefined,
                  });
                  setCursor(undefined);
                }}
                testId="filter-agent"
              />
            </InlineFilterPanel.Field>
            {/* 6. Группа контрагента */}
            <InlineFilterPanel.Field
              fieldKey="agentGroup"
              label={tFilters('agent_group')}
              expandable
            >
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
                inlineFetcher={async (q): Promise<PickerItem[]> => {
                  const r = await api.get<{ items: { id: string; name: string }[] }>(
                    `/groups?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return r.items.map((x) => ({ id: x.id, primary: x.name }));
                }}
                onInlineSelect={(item) => {
                  setExtFilter({
                    ...extFilter,
                    agentGroupId: item.id,
                    agentGroupLabel: String(item.primary),
                  });
                  setCursor(undefined);
                }}
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
            {/* 7. Счёт контрагента — disabled until agent picked. */}
            <InlineFilterPanel.Field
              fieldKey="agentAccount"
              label={tFilters('agent_account')}
              expandable
            >
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
                onPick={() => filterValues.agentId && setPickerOpen('agentAccount')}
                inlineFetcher={async (q): Promise<PickerItem[]> => {
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
                disabled={!filterValues.agentId}
                disabledHint={tFilters('agent_account_disabled_hint')}
                testId="filter-agent-account"
              />
            </InlineFilterPanel.Field>
            {/* 8. Договор */}
            <InlineFilterPanel.Field fieldKey="contract" label={tFilters('contract')} expandable>
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
                inlineFetcher={async (q): Promise<PickerItem[]> => {
                  const r = await api.get<{ items: { id: string; name: string }[] }>(
                    `/contracts?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return r.items.map((x) => ({ id: x.id, primary: x.name }));
                }}
                onInlineSelect={(item) => {
                  setExtFilter({
                    ...extFilter,
                    contractId: item.id,
                    contractLabel: String(item.primary),
                  });
                  setCursor(undefined);
                }}
                onClear={() => {
                  setExtFilter({ ...extFilter, contractId: undefined, contractLabel: undefined });
                  setCursor(undefined);
                }}
                testId="filter-contract"
              />
            </InlineFilterPanel.Field>
            {/* 9. Организация */}
            <InlineFilterPanel.Field
              fieldKey="organization"
              label={tFilters('organization')}
              expandable
            >
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
                inlineFetcher={async (q): Promise<PickerItem[]> => {
                  const r = await api.get<{ items: { id: string; name: string }[] }>(
                    `/organizations?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return r.items.map((x) => ({ id: x.id, primary: x.name }));
                }}
                onInlineSelect={(item) => {
                  setFilterValues({
                    ...filterValues,
                    organizationId: item.id,
                    organizationLabel: String(item.primary),
                  });
                  setCursor(undefined);
                }}
                onClear={() => {
                  setFilterValues({
                    ...filterValues,
                    organizationId: undefined,
                    organizationLabel: undefined,
                  });
                  setCursor(undefined);
                }}
                testId="filter-organization"
              />
            </InlineFilterPanel.Field>
            {/* 10. Счёт организации — disabled until organization picked. */}
            <InlineFilterPanel.Field
              fieldKey="orgAccount"
              label={tFilters('organization_account')}
              expandable={false}
            >
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
                inlineFetcher={async (q): Promise<PickerItem[]> => {
                  if (!filterValues.organizationId) return [];
                  // moysklad parity: organization accounts come from the flat
                  // /organization-accounts?organizationId= route (mirror the detail-form
                  // organizationAccountFetcher). Default accounts have accountNumber=null,
                  // so fall back to the account name for the headline.
                  const orgAcctParams = new URLSearchParams({ search: q, limit: '50' });
                  orgAcctParams.set('organizationId', filterValues.organizationId);
                  const r = await api.get<{
                    items: {
                      id: string;
                      name: string;
                      accountNumber: string | null;
                      bankName: string | null;
                    }[];
                  }>(`/organization-accounts?${orgAcctParams.toString()}`);
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
                disabled={!filterValues.organizationId}
                disabledHint={tFilters('org_account_disabled_hint')}
                testId="filter-org-account"
              />
            </InlineFilterPanel.Field>
            {/* 11. Проект */}
            {/* 11a. Tovar yoki guruh — productId picker. */}
            {/* 12. Статус — by the account's custom statuses (matches the list
                column) when defined; else the FSM-state dropdown. */}
            <InlineFilterPanel.Field fieldKey="status" label={tFilters('state')} expandable>
              {customStatuses.length > 0 ? (
                <NativeSelect
                  value={extFilter.statusId ?? ''}
                  onChange={(e) => {
                    setExtFilter({ ...extFilter, statusId: e.target.value || undefined });
                    setCursor(undefined);
                  }}
                  data-test-id="filter-status"
                >
                  <option value="" />
                  {customStatuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <NativeSelect
                  value={extFilter.state ?? ''}
                  onChange={(e) => {
                    setExtFilter({ ...extFilter, state: e.target.value || undefined });
                    setCursor(undefined);
                  }}
                  data-test-id="filter-state"
                >
                  <option value="" />
                  {[
                    'draft',
                    'confirmed',
                    'awaiting_payment',
                    'paid',
                    'partially_shipped',
                    'fully_shipped',
                    'closed',
                    'cancelled',
                  ].map((s) => (
                    <option key={s} value={s}>
                      {tStates(s)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </InlineFilterPanel.Field>
            {/* 12a. Custom «Дополнительные поля» — one dynamic field per active
                CustomerOrder attribute (moysklad shows «Уста», «Санаси», …
                right after «Статус»). Type-aware controls: reference → inline
                counterparty/entity typeahead; date → from–to range; enum →
                select; boolean → ✓/—; else a contains text box. */}
            {attrMetas.map((attr) => {
              const fieldKey = `attr_${attr.code}`;
              const fv = attrFilters[attr.code] ?? {};
              if (attr.type === 'date') {
                return (
                  <InlineFilterPanel.Field
                    label={attr.name}
                    inlineSuffix={
                      <PeriodShortcuts
                        onChange={({ from, to }) => setAttr(attr.code, { from, to })}
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
                      from={fv.from}
                      to={fv.to}
                      onChange={({ from, to }) => setAttr(attr.code, { from, to })}
                      testId={`filter-${fieldKey}`}
                    />
                  </InlineFilterPanel.Field>
                );
              }
              if (attr.type === 'reference' && attr.referenceEntity) {
                const endpoint = ATTR_REF_ENDPOINT[attr.referenceEntity];
                if (endpoint) {
                  return (
                    <InlineFilterPanel.Field key={attr.code} fieldKey={fieldKey} label={attr.name}>
                      <CatalogPickerField
                        value={fv.value ? { id: fv.value, label: fv.label ?? fv.value } : null}
                        placeholder=""
                        // Inline typeahead is the interaction; no separate modal
                        // for dynamic attrs (clear via the panel's «Очистить»).
                        onPick={() => {}}
                        inlineFetcher={async (q): Promise<PickerItem[]> => {
                          const r = await api.get<{ items: { id: string; name: string }[] }>(
                            `${endpoint}?search=${encodeURIComponent(q)}&limit=20`,
                          );
                          return r.items.map((x) => ({ id: x.id, primary: x.name }));
                        }}
                        onInlineSelect={(item) =>
                          setAttr(attr.code, { value: item.id, label: String(item.primary) })
                        }
                        testId={`filter-${fieldKey}`}
                      />
                    </InlineFilterPanel.Field>
                  );
                }
              }
              if (attr.type === 'enum' && attr.enumOptions) {
                return (
                  <InlineFilterPanel.Field key={attr.code} fieldKey={fieldKey} label={attr.name}>
                    <NativeSelect
                      value={fv.value ?? ''}
                      onChange={(e) => setAttr(attr.code, { value: e.target.value || undefined })}
                      data-test-id={`filter-${fieldKey}`}
                    >
                      <option value="" />
                      {attr.enumOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </InlineFilterPanel.Field>
                );
              }
              if (attr.type === 'boolean') {
                return (
                  <InlineFilterPanel.Field key={attr.code} fieldKey={fieldKey} label={attr.name}>
                    <YesNoSelect
                      value={fv.value === 'true' || fv.value === 'false' ? fv.value : undefined}
                      onChange={(v) => setAttr(attr.code, { value: v })}
                      testId={`filter-${fieldKey}`}
                    />
                  </InlineFilterPanel.Field>
                );
              }
              // string / text / link / long / double / unsupported reference →
              // a plain contains/equals text box.
              return (
                <InlineFilterPanel.Field key={attr.code} fieldKey={fieldKey} label={attr.name}>
                  <Input
                    value={fv.value ?? ''}
                    onChange={(e) => setAttr(attr.code, { value: e.target.value || undefined })}
                    data-test-id={`filter-${fieldKey}`}
                  />
                </InlineFilterPanel.Field>
              );
            })}
            {/* 13. Проведено */}
            <InlineFilterPanel.Field
              fieldKey="applicable"
              label={tFilters('applicable')}
              expandable
            >
              <YesNoSelect
                value={extFilter.applicable}
                onChange={(v) => {
                  setExtFilter({ ...extFilter, applicable: v });
                  setCursor(undefined);
                }}
                testId="filter-applicable"
              />
            </InlineFilterPanel.Field>
            {/* 14. Напечатано */}
            <InlineFilterPanel.Field fieldKey="printed" label={tFilters('printed')} expandable>
              <YesNoSelect
                value={extFilter.printed}
                onChange={(v) => {
                  setExtFilter({ ...extFilter, printed: v });
                  setCursor(undefined);
                }}
                testId="filter-printed"
              />
            </InlineFilterPanel.Field>
            {/* 15. Отправлено */}
            <InlineFilterPanel.Field fieldKey="published" label={tFilters('published')} expandable>
              <YesNoSelect
                value={extFilter.published}
                onChange={(v) => {
                  setExtFilter({ ...extFilter, published: v });
                  setCursor(undefined);
                }}
                testId="filter-published"
              />
            </InlineFilterPanel.Field>
            {/* 15a. Общий доступ */}
            <InlineFilterPanel.Field fieldKey="shared" label={tFilters('shared')} expandable>
              <YesNoSelect
                value={extFilter.shared}
                onChange={(v) => {
                  setExtFilter({ ...extFilter, shared: v });
                  setCursor(undefined);
                }}
                testId="filter-shared"
              />
            </InlineFilterPanel.Field>
            {/* 16. Канал продаж */}
            <InlineFilterPanel.Field
              fieldKey="salesChannel"
              label={tFilters('sales_channel')}
              expandable
            >
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
                inlineFetcher={async (q): Promise<PickerItem[]> => {
                  const r = await api.get<{ items: { id: string; name: string }[] }>(
                    `/sales-channels?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return r.items.map((x) => ({ id: x.id, primary: x.name }));
                }}
                onInlineSelect={(item) => {
                  setExtFilter({
                    ...extFilter,
                    salesChannelId: item.id,
                    salesChannelLabel: String(item.primary),
                  });
                  setCursor(undefined);
                }}
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
            {/* 17. Владелец-сотрудник */}
            <InlineFilterPanel.Field
              fieldKey="ownerEmployee"
              label={tFilters('owner_employee')}
              expandable
            >
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
                inlineFetcher={async (q): Promise<PickerItem[]> => {
                  const r = await api.get<{ items: { id: string; name: string }[] }>(
                    `/employees?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return r.items.map((x) => ({ id: x.id, primary: x.name }));
                }}
                onInlineSelect={(item) => {
                  setFilterValues({
                    ...filterValues,
                    ownerId: item.id,
                    ownerLabel: String(item.primary),
                  });
                  setCursor(undefined);
                }}
                onClear={() => {
                  setFilterValues({
                    ...filterValues,
                    ownerId: undefined,
                    ownerLabel: undefined,
                  });
                  setCursor(undefined);
                }}
                testId="filter-owner"
              />
            </InlineFilterPanel.Field>
            {/* 18. Владелец-отдел */}
            <InlineFilterPanel.Field
              fieldKey="ownerDept"
              label={tFilters('owner_group')}
              expandable
            >
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
                inlineFetcher={async (q): Promise<PickerItem[]> => {
                  const r = await api.get<{ items: { id: string; name: string }[] }>(
                    `/groups?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return r.items.map((x) => ({ id: x.id, primary: x.name }));
                }}
                onInlineSelect={(item) => {
                  setExtFilter({
                    ...extFilter,
                    groupId: item.id,
                    groupLabel: String(item.primary),
                  });
                  setCursor(undefined);
                }}
                onClear={() => {
                  setExtFilter({ ...extFilter, groupId: undefined, groupLabel: undefined });
                  setCursor(undefined);
                }}
                testId="filter-group"
              />
            </InlineFilterPanel.Field>
            {/* Склад — moysklad CO filter (kept; not in the listed label set
                but a valid working field). */}
            {/* 19. Сумма — from / to bounds. */}
            <InlineFilterPanel.Field fieldKey="sumFrom" label={tFilters('sum_from')} expandable>
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
            <InlineFilterPanel.Field fieldKey="sumTo" label={tFilters('sum_to')} expandable>
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
            {/* 20. Когда изменен — updatedAt range. fieldKey wires it to the
                filter ⚙ visibility set, where it is HIDDEN by default (moysklad's
                CO filter does not surface «Когда изменен»; it's opt-in via the gear). */}
            <InlineFilterPanel.Field
              fieldKey="updatedRange"
              label={tFilters('updated_period')}
              inlineSuffix={
                <PeriodShortcuts
                  onChange={({ from, to }) => {
                    setExtFilter({
                      ...extFilter,
                      updatedFrom: from,
                      updatedTo: to,
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
                from={extFilter.updatedFrom}
                to={extFilter.updatedTo}
                onChange={({ from, to }) => {
                  setExtFilter({
                    ...extFilter,
                    updatedFrom: from,
                    updatedTo: to,
                  });
                  setCursor(undefined);
                }}
                testId="filter-updated"
              />
            </InlineFilterPanel.Field>
          </InlineFilterPanel>
        }
        hasNext={!!data?.nextCursor}
        hasPrevious={prevCursors.length > 0}
        onNext={() => {
          setPrevCursors((s) => [...s, cursor]);
          setCursor(data?.nextCursor);
        }}
        onPrevious={() => {
          const prev = prevCursors[prevCursors.length - 1];
          setPrevCursors((s) => s.slice(0, -1));
          setCursor(prev);
        }}
        loading={isLoading}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyTitle={search ? tCommon('no_results') : t('empty_title')}
        hasActiveFilter={!!search}
        richEmpty={{
          // All strings sourced from screenshots/37-default.png
          // (customerorder capture v2, 2026-04-30 sweep). Heading,
          // helper, CTA label, and the three resource link labels
          // are all verbatim from the moysklad UI.
          heading: t('empty_rich_heading'),
          cta: { label: t('empty_rich_cta'), href: '/customer-orders/new' },
          helper: { label: t('empty_rich_helper'), href: '/settings/integrations' },
          resources: [
            { label: t('empty_resource_guide'), href: '/help/customer-orders' },
            { label: t('empty_resource_video'), href: '/help/customer-orders/video' },
            { label: t('empty_resource_course'), href: '/help/customer-orders/course' },
          ],
        }}
        // No fillHeight — the user asked to remove the inner grid scroll completely.
        // The all-pages «Итого» row (footerRow, fed by /aggregate/totals) renders in
        // natural document flow at the end of the list instead of being pinned via an
        // internal scroll box. (Pinning WITHOUT an inner scroll = a sticky bottom bar,
        // as in counterparties/page.tsx — a follow-up if we want it pinned here too.)
        footerRow={showTotals ? footerRow : undefined}
        footerToggle={
          <button
            type="button"
            onClick={() => setShowTotals((v) => !v)}
            className="whitespace-nowrap px-2 py-1 text-[var(--ms-text-brand)] text-xs hover:underline"
            data-test-id="co-totals-toggle"
          >
            {showTotals ? t('hide_totals') : t('show_totals')}
          </button>
        }
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          setCursor(undefined);
        }}
        {...bulk.listViewProps}
        // bulkActionBar intentionally omitted — moysklad surfaces bulk
        // actions through the toolbar Изменить/Статус/Создать/Печать
        // dropdowns instead of a bottom sticky bar.
        visibleColumnKeys={cols.visibleKeys}
        extraActionsLeft={
          /* Filter-toggle goes BEFORE the inline search per moysklad's
           i-default.png ordering. ListView places search + 0 counter
           after this slot, then renders the bulk-action dropdowns. */
          <FilterToggleButton
            open={filterOpen}
            onToggle={() => setFilterOpen((v) => !v)}
            label={tFilters('trigger')}
          />
        }
        extraActions={
          // moysklad parity: dropdowns only in the toolbar — no
          // ExportButton icon, no ColumnCustomizer (moved to the table
          // header gear via `headerEndSlot`). Print menu's «Список
          // заказов» item already triggers handleListExport.
          <>
            <BulkActionsDropdown
              selectedIds={bulk.selectedIds}
              listQueryKey={listQueryKey}
              onClearSelection={bulk.clearSelection}
              confirmedCount={confirmedCount}
              onMassEdit={() => {
                setMassEditIds(Array.from(bulk.selectedIds));
                setMassEditOwner(null);
                setMassEditProject(null);
                setMassEditOpen(true);
              }}
            />
            <StatusChangeDropdown
              selectedIds={bulk.selectedIds}
              listQueryKey={listQueryKey}
              onClearSelection={bulk.clearSelection}
              customStatuses={customStatuses}
            />
            <CreateRelatedDropdown selectedIds={bulk.selectedIds} />
            <PrintDropdown
              onExportList={handleListExport}
              canPrintOrder={bulk.selectedIds.size > 0}
              onPrintOrder={() => bulk.bulkPrint.mutateAsync(Array.from(bulk.selectedIds))}
              selectedIds={bulk.selectedIds}
            />
            {/* moysklad-parity «Столбцы» toolbar button (after Печать) — the
                visible column control. Shares the same column-visibility state
                as the table-header gear. */}
            <ColumnSettings
              label={t('columns_button')}
              columns={columns.map((c) => ({ key: c.key, label: c.header }))}
              visibleKeys={cols.visibleKeys}
              onChange={cols.setVisibleKeys}
              onReset={cols.reset}
            />
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

      {/* Filter pickers — opened from <InlineFilterPanel.Field>. */}
      <CatalogPicker
        open={pickerOpen === 'agent'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('agent')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/counterparties?search=${encodeURIComponent(q)}&limit=20`,
          );
          const items = r.items.map((x) => ({ id: x.id, primary: x.name }));
          return pinDefaultCustomer(
            items,
            userDefaults.data?.defaultCustomer,
            q,
            tForm('pinned_default'),
          );
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
        open={pickerOpen === 'product'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('product_or_group')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string; code: string | null }[] }>(
            `/products?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({
            id: x.id,
            primary: x.name,
            secondary: x.code ?? undefined,
          }));
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
