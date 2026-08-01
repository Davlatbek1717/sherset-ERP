'use client';

import { ColumnSettings } from '@/components/column-settings';
import { BulkActionsDropdown } from '@/components/customer-orders/bulk-actions-dropdown';
import { CreateRelatedDropdown } from '@/components/customer-orders/create-related-dropdown';
import { CustomerOrderKanban } from '@/components/customer-orders/kanban-board';
import { PrintDropdown } from '@/components/customer-orders/print-dropdown';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { StatusChangeDropdown } from '@/components/customer-orders/status-change-dropdown';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { stashBulkEdit } from '@/lib/bulk-edit-nav';
import { filterFromQueryString } from '@/lib/filter-from-query';
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
  MultiCombobox,
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
import { useRouter } from 'next/navigation';
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

/** Multi-select reference field — moysklad checkbox-dropdown holds {id,label}[]. */
type RefMulti = { id: string; label: string };

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
  const tMass = useTranslations('mass_edit_modal');
  // tStates feeds the inline filter's FSM-state dropdown (shown only for
  // accounts that define no custom order statuses).
  const tStates = useTranslations('states.customer_order');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [filterOpen, setFilterOpen] = useState(true);
  // moysklad «Список | Столбцы» view toggle — 'columns' renders the custom-status
  // kanban board («новый дизайн реестров документов») in place of the flat table.
  const [view, setView] = useState<'list' | 'columns'>('list');
  const [pickerOpen, setPickerOpen] = useState<
    | null
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
  // «Контрагент» / «Организация» — moysklad-parity inline multi-select checkbox
  // dropdowns (MultiCombobox), replacing the old single-select modals. Each holds
  // the picked {id,label} pairs; on the wire they go out as `<field>Ids` CSV. The
  // «Контрагент» dropdown shows the phone as a sublabel and searches by name OR
  // phone (BE /counterparties?search= already matches both). The dependent
  // «Счёт…» account pickers scope to the FIRST selected agent/org (agents[0]).
  const [agents, setAgents] = useState<RefMulti[]>([]);
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);
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
    // «План. дата отгрузки» period (moysklad first filter row, grounded 2026-07-31)
    deliveryPlannedFrom?: string;
    deliveryPlannedTo?: string;
    // «Адрес доставки» — free-text substring
    shipmentAddress?: string;
    // «Владелец контрагента» — the COUNTERPARTY's owner (Counterparty.ownerId),
    // a different person from the order's own «Владелец-сотрудник».
    agentOwnerId?: string;
    agentOwnerLabel?: string;
    // «Срок задачи» — open-task deadline range
    taskDueFrom?: string;
    taskDueTo?: string;
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
  if (agents.length) paramsRecord.agentIds = agents.map((x) => x.id).join(',');
  if (organizations.length) paramsRecord.organizationIds = organizations.map((x) => x.id).join(',');
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
  if (extFilter.deliveryPlannedFrom)
    paramsRecord.deliveryPlannedFrom = extFilter.deliveryPlannedFrom;
  if (extFilter.deliveryPlannedTo) paramsRecord.deliveryPlannedTo = extFilter.deliveryPlannedTo;
  if (extFilter.shipmentAddress?.trim())
    paramsRecord.shipmentAddress = extFilter.shipmentAddress.trim();
  if (extFilter.agentOwnerId) paramsRecord.agentOwnerId = extFilter.agentOwnerId;
  if (extFilter.taskDueFrom) paramsRecord.taskDueFrom = extFilter.taskDueFrom;
  if (extFilter.taskDueTo) paramsRecord.taskDueTo = extFilter.taskDueTo;
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

  // Saved-filter query string — the live `params` already carry the agentIds /
  // organizationIds CSV, but a bare CSV loses the picked labels. Append the
  // picked {id,label}[] as JSON so a re-applied pill restores the checkbox chips
  // with their names (not bare UUIDs); every other field round-trips via params.
  const savedFilterQuery = (() => {
    const p = new URLSearchParams(params);
    if (agents.length) p.set('agents', JSON.stringify(agents));
    if (organizations.length) p.set('organizations', JSON.stringify(organizations));
    return p.toString();
  })();

  const listQueryKey = [
    'customer-orders',
    search,
    cursor,
    sortKey,
    sortDir,
    filterValues,
    agents,
    organizations,
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
  // «Итого» all-pages strip. Re-grounded 2026-07-31 on the LIVE #customerorder
  // list (elektro_sentr, 5 orders): the totals row renders IMMEDIATELY above the
  // «1-5 из 5» pager and there is no «Показать итоги» link anywhere in the DOM.
  // The archived capture (older register design) DOES carry that link — so
  // moysklad's behaviour differs, and the previous unconditional link was wrong
  // for ordinary-sized lists.
  //
  // The perf reason behind the link is still real (the aggregate scans the whole
  // filtered set), so it is kept as a size guard rather than deleted: small lists
  // compute totals automatically, large ones keep the opt-in link. `showTotals`
  // still gates BOTH the query (enabled) and the footer strip.
  const AUTO_TOTALS_MAX_ROWS = 500;
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
  // Auto-reveal the totals strip once we know the filtered set is small — the
  // live moysklad list shows it with no interaction at all. Only ever turns the
  // flag ON: a user who clicked «Показать итоги» on a huge list must not have it
  // yanked away when they narrow the filter and the count drops.
  useEffect(() => {
    const total = data?.total;
    if (!showTotals && typeof total === 'number' && total <= AUTO_TOTALS_MAX_ROWS)
      setShowTotals(true);
  }, [data?.total, showTotals]);

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
    // Re-grounded 2026-07-31 on the LIVE #customerorder register (elektro_sentr):
    // №·Время·Контрагент·Организация·Сумма·Валюта·Выставлено счетов·Оплачено·
    // Отгружено·**Зарезервировано**·Статус·Отправлено·Напечатано·Комментарий.
    // «Зарезервировано» IS default-visible there — the earlier note said it was
    // not (parity delta #1). It could only be enabled once the app-shell 1440px
    // content cap was lifted: before that the grid already needed 1870px in a
    // 1402px box. Container is now ~1642px on a 1680px viewport.
    // «Не оплачено» stays as our deliberate extra (owner decision 2026-07-31) —
    // moysklad does not show it.
    'currency',
    'invoicedSum',
    'payedSum',
    'unpaidSum',
    'shippedSum',
    'reservedSum',
    'state',
    'published',
    'printed',
    'description',
  ]);

  // moysklad parity: column-width persistence per user (drag handles
  // on the right edge of each header). Tour 5 D7 — wired same way as
  // purchase-orders.
  const colWidths = useColumnWidths('customer-orders');

  // moysklad ⚙ filter field-visibility. The default array = the keys HIDDEN on
  // first load (useColumnVisibility's `visibleKeys` stores the HIDDEN set here,
  // same as products/purchase-orders use it). Each <InlineFilterPanel.Field>
  // carries a stable, locale-independent `fieldKey`; a key in this set hides it.
  //
  // Re-grounded 2026-07-31 on the LIVE #customerorder list (elektro_sentr): the
  // filter panel there opens with ALL ~29 fields expanded — Период · Оплата ·
  // Отгружено · План. дата отгрузки · Товар или группа · Тип возврата · Склад ·
  // Проект · Контрагент · Группа контрагента · Счет контрагента · Договор ·
  // Владелец контрагента · Организация · Счет организации · Статус · Проведено ·
  // Напечатано · Отправлено · Канал продаж · Адрес доставки · Комментарий к
  // адресу доставки · Владелец-сотрудник · Владелец-отдел · Общий доступ ·
  // Когда изменен · Кто изменил · Ближайшая задача · Срок задачи.
  // Nothing is tucked behind the gear. The previous note here claimed moysklad
  // shows "a compact ~10-field set" — the capture REFUTES that, so the hidden
  // set is now empty (parity delta #13). Users can still hide fields via the ⚙;
  // the choice persists per-user through useColumnVisibility.
  const filterHidden = useColumnVisibility('customer-orders-filter-hidden', []);

  // moysklad's customer-orders list does NOT use pill sub-tabs for the
  // status quick-filter — instead it surfaces "Статус" as a dropdown in
  // the toolbar (handled by FilterDrawer below) and keeps the row chrome
  // un-tabbed. Removing the sub-tabs here brings the page in line with
  // the moysklad capture (see docs/moysklad-reference/visual-captures/
  // 03-module/customerorder/dom/01-default.html — no `.list-tabs` node).
  const filters: ListViewFilter[] = [];

  // Column widths — compacted 2026-07-31 (parity delta #5). Measured before:
  // the default column set summed to 1870px inside a 1402px container, i.e. a
  // 475px horizontal overflow that clipped «Статус» onward off the right edge
  // and squeezed «Комментарий» to literally 0px. moysklad fits its whole
  // register row in the window, so the widths here follow its compact scale.
  //
  // The 1402px budget comes from the APP shell («min-[1600px]:max-w-[1440px]»),
  // not from this page — moysklad does not cap register width, but changing that
  // cap is an app-wide layout decision and is deliberately out of scope here.
  // Toggling extra columns on via the ⚙ can still overflow (so does moysklad).
  const columns: DataTableColumn<CustomerOrderRow>[] = [
    {
      key: 'name',
      header: '№',
      width: '70px',
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
      width: '105px',
      sortable: true,
      cell: (o) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {formatDate(o.moment)}
        </span>
      ),
      cellText: (r: CustomerOrderRow) => formatDate(r.moment),
    },
    {
      key: 'agent',
      header: tFields('agent'),
      width: '130px',
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
      width: '120px',
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
      width: '95px',
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
      width: '45px',
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
      width: '95px',
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
      width: '90px',
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
      width: '95px',
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
      width: '90px',
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
      width: '95px',
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
      width: '110px',
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
      width: '90px',
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
      width: '90px',
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
      // Had no width at all, so the browser gave it whatever was left after the
      // fixed columns — which, once they overflowed, was 0px: «Комментарий»
      // rendered as a zero-width column (measured 2026-07-31). Give it a real
      // share of the row like moysklad's trailing comment column.
      width: '90px',
      cell: (o) => (
        <span className="block max-w-full truncate text-[var(--ms-text-muted)] text-[11px]">
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
        body={
          // moysklad «Столбцы» kanban replaces the table when the «Список |
          // Столбцы» toggle is on 'columns'; reuses the SAME filter query as the
          // list so the board respects Период/Контрагент/search/etc.
          view === 'columns' ? <CustomerOrderKanban filterQuery={params.toString()} /> : undefined
        }
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
              setAgents([]);
              setOrganizations([]);
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
                currentQueryString={savedFilterQuery}
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
                  // Restore the multi-select «Контрагент» / «Организация» dropdowns:
                  // prefer the JSON label arrays (chips keep their names), else the
                  // *Ids CSV, else a legacy single *Id param (ids only).
                  const parseRefList = (key: string): RefMulti[] => {
                    try {
                      const raw = usp.get(key);
                      if (!raw) return [];
                      const arr: unknown = JSON.parse(raw);
                      return Array.isArray(arr)
                        ? arr
                            .filter(
                              (x): x is { id: string; label?: unknown } =>
                                !!x && typeof (x as { id?: unknown }).id === 'string',
                            )
                            .map((x) => ({ id: x.id, label: String(x.label ?? x.id) }))
                        : [];
                    } catch {
                      return [];
                    }
                  };
                  const restoreRefs = (
                    jsonKey: string,
                    csvKey: string,
                    singleKey: string,
                  ): RefMulti[] => {
                    const j = parseRefList(jsonKey);
                    if (j.length) return j;
                    const csv = usp.get(csvKey);
                    if (csv)
                      return csv
                        .split(',')
                        .filter(Boolean)
                        .map((id) => ({ id, label: id }));
                    const single = usp.get(singleKey);
                    if (single) return [{ id: single, label: single }];
                    return [];
                  };
                  setAgents(restoreRefs('agents', 'agentIds', 'agentId'));
                  setOrganizations(
                    restoreRefs('organizations', 'organizationIds', 'organizationId'),
                  );
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
                    deliveryPlannedFrom: pickStr('deliveryPlannedFrom'),
                    deliveryPlannedTo: pickStr('deliveryPlannedTo'),
                    shipmentAddress: pickStr('shipmentAddress'),
                    agentOwnerId: pickStr('agentOwnerId'),
                    taskDueFrom: pickStr('taskDueFrom'),
                    taskDueTo: pickStr('taskDueTo'),
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
                {/* Order matches the live moysklad «Оплата» dropdown (grounded
                    2026-07-31): Оплачено → Частично оплачено → Не оплачено.
                    Ours listed them reversed (parity delta #23). */}
                <option value="paid">{tFilters('payment_paid')}</option>
                <option value="partial">{tFilters('payment_partial')}</option>
                <option value="unpaid">{tFilters('payment_unpaid')}</option>
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
            {/* 3b. План. дата отгрузки — moysklad puts this in the FIRST filter row,
                right after «Отгружено» (grounded 2026-07-31 on the live #customerorder
                filter panel). Backed by CustomerOrder.deliveryPlannedMoment; the API
                takes deliveryPlannedFrom/To with the same Tashkent-day bounds as
                «Период». */}
            <InlineFilterPanel.Field
              fieldKey="deliveryPlannedRange"
              label={tFields('delivery_planned')}
              inlineSuffix={
                <PeriodShortcuts
                  onChange={({ from, to }) => {
                    setExtFilter({
                      ...extFilter,
                      deliveryPlannedFrom: from,
                      deliveryPlannedTo: to,
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
                from={extFilter.deliveryPlannedFrom}
                to={extFilter.deliveryPlannedTo}
                onChange={({ from, to }) => {
                  setExtFilter({
                    ...extFilter,
                    deliveryPlannedFrom: from,
                    deliveryPlannedTo: to,
                  });
                  setCursor(undefined);
                }}
                testId="filter-delivery-planned"
              />
            </InlineFilterPanel.Field>
            {/* 3c. Адрес доставки — case-insensitive substring on
                CustomerOrder.shipmentAddress. */}
            <InlineFilterPanel.Field fieldKey="shipmentAddress" label={tFields('delivery_address')}>
              <Input
                value={extFilter.shipmentAddress ?? ''}
                onChange={(e) => {
                  setExtFilter({
                    ...extFilter,
                    shipmentAddress: e.target.value || undefined,
                  });
                  setCursor(undefined);
                }}
                data-test-id="filter-shipment-address"
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
            {/* 5. Контрагент — moysklad-parity inline multi-select checkbox
                dropdown: type a name OR phone, results appear inline (each row
                shows the phone as a sublabel), tick as many as needed. Was a
                single-select modal. */}
            <InlineFilterPanel.Field fieldKey="agent" label={tFilters('agent')} expandable>
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
                onPick={() => agents[0]?.id && setPickerOpen('agentAccount')}
                inlineFetcher={async (q): Promise<PickerItem[]> => {
                  const agentId = agents[0]?.id;
                  if (!agentId) return [];
                  // moysklad parity: counterparty bank accounts have only the nested
                  // /counterparties/:id/bank-accounts route (raw array, no search param) —
                  // mirror the detail-form agentAccountFetcher and client-filter by search.
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
            {/* 8b. Владелец контрагента — the COUNTERPARTY's owner, which moysklad
                lists right after «Договор». Distinct from «Владелец-сотрудник»
                (the order's own owner) further down. Backed by
                CustomerOrderFilterSchema.agentOwnerId → `agent: { ownerId }`. */}
            <InlineFilterPanel.Field fieldKey="agentOwner" label={tFilters('agent_owner')}>
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
                // Inline-only: the employee list is small enough to pick from the
                // dropdown, so no modal picker is wired (unlike «Владелец-сотрудник»,
                // which predates the inline fetcher). onPick is required by the type.
                onPick={() => {}}
                inlineFetcher={async (q): Promise<PickerItem[]> => {
                  const r = await api.get<{ items: { id: string; name: string }[] }>(
                    `/employees?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return r.items.map((x) => ({ id: x.id, primary: x.name }));
                }}
                onInlineSelect={(item) => {
                  setExtFilter({
                    ...extFilter,
                    agentOwnerId: item.id,
                    agentOwnerLabel: String(item.primary),
                  });
                  setCursor(undefined);
                }}
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
            {/* 9. Организация — moysklad-parity inline multi-select checkbox
                dropdown (was a single-select modal). */}
            <InlineFilterPanel.Field
              fieldKey="organization"
              label={tFilters('organization')}
              expandable
            >
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
                onPick={() => organizations[0]?.id && setPickerOpen('orgAccount')}
                inlineFetcher={async (q): Promise<PickerItem[]> => {
                  const organizationId = organizations[0]?.id;
                  if (!organizationId) return [];
                  // moysklad parity: organization accounts come from the flat
                  // /organization-accounts?organizationId= route (mirror the detail-form
                  // organizationAccountFetcher). Default accounts have accountNumber=null,
                  // so fall back to the account name for the headline.
                  const orgAcctParams = new URLSearchParams({ search: q, limit: '50' });
                  orgAcctParams.set('organizationId', organizationId);
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
                disabled={!organizations[0]?.id}
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
            {/* 19b. Срок задачи — deadline of an OPEN task linked to the order.
                moysklad renders it with the same вч·сег·нед·мес shortcuts as
                «Период» (grounded 2026-07-31). Backed by taskDueFrom/To; the API
                resolves it through Task.entity/entityId (no Prisma relation).
                «Ближайшая задача» (#20) is deliberately NOT here — the capture
                shows a combobox whose options a static DOM dump cannot reveal. */}
            <InlineFilterPanel.Field
              fieldKey="taskDueRange"
              label={tFilters('task_due')}
              inlineSuffix={
                <PeriodShortcuts
                  onChange={({ from, to }) => {
                    setExtFilter({ ...extFilter, taskDueFrom: from, taskDueTo: to });
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
                from={extFilter.taskDueFrom}
                to={extFilter.taskDueTo}
                onChange={({ from, to }) => {
                  setExtFilter({ ...extFilter, taskDueFrom: from, taskDueTo: to });
                  setCursor(undefined);
                }}
                testId="filter-task-due"
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
          <>
            <FilterToggleButton
              open={filterOpen}
              onToggle={() => setFilterOpen((v) => !v)}
              label={tFilters('trigger')}
            />
            {/* moysklad «Список | Столбцы» segmented view toggle (new-design
                реестров) — «Столбцы» swaps the flat table for the status
                kanban; «Список» is the default table. Sits right after Фильтр. */}
            <div
              className="inline-flex items-center gap-0.5 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] p-0.5"
              data-test-id="co-view-toggle"
            >
              <button
                type="button"
                onClick={() => setView('list')}
                className={`rounded-[var(--ms-radius-default)] px-3 py-1 text-sm transition-colors ${view === 'list' ? 'bg-[var(--ms-bg-surface)] font-medium text-[var(--ms-text-primary)] shadow-sm' : 'text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'}`}
                data-test-id="co-view-list"
              >
                {t('view_list')}
              </button>
              <button
                type="button"
                onClick={() => setView('columns')}
                className={`rounded-[var(--ms-radius-default)] px-3 py-1 text-sm transition-colors ${view === 'columns' ? 'bg-[var(--ms-bg-surface)] font-medium text-[var(--ms-text-primary)] shadow-sm' : 'text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'}`}
                data-test-id="co-view-columns"
              >
                {t('columns_button')}
              </button>
            </div>
          </>
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
                stashBulkEdit({
                  entity: 'customer-orders',
                  ids:
                    bulk.selectedIds.size > 0
                      ? Array.from(bulk.selectedIds)
                      : (data?.items ?? []).map((r) => r.id),
                  from: '/customer-orders',
                });
                router.push('/bulk-edit');
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
            {/* The old toolbar «Столбцы» column-visibility button is gone: that
                slot is now the «Список | Столбцы» VIEW toggle (extraActionsLeft,
                moysklad new-design реестров). Column visibility now lives solely
                on the table-header gear below (headerEndSlot). */}
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

      {/* Filter pickers — opened from <InlineFilterPanel.Field>. «Контрагент» and
          «Организация» are now inline MultiCombobox dropdowns (no modal). */}
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
          const agentId = agents[0]?.id;
          if (!agentId) return [];
          // moysklad parity: counterparty bank accounts have only the nested
          // /counterparties/:id/bank-accounts route (raw array, no search param) —
          // mirror the detail-form agentAccountFetcher and client-filter by search.
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
          const organizationId = organizations[0]?.id;
          if (!organizationId) return [];
          // moysklad parity: organization accounts come from the flat
          // /organization-accounts?organizationId= route (mirror the detail-form
          // organizationAccountFetcher). Default accounts have accountNumber=null,
          // so fall back to the account name for the headline.
          const params = new URLSearchParams({ search: q, limit: '50' });
          params.set('organizationId', organizationId);
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
