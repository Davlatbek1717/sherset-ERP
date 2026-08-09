'use client';

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { YesNoSelect } from '@/components/filters/filter-fields';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import {
  useDocEditMenuItems,
  useInvoiceInPrintMenuItems,
} from '@/components/money/document-toolbar-menus';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { stashBulkEdit } from '@/lib/bulk-edit-nav';
import { INVOICE_STATE_TONE, documentStateTone } from '@/lib/document-state-tone';
import { filterFromQueryString } from '@/lib/filter-from-query';
import {
  Badge,
  CatalogPicker,
  type DataTableColumn,
  type FilterDrawerValues,
  InlineFilterPanel,
  Input,
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
import { useState } from 'react';

interface InvoiceRow {
  id: string;
  name: string;
  incomingNumber: string | null;
  state: string;
  applicable: boolean;
  sumMinor: string;
  payedSumMinor: string;
  // «Принято» — how much of the invoice has been physically received
  // (cascades from linked Supply docs). moysklad list column.
  shippedSumMinor: string;
  // moysklad parity (v2.2 audit): backend Prisma scalars surfaced.
  currency: string;
  printed: boolean;
  published: boolean;
  description: string | null;
  moment: string;
  paymentPlannedMoment: string | null;
  incomingDate: string | null;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string };
  // «На склад» — the warehouse the linked Supply would receive into (optional).
  store: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  purchaseOrder: { id: string; name: string } | null;
  _count: { positions: number };
}

interface ListResponse {
  items: InvoiceRow[];
  nextCursor?: string;
  total: number;
}

// Moysklad parity — 100 rows per page.
const LIMIT = 100;

/**
 * Currency display map — moysklad-parity short names (mirror purchase-orders).
 * moysklad.uz shows the Russian short forms across the whole UI («сум» for UZS,
 * «доллар» for USD), even though the ISO code is what's stored. The «Валюта»
 * list column reads off this map; unknown currencies fall through unchanged.
 */
const CURRENCY_LABEL: Record<string, string> = {
  UZS: 'сум',
  USD: 'доллар',
  EUR: 'евро',
  RUB: 'руб',
};

/**
 * Receipt-progress mini-bar under the «Оплачено» / «Принято» money cells
 * (mirror purchase-orders). moysklad draws a 4px olive-green (#86aa60)
 * border-bottom on fulfilment money cells, sized to the cur/target proportion
 * (clipped at 100%); no bar when cur or target is 0. Green at every fill level
 * — moysklad conveys partial-ness via the bar's WIDTH, not its colour.
 */
function FulfilmentBar({ cur, target }: { cur: bigint; target: bigint }) {
  if (cur <= 0n || target <= 0n) return null;
  const pct = Math.min(Number(cur) / Number(target), 1) * 100;
  return (
    <div
      aria-hidden="true"
      className="-mb-0.5 mt-1 h-[4px] w-full rounded-sm bg-[var(--ms-border-subtle)]"
    >
      <div
        className="h-full rounded-sm transition-[width]"
        style={{ width: `${pct}%`, backgroundColor: '#86aa60' }}
      />
    </div>
  );
}

/**
 * Coloured badge for the boolean status columns (Отправлено / Напечатано) —
 * mirror purchase-orders. moysklad shows a cyan pill with the past-participle
 * inside; an EMPTY cell when the flag is false (no «—» placeholder).
 */
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

type InvoiceInStateKey = 'draft' | 'posted' | 'partially_paid' | 'paid' | 'cancelled';

/** Generic typed select for the moysklad-parity «Оплата» / «Приемка» filters
 *  (mirror the purchase-orders gold standard). The empty option is always
 *  unlabelled so unselecting feels exactly like moysklad does. */
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

/** «Оплата» — moysklad-parity tri-state select (mirror purchase-orders). */
const PAYMENT_OPTIONS = [
  { value: 'paid', ru: 'Оплачено', uz: "To'liq to'langan" },
  { value: 'partlyPaid', ru: 'Частично оплачено', uz: 'Qisman to’langan' },
  { value: 'unpaid', ru: 'Не оплачено', uz: "To'lanmagan" },
] as const;

/** «Приемка» — moysklad-parity tri-state select. Mirrors purchase-orders BUT
 *  WITHOUT «Просрочено» (overdue): InvoiceIn has no delivery-date concept. */
const RECEIVE_OPTIONS = [
  { value: 'shipped', ru: 'Принято', uz: 'Qabul qilingan' },
  { value: 'partiallyshipped', ru: 'Частично принято', uz: 'Qisman qabul qilingan' },
  { value: 'unshipped', ru: 'Не принято', uz: 'Qabul qilinmagan' },
] as const;

/** «Статус» single-select — InvoiceIn's FSM surfaces 5 states; moysklad
 *  renders it as a plain dropdown (no multi-tag picker, like supplies). */
function StateSelect({
  value,
  onChange,
  labeler,
  testId,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  labeler: (s: InvoiceInStateKey) => string;
  testId?: string;
}) {
  return (
    <NativeSelect
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      data-test-id={testId}
    >
      <option value="" />
      {(['draft', 'posted', 'partially_paid', 'paid', 'cancelled'] as const).map((s) => (
        <option key={s} value={s}>
          {labeler(s)}
        </option>
      ))}
    </NativeSelect>
  );
}

/**
 * InvoiceIn-specific extension fields stored alongside the shared
 * FilterDrawerValues shape. Local to this page (the shared
 * `useMoyskladDocFilter` hook is intentionally NOT used here — invoices-in
 * mirrors the purchase-orders inline-field gold standard).
 *
 * The multi-select reference filters (Группа контрагента / Владелец
 * контрагента / Склад / Проект / Договор / Владелец-сотрудник / Владелец-отдел
 * / Кто изменил / Товар или группа) live in dedicated `RefMulti[]` state
 * arrays below, NOT here. Only the single-FK pickers (Счет контрагента / Счет
 * организации) keep their id+label here.
 */
