'use client';

import { ColumnSettings } from '@/components/column-settings';
import { YesNoSelect } from '@/components/filters/filter-fields';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { PurchaseReturnBulkActionsDropdown } from '@/components/purchase-returns/bulk-actions-dropdown';
import { PurchaseReturnPrintDropdown } from '@/components/purchase-returns/print-dropdown';
import {
  type PurchaseReturnCustomStatus,
  PurchaseReturnStatusDropdown,
} from '@/components/purchase-returns/purchase-return-status-dropdown';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { stashBulkEdit } from '@/lib/bulk-edit-nav';
import {
  CatalogPicker,
  CatalogPickerField,
  type DataTableColumn,
  type FilterDrawerValues,
  InlineFilterPanel,
  ListView,
  MassEditModal,
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

interface PurchaseReturnRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  // moysklad parity (v2.2 audit): backend Prisma scalars surfaced.
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
  supply: { id: string; name: string } | null;
  // moysklad «Статус» column = account-defined CUSTOM workflow status (coloured
  // pill), NOT the FSM `state`. The list() service already includes it.
  status: { id: string; name: string; color: string | null } | null;
  _count: { positions: number };
}

interface ListResponse {
  items: PurchaseReturnRow[];
  nextCursor?: string;
  total: number;
}

// Moysklad parity — 100 rows per page.
const LIMIT = 100;

type PurchaseReturnStateKey = 'draft' | 'posted' | 'cancelled';

/** Generic typed select for the moysklad-parity «Оплата» filter (copied from
 *  the invoices-in LIST gold standard). The empty option is always unlabelled
 *  so unselecting feels exactly like moysklad does. */
function OptionSelect<T extends string>({
  value,
  options,
  onChange,
  testId,
}: {
  value: T | undefined;
  options: ReadonlyArray<{ readonly value: T; readonly ru: string; readonly uz: string }>;
  onChange: (v: T | undefined) => void;
  testId: string;
}) {
  return (
    <NativeSelect
      value={value ?? ''}
      onChange={(e) => onChange((e.target.value as T) || undefined)}
      data-test-id={testId}
    >
      <option value="" />
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.ru}
        </option>
      ))}
    </NativeSelect>
  );
}

/** «Оплата» — moysklad-parity tri-state select (copied from invoices-in LIST). */
const PAYMENT_OPTIONS = [
  { value: 'paid', ru: 'Оплачено', uz: "To'liq to'langan" },
  { value: 'partlyPaid', ru: 'Частично оплачено', uz: 'Qisman to’langan' },
  { value: 'unpaid', ru: 'Не оплачено', uz: "To'lanmagan" },
] as const;

/** «Статус» single-select — PurchaseReturn's FSM surfaces 3 states; moysklad
 *  renders it as a plain dropdown (no multi-tag picker, like supplies). */
function StateSelect({
  value,
  onChange,
  labeler,
  testId,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  labeler: (s: PurchaseReturnStateKey) => string;
  testId?: string;
}) {
  return (
    <NativeSelect
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      data-test-id={testId}
    >
      <option value="" />
      {(['draft', 'posted', 'cancelled'] as const).map((s) => (
        <option key={s} value={s}>
          {labeler(s)}
        </option>
      ))}
    </NativeSelect>
  );
}

/**
 * PurchaseReturn-specific extension fields stored alongside the shared
 * FilterDrawerValues shape. Local to this page (the shared
 * `useMoyskladDocFilter` hook is intentionally NOT used here —
 * purchase-returns mirrors the supplies / invoices-in inline-field gold
 * standard).
 */
type ExtraFilterFields = {
  applicable?: 'true' | 'false';
  printed?: 'true' | 'false';
  published?: 'true' | 'false';
  shared?: 'true' | 'false';
  ownerId?: string;
  ownerLabel?: string;
  updatedFrom?: string;
  updatedTo?: string;
  // «Дата приемки» period.
  receiptDateFrom?: string;
  receiptDateTo?: string;
  // Derived «Оплата» state filter.
  paymentState?: 'paid' | 'partlyPaid' | 'unpaid';
  // FK pickers
  agentGroupId?: string;
  agentGroupLabel?: string;
  agentAccountId?: string;
  agentAccountLabel?: string;
  organizationAccountId?: string;
  organizationAccountLabel?: string;
  groupId?: string;
  groupLabel?: string;
  projectId?: string;
  projectLabel?: string;
  contractId?: string;
  contractLabel?: string;
  productId?: string;
  productLabel?: string;
  agentOwnerId?: string;
  agentOwnerLabel?: string;
  modifiedById?: string;
  modifiedByLabel?: string;
};

/** Multi-select reference field — moysklad checkbox-dropdown holds {id,label}[]. */
type RefMulti = { id: string; label: string };

export default function PurchaseReturnsPage() {
  const t = useTranslations('pages.purchase_returns');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tMass = useTranslations('mass_edit_modal');
  const tPo = useTranslations('pages.purchase_orders');
  const tStates = useTranslations('states.purchase_return');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [filterValues, setFilterValues] = useState<FilterDrawerValues & ExtraFilterFields>({});
  // «Контрагент» / «Организация» — moysklad-parity inline multi-select checkbox
  // dropdowns (were single-select modals). The «Контрагент» dropdown shows the
  // phone as a sublabel and searches by name OR phone (BE /counterparties?search=
  // already matches both). On the wire they go out as `agentIds` / `organizationIds`
  // CSV. The dependent «Счёт…» account pickers scope to the FIRST selected
  // agent/org (agents[0]) since a bank account belongs to one.
  const [agents, setAgents] = useState<RefMulti[]>([]);
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);
  // moysklad parity (#purchasereturn 01-default.png): the list loads with the
  // filter panel COLLAPSED — only the «Фильтр» button shows until clicked.
  const [filterOpen, setFilterOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<
    | null
    | 'store'
    | 'owner'
    | 'agentGroup'
    | 'agentAccount'
    | 'orgAccount'
    | 'group'
    | 'project'
    | 'contract'
    | 'product'
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
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const onResetCursor = () => setCursor(undefined);

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(stateFilter ? { state: stateFilter } : {}),
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
    ...(filterValues.momentFrom ? { momentFrom: filterValues.momentFrom } : {}),
    ...(filterValues.momentTo ? { momentTo: filterValues.momentTo } : {}),
    ...(filterValues.receiptDateFrom ? { receiptDateFrom: filterValues.receiptDateFrom } : {}),
    ...(filterValues.receiptDateTo ? { receiptDateTo: filterValues.receiptDateTo } : {}),
    ...(filterValues.paymentState ? { paymentState: filterValues.paymentState } : {}),
    ...(agents.length ? { agentIds: agents.map((x) => x.id).join(',') } : {}),
    ...(organizations.length ? { organizationIds: organizations.map((x) => x.id).join(',') } : {}),
    ...(filterValues.storeId ? { storeId: filterValues.storeId } : {}),
    ...(filterValues.ownerId ? { ownerId: filterValues.ownerId } : {}),
    ...(filterValues.applicable ? { applicable: filterValues.applicable } : {}),
    ...(filterValues.printed ? { printed: filterValues.printed } : {}),
    ...(filterValues.published ? { published: filterValues.published } : {}),
    ...(filterValues.shared ? { shared: filterValues.shared } : {}),
    ...(filterValues.updatedFrom ? { updatedFrom: filterValues.updatedFrom } : {}),
    ...(filterValues.updatedTo ? { updatedTo: filterValues.updatedTo } : {}),
    ...(filterValues.agentGroupId ? { agentGroupId: filterValues.agentGroupId } : {}),
    ...(filterValues.agentAccountId ? { agentAccountId: filterValues.agentAccountId } : {}),
    ...(filterValues.organizationAccountId
      ? { organizationAccountId: filterValues.organizationAccountId }
      : {}),
    ...(filterValues.groupId ? { groupId: filterValues.groupId } : {}),
    ...(filterValues.projectId ? { projectId: filterValues.projectId } : {}),
    ...(filterValues.contractId ? { contractId: filterValues.contractId } : {}),
    ...(filterValues.productId ? { productId: filterValues.productId } : {}),
    ...(filterValues.agentOwnerId ? { agentOwnerId: filterValues.agentOwnerId } : {}),
    ...(filterValues.modifiedById ? { modifiedById: filterValues.modifiedById } : {}),
  });

  const listQueryKey = [
    'purchase-returns',
    search,
    stateFilter,
    cursor,
    sortKey,
    sortDir,
    params.toString(),
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/purchase-returns?${params.toString()}`),
  });

  // moysklad-parity pinned «Итого» footer — sums the «Сумма» column over ALL
  // filtered records (the SAME filter params, minus pagination/sort). A mixed-
  // currency set shows the base-UZS total (footerMoneyCells baseValuesMinor).
  const totalsParams = new URLSearchParams(params);
  totalsParams.delete('cursor');
  totalsParams.delete('limit');
  totalsParams.delete('sortBy');
  totalsParams.delete('sortDir');
  const totalsQs = totalsParams.toString();
  const { data: totals } = useQuery<{
    count: number;
    sumMinor: string;
    currencies: string[];
    baseSumMinor: string;
  }>({
    queryKey: ['purchase-returns-totals', totalsQs],
    queryFn: () => api.get(`/purchase-returns/aggregate/totals${totalsQs ? `?${totalsQs}` : ''}`),
    staleTime: 30_000,
  });

  // moysklad «Статус» dropdown — the account's custom return statuses (State
  // rows, entityType="purchasereturn"). archived=false: a retired status must
  // not be OFFERED for assigning. The return FSM («Провести») stays in «Изменить».
  const { data: statusData } = useQuery<{ items: PurchaseReturnCustomStatus[] }>({
    queryKey: ['states', 'purchasereturn'],
    queryFn: () =>
      api.get<{ items: PurchaseReturnCustomStatus[] }>(
        '/states?entityType=purchasereturn&archived=false&limit=250',
      ),
    staleTime: 60_000,
  });
  const purchaseReturnStatuses = statusData?.items ?? [];

  const bulk = useBulkDocumentActions('purchase-returns', listQueryKey, {
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
  // PurchaseReturnBulkActionsDropdown — disable Provedeno when every selected
  // row is already posted (mirrors moysklad's gwt-MenuItem-disabled).
  const postedCount = useMemo(() => {
    if (!data?.items?.length) return 0;
    let n = 0;
    for (const r of data.items) {
      if (bulk.selectedIds.has(r.id) && r.state === 'posted') n++;
    }
    return n;
  }, [data?.items, bulk.selectedIds]);
  // moysklad parity (LIVE-GROUND 2026-06-28 #purchasereturn): /purchasereturn
  // default columns are № · Время · Со склада · Организация · Контрагент ·
  // Сумма · Отправлено · Напечатано · Комментарий (Организация BEFORE
  // Контрагент). state + supply + currency stay available via the ⚙ gear.
  const cols = useColumnVisibility('purchase-returns', [
    'all',
    'draft',
    'posted',
    'cancelled',
    'name',
    'moment',
    'store',
    'organization',
    'agent',
    'sum',
    'published',
    'printed',
    'description',
  ]);
  const colWidths = useColumnWidths('purchase-returns');

  // moysklad's "Возвраты поставщикам" list has no status pill sub-tabs
  // (shared GWT list chrome). Status filtering is the "Статус" select
  // inside the inline filter panel below.

  const columns: DataTableColumn<PurchaseReturnRow>[] = [
    {
      key: 'name',
      header: tFields('number'),
      width: '140px',
      sortable: true,
      cell: (r) => (
        <a
          href={`/purchase-returns/${r.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {r.name}
        </a>
      ),
      cellText: (r: PurchaseReturnRow) => r.name,
    },
    {
      key: 'moment',
      header: tFields('time'),
      width: '120px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(r.moment)}</span>
      ),
      cellText: (r: PurchaseReturnRow) => formatDate(r.moment),
    },
    {
      // moysklad parity: «Со склада» on /purchasereturn (C4 audit).
      key: 'store',
      header: tFields('store_from'),
      width: '160px',
      sortable: true,
      cell: (r) => <span className="max-w-[160px] truncate text-sm">{r.store?.name ?? '—'}</span>,
      cellText: (r: PurchaseReturnRow) => r.store?.name ?? '',
    },
    {
      // moysklad parity (LIVE-GROUND 2026-06-28 #purchasereturn): «Организация»
      // comes BEFORE «Контрагент» in the default grid (…Со склада · Организация ·
      // Контрагент · Сумма…). Earlier audit had them reversed.
      key: 'organization',
      header: tFields('organization'),
      width: '180px',
      sortable: true,
      cell: (r) => (
        <span className="max-w-[180px] truncate text-sm">{r.organization?.name ?? '—'}</span>
      ),
      cellText: (r: PurchaseReturnRow) => r.organization?.name ?? '',
    },
    {
      key: 'agent',
      header: tFields('agent'),
      width: '220px',
      sortable: true,
      cell: (r) => (
        <div>
          <div className="max-w-[300px] truncate font-medium">{r.agent.name}</div>
          {r.agent.legalTitle && (
            <div className="max-w-[300px] truncate text-[var(--ms-text-muted)] text-[11px]">
              {r.agent.legalTitle}
            </div>
          )}
        </div>
      ),
      cellText: (r: PurchaseReturnRow) =>
        r.agent?.legalTitle ? `${r.agent.name} (${r.agent.legalTitle})` : (r.agent?.name ?? ''),
    },
    {
      key: 'sum',
      sortField: 'sumMinor',
      header: tFields('sum'),
      align: 'right',
      width: '180px',
      sortable: true,
      cell: (r) => (
        <span className="font-medium tabular-nums">
          {formatMoney(r.sumMinor, 'UZS', { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: PurchaseReturnRow) => (r.sumMinor ? formatMoney(r.sumMinor) : ''),
    },
    // moysklad parity (v2.2 audit): «Валюта» · «Отправлено» ·
    // «Напечатано» · «Комментарий».
    {
      key: 'currency',
      header: tFields('currency'),
      width: '90px',
      align: 'center',
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs uppercase">{r.currency}</span>
      ),
      cellText: (r: PurchaseReturnRow) => r.currency,
    },
    {
      key: 'published',
      header: tFields('published'),
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
      cellText: (r: PurchaseReturnRow) => (r.published ? tFields('published_badge') : ''),
    },
    {
      key: 'printed',
      header: tFields('printed'),
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
      cellText: (r: PurchaseReturnRow) => (r.printed ? tFields('printed_badge') : ''),
    },
    {
      key: 'description',
      header: tFields('description'),
      width: '220px',
      cell: (r) => (
        <span className="block max-w-[220px] truncate text-[var(--ms-text-muted)] text-[11px]">
          {r.description ?? ''}
        </span>
      ),
      cellText: (r: PurchaseReturnRow) => r.description ?? '',
    },
    // Bizning QO`SHIMCHA ustunlarimiz — capture`da yo`q, moysklad
    // ketma-ketligidan KEYIN turadi (2026-07-31 prod QA).
    // Ground-truth: №·Время·Со склада·Организация·Контрагент·Сумма·
    // Отправлено·Напечатано·Комментарий
    {
      key: 'supply',
      header: tFields('linked_supply'),
      width: '130px',
      cell: (r) =>
        r.supply ? (
          <a
            href={`/supplies/${r.supply.id}`}
            className="text-[var(--ms-text-brand)] text-sm underline-offset-2 hover:underline"
          >
            {r.supply.name}
          </a>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">{tCommon('none')}</span>
        ),
    },
    {
      // moysklad parity: «Статус» column = the account-defined CUSTOM status
      // (coloured pill), NOT the FSM state. Grey «Status» placeholder until one is
      // assigned. Posting lives in «Проведено», not here. Mirror demands.
      key: 'state',
      header: tFields('state'),
      width: '150px',
      cell: (r) =>
        r.status ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] px-2 py-0.5 font-medium text-white text-xs"
            style={{ backgroundColor: r.status.color ?? 'var(--ms-text-muted)' }}
            data-test-id="pr-status-pill"
          >
            {r.status.name}
          </span>
        ) : (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] bg-[var(--ms-bg-muted)] px-2 py-0.5 text-[var(--ms-text-muted)] text-xs"
            data-test-id="pr-status-placeholder"
          >
            {tFields('custom_status_placeholder')}
          </span>
        ),
      cellText: (r: PurchaseReturnRow) => r.status?.name ?? '',
    },
    {
      key: 'positions',
      header: tFields('positions_count'),
      width: '70px',
      align: 'right',
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">
          {r._count.positions}
        </span>
      ),
      cellText: (r: PurchaseReturnRow) => String(r._count?.positions ?? ''),
    },
  ];

  const hasFilter =
    !!search ||
    !!stateFilter ||
    agents.length > 0 ||
    organizations.length > 0 ||
    !!filterValues.storeId ||
    !!filterValues.ownerId ||
    !!filterValues.applicable ||
    !!filterValues.printed ||
    !!filterValues.published ||
    !!filterValues.shared ||
    !!filterValues.momentFrom ||
    !!filterValues.momentTo ||
    !!filterValues.receiptDateFrom ||
    !!filterValues.receiptDateTo ||
    !!filterValues.paymentState ||
    !!filterValues.updatedFrom ||
    !!filterValues.updatedTo ||
    !!filterValues.agentGroupId ||
    !!filterValues.agentAccountId ||
    !!filterValues.organizationAccountId ||
    !!filterValues.groupId ||
    !!filterValues.projectId ||
    !!filterValues.contractId ||
    !!filterValues.productId ||
    !!filterValues.agentOwnerId ||
    !!filterValues.modifiedById;

  // Pinned «Итого» footer money cell (key 'sum' = the «Сумма» column): «…» while
  // loading, the base-UZS sum for a mixed-currency set, else the single-currency
  // total. moysklad shows exactly one money total on the purchasereturn list.
  const footerRow = footerMoneyCells(
    totals,
    { sum: totals?.sumMinor ?? '0' },
    { baseValuesMinor: { sum: totals?.baseSumMinor ?? '0' } },
  );

  // moysklad-parity inline filter panel — LIVE-GROUND 2026-06-28 #purchasereturn:
  // the 22-field grid in order: Период · Дата приемки · Оплата · Товар или группа ·
  // Склад · Проект · Контрагент · Группа контрагента · Счет контрагента · Договор ·
  // Владелец контрагента · Организация · Счет организации · Статус · Проведено ·
  // Напечатано · Отправлено · Владелец-сотрудник · Владелец-отдел · Общий доступ ·
  // Когда изменен · Кто изменил.
  // «Счёт контрагента» / «Счёт организации» mirror the gold standard (disabled
  // until the parent FK is picked). Reference fields keep the CatalogPickerField
  // modal-picker style (NOT MultiCombobox) — single-select per field.
  const filterPanel = (
    <InlineFilterPanel
      hidden={!filterOpen}
      applyLabel={tFilters('find')}
      clearLabel={tFilters('clear')}
      onClear={() => {
        setFilterValues({});
        setStateFilter(null);
        setAgents([]);
        setOrganizations([]);
        onResetCursor();
      }}
      testId="purchase-returns-inline-filter"
    >
      {/* 1. Период */}
      <InlineFilterPanel.Field
        label={`${tFilters('period')}:`}
        expandable
        inlineSuffix={
          <PeriodShortcuts
            onChange={({ from, to }) => {
              setFilterValues({ ...filterValues, momentFrom: from, momentTo: to });
              onResetCursor();
            }}
            labels={{
              yesterday: tFilters('period_yesterday'),
              today: tFilters('period_today'),
              week: tFilters('period_week'),
              month: tFilters('period_month'),
            }}
          />
        }
      >
        <PeriodInputs
          from={filterValues.momentFrom}
          to={filterValues.momentTo}
          onChange={({ from, to }) => {
            setFilterValues({ ...filterValues, momentFrom: from, momentTo: to });
            onResetCursor();
          }}
          testId="filter-period"
        />
      </InlineFilterPanel.Field>
      {/* 2. Дата приемки */}
      <InlineFilterPanel.Field
        label={`${tFields('receipt_date')}:`}
        expandable
        inlineSuffix={
          <PeriodShortcuts
            onChange={({ from, to }) => {
              setFilterValues({ ...filterValues, receiptDateFrom: from, receiptDateTo: to });
              onResetCursor();
            }}
            labels={{
              yesterday: tFilters('period_yesterday'),
              today: tFilters('period_today'),
              week: tFilters('period_week'),
              month: tFilters('period_month'),
            }}
          />
        }
      >
        <PeriodInputs
          from={filterValues.receiptDateFrom}
          to={filterValues.receiptDateTo}
          onChange={({ from, to }) => {
            setFilterValues({ ...filterValues, receiptDateFrom: from, receiptDateTo: to });
            onResetCursor();
          }}
          testId="filter-receipt-date"
        />
      </InlineFilterPanel.Field>
      {/* 3. Оплата */}
      <InlineFilterPanel.Field label={tPo('filter_payment_state')} expandable={false}>
        <OptionSelect
          value={filterValues.paymentState}
          options={PAYMENT_OPTIONS}
          onChange={(v) => {
            setFilterValues({ ...filterValues, paymentState: v });
            onResetCursor();
          }}
          testId="filter-payment-state"
        />
      </InlineFilterPanel.Field>
      {/* 4. Товар или группа */}
      <InlineFilterPanel.Field label={tPo('filter_product_or_group')} expandable>
        <CatalogPickerField
          value={
            filterValues.productId
              ? {
                  id: filterValues.productId,
                  label: filterValues.productLabel ?? filterValues.productId,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('product')}
          onClear={() => {
            setFilterValues({ ...filterValues, productId: undefined, productLabel: undefined });
            onResetCursor();
          }}
          testId="filter-product"
        />
      </InlineFilterPanel.Field>
      {/* 5. Склад */}
      <InlineFilterPanel.Field label={tFields('store')} expandable>
        <CatalogPickerField
          value={
            filterValues.storeId
              ? { id: filterValues.storeId, label: filterValues.storeLabel ?? filterValues.storeId }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('store')}
          onClear={() => {
            setFilterValues({ ...filterValues, storeId: undefined, storeLabel: undefined });
            onResetCursor();
          }}
          testId="filter-store"
        />
      </InlineFilterPanel.Field>
      {/* 6. Проект */}
      <InlineFilterPanel.Field label={tPo('filter_project')} expandable>
        <CatalogPickerField
          value={
            filterValues.projectId
              ? {
                  id: filterValues.projectId,
                  label: filterValues.projectLabel ?? filterValues.projectId,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('project')}
          onClear={() => {
            setFilterValues({ ...filterValues, projectId: undefined, projectLabel: undefined });
            onResetCursor();
          }}
          testId="filter-project"
        />
      </InlineFilterPanel.Field>
      {/* 7. Контрагент — moysklad-parity inline multi-select checkbox dropdown:
          type a name OR phone, results appear inline (each row shows the phone
          as a sublabel), tick as many as needed. Was a single-select modal. */}
      <InlineFilterPanel.Field label={tFields('agent')} expandable>
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
            onResetCursor();
          }}
          placeholder=""
          testId="filter-agent"
        />
      </InlineFilterPanel.Field>
      {/* 8. Группа контрагента */}
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
            onResetCursor();
          }}
          testId="filter-agent-group"
        />
      </InlineFilterPanel.Field>
      {/* 9. Счёт контрагента — disabled until agent picked */}
      <InlineFilterPanel.Field label={tPo('filter_agent_account')} expandable>
        <CatalogPickerField
          value={
            filterValues.agentAccountId
              ? {
                  id: filterValues.agentAccountId,
                  label: filterValues.agentAccountLabel ?? filterValues.agentAccountId,
                }
              : null
          }
          placeholder=""
          onPick={() => agents[0]?.id && setPickerOpen('agentAccount')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              agentAccountId: undefined,
              agentAccountLabel: undefined,
            });
            onResetCursor();
          }}
          disabled={!agents[0]?.id}
          disabledHint={tPo('filter_agent_account_disabled_hint')}
          testId="filter-agent-account"
        />
      </InlineFilterPanel.Field>
      {/* 10. Договор */}
      <InlineFilterPanel.Field label={tPo('filter_contract')} expandable>
        <CatalogPickerField
          value={
            filterValues.contractId
              ? {
                  id: filterValues.contractId,
                  label: filterValues.contractLabel ?? filterValues.contractId,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('contract')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              contractId: undefined,
              contractLabel: undefined,
            });
            onResetCursor();
          }}
          testId="filter-contract"
        />
      </InlineFilterPanel.Field>
      {/* 11. Владелец контрагента */}
      <InlineFilterPanel.Field label={tPo('filter_agent_owner')} expandable>
        <CatalogPickerField
          value={
            filterValues.agentOwnerId
              ? {
                  id: filterValues.agentOwnerId,
                  label: filterValues.agentOwnerLabel ?? filterValues.agentOwnerId,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('agentOwner')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              agentOwnerId: undefined,
              agentOwnerLabel: undefined,
            });
            onResetCursor();
          }}
          testId="filter-agent-owner"
        />
      </InlineFilterPanel.Field>
      {/* 12. Организация — moysklad-parity inline multi-select checkbox dropdown
          (was a single-select modal). */}
      <InlineFilterPanel.Field label={tFields('organization')} expandable>
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
            onResetCursor();
          }}
          placeholder=""
          testId="filter-org"
        />
      </InlineFilterPanel.Field>
      {/* 13. Счёт организации — disabled until organization picked */}
      <InlineFilterPanel.Field label={tPo('filter_org_account')} expandable>
        <CatalogPickerField
          value={
            filterValues.organizationAccountId
              ? {
                  id: filterValues.organizationAccountId,
                  label:
                    filterValues.organizationAccountLabel ?? filterValues.organizationAccountId,
                }
              : null
          }
          placeholder=""
          onPick={() => organizations[0]?.id && setPickerOpen('orgAccount')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              organizationAccountId: undefined,
              organizationAccountLabel: undefined,
            });
            onResetCursor();
          }}
          disabled={!organizations[0]?.id}
          disabledHint={tPo('filter_org_account_disabled_hint')}
          testId="filter-org-account"
        />
      </InlineFilterPanel.Field>
      {/* 14. Статус */}
      <InlineFilterPanel.Field label={tPo('filter_status_multi')} expandable>
        <StateSelect
          value={stateFilter ?? undefined}
          onChange={(v) => {
            setStateFilter(v ?? null);
            onResetCursor();
          }}
          labeler={(s) => tStates(s)}
          testId="filter-state"
        />
      </InlineFilterPanel.Field>
      {/* 15. Проведено */}
      <InlineFilterPanel.Field label={tFields('applicable')} expandable>
        <YesNoSelect
          value={filterValues.applicable}
          onChange={(v) => {
            setFilterValues({ ...filterValues, applicable: v });
            onResetCursor();
          }}
          testId="filter-applicable"
        />
      </InlineFilterPanel.Field>
      {/* 16. Напечатано */}
      <InlineFilterPanel.Field label={tFields('printed')} expandable>
        <YesNoSelect
          value={filterValues.printed}
          onChange={(v) => {
            setFilterValues({ ...filterValues, printed: v });
            onResetCursor();
          }}
          testId="filter-printed"
        />
      </InlineFilterPanel.Field>
      {/* 17. Отправлено */}
      <InlineFilterPanel.Field label={tFields('published')} expandable>
        <YesNoSelect
          value={filterValues.published}
          onChange={(v) => {
            setFilterValues({ ...filterValues, published: v });
            onResetCursor();
          }}
          testId="filter-published"
        />
      </InlineFilterPanel.Field>
      {/* 18. Владелец-сотрудник */}
      <InlineFilterPanel.Field label={tPo('filter_owner_employee')} expandable>
        <CatalogPickerField
          value={
            filterValues.ownerId
              ? { id: filterValues.ownerId, label: filterValues.ownerLabel ?? filterValues.ownerId }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('owner')}
          onClear={() => {
            setFilterValues({ ...filterValues, ownerId: undefined, ownerLabel: undefined });
            onResetCursor();
          }}
          testId="filter-owner"
        />
      </InlineFilterPanel.Field>
      {/* 19. Владелец-отдел */}
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
            onResetCursor();
          }}
          testId="filter-group"
        />
      </InlineFilterPanel.Field>
      {/* 20. Общий доступ */}
      <InlineFilterPanel.Field label={tPo('filter_shared')} expandable={false}>
        <YesNoSelect
          value={filterValues.shared}
          onChange={(v) => {
            setFilterValues({ ...filterValues, shared: v });
            onResetCursor();
          }}
          testId="filter-shared"
        />
      </InlineFilterPanel.Field>
      {/* 21. Когда изменен */}
      <InlineFilterPanel.Field
        label={`${tPo('filter_updated_period')}:`}
        expandable
        inlineSuffix={
          <PeriodShortcuts
            onChange={({ from, to }) => {
              setFilterValues({ ...filterValues, updatedFrom: from, updatedTo: to });
              onResetCursor();
            }}
            labels={{
              yesterday: tFilters('period_yesterday'),
              today: tFilters('period_today'),
              week: tFilters('period_week'),
              month: tFilters('period_month'),
            }}
          />
        }
      >
        <PeriodInputs
          from={filterValues.updatedFrom}
          to={filterValues.updatedTo}
          onChange={({ from, to }) => {
            setFilterValues({ ...filterValues, updatedFrom: from, updatedTo: to });
            onResetCursor();
          }}
          testId="filter-updated"
        />
      </InlineFilterPanel.Field>
      {/* 22. Кто изменил */}
      <InlineFilterPanel.Field label={tPo('filter_modified_by')} expandable>
        <CatalogPickerField
          value={
            filterValues.modifiedById
              ? {
                  id: filterValues.modifiedById,
                  label: filterValues.modifiedByLabel ?? filterValues.modifiedById,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('modifiedBy')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              modifiedById: undefined,
              modifiedByLabel: undefined,
            });
            onResetCursor();
          }}
          testId="filter-modified-by"
        />
      </InlineFilterPanel.Field>
    </InlineFilterPanel>
  );

  const filterToggleButton = (
    <FilterToggleButton
      open={filterOpen}
      onToggle={() => setFilterOpen((v) => !v)}
      label={tFilters('trigger')}
    />
  );

  return (
    <>
      <ListView
        testId="purchase-returns-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        onHelp={() => window.open('/help/purchase-returns', '_blank')}
        selectionCount={bulk.selectedIds.size}
        createHref="/purchase-returns/new"
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
        rowTestId={(r) => `purchase-return-row-${r.id}`}
        rowActions={(r) => bulk.rowDelete(r.id)}
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
        {...bulk.listViewProps}
        // bulkActionBar omitted — toolbar dropdowns replace it.
        visibleColumnKeys={cols.visibleKeys}
        headerSlot={filterPanel}
        extraActionsLeft={filterToggleButton}
        extraActions={
          <>
            <PurchaseReturnBulkActionsDropdown
              selectedIds={bulk.selectedIds}
              listQueryKey={listQueryKey}
              onClearSelection={bulk.clearSelection}
              postedCount={postedCount}
              onMassEdit={() => {
                stashBulkEdit({
                  entity: 'purchase-returns',
                  ids:
                    bulk.selectedIds.size > 0
                      ? Array.from(bulk.selectedIds)
                      : (data?.items ?? []).map((r) => r.id),
                  from: '/purchase-returns',
                });
                router.push('/bulk-edit');
              }}
            />
            {/* moysklad toolbar order: Изменить · Статус · Печать */}
            <PurchaseReturnStatusDropdown
              selectedIds={bulk.selectedIds}
              listQueryKey={listQueryKey}
              onClearSelection={bulk.clearSelection}
              customStatuses={purchaseReturnStatuses}
            />
            {/* no page-level CSV exporter yet — list_export stays disabled */}
            <PurchaseReturnPrintDropdown selectedIds={bulk.selectedIds} />
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

      {/* «Контрагент» / «Организация» are now inline MultiCombobox dropdowns
          (see the filter panel above) — their old single-select modals are gone. */}
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
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'agentAccount'}
        onClose={() => setPickerOpen(null)}
        title={tPo('filter_agent_account')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const scopedAgentId = agents[0]?.id;
          if (!scopedAgentId) return [];
          // moysklad parity: counterparty bank accounts have only the nested
          // /counterparties/:id/bank-accounts route (raw array, no search param) —
          // mirror the detail-form agentAccountFetcher and client-filter by search.
          const d = await api.get<
            Array<{ id: string; accountNumber: string; bankName: string | null }>
          >(`/counterparties/${scopedAgentId}/bank-accounts`);
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
          setFilterValues({
            ...filterValues,
            agentAccountId: item.id,
            agentAccountLabel: String(item.primary),
          });
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'contract'}
        onClose={() => setPickerOpen(null)}
        title={tPo('filter_contract')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/contracts?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            contractId: item.id,
            contractLabel: String(item.primary),
          });
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'orgAccount'}
        onClose={() => setPickerOpen(null)}
        title={tPo('filter_org_account')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const scopedOrgId = organizations[0]?.id;
          if (!scopedOrgId) return [];
          // moysklad parity: organization accounts come from the flat
          // /organization-accounts?organizationId= route (mirror the detail-form
          // organizationAccountFetcher). Default accounts have accountNumber=null,
          // so fall back to the account name for the headline.
          const params = new URLSearchParams({ search: q, limit: '50' });
          params.set('organizationId', scopedOrgId);
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
          setFilterValues({
            ...filterValues,
            organizationAccountId: item.id,
            organizationAccountLabel: String(item.primary),
          });
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'store'}
        onClose={() => setPickerOpen(null)}
        title={tFields('store')}
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
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'project'}
        onClose={() => setPickerOpen(null)}
        title={tPo('filter_project')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/projects?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            projectId: item.id,
            projectLabel: String(item.primary),
          });
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'product'}
        onClose={() => setPickerOpen(null)}
        title={tPo('filter_product_or_group')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/products?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            productId: item.id,
            productLabel: String(item.primary),
          });
          onResetCursor();
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
          onResetCursor();
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
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'agentOwner'}
        onClose={() => setPickerOpen(null)}
        title={tPo('filter_agent_owner')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/employees?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            agentOwnerId: item.id,
            agentOwnerLabel: String(item.primary),
          });
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'modifiedBy'}
        onClose={() => setPickerOpen(null)}
        title={tPo('filter_modified_by')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/employees?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            modifiedById: item.id,
            modifiedByLabel: String(item.primary),
          });
          onResetCursor();
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