type ExtraFilterFields = {
  applicable?: 'true' | 'false';
  printed?: 'true' | 'false';
  published?: 'true' | 'false';
  shared?: 'true' | 'false';
  updatedFrom?: string;
  updatedTo?: string;
  // «Входящий номер» — plain text contains-match on the supplier's doc number.
  incomingNumber?: string;
  // «Входящая дата» period.
  incomingDateFrom?: string;
  incomingDateTo?: string;
  // «План. дата оплаты» period.
  paymentPlannedFrom?: string;
  paymentPlannedTo?: string;
  // Derived «Оплата» / «Приемка» state filters.
  paymentState?: 'paid' | 'partlyPaid' | 'unpaid';
  receiveState?: 'shipped' | 'partiallyshipped' | 'unshipped';
  // Single-FK pickers (need the catalog modal / a dependent parent FK).
  agentAccountId?: string;
  agentAccountLabel?: string;
  organizationAccountId?: string;
  organizationAccountLabel?: string;
};

/** Multi-select reference field — moysklad checkbox-dropdown holds {id,label}[]. */
type RefMulti = { id: string; label: string };

export default function InvoicesInPage() {
  const t = useTranslations('pages.invoices_in');
  const tPrintMenu = useTranslations('print_menu');
  const tBulkActions = useTranslations('bulk_actions');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tPo = useTranslations('pages.purchase_orders');
  const tStates = useTranslations('states.invoice_in');
  const tMass = useTranslations('mass_edit_modal');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [filterValues, setFilterValues] = useState<FilterDrawerValues & ExtraFilterFields>({});
  // moysklad-parity multi-select reference filters — checkbox dropdowns
  // (MultiCombobox), mirroring the purchase-orders gold standard. Each holds
  // the picked {id,label} pairs; on the wire they go out as `<field>Ids` CSV.
  const [agentGroups, setAgentGroups] = useState<RefMulti[]>([]);
  const [agentOwners, setAgentOwners] = useState<RefMulti[]>([]);
  const [stores, setStores] = useState<RefMulti[]>([]);
  const [projects, setProjects] = useState<RefMulti[]>([]);
  const [contracts, setContracts] = useState<RefMulti[]>([]);
  const [owners, setOwners] = useState<RefMulti[]>([]);
  const [groups, setGroups] = useState<RefMulti[]>([]);
  const [modifiedBys, setModifiedBys] = useState<RefMulti[]>([]);
  const [products, setProducts] = useState<RefMulti[]>([]);
  // moysklad parity: «Контрагент» / «Организация» / «Счёт контрагента» / «Счёт
  // организации» are INLINE multi-select checkbox-dropdowns (NOT modal pickers).
  const [agents, setAgents] = useState<RefMulti[]>([]);
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);
  const [agentAccounts, setAgentAccounts] = useState<RefMulti[]>([]);
  const [orgAccounts, setOrgAccounts] = useState<RefMulti[]>([]);
  // moysklad parity: the «Счета поставщиков» list loads with the filter panel
  // COLLAPSED (only the «Фильтр» button shows) — user-confirmed 2026-06-25.
  const [filterOpen, setFilterOpen] = useState(false);
  // «Фильтр» 🔖 save-filter + ⚙ field-visibility (moysklad parity, mirror PO).
  // `saveFilterOpen` is shared with the SavedFiltersPills add mode;
  // `filterHidden.visibleKeys` holds the HIDDEN filter-field keys.
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  const filterHidden = useColumnVisibility('invoices-in-filter-hidden', []);
  // Only the mass-edit modal pickers remain. ALL filter reference fields are now
  // INLINE MultiCombobox checkbox-dropdowns (no modal) — moysklad parity.
  const [pickerOpen, setPickerOpen] = useState<null | 'massEditOwner' | 'massEditProject'>(null);
  // moysklad «Массовое редактирование» (Изменить dropdown) — owner / project /
  // description patch across selected rows. Backend: POST /invoices-in/mass-edit.
  const [massEditOpen, setMassEditOpen] = useState(false);
  // «Владелец-отдел» (groupId) options for the mass-edit wizard — mirrors losses.
  const { data: massGroupsData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['groups', 'mass-edit'],
    queryFn: () => api.get('/groups?limit=100'),
    enabled: massEditOpen,
    staleTime: 5 * 60 * 1000,
  });
  const [massEditIds] = useState<string[]>([]);
  const [massEditOwner, setMassEditOwner] = useState<{ id: string; label: string } | null>(null);
  const [massEditProject, setMassEditProject] = useState<{ id: string; label: string } | null>(
    null,
  );
  // moysklad-parity (LIVE-GROUND 2026-06-28, #invoicein list-01-default.png): the
  // default sort arrow sits on the «Время» (moment) column DESC — newest first —
  // NOT «№». Ground-truth proof: the capture's two rows are №00001/09.02.2026 then
  // №00001/24.03.2025 (equal numbers, date-descending), so the active sort is moment.
  // Matches the backend's own default (InvoiceInFilterSchema sortBy.default='moment').
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
    ...(filterValues.incomingNumber ? { incomingNumber: filterValues.incomingNumber } : {}),
    ...(filterValues.incomingDateFrom ? { incomingDateFrom: filterValues.incomingDateFrom } : {}),
    ...(filterValues.incomingDateTo ? { incomingDateTo: filterValues.incomingDateTo } : {}),
    ...(filterValues.paymentPlannedFrom
      ? { paymentPlannedFrom: filterValues.paymentPlannedFrom }
      : {}),
    ...(filterValues.paymentPlannedTo ? { paymentPlannedTo: filterValues.paymentPlannedTo } : {}),
    ...(filterValues.paymentState ? { paymentState: filterValues.paymentState } : {}),
    ...(filterValues.receiveState ? { receiveState: filterValues.receiveState } : {}),
    ...(agents.length ? { agentIds: agents.map((x) => x.id).join(',') } : {}),
    ...(organizations.length ? { organizationIds: organizations.map((x) => x.id).join(',') } : {}),
    ...(stores.length ? { storeIds: stores.map((x) => x.id).join(',') } : {}),
    ...(owners.length ? { ownerIds: owners.map((x) => x.id).join(',') } : {}),
    ...(filterValues.applicable ? { applicable: filterValues.applicable } : {}),
    ...(filterValues.printed ? { printed: filterValues.printed } : {}),
    ...(filterValues.published ? { published: filterValues.published } : {}),
    ...(filterValues.shared ? { shared: filterValues.shared } : {}),
    ...(filterValues.updatedFrom ? { updatedFrom: filterValues.updatedFrom } : {}),
    ...(filterValues.updatedTo ? { updatedTo: filterValues.updatedTo } : {}),
    ...(agentGroups.length ? { agentGroupIds: agentGroups.map((x) => x.id).join(',') } : {}),
    ...(agentOwners.length ? { agentOwnerIds: agentOwners.map((x) => x.id).join(',') } : {}),
    ...(agentAccounts.length ? { agentAccountIds: agentAccounts.map((x) => x.id).join(',') } : {}),
    ...(orgAccounts.length
      ? { organizationAccountIds: orgAccounts.map((x) => x.id).join(',') }
      : {}),
    ...(groups.length ? { groupIds: groups.map((x) => x.id).join(',') } : {}),
    ...(projects.length ? { projectIds: projects.map((x) => x.id).join(',') } : {}),
    ...(contracts.length ? { contractIds: contracts.map((x) => x.id).join(',') } : {}),
    ...(modifiedBys.length ? { modifiedByIds: modifiedBys.map((x) => x.id).join(',') } : {}),
    ...(products.length ? { productIds: products.map((x) => x.id).join(',') } : {}),
  });

  const listQueryKey = [
    'invoices-in',
    search,
    stateFilter,
    cursor,
    sortKey,
    sortDir,
    params.toString(),
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/invoices-in?${params.toString()}`),
  });

  // moysklad-parity: the pinned «Итого» footer sums ALL filtered records (not
  // just the visible page), fetched with the SAME filter params minus
  // pagination/sort (which don't change the totals). Mirror purchase-orders.
  const totalsParams = new URLSearchParams(params);
  totalsParams.delete('cursor');
  totalsParams.delete('limit');
  totalsParams.delete('sortBy');
  totalsParams.delete('sortDir');
  const totalsQs = totalsParams.toString();
  const { data: totals } = useQuery<{
    count: number;
    sumMinor: string;
    payedSumMinor: string;
    shippedSumMinor: string;
    // Distinct document currencies in the filtered set; >1 → footer shows the
    // base-converted sum below (moysklad parity), not a «—» dash.
    currencies: string[];
    // Base-currency (UZS) converted totals — populated by the BE only for
    // mixed-currency sets; the footer renders these when currencies.length > 1.
    baseSumMinor: string;
    basePayedSumMinor: string;
    baseShippedSumMinor: string;
  }>({
    queryKey: ['invoices-in-totals', totalsQs],
    queryFn: () => api.get(`/invoices-in/aggregate/totals${totalsQs ? `?${totalsQs}` : ''}`),
    staleTime: 30_000,
  });

  const bulk = useBulkDocumentActions('invoices-in', listQueryKey, { hasFSM: true });
  // moysklad «Изменить» / «Печать» parity — items, order and disabled
  // state mirror docs/moysklad-reference/invoices-in/states/metadata.json
  // (Phase 2 audit, 2026-05-30): Изменить has 6 items (+ Объединить);
  // Массовое редактирование stays a disabled placeholder (no
  // /invoices-in/mass-edit endpoint yet). Печать is the 4-item supplier
  // invoice set (Список счетов · Счет поставщика · Комплект… · Настроить…).
  const openMassEdit = (ids: string[]) => {
    stashBulkEdit({ entity: 'invoices-in', ids, from: '/invoices-in' });
    router.push('/bulk-edit');
  };
  const editMenuItems = useDocEditMenuItems({
    selectedIds: bulk.selectedIds,
    allRowIds: (data?.items ?? []).map((r) => r.id),
    onBulkDelete: (ids) => bulk.bulkDelete.mutate(ids),
    deletePending: bulk.bulkDelete.isPending,
    onMassEdit: openMassEdit,
    includeMerge: true,
  });
  const printMenuItems = useInvoiceInPrintMenuItems();

  // moysklad-parity «Создать ▾» — LIVE-GROUNDED 2026-06-25 (with rows selected
  // moysklad offers exactly «Исходящие платежи» + «Расходные ордера»). Each
  // creates one draft per selected invoice (BE bulk-create endpoints) then
  // routes to that doc list. Disabled until ≥1 row is selected (matches the
  // greyed «Создать» on an empty selection). Labels reuse the purchase-orders
  // keys (tPo) — identical wording.
  const router = useRouter();
  const selectedIdsArray = Array.from(bulk.selectedIds);
  const selectedCount = bulk.selectedIds.size;
  const bulkCreatePaymentOut = useApiMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ total: number; succeeded: string[]; failed: unknown[] }>(
        '/invoices-in/bulk-create-payment-out',
        { ids },
      ),
    onSuccess: () => router.push('/payments-out'),
  });
  const bulkCreateCashOut = useApiMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ total: number; succeeded: string[]; failed: unknown[] }>(
        '/invoices-in/bulk-create-cash-out',
        { ids },
      ),
    onSuccess: () => router.push('/cash-out'),
  });
  const createMenuConfig = {
    label: tPo('bulk_create'),
    disabled: selectedCount === 0 || bulkCreatePaymentOut.isPending || bulkCreateCashOut.isPending,
    items: [
      {
        id: 'payment-out',
        label: tPo('bulk_create_payment_out'),
        onSelect: () => bulkCreatePaymentOut.mutate(selectedIdsArray),
      },
      {
        id: 'cash-out',
        label: tPo('bulk_create_cash_out'),
        onSelect: () => bulkCreateCashOut.mutate(selectedIdsArray),
      },
    ],
  };
  // moysklad parity — LIVE-GROUNDED 2026-06-25 (online.moysklad.uz #invoicein,
  // tools/capture/ms-invoicein-list-ground.mjs). The default-visible grid is, in
  // order: № · Время · Контрагент · Организация · На склад · Сумма · Валюта ·
  // Оплачено · Принято · План. дата оплаты · Входящий номер · Входящая дата ·
  // Отправлено · Напечатано · Комментарий. `state` + `purchase_order` stay
  // available in the ⚙ customizer but hidden by default (moysklad shows neither).
  const cols = useColumnVisibility('invoices-in', [
    'name',
    'moment',
    'agent',
    'organization',
    'store',
    'sum',
    'currency',
    'paid',
    'received',
    'paymentPlanned',
    'incoming',
    'incomingDate',
    'published',
    'printed',
    'description',
  ]);
  const colWidths = useColumnWidths('invoices-in');

  // moysklad's "Счета поставщиков" list has no status pill sub-tabs (shared
  // GWT list chrome). Status filtering is the "Статус" select inside the
  // inline filter panel below.

  // moysklad-parity columns — LIVE-GROUNDED 2026-06-25 order. Shared GWT list
  // chrome (mirror purchase-orders): № + Контрагент are brand-blue, normal-
  // weight, ALWAYS-underlined links; «Валюта» shows the short name; «Оплачено»
  // / «Принято» carry the olive fulfilment under-bar; «Отправлено» /
  // «Напечатано» are cyan badges (empty when off). `purchase_order` + `state`
  // stay available in the ⚙ customizer but are not default-visible.
  const columns: DataTableColumn<InvoiceRow>[] = [
    {
      key: 'name',
      header: tFields('number'),
      width: '70px',
      sortable: true,
      cell: (i) => (
        <a
          href={`/invoices-in/${i.id}`}
          className="text-[var(--ms-text-brand)] underline underline-offset-2"
        >
          {i.name}
        </a>
      ),
      cellText: (r: InvoiceRow) => r.name,
    },
    {
      key: 'moment',
      header: tFields('time'),
      width: '110px',
      sortable: true,
      cell: (i) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {formatDate(i.moment)}
        </span>
      ),
      cellText: (r: InvoiceRow) => formatDate(r.moment),
    },
    {
      key: 'agent',
      header: tFields('agent'),
      width: '200px',
      sortable: true,
      cell: (i) => (
        <div>
          <a
            href={`/counterparties/${i.agent.id}`}
            className="block max-w-[280px] truncate text-[var(--ms-text-brand)] underline underline-offset-2"
          >
            {i.agent.name}
          </a>
          {i.agent.legalTitle && (
            <div className="max-w-[280px] truncate text-[var(--ms-text-muted)] text-[11px]">
              {i.agent.legalTitle}
            </div>
          )}
        </div>
      ),
      cellText: (r: InvoiceRow) =>
        r.agent?.legalTitle ? `${r.agent.name} (${r.agent.legalTitle})` : (r.agent?.name ?? ''),
    },
    {
      // moysklad parity: «Организация» column on /invoicein (C3 audit).
      key: 'organization',
      header: tFields('organization'),
      width: '130px',
      sortable: true,
      cell: (i) => (
        <span className="block max-w-[180px] truncate text-[var(--ms-text-primary)] text-sm">
          {i.organization?.name ?? '—'}
        </span>
      ),
      cellText: (r: InvoiceRow) => r.organization?.name ?? '',
    },
    {
      // moysklad «На склад» — the warehouse the linked Supply receives into.
      key: 'store',
      header: tFields('store_to'),
      width: '120px',
      cell: (i) => (
        <span className="block max-w-[180px] truncate text-[var(--ms-text-primary)] text-sm">
          {i.store?.name ?? ''}
        </span>
      ),
      cellText: (r: InvoiceRow) => r.store?.name ?? '',
    },
    {
      key: 'sum',
      sortField: 'sumMinor',
      header: tFields('sum'),
      align: 'right',
      width: '110px',
      sortable: true,
      cell: (i) => (
        <span className="font-medium tabular-nums">
          {formatMoney(i.sumMinor, i.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: InvoiceRow) =>
        r.sumMinor ? formatMoney(r.sumMinor, r.currency, { displayAs: 'none' }) : '',
    },
    // moysklad parity (v2.2 audit): «Валюта» column — short name (сум / доллар).
    {
      key: 'currency',
      header: tFields('currency'),
      width: '60px',
      sortable: true,
      cell: (i) => (
        <span className="text-[var(--ms-text-muted)] text-sm">
          {CURRENCY_LABEL[i.currency] ?? i.currency}
        </span>
      ),
      cellText: (r: InvoiceRow) => CURRENCY_LABEL[r.currency] ?? r.currency,
    },
    {
      key: 'paid',
      sortField: 'payedSumMinor',
      header: tFields('payed_sum'),
      align: 'right',
      width: '100px',
      cell: (i) => (
        <div>
          <span className="text-sm tabular-nums">
            {formatMoney(i.payedSumMinor, i.currency, { displayAs: 'none' })}
          </span>
          <FulfilmentBar cur={BigInt(i.payedSumMinor || '0')} target={BigInt(i.sumMinor || '0')} />
        </div>
      ),
      cellText: (r: InvoiceRow) =>
        r.payedSumMinor ? formatMoney(r.payedSumMinor, r.currency, { displayAs: 'none' }) : '',
    },
    {
      // moysklad «Принято» — received sum (shippedSumMinor), olive under-bar.
      key: 'received',
      sortField: 'shippedSumMinor',
      header: tFields('received_sum'),
      align: 'right',
      width: '110px',
      cell: (i) => (
        <div>
          <span className="text-sm tabular-nums">
            {formatMoney(i.shippedSumMinor, i.currency, { displayAs: 'none' })}
          </span>
          <FulfilmentBar
            cur={BigInt(i.shippedSumMinor || '0')}
            target={BigInt(i.sumMinor || '0')}
          />
        </div>
      ),
      cellText: (r: InvoiceRow) =>
        r.shippedSumMinor ? formatMoney(r.shippedSumMinor, r.currency, { displayAs: 'none' }) : '',
    },
    {
      // moysklad «План. дата оплаты» — planned payment date.
      key: 'paymentPlanned',
      header: tFields('payment_planned'),
      width: '120px',
      cell: (i) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {i.paymentPlannedMoment ? formatDate(i.paymentPlannedMoment) : ''}
        </span>
      ),
      cellText: (r: InvoiceRow) =>
        r.paymentPlannedMoment ? formatDate(r.paymentPlannedMoment) : '',
    },
    {
      // moysklad «Входящий номер» (full word — page-local key, NOT the shared
      // `fields.incoming_number`=«Входящий №» used elsewhere).
      key: 'incoming',
      header: t('col_incoming_number'),
      width: '120px',
      cell: (i) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{i.incomingNumber ?? ''}</span>
      ),
      cellText: (r: InvoiceRow) => r.incomingNumber ?? '',
    },
    {
      // moysklad «Входящая дата» — supplier's document date.
      key: 'incomingDate',
      header: tFields('incoming_date'),
      width: '110px',
      cell: (i) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {i.incomingDate ? formatDate(i.incomingDate) : ''}
        </span>
      ),
      cellText: (r: InvoiceRow) => (r.incomingDate ? formatDate(r.incomingDate) : ''),
    },
    {
      key: 'published',
      header: tFields('published'),
      width: '100px',
      cell: (i) => <StatusBadge on={i.published} label={tFields('published')} />,
      cellText: (r: InvoiceRow) => (r.published ? tFields('published') : ''),
    },
    {
      key: 'printed',
      header: tFields('printed'),
      width: '100px',
      cell: (i) => <StatusBadge on={i.printed} label={tFields('printed')} />,
      cellText: (r: InvoiceRow) => (r.printed ? tFields('printed') : ''),
    },
    {
      key: 'description',
      header: tFields('description'),
      width: '160px',
      cell: (i) => (
        <span className="block max-w-[220px] truncate text-[var(--ms-text-muted)] text-[11px]">
          {i.description ?? ''}
        </span>
      ),
      cellText: (r: InvoiceRow) => r.description ?? '',
    },
    // Available-but-hidden in the ⚙ customizer (moysklad shows neither by default).
    {
      key: 'purchase_order',
      header: tFields('linked_purchase_order'),
      width: '130px',
      cell: (i) =>
        i.purchaseOrder ? (
          <a
            href={`/purchase-orders/${i.purchaseOrder.id}`}
            className="text-[var(--ms-text-brand)] text-sm underline underline-offset-2"
          >
            {i.purchaseOrder.name}
          </a>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">{tCommon('none')}</span>
        ),
    },
    {
      key: 'state',
      header: tFields('state'),
      width: '170px',
      cell: (i) => (
        <Badge tone={documentStateTone(i.state, INVOICE_STATE_TONE)}>
          {tStates(i.state as InvoiceInStateKey)}
        </Badge>
      ),
      cellText: (r: InvoiceRow) => r.state,
    },
  ];

  // Pinned footer money cells — moysklad currency-guard: «…» while loading, «—»
  // on a mixed-currency set, else the exact single-currency total. Keys must
  // match the column keys (sum / paid / received). Mirror purchase-orders.
  const footerRow: Record<string, React.ReactNode> = footerMoneyCells(
    totals,
    {
      sum: totals?.sumMinor ?? '0',
      paid: totals?.payedSumMinor ?? '0',
      received: totals?.shippedSumMinor ?? '0',
    },
    {
      // moysklad parity: a mixed-currency footer shows the base-UZS converted
      // sum (from the BE), not «—».
      baseValuesMinor: {
        sum: totals?.baseSumMinor ?? '0',
        paid: totals?.basePayedSumMinor ?? '0',
        received: totals?.baseShippedSumMinor ?? '0',
      },
    },
  );

  const hasFilter =
    !!search ||
    !!stateFilter ||
    agents.length > 0 ||
    organizations.length > 0 ||
    agentAccounts.length > 0 ||
    orgAccounts.length > 0 ||
    stores.length > 0 ||
    owners.length > 0 ||
    !!filterValues.applicable ||
    !!filterValues.printed ||
    !!filterValues.published ||
    !!filterValues.shared ||
    !!filterValues.momentFrom ||
    !!filterValues.momentTo ||
    !!filterValues.incomingNumber ||
    !!filterValues.incomingDateFrom ||
    !!filterValues.incomingDateTo ||
    !!filterValues.paymentPlannedFrom ||
    !!filterValues.paymentPlannedTo ||
    !!filterValues.paymentState ||
    !!filterValues.receiveState ||
    !!filterValues.updatedFrom ||
    !!filterValues.updatedTo ||
    agentGroups.length > 0 ||
    agentOwners.length > 0 ||
    groups.length > 0 ||
    projects.length > 0 ||
    contracts.length > 0 ||
    modifiedBys.length > 0 ||
    products.length > 0;

  // moysklad-parity inline filter panel — rebuilt 2026-06-25 to MIRROR the
  // purchase-orders gold standard exactly, in the live-grounded invoicein order
  // (25 fields): Период · Входящий номер · Входящая дата · Оплата · Приемка ·
  // План. дата оплаты · Товар или группа · Склад · Проект · Контрагент · Группа
  // контрагента · Счет контрагента · Договор · Владелец контрагента ·
  // Организация · Счет организации · Статус · Проведено · Напечатано ·
  // Отправлено · Владелец-сотрудник · Владелец-отдел · Общий доступ · Когда
  // изменен · Кто изменил.
  // The reference filters (Группа контрагента / Договор / Владелец контрагента /
  // Склад / Проект / Владелец-сотрудник / Владелец-отдел / Товар или группа /
  // Кто изменил) are MULTI-select MultiCombobox checkbox-dropdowns (mirror PO).
  // «Заказ поставщику» + the «Сумма» range are NOT part of moysklad's invoicein
  // filter — removed. «Кто изменил» is backed via an auditLog approximation
  // (InvoiceIn has no modifiedById column yet). «Статус» stays a single
  // StateSelect (InvoiceIn FSM 5 states), not a multi-tag picker.
  // Saved-filter serialize / restore — mirror purchase-orders. The whole
  // filterValues is round-tripped as `fv`; each multi-select reference array is
  // appended as JSON so a re-applied pill restores the checkbox chips (not bare
  // ids). Legacy saves (no `fv`) fall back to the shared decoder.
  const savedFilterQuery = (() => {
    const p = new URLSearchParams();
    p.set('fv', JSON.stringify(filterValues));
    if (agents.length) p.set('agents', JSON.stringify(agents));
    if (organizations.length) p.set('organizations', JSON.stringify(organizations));
    if (agentAccounts.length) p.set('agentAccounts', JSON.stringify(agentAccounts));
    if (orgAccounts.length) p.set('orgAccounts', JSON.stringify(orgAccounts));
    if (agentGroups.length) p.set('agentGroups', JSON.stringify(agentGroups));
    if (agentOwners.length) p.set('agentOwners', JSON.stringify(agentOwners));
    if (stores.length) p.set('stores', JSON.stringify(stores));
    if (projects.length) p.set('projects', JSON.stringify(projects));
    if (contracts.length) p.set('contracts', JSON.stringify(contracts));
    if (owners.length) p.set('owners', JSON.stringify(owners));
    if (groups.length) p.set('groups', JSON.stringify(groups));
    if (modifiedBys.length) p.set('modifiedBys', JSON.stringify(modifiedBys));
    if (products.length) p.set('products', JSON.stringify(products));
    return p.toString();
  })();

  const applySavedFilter = (qs: string) => {
    const p = qs.startsWith('?') ? new URLSearchParams(qs.slice(1)) : new URLSearchParams(qs);
    const fvRaw = p.get('fv');
    if (fvRaw) {
      try {
        const fv: unknown = JSON.parse(fvRaw);
        setFilterValues(fv as typeof filterValues);
      } catch {
        setFilterValues(filterFromQueryString(qs));
      }
    } else {
      setFilterValues(filterFromQueryString(qs));
    }
    const parseList = (key: string): RefMulti[] => {
      try {
        const raw = p.get(key);
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
    setAgents(parseList('agents'));
    setOrganizations(parseList('organizations'));
    setAgentAccounts(parseList('agentAccounts'));
    setOrgAccounts(parseList('orgAccounts'));
    setAgentGroups(parseList('agentGroups'));
    setAgentOwners(parseList('agentOwners'));
    setStores(parseList('stores'));
    setProjects(parseList('projects'));
    setContracts(parseList('contracts'));
    setOwners(parseList('owners'));
    setGroups(parseList('groups'));
    setModifiedBys(parseList('modifiedBys'));
    setProducts(parseList('products'));
    onResetCursor();
  };

  const filterPanel = (
    <InlineFilterPanel
      hidden={!filterOpen}
      onApply={() => refetch()}
      onBookmarkClick={() => setSaveFilterOpen(true)}
      fieldVisibility={{
        hidden: filterHidden.visibleKeys,
        onToggle: (k) => {
          const next = new Set(filterHidden.visibleKeys);
          if (next.has(k)) next.delete(k);
          else next.add(k);
          filterHidden.setVisibleKeys(next);
        },
      }}
      pills={
        <SavedFiltersPills
          entity="invoicein"
          currentQueryString={savedFilterQuery}
          onApply={applySavedFilter}
          adding={saveFilterOpen}
          onAddingChange={setSaveFilterOpen}
          // moysklad parity: the «+ Сохранить фильтр» add affordance shows only
          // while the filter panel is OPEN — a collapsed list shows saved pills
          // alone (none here → nothing), not a stray dashed add button.
          showAdd={filterOpen}
        />
      }
      applyLabel={tFilters('find')}
      clearLabel={tFilters('clear')}
      onClear={() => {
        setFilterValues({});
        setStateFilter(null);
        setAgents([]);
        setOrganizations([]);
        setAgentAccounts([]);
        setOrgAccounts([]);
        setAgentGroups([]);
        setAgentOwners([]);
        setStores([]);
        setProjects([]);
        setContracts([]);
        setOwners([]);
        setGroups([]);
        setModifiedBys([]);
        setProducts([]);
        onResetCursor();
      }}
      testId="invoices-in-inline-filter"
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
      {/* 2. Входящий номер — plain text contains-match on supplier's doc №.
         Full-word page-local label (moysklad «Входящий номер», not «Входящий №»). */}
      <InlineFilterPanel.Field label={t('col_incoming_number')} expandable={false}>
        <Input
          value={filterValues.incomingNumber ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            setFilterValues({ ...filterValues, incomingNumber: v || undefined });
            onResetCursor();
          }}
          data-test-id="filter-incoming-number"
        />
      </InlineFilterPanel.Field>
      {/* 3. Входящая дата */}
      <InlineFilterPanel.Field
        label={`${tFields('incoming_date')}:`}
        expandable
        inlineSuffix={
          <PeriodShortcuts
            onChange={({ from, to }) => {
              setFilterValues({ ...filterValues, incomingDateFrom: from, incomingDateTo: to });
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
          from={filterValues.incomingDateFrom}
          to={filterValues.incomingDateTo}
          onChange={({ from, to }) => {
            setFilterValues({ ...filterValues, incomingDateFrom: from, incomingDateTo: to });
            onResetCursor();
          }}
          testId="filter-incoming-date"
        />
      </InlineFilterPanel.Field>
      {/* 4. Оплата */}
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
      {/* 5. Приемка */}
      <InlineFilterPanel.Field label={tPo('filter_receive_state')} expandable={false}>
        <OptionSelect
          value={filterValues.receiveState}
          options={RECEIVE_OPTIONS}
          onChange={(v) => {
            setFilterValues({ ...filterValues, receiveState: v });
            onResetCursor();
          }}
          testId="filter-receive-state"
        />
      </InlineFilterPanel.Field>
      {/* 6. План. дата оплаты */}
      <InlineFilterPanel.Field
        label={`${tFields('payment_planned')}:`}
        expandable
        inlineSuffix={
          <PeriodShortcuts
            onChange={({ from, to }) => {
              setFilterValues({ ...filterValues, paymentPlannedFrom: from, paymentPlannedTo: to });
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
          from={filterValues.paymentPlannedFrom}
          to={filterValues.paymentPlannedTo}
          onChange={({ from, to }) => {
            setFilterValues({ ...filterValues, paymentPlannedFrom: from, paymentPlannedTo: to });
            onResetCursor();
          }}
          testId="filter-payment-planned"
        />
      </InlineFilterPanel.Field>
      {/* 7. Товар или группа — multi-select product dropdown. */}
      <InlineFilterPanel.Field label={tPo('filter_product_or_group')} expandable>
        <MultiCombobox
          value={products.map((x) => x.id)}
          items={products.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            const r = await api.get<{
              items: { id: string; name: string; code: string | null }[];
            }>(`/products?search=${encodeURIComponent(q)}&limit=20`);
            return r.items.map((x) => ({
              value: x.id,
              label: x.name,
              sublabel: x.code ?? undefined,
            }));
          }}
          onChange={(nextIds, toggled) => {
            setProducts((prev) =>
              nextIds.map((id) => {
                const ex = prev.find((p) => p.id === id);
                if (ex) return ex;
                if (toggled?.value === id) return { id, label: String(toggled.label) };
                return { id, label: id };
              }),
            );
            onResetCursor();
          }}
          placeholder=""
          testId="filter-product"
        />
      </InlineFilterPanel.Field>
      {/* 8. Склад — multi-select store dropdown. */}
      <InlineFilterPanel.Field label={tFields('store')} expandable>
        <MultiCombobox
          value={stores.map((x) => x.id)}
          items={stores.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            const r = await api.get<{ items: { id: string; name: string }[] }>(
              `/stores?search=${encodeURIComponent(q)}&limit=20`,
            );
            return r.items.map((x) => ({ value: x.id, label: x.name }));
          }}
          onChange={(nextIds, toggled) => {
            setStores((prev) =>
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
          testId="filter-store"
        />
      </InlineFilterPanel.Field>
      {/* 9. Проект — multi-select project dropdown. */}
      <InlineFilterPanel.Field label={tPo('filter_project')} expandable>
        <MultiCombobox
          value={projects.map((x) => x.id)}
          items={projects.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            const r = await api.get<{ items: { id: string; name: string }[] }>(
              `/projects?search=${encodeURIComponent(q)}&limit=20`,
            );
            return r.items.map((x) => ({ value: x.id, label: x.name }));
          }}
          onChange={(nextIds, toggled) => {
            setProjects((prev) =>
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
          testId="filter-project"
        />
      </InlineFilterPanel.Field>
      {/* 10. Контрагент — INLINE multi-select checkbox-dropdown (moysklad: click,
         type, tick — NOT a modal). */}
      <InlineFilterPanel.Field label={tFields('agent')} expandable>
        <MultiCombobox
          value={agents.map((x) => x.id)}
          items={agents.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            const r = await api.get<{ items: { id: string; name: string }[] }>(
              `/counterparties?search=${encodeURIComponent(q)}&limit=20`,
            );
            return r.items.map((x) => ({ value: x.id, label: x.name }));
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
      {/* 11. Группа контрагента — multi-select counterparty-group dropdown. */}
      <InlineFilterPanel.Field label={tPo('filter_agent_group')} expandable>
        <MultiCombobox
          value={agentGroups.map((x) => x.id)}
          items={agentGroups.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            const r = await api.get<{ items: { id: string; name: string }[] }>(
              `/groups?search=${encodeURIComponent(q)}&limit=20`,
            );
            return r.items.map((x) => ({ value: x.id, label: x.name }));
          }}
          onChange={(nextIds, toggled) => {
            setAgentGroups((prev) =>
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
          testId="filter-agent-group"
        />
      </InlineFilterPanel.Field>
      {/* 12. Счет контрагента — INLINE multi-select; lists the bank accounts of
         the selected counterparties (empty until ≥1 Контрагент is picked). */}
      <InlineFilterPanel.Field label={tPo('filter_agent_account')} expandable={false}>
        <MultiCombobox
          value={agentAccounts.map((x) => x.id)}
          items={agentAccounts.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            // moysklad: scoped to the picked counterparties. Bank accounts come
            // from the nested /counterparties/:id/bank-accounts route (raw array,
            // no search param) — fetch each selected agent's, merge, client-filter.
            const lists = await Promise.all(
              agents.map((a) =>
                api
                  .get<Array<{ id: string; accountNumber: string; bankName: string | null }>>(
                    `/counterparties/${a.id}/bank-accounts`,
                  )
                  .catch(() => []),
              ),
            );
            const k = q.trim().toLowerCase();
            return lists
              .flat()
              .filter(
                (x) =>
                  !k ||
                  x.accountNumber.toLowerCase().includes(k) ||
                  (x.bankName ?? '').toLowerCase().includes(k),
              )
              .map((x) => ({
                value: x.id,
                label: x.accountNumber,
                sublabel: x.bankName ?? undefined,
              }));
          }}
          onChange={(nextIds, toggled) => {
            setAgentAccounts((prev) =>
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
          testId="filter-agent-account"
        />
      </InlineFilterPanel.Field>
      {/* 13. Договор — multi-select contract dropdown. */}
      <InlineFilterPanel.Field label={tPo('filter_contract')} expandable>
        <MultiCombobox
          value={contracts.map((x) => x.id)}
          items={contracts.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            const r = await api.get<{ items: { id: string; name: string }[] }>(
              `/contracts?search=${encodeURIComponent(q)}&limit=20`,
            );
            return r.items.map((x) => ({ value: x.id, label: x.name }));
          }}
          onChange={(nextIds, toggled) => {
            setContracts((prev) =>
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
          testId="filter-contract"
        />
      </InlineFilterPanel.Field>
      {/* 14. Владелец контрагента — multi-select employee dropdown (agent.ownerId). */}
      <InlineFilterPanel.Field label={tPo('filter_agent_owner')} expandable>
        <MultiCombobox
          value={agentOwners.map((x) => x.id)}
          items={agentOwners.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            const r = await api.get<{ items: { id: string; name: string }[] }>(
              `/employees?search=${encodeURIComponent(q)}&limit=20`,
            );
            return r.items.map((x) => ({ value: x.id, label: x.name }));
          }}
          onChange={(nextIds, toggled) => {
            setAgentOwners((prev) =>
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
          testId="filter-agent-owner"
        />
      </InlineFilterPanel.Field>
      {/* 15. Организация — INLINE multi-select checkbox-dropdown (moysklad). */}
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
      {/* 16. Счет организации — INLINE multi-select; lists the accounts of the
         selected organizations (empty until ≥1 Организация is picked). */}
      <InlineFilterPanel.Field label={tPo('filter_org_account')} expandable={false}>
        <MultiCombobox
          value={orgAccounts.map((x) => x.id)}
          items={orgAccounts.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            // moysklad: scoped to the picked organizations. Org accounts come from
            // the flat /organization-accounts?organizationId= route — fetch each
            // selected org's, merge. Default accounts have a null accountNumber,
            // so fall back to the account name for the headline.
            const lists = await Promise.all(
              organizations.map((o) => {
                const p = new URLSearchParams({ search: q, limit: '50', organizationId: o.id });
                return api
                  .get<{
                    items: {
                      id: string;
                      name: string;
                      accountNumber: string | null;
                      bankName: string | null;
                    }[];
                  }>(`/organization-accounts?${p.toString()}`)
                  .then((r) => r.items)
                  .catch(() => []);
              }),
            );
            return lists.flat().map((x) => ({
              value: x.id,
              label: x.accountNumber || x.name,
              sublabel: x.bankName ?? undefined,
            }));
          }}
          onChange={(nextIds, toggled) => {
            setOrgAccounts((prev) =>
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
          testId="filter-org-account"
        />
      </InlineFilterPanel.Field>
      {/* 17. Статус — single StateSelect (InvoiceIn FSM 5 states). */}
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
      {/* 18. Проведено */}
      <InlineFilterPanel.Field label={tFields('applicable')} expandable={false}>
        <YesNoSelect
          value={filterValues.applicable}
          onChange={(v) => {
            setFilterValues({ ...filterValues, applicable: v });
            onResetCursor();
          }}
          testId="filter-applicable"
        />
      </InlineFilterPanel.Field>
      {/* 19. Напечатано */}
      <InlineFilterPanel.Field label={tFields('printed')} expandable={false}>
        <YesNoSelect
          value={filterValues.printed}
          onChange={(v) => {
            setFilterValues({ ...filterValues, printed: v });
            onResetCursor();
          }}
          testId="filter-printed"
        />
      </InlineFilterPanel.Field>
      {/* 20. Отправлено */}
      <InlineFilterPanel.Field label={tFields('published')} expandable={false}>
        <YesNoSelect
          value={filterValues.published}
          onChange={(v) => {
            setFilterValues({ ...filterValues, published: v });
            onResetCursor();
          }}
          testId="filter-published"
        />
      </InlineFilterPanel.Field>
      {/* 21. Владелец-сотрудник — multi-select employee dropdown. */}
      <InlineFilterPanel.Field label={tPo('filter_owner_employee')} expandable>
        <MultiCombobox
          value={owners.map((x) => x.id)}
          items={owners.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            const r = await api.get<{ items: { id: string; name: string }[] }>(
              `/employees?search=${encodeURIComponent(q)}&limit=20`,
            );
            return r.items.map((x) => ({ value: x.id, label: x.name }));
          }}
          onChange={(nextIds, toggled) => {
            setOwners((prev) =>
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
          testId="filter-owner"
        />
      </InlineFilterPanel.Field>
      {/* 22. Владелец-отдел — multi-select department (group) dropdown. */}
      <InlineFilterPanel.Field label={tPo('filter_owner_group')} expandable>
        <MultiCombobox
          value={groups.map((x) => x.id)}
          items={groups.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            const r = await api.get<{ items: { id: string; name: string }[] }>(
              `/groups?search=${encodeURIComponent(q)}&limit=20`,
            );
            return r.items.map((x) => ({ value: x.id, label: x.name }));
          }}
          onChange={(nextIds, toggled) => {
            setGroups((prev) =>
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
          testId="filter-group"
        />
      </InlineFilterPanel.Field>
      {/* 23. Общий доступ */}
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
      {/* 24. Когда изменен */}
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
      {/* 25. Кто изменил — multi-select employee dropdown (auditLog-approximated). */}
      <InlineFilterPanel.Field label={tPo('filter_modified_by')} expandable>
        <MultiCombobox
          value={modifiedBys.map((x) => x.id)}
          items={modifiedBys.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            const r = await api.get<{ items: { id: string; name: string }[] }>(
              `/employees?search=${encodeURIComponent(q)}&limit=20`,
            );
            return r.items.map((x) => ({ value: x.id, label: x.name }));
          }}
          onChange={(nextIds, toggled) => {
            setModifiedBys((prev) =>
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
        testId="invoices-in-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        onHelp={() => window.open('/help/invoices-in', '_blank')}
        selectionCount={bulk.selectedIds.size}
        createHref="/invoices-in/new"
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
        rowTestId={(i) => `invoice-in-row-${i.id}`}
        rowActions={(i) => bulk.rowDelete(i.id)}
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
        editMenu={{ label: tBulkActions('trigger'), items: editMenuItems }}
        createDocMenu={createMenuConfig}
        printMenu={{ label: tPrintMenu('trigger'), items: printMenuItems }}
        {...bulk.listViewProps}
        // bulkActionBar omitted — toolbar dropdowns replace it.
        visibleColumnKeys={cols.visibleKeys}
        headerSlot={filterPanel}
        extraActionsLeft={filterToggleButton}
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
          title: tMass('title'),
          ownerLabel: tFilters('owner_employee'),
          projectLabel: tFilters('project'),
          descriptionLabel: tMass('description_label'),
          apply: tMass('apply'),
          cancel: tMass('cancel'),
          hint: tMass('hint', { count: massEditIds.length }),
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
