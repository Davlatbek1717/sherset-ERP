'use client';

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { usePrintTemplatesManager } from '@/components/print/print-templates-provider';
import { type KitPrintForm, KitPrintModal } from '@/components/purchase-orders/kit-print-modal';
import { useApiMutation } from '@/hooks/use-api-mutation';
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
  type ListViewFilter,
  MassEditModal,
  MultiCombobox,
  NativeSelect,
  PeriodInputs,
  PeriodShortcuts,
  type PickerItem,
  footerMoneyCells,
  formatDate,
  formatMoney,
  useConfirm,
  useDebounce,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface PurchaseOrderRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  payedSumMinor: string;
  invoicedSumMinor: string;
  receivedSumMinor: string;
  waitSumMinor: string;
  shippedSumMinor: string;
  vatSumMinor: string;
  currency: string;
  printed: boolean;
  published: boolean;
  description: string | null;
  moment: string;
  deliveryPlannedMoment: string | null;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string; legalTitle: string | null };
  store: { id: string; name: string };
  owner: { id: string; name: string } | null;
  _count: { positions: number };
}

interface ListResponse {
  items: PurchaseOrderRow[];
  nextCursor?: string;
  total: number;
}

// Moysklad parity — 100 rows per page.
const LIMIT = 100;

/**
 * Currency display map — moysklad-parity short names. moysklad.uz uses
 * the Russian short forms across the entire UI ("сум" for UZS,
 * "доллар" for USD, "евро" for EUR), even though the underlying ISO
 * code is what's stored. The list-page «Валюта» column reads off this
 * map; unknown currencies fall through to the ISO code unchanged.
 */
const CURRENCY_LABEL: Record<string, string> = {
  UZS: 'сум',
  USD: 'доллар',
  EUR: 'евро',
  RUB: 'руб',
};

/**
 * Receipt-progress mini-bar shown under the «Принято» / «Оплачено» /
 * «Выставлено счетов» money cells.
 *
 * moysklad parity: each money cell that tracks fulfilment carries a
 * 2-3px coloured strip at the bottom of the cell:
 *   - cur === 0      → no bar (visually clear cell)
 *   - cur < target   → "small orange" 2px bar at orange (#e8a33b)
 *   - cur >= target  → "large green"  3px bar at green  (#3eb53e)
 *
 * The "small/large" naming mirrors moysklad's CSS classes and signals
 * fulfilment level at a glance — green & taller = "all good", orange
 * & shorter = "needs attention". The bar's width is always
 * proportional to cur/target (clipped to 100% on over-receipt).
 */
function FulfilmentBar({ cur, target }: { cur: bigint; target: bigint }) {
  if (cur <= 0n || target <= 0n) return null;
  const pct = Math.min(Number(cur) / Number(target), 1) * 100;
  // moysklad «bottom-indicator … green»: the received-fulfilment underline is a
  // muted olive green at 4px — measured live on climart #purchaseorder as a 4px
  // border-bottom of rgb(134,170,96) = #86aa60 (ours was a vivid #3eb53e). It is
  // GREEN at every fill level, sized to the received proportion — moysklad does
  // NOT switch to amber for partial receipts (its sole class modifier was
  // «…green»; the proportion is conveyed by the bar's WIDTH, not its colour).
  // Partial-green is inferred: climart's demo had no partial-receipt row to
  // observe directly. NOTE: invisible in our demo (all rows 0-received).
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
 * Coloured badge for boolean status columns (Напечатано / Отправлено).
 * moysklad shows a cyan pill with the verb-past-participle inside;
 * empty cell when the flag is false (no "—" placeholder).
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

/** Tri-state Yes/No/All select for boolean filter fields. */
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

/** Generic typed select for the moysklad-parity tri/quad-state filters
 *  (Оплата / Приемка / Тип возврата). The empty option is always
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

/**
 * One bulk-action item for the «Изменить ▾» / «Создать ▾» toolbar menus.
 * Mapped into ListView's typed `editMenu`/`createDocMenu` (so they render in
 * the joined segmented toolbar group); each item carries a label, optional
 * disabled flag (with reason tooltip), and optional destructive styling.
 */
type BulkActionItem = {
  key: string;
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
  destructive?: boolean;
};

// «Изменить ▾» / «Создать ▾» now render via ListView's typed editMenu /
// createDocMenu (see editMenuConfig / createMenuConfig below) so they join the
// moysklad segmented toolbar group — the bespoke BulkActionDropdown is gone.

/** «Оплата» — moysklad-parity tri-state select. */
const PAYMENT_OPTIONS = [
  { value: 'paid', ru: 'Оплачено', uz: "To'liq to'langan" },
  { value: 'partlyPaid', ru: 'Частично оплачено', uz: 'Qisman to’langan' },
  { value: 'unpaid', ru: 'Не оплачено', uz: "To'lanmagan" },
] as const;

/** «Приемка» — moysklad-parity quad-state select. */
const RECEIVE_OPTIONS = [
  { value: 'shipped', ru: 'Принято', uz: 'Qabul qilingan' },
  { value: 'partiallyshipped', ru: 'Частично принято', uz: 'Qisman qabul qilingan' },
  { value: 'unshipped', ru: 'Не принято', uz: 'Qabul qilinmagan' },
  { value: 'overdue', ru: 'Просрочено', uz: "Muddati o'tgan" },
] as const;

/** «Тип возврата» — moysklad-parity tri-state select. */
const RETURN_OPTIONS = [
  { value: 'mixed', ru: 'Частично возвращено', uz: 'Qisman qaytarilgan' },
  { value: 'noReturn', ru: 'Без возвратов', uz: 'Qaytarishsiz' },
  { value: 'return', ru: 'Полностью возвращено', uz: "To'liq qaytarilgan" },
] as const;

/**
 * Purchase-order-specific extension fields stored in
 * FilterDrawerValues alongside the shared shape. Cast at point of
 * use to avoid widening the canonical type used by 16 other list
 * pages.
 */
type ExtraFilterFields = {
  applicable?: 'true' | 'false';
  printed?: 'true' | 'false';
  published?: 'true' | 'false';
  shared?: 'true' | 'false';
  currency?: string;
  updatedFrom?: string;
  updatedTo?: string;
  // Multi-state status filter (csv on the wire).
  states?: string;
  // Derived state filters
  paymentState?: 'paid' | 'partlyPaid' | 'unpaid';
  receiveState?: 'shipped' | 'partiallyshipped' | 'unshipped' | 'overdue';
  returnState?: 'mixed' | 'noReturn' | 'return';
  // Дата приемки period
  deliveryFrom?: string;
  deliveryTo?: string;
  // Single-FK pickers that stay single-select (their dependent sub-fields or
  // catalog modal require one value). Группа контрагента / Владелец контрагента
  // / Склад / Проект / Договор / Владелец-сотрудник / Владелец-отдел / Кто
  // изменил are now MULTI-select (see the dedicated state arrays below).
  agentAccountId?: string;
  agentAccountLabel?: string;
  organizationAccountId?: string;
  organizationAccountLabel?: string;
};

/** Multi-select reference field — moysklad checkbox-dropdown holds {id,label}[]. */
type RefMulti = { id: string; label: string };

export default function PurchaseOrdersPage() {
  const t = useTranslations('pages.purchase_orders');
  const tPrintMenu = useTranslations('print_menu');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tStates = useTranslations('states.purchase_order');
  const locale = useLocale();

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [stateFilter, _setStateFilter] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  // Click-to-sort headers — moysklad-parity. Default mirrors the backend
  // service default (moment DESC = newest first); a header click fires
  // through ListView → DataTable, then onSortChange resets the cursor so
  // the user lands on page 1 of the freshly-ordered list.
  // moysklad-parity: the list defaults to «Номер» DESC — the sort arrow sits on
  // the № column (newest/highest first). Our № was renumbered in (moment, id)
  // order, so the backend maps a 'name' sort to [moment, id] = a clean numeric
  // «Номер» order (a plain string sort on «999»/«2143» would misorder).
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterValues, setFilterValues] = useState<FilterDrawerValues & ExtraFilterFields>({});
  // moysklad-parity multi-select reference filters — checkbox dropdowns
  // (MultiCombobox), mirroring the products list. Each holds the picked
  // {id,label} pairs; on the wire they go out as `<field>Ids` CSV.
  const [agentGroups, setAgentGroups] = useState<RefMulti[]>([]);
  const [agentOwners, setAgentOwners] = useState<RefMulti[]>([]);
  const [stores, setStores] = useState<RefMulti[]>([]);
  const [projects, setProjects] = useState<RefMulti[]>([]);
  const [contracts, setContracts] = useState<RefMulti[]>([]);
  const [owners, setOwners] = useState<RefMulti[]>([]);
  const [groups, setGroups] = useState<RefMulti[]>([]);
  const [modifiedBys, setModifiedBys] = useState<RefMulti[]>([]);
  const [products, setProducts] = useState<RefMulti[]>([]);
  // «Фильтр» 🔖 save-filter + ⚙ field-visibility (moysklad parity, mirrors the
  // products list). `saveFilterOpen` is shared with the SavedFiltersPills add
  // mode; `filterHidden.visibleKeys` holds the HIDDEN filter-field keys.
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  const filterHidden = useColumnVisibility('purchase-orders-filter-hidden', []);
  // moysklad always shows the footer totals row when totals are
  // computed; no user toggle in the toolbar — see audit protocol.
  const showTotals = true;
  const [filterOpen, setFilterOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState<
    null | 'agent' | 'org' | 'agentAccount' | 'orgAccount' | 'massEditOwner' | 'massEditProject'
  >(null);

  const [massEditOpen, setMassEditOpen] = useState(false);
  const [massEditIds, setMassEditIds] = useState<string[]>([]);
  // «Печать ▸ Комплект…» bundle-print dialog.
  const [kitPrintOpen, setKitPrintOpen] = useState(false);
  const [massEditOwner, setMassEditOwner] = useState<{ id: string; label: string } | null>(null);
  const [massEditProject, setMassEditProject] = useState<{ id: string; label: string } | null>(
    null,
  );

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
    ...(filterValues.sumMinorFrom !== undefined
      ? { sumMinorFrom: String(filterValues.sumMinorFrom) }
      : {}),
    ...(filterValues.sumMinorTo !== undefined
      ? { sumMinorTo: String(filterValues.sumMinorTo) }
      : {}),
    ...(filterValues.agentId ? { agentId: filterValues.agentId } : {}),
    ...(filterValues.organizationId ? { organizationId: filterValues.organizationId } : {}),
    ...(stores.length ? { storeIds: stores.map((x) => x.id).join(',') } : {}),
    ...(owners.length ? { ownerIds: owners.map((x) => x.id).join(',') } : {}),
    ...(filterValues.applicable ? { applicable: filterValues.applicable } : {}),
    ...(filterValues.printed ? { printed: filterValues.printed } : {}),
    ...(filterValues.published ? { published: filterValues.published } : {}),
    ...(filterValues.shared ? { shared: filterValues.shared } : {}),
    ...(filterValues.currency ? { currency: filterValues.currency } : {}),
    ...(filterValues.updatedFrom ? { updatedFrom: filterValues.updatedFrom } : {}),
    ...(filterValues.updatedTo ? { updatedTo: filterValues.updatedTo } : {}),
    ...(filterValues.deliveryFrom ? { deliveryFrom: filterValues.deliveryFrom } : {}),
    ...(filterValues.deliveryTo ? { deliveryTo: filterValues.deliveryTo } : {}),
    ...(filterValues.states ? { states: filterValues.states } : {}),
    ...(filterValues.paymentState ? { paymentState: filterValues.paymentState } : {}),
    ...(filterValues.receiveState ? { receiveState: filterValues.receiveState } : {}),
    ...(filterValues.returnState ? { returnState: filterValues.returnState } : {}),
    ...(agentGroups.length ? { agentGroupIds: agentGroups.map((x) => x.id).join(',') } : {}),
    ...(agentOwners.length ? { agentOwnerIds: agentOwners.map((x) => x.id).join(',') } : {}),
    ...(filterValues.agentAccountId ? { agentAccountId: filterValues.agentAccountId } : {}),
    ...(filterValues.organizationAccountId
      ? { organizationAccountId: filterValues.organizationAccountId }
      : {}),
    ...(groups.length ? { groupIds: groups.map((x) => x.id).join(',') } : {}),
    ...(projects.length ? { projectIds: projects.map((x) => x.id).join(',') } : {}),
    ...(contracts.length ? { contractIds: contracts.map((x) => x.id).join(',') } : {}),
    ...(modifiedBys.length ? { modifiedByIds: modifiedBys.map((x) => x.id).join(',') } : {}),
    ...(products.length ? { productIds: products.map((x) => x.id).join(',') } : {}),
  });

  const listQueryKey = [
    'purchase-orders',
    search,
    stateFilter,
    cursor,
    sortKey,
    sortDir,
    params.toString(),
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/purchase-orders?${params.toString()}`),
  });

  // moysklad-parity: the footer totals sum ALL filtered records (not just the
  // visible page). Fetched from the aggregate endpoint with the SAME filter
  // params the list uses, minus pagination/sort (which don't change the totals).
  const totalsParams = new URLSearchParams(params);
  totalsParams.delete('cursor');
  totalsParams.delete('limit');
  totalsParams.delete('sortBy');
  totalsParams.delete('sortDir');
  const totalsQs = totalsParams.toString();
  const { data: totals } = useQuery<{
    count: number;
    sumMinor: string;
    invoicedSumMinor: string;
    payedSumMinor: string;
    receivedSumMinor: string;
    waitSumMinor: string;
    // Distinct document currencies in the filtered set; >1 → footer shows «—».
    currencies: string[];
  }>({
    queryKey: ['purchase-order-totals', totalsQs],
    queryFn: () => api.get(`/purchase-orders/aggregate/totals${totalsQs ? `?${totalsQs}` : ''}`),
    staleTime: 30_000,
  });

  // moysklad-parity: the account's own «Заказ поставщику» print forms, shown
  // as extra items in the Печать menu (doc-scoped, purchaseorder:view —
  // independent of settings-admin access). Empty for accounts with no custom
  // templates, in which case the menu shows only the built-in standard form.
  const { data: printForms } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['purchase-order-print-forms'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('/purchase-orders/print-forms'),
    staleTime: 60_000,
  });

  const bulk = useBulkDocumentActions('purchase-orders', listQueryKey, {
    hasFSM: true,
    transitionTargets: ['confirm', 'cancel'] as const,
    hasBulkPrint: true,
    onMassEditClick: (ids) => {
      setMassEditIds(ids);
      setMassEditOwner(null);
      setMassEditProject(null);
      setMassEditOpen(true);
    },
  });

  // moysklad-parity bulk-action dropdowns wiring. Each mutation
  // invalidates the list query and clears the selection on success
  // so the toolbar count badge and row checkboxes reset together.
  const router = useRouter();
  const { openTemplates } = usePrintTemplatesManager();
  const qc = useQueryClient();
  const { confirm } = useConfirm();

  const invalidateAndClear = () => {
    qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    bulk.clearSelection();
  };

  const bulkClone = useApiMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ total: number; succeeded: string[]; failed: unknown[] }>(
        '/purchase-orders/bulk-clone',
        { ids },
      ),
    onSuccess: invalidateAndClear,
  });
  const bulkSetWaiting = useApiMutation({
    mutationFn: (input: { ids: string[]; waiting: boolean }) =>
      api.post<{ total: number; succeeded: string[]; failed: unknown[] }>(
        '/purchase-orders/bulk-set-waiting',
        input,
      ),
    onSuccess: invalidateAndClear,
  });
  const bulkCreatePaymentOut = useApiMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ total: number; succeeded: string[]; failed: unknown[] }>(
        '/purchase-orders/bulk-create-payment-out',
        { ids },
      ),
    onSuccess: () => router.push('/payments-out'),
  });
  const bulkCreateCashOut = useApiMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ total: number; succeeded: string[]; failed: unknown[] }>(
        '/purchase-orders/bulk-create-cash-out',
        { ids },
      ),
    onSuccess: () => router.push('/cash-out'),
  });
  // «Объединить» — combine the selected orders into one new draft PO and open
  // it (the BE returns the new id). Originals are untouched; the user reviews
  // and saves on the detail page (moysklad opens an unsaved draft — we persist).
  const bulkMerge = useApiMutation({
    mutationFn: (ids: string[]) => api.post<{ id: string }>('/purchase-orders/merge', { ids }),
    onSuccess: (data) => {
      bulk.clearSelection();
      router.push(`/purchase-orders/${data.id}`);
    },
  });

  const bulkAnyPending =
    bulk.bulkDelete.isPending ||
    bulk.bulkTransition.isPending ||
    bulkClone.isPending ||
    bulkSetWaiting.isPending ||
    bulkCreatePaymentOut.isPending ||
    bulkCreateCashOut.isPending ||
    bulkMerge.isPending;
  const selectedIdsArray = Array.from(bulk.selectedIds);
  const selectedCount = selectedIdsArray.length;
  // Default visible set — mirrors moysklad's first-load view.
  // `state` and `positions` stay available in the customizer but
  // hidden by default for parity.
  const cols = useColumnVisibility('purchase-orders', [
    'name',
    'moment',
    'agent',
    'organization',
    'sum',
    // «Валюта» — visible by default. Measured live against
    // online.moysklad.uz #purchaseorder: this (multi-currency) account
    // shows a Валюта column right after Сумма (сум / доллар). See
    // docs/audits/purchase-orders-list-PIXEL-DELTA.md (#8).
    'currency',
    'invoicedSum',
    'payedSum',
    'receivedSum',
    'waitSum',
    'published',
    'printed',
    'description',
  ]);

  // moysklad parity: column width persistence per user (drag handles
  // on the right edge of each header). Empty by default — columns
  // fall back to their `DataTableColumn.width` if not yet resized.
  const colWidths = useColumnWidths('purchase-orders');

  // moysklad's purchase-orders list does NOT use pill sub-tabs for the
  // status quick-filter — the toolbar exposes "Статус" as a dropdown.
  const filters: ListViewFilter[] = [];

  const columns: DataTableColumn<PurchaseOrderRow>[] = [
    {
      key: 'name',
      header: t('col_number'),
      width: '60px',
      sortable: true,
      cell: (o) => (
        <a
          href={`/purchase-orders/${o.id}`}
          // moysklad parity (measured live #purchaseorder): row links are a
          // brand-blue (#186999), NORMAL-weight (400), ALWAYS-underlined link
          // — not font-medium and not hover-only underline.
          className="text-[var(--ms-text-brand)] underline underline-offset-2"
        >
          {o.name}
        </a>
      ),
      cellText: (r) => r.name,
    },
    {
      key: 'moment',
      header: t('col_time'),
      width: '100px',
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
      // moysklad parity: the Контрагент column is a primary, always-visible
      // column. Without an explicit width it collapsed to 0 under the
      // table-layout:fixed grid (the fixed widths filled the table), so the
      // whole supplier column was invisible. Give it a real width.
      width: '100px',
      sortable: true,
      cell: (o) => (
        <div>
          {/* moysklad parity: Контрагент is a brand-blue, normal-weight,
              always-underlined link to the counterparty card. */}
          <a
            href={`/counterparties/${o.agent.id}`}
            className="block max-w-[280px] truncate text-[var(--ms-text-brand)] underline underline-offset-2"
          >
            {o.agent.name}
          </a>
          {o.agent.legalTitle && (
            <div className="max-w-[280px] truncate text-[var(--ms-text-muted)] text-xs">
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
      width: '90px',
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
      width: '90px',
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
      key: 'currency',
      header: tFields('currency'),
      width: '50px',
      sortable: true,
      cell: (o) => (
        <span className="text-[var(--ms-text-muted)] text-sm">
          {CURRENCY_LABEL[o.currency] ?? o.currency}
        </span>
      ),
      cellText: (r) => CURRENCY_LABEL[r.currency] ?? r.currency,
    },
    {
      key: 'invoicedSum',
      sortField: 'invoicedSumMinor',
      header: t('col_invoiced'),
      align: 'right',
      width: '90px',
      sortable: true,
      cell: (o) => (
        <div>
          <span className="tabular-nums">
            {formatMoney(o.invoicedSumMinor, o.currency, { displayAs: 'none' })}
          </span>
          <FulfilmentBar
            cur={BigInt(o.invoicedSumMinor || '0')}
            target={BigInt(o.sumMinor || '0')}
          />
        </div>
      ),
      cellText: (r) =>
        r.invoicedSumMinor
          ? formatMoney(r.invoicedSumMinor, r.currency, { displayAs: 'none' })
          : '',
    },
    {
      key: 'payedSum',
      sortField: 'payedSumMinor',
      header: t('col_paid'),
      align: 'right',
      width: '90px',
      sortable: true,
      cell: (o) => (
        <div>
          <span className="tabular-nums">
            {formatMoney(o.payedSumMinor, o.currency, { displayAs: 'none' })}
          </span>
          <FulfilmentBar cur={BigInt(o.payedSumMinor || '0')} target={BigInt(o.sumMinor || '0')} />
        </div>
      ),
      cellText: (r) =>
        r.payedSumMinor ? formatMoney(r.payedSumMinor, r.currency, { displayAs: 'none' }) : '',
    },
    {
      key: 'receivedSum',
      sortField: 'receivedSumMinor',
      header: t('col_received'),
      align: 'right',
      width: '125px',
      sortable: true,
      cell: (o) => (
        <div>
          <span className="tabular-nums">
            {formatMoney(o.receivedSumMinor, o.currency, { displayAs: 'none' })}
          </span>
          <FulfilmentBar
            cur={BigInt(o.receivedSumMinor || '0')}
            target={BigInt(o.sumMinor || '0')}
          />
        </div>
      ),
      cellText: (r) =>
        r.receivedSumMinor
          ? formatMoney(r.receivedSumMinor, r.currency, { displayAs: 'none' })
          : '',
    },
    {
      key: 'waitSum',
      sortField: 'waitSumMinor',
      header: t('col_waiting'),
      align: 'right',
      width: '90px',
      sortable: true,
      cell: (o) => {
        // server provides waitSumMinor, but fall back to (sum - received)
        // for older rows that haven't been re-saved since the column was
        // introduced.
        const wait =
          o.waitSumMinor && o.waitSumMinor !== '0'
            ? BigInt(o.waitSumMinor)
            : BigInt(o.sumMinor || '0') - BigInt(o.receivedSumMinor || '0');
        return (
          <span className="text-[var(--ms-text-muted)] tabular-nums">
            {wait > 0n ? formatMoney(wait, o.currency, { displayAs: 'none' }) : ''}
          </span>
        );
      },
      cellText: (r) => {
        const wait =
          r.waitSumMinor && r.waitSumMinor !== '0'
            ? BigInt(r.waitSumMinor)
            : BigInt(r.sumMinor || '0') - BigInt(r.receivedSumMinor || '0');
        return wait > 0n ? formatMoney(wait, r.currency, { displayAs: 'none' }) : '';
      },
    },
    {
      key: 'published',
      header: tFields('published'),
      width: '120px',
      align: 'left',
      sortable: true,
      cell: (o) => <StatusBadge on={o.published} label={t('badge_published')} />,
      cellText: (r) => (r.published ? t('badge_published') : ''),
    },
    {
      key: 'printed',
      header: tFields('printed'),
      width: '120px',
      align: 'left',
      sortable: true,
      cell: (o) => <StatusBadge on={o.printed} label={t('badge_printed')} />,
      cellText: (r) => (r.printed ? t('badge_printed') : ''),
    },
    {
      key: 'description',
      header: t('col_comment'),
      // Explicit width — same fix as `agent`: a width-less column collapses
      // to 0 under table-layout:fixed once the other columns fill the grid.
      width: '100px',
      sortable: true,
      cell: (o) => (
        <span className="block max-w-[260px] truncate text-[var(--ms-text-muted)] text-sm">
          {o.description ?? ''}
        </span>
      ),
      cellText: (r) => r.description ?? '',
    },
    // Status & positions — kept available in the column customizer for
    // power users who want them, but hidden by default to match moysklad.
    {
      key: 'state',
      header: tFields('state'),
      width: '170px',
      sortable: true,
      cell: (o) => (
        <Badge tone={documentStateTone(o.state)}>
          {tStates(
            o.state as
              | 'draft'
              | 'sent'
              | 'confirmed'
              | 'partially_received'
              | 'fully_received'
              | 'closed'
              | 'cancelled',
          )}
        </Badge>
      ),
      cellText: (r) => r.state,
    },
    {
      key: 'positions',
      header: tFields('positions_count'),
      width: '70px',
      align: 'right',
      cell: (o) => (
        <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">
          {o._count.positions}
        </span>
      ),
      cellText: (r) => String(r._count?.positions ?? ''),
    },
  ];

  // Footer sum row — moysklad-parity totals across ALL filtered records (the
  // `totals` aggregate above), not just the visible page: Сумма / Выставлено /
  // Оплачено / Принято / В ожидании.
  // moysklad currency-guard (mirrors customer-order): show «—» on a mixed-
  // currency set instead of a meaningless cross-currency sum, «…» while the
  // aggregate loads, else the exact single-currency total. The DataTable tfoot
  // already applies tabular-nums + right alignment, so plain strings suffice.
  const footerRow: Record<string, React.ReactNode> = footerMoneyCells(totals, {
    sum: totals?.sumMinor ?? '0',
    invoicedSum: totals?.invoicedSumMinor ?? '0',
    payedSum: totals?.payedSumMinor ?? '0',
    receivedSum: totals?.receivedSumMinor ?? '0',
    waitSum: totals?.waitSumMinor ?? '0',
  });

  const hasFilter =
    !!search ||
    !!stateFilter ||
    !!filterValues.agentId ||
    !!filterValues.organizationId ||
    stores.length > 0 ||
    owners.length > 0 ||
    !!filterValues.applicable ||
    !!filterValues.printed ||
    !!filterValues.published ||
    !!filterValues.shared ||
    !!filterValues.currency ||
    !!filterValues.momentFrom ||
    !!filterValues.momentTo ||
    !!filterValues.updatedFrom ||
    !!filterValues.updatedTo ||
    !!filterValues.deliveryFrom ||
    !!filterValues.deliveryTo ||
    !!filterValues.states ||
    !!filterValues.paymentState ||
    !!filterValues.receiveState ||
    !!filterValues.returnState ||
    agentGroups.length > 0 ||
    agentOwners.length > 0 ||
    !!filterValues.agentAccountId ||
    !!filterValues.organizationAccountId ||
    groups.length > 0 ||
    projects.length > 0 ||
    contracts.length > 0 ||
    modifiedBys.length > 0 ||
    products.length > 0 ||
    filterValues.sumMinorFrom !== undefined ||
    filterValues.sumMinorTo !== undefined;

  // Saved-filter serialize — the shared `queryFromFilter` only round-trips the
  // canonical FilterDrawerValues fields; the multi-select reference filters are
  // appended here as JSON ({id,label}[]) so a re-applied pill restores the
  // checkbox chips, not bare ids. Existing filterValues serialization is kept.
  const savedFilterQuery = (() => {
    const p = new URLSearchParams();
    // Round-trip the ENTIRE filterValues (not just the common subset
    // queryFromFilter handles) so a saved filter restores Статус / payment /
    // receive / return / applicable·printed·published·shared / currency /
    // accounts / contract·project / delivery+updated dates — previously
    // EVERYTHING except the date was silently dropped on save.
    p.set('fv', JSON.stringify(filterValues));
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

  // Saved-filter restore — rehydrate the canonical filterValues via the shared
  // decoder, then parse each multi-select JSON param back into its state array.
  const applySavedFilter = (qs: string) => {
    const p = qs.startsWith('?') ? new URLSearchParams(qs.slice(1)) : new URLSearchParams(qs);
    // New saves carry the whole filterValues as `fv`; legacy saves only have the
    // common subset → fall back to the shared decoder (restores at least dates).
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

  // Inline filter panel — purchase-order-specific superset of the
  // shared `useMoyskladDocFilter` hook. Mirrors moysklad's filter
  // panel field-for-field for the columns we already support; skips
  // fields that need backend schema work (Договор / Проект / Группа
  // контрагента / Тип возврата / Оплата / Приемка) until those land.
  // moysklad-parity inline filter panel — fields ordered exactly as
  // the captured DOM at docs/moysklad-reference/visual-captures/02-module/
  // purchaseorder/dom/01-default.html. The 24 fields are stable and
  // there are NO extras (Сумма range and standalone Валюта filters do
  // NOT exist in moysklad's purchase-order panel).
  const filterPanel = (
    <InlineFilterPanel
      hidden={!filterOpen}
      applyLabel={tFilters('find')}
      clearLabel={tFilters('clear')}
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
      onClear={() => {
        setFilterValues({});
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
      pills={
        <SavedFiltersPills
          entity="purchaseorder"
          currentQueryString={savedFilterQuery}
          onApply={applySavedFilter}
          adding={saveFilterOpen}
          onAddingChange={setSaveFilterOpen}
        />
      }
      testId="purchase-orders-inline-filter"
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
      {/* 2. Оплата */}
      <InlineFilterPanel.Field label={t('filter_payment_state')} expandable={false}>
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
      {/* 3. Приемка */}
      <InlineFilterPanel.Field label={t('filter_receive_state')} expandable={false}>
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
      {/* 4. Дата приемки */}
      <InlineFilterPanel.Field
        label={`${t('filter_delivery_period')}:`}
        expandable
        inlineSuffix={
          <PeriodShortcuts
            onChange={({ from, to }) => {
              setFilterValues({ ...filterValues, deliveryFrom: from, deliveryTo: to });
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
          from={filterValues.deliveryFrom}
          to={filterValues.deliveryTo}
          onChange={({ from, to }) => {
            setFilterValues({ ...filterValues, deliveryFrom: from, deliveryTo: to });
            onResetCursor();
          }}
          testId="filter-delivery"
        />
      </InlineFilterPanel.Field>
      {/* 5. Товар или группа — multi-select product dropdown. */}
      <InlineFilterPanel.Field label={t('filter_product_or_group')} expandable>
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
      {/* 6. Тип возврата */}
      <InlineFilterPanel.Field label={t('filter_return_state')} expandable={false}>
        <OptionSelect
          value={filterValues.returnState}
          options={RETURN_OPTIONS}
          onChange={(v) => {
            setFilterValues({ ...filterValues, returnState: v });
            onResetCursor();
          }}
          testId="filter-return-state"
        />
      </InlineFilterPanel.Field>
      {/* 7. Склад — multi-select store dropdown. */}
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
      {/* 8. Проект — multi-select project dropdown. */}
      <InlineFilterPanel.Field label={t('filter_project')} expandable>
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
      {/* 9. Контрагент */}
      <InlineFilterPanel.Field label={tFields('agent')} expandable>
        <CatalogPickerField
          value={
            filterValues.agentId
              ? { id: filterValues.agentId, label: filterValues.agentLabel ?? filterValues.agentId }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('agent')}
          onClear={() => {
            setFilterValues({ ...filterValues, agentId: undefined, agentLabel: undefined });
            onResetCursor();
          }}
          testId="filter-agent"
        />
      </InlineFilterPanel.Field>
      {/* 10. Группа контрагента — multi-select counterparty-group dropdown. */}
      <InlineFilterPanel.Field label={t('filter_agent_group')} expandable>
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
      {/* 11. Счет контрагента — disabled until agent picked */}
      <InlineFilterPanel.Field label={t('filter_agent_account')} expandable={false}>
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
          onPick={() => filterValues.agentId && setPickerOpen('agentAccount')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              agentAccountId: undefined,
              agentAccountLabel: undefined,
            });
            onResetCursor();
          }}
          disabled={!filterValues.agentId}
          disabledHint={t('filter_agent_account_disabled_hint')}
          testId="filter-agent-account"
        />
      </InlineFilterPanel.Field>
      {/* 12. Договор — multi-select contract dropdown. */}
      <InlineFilterPanel.Field label={t('filter_contract')} expandable>
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
      {/* 13. Владелец контрагента — multi-select employee dropdown. */}
      <InlineFilterPanel.Field label={t('filter_agent_owner')} expandable>
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
      {/* 14. Организация */}
      <InlineFilterPanel.Field label={tFields('organization')} expandable>
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
            onResetCursor();
          }}
          testId="filter-org"
        />
      </InlineFilterPanel.Field>
      {/* 15. Счет организации — disabled until organization picked */}
      <InlineFilterPanel.Field label={t('filter_org_account')} expandable={false}>
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
          onPick={() => filterValues.organizationId && setPickerOpen('orgAccount')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              organizationAccountId: undefined,
              organizationAccountLabel: undefined,
            });
            onResetCursor();
          }}
          disabled={!filterValues.organizationId}
          disabledHint={t('filter_org_account_disabled_hint')}
          testId="filter-org-account"
        />
      </InlineFilterPanel.Field>
      {/* 16. Статус (multi-tag picker) */}
      <InlineFilterPanel.Field label={t('filter_status_multi')} expandable>
        <MultiCombobox
          value={(filterValues.states ?? '').split(',').filter(Boolean)}
          items={[
            { value: 'draft', label: tStates('draft') },
            { value: 'sent', label: tStates('sent') },
            { value: 'confirmed', label: tStates('confirmed') },
            { value: 'partially_received', label: tStates('partially_received') },
            { value: 'fully_received', label: tStates('fully_received') },
            { value: 'closed', label: tStates('closed') },
            { value: 'cancelled', label: tStates('cancelled') },
          ]}
          onChange={(next) => {
            setFilterValues({
              ...filterValues,
              states: next.length ? next.join(',') : undefined,
            });
            onResetCursor();
          }}
          placeholder=""
          testId="filter-status"
        />
      </InlineFilterPanel.Field>
      {/* 17. Проведено */}
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
      {/* 18. Напечатано */}
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
      {/* 19. Отправлено */}
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
      {/* 20. Владелец-сотрудник — multi-select employee dropdown. */}
      <InlineFilterPanel.Field label={t('filter_owner_employee')} expandable>
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
      {/* 21. Владелец-отдел — multi-select department (group) dropdown. */}
      <InlineFilterPanel.Field label={t('filter_owner_group')} expandable>
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
      {/* 22. Общий доступ */}
      <InlineFilterPanel.Field label={t('filter_shared')} expandable={false}>
        <YesNoSelect
          value={filterValues.shared}
          onChange={(v) => {
            setFilterValues({ ...filterValues, shared: v });
            onResetCursor();
          }}
          testId="filter-shared"
        />
      </InlineFilterPanel.Field>
      {/* 23. Когда изменен */}
      <InlineFilterPanel.Field
        label={`${t('filter_updated_period')}:`}
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
      {/* 24. Кто изменил — multi-select employee dropdown. */}
      <InlineFilterPanel.Field label={t('filter_modified_by')} expandable>
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

  // moysklad-parity «Изменить ▾» dropdown items.
  const changeMenuItems: BulkActionItem[] = [
    {
      key: 'delete',
      label: t('bulk_delete'),
      destructive: true,
      disabled: bulkAnyPending,
      onClick: async () => {
        const ok = await confirm({
          title: t('bulk_delete_confirm', { count: selectedCount }),
          confirmLabel: t('bulk_delete'),
          tone: 'destructive',
        });
        if (ok) bulk.bulkDelete.mutate(selectedIdsArray);
      },
    },
    {
      key: 'clone',
      label: t('bulk_clone'),
      disabled: bulkAnyPending,
      onClick: () => bulkClone.mutate(selectedIdsArray),
    },
    {
      key: 'mass-edit',
      label: t('bulk_mass_edit'),
      // Audit 2026-05-29: moysklad metadata.json marks Массовое редактирование
      // as enabled when ≥1 row is selected — backend endpoint exists, the
      // page already owns the MassEditModal (see bottom of JSX tree).
      disabled: bulkAnyPending,
      onClick: () => {
        setMassEditIds(selectedIdsArray);
        setMassEditOpen(true);
      },
    },
    {
      key: 'post',
      label: t('bulk_post'),
      disabled: bulkAnyPending,
      onClick: async () => {
        const ok = await confirm({
          title: t('bulk_post_confirm', { count: selectedCount }),
          confirmLabel: t('bulk_post'),
        });
        if (ok) bulk.bulkTransition.mutate({ ids: selectedIdsArray, target: 'confirm' });
      },
    },
    {
      key: 'unpost',
      label: t('bulk_unpost'),
      disabled: bulkAnyPending,
      onClick: async () => {
        const ok = await confirm({
          title: t('bulk_unpost_confirm', { count: selectedCount }),
          confirmLabel: t('bulk_unpost'),
        });
        if (ok) bulk.bulkTransition.mutate({ ids: selectedIdsArray, target: 'unconfirm' });
      },
    },
    {
      key: 'merge',
      label: t('bulk_merge'),
      // «Объединить» — needs ≥2 orders to combine. moysklad opens a draft with
      // the merged positions; we create + open a persisted draft. No confirm
      // (matches moysklad's one-click), and the result is a deletable draft.
      disabled: bulkAnyPending || selectedCount < 2,
      onClick: () => bulkMerge.mutate(selectedIdsArray),
    },
    {
      key: 'set-waiting',
      label: t('bulk_set_waiting'),
      disabled: bulkAnyPending,
      onClick: () => bulkSetWaiting.mutate({ ids: selectedIdsArray, waiting: true }),
    },
    {
      key: 'clear-waiting',
      label: t('bulk_clear_waiting'),
      disabled: bulkAnyPending,
      onClick: () => bulkSetWaiting.mutate({ ids: selectedIdsArray, waiting: false }),
    },
  ];

  // moysklad-parity «Печать ▾» dropdown items.
  // Live-grounded 2026-06-17 (online.moysklad.uz #purchaseorder, real
  // account): the menu is dynamic — account templates · Заказ поставщику ·
  // Комплект… · Настроить… · «Запросить форму» block. «Заказ поставщику»
  // is the STANDARD order form and prints the SELECTED orders.
  //   1. Список заказов     (enabled — browser print of the list)
  //   2. Заказ поставщику   (prints selected orders' standard form via
  //                          bulk-print; selection-gated like «Изменить»)
  //   3. Комплект...        (kit print — disabled placeholder, task #3)
  //   4. Настроить...       (enabled — settings nav)
  // TODO(task #3): list the account's own purchaseorder PrintTemplates as
  // extra items (needs a doc-scoped GET + bulk-print templateId param).
  // Print the selected orders through bulk-print. An optional templateId
  // renders via a specific account form; without it the standard/default
  // form is used. Invalidates the list so the flipped printed=true shows.
  const printSelected = (templateId?: string) => {
    if (selectedCount === 0) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    void api
      .postDownload(
        '/purchase-orders/bulk-print',
        { ids: selectedIdsArray, ...(templateId ? { templateId } : {}) },
        `purchase-orders-${selectedIdsArray.length}-${stamp}.pdf`,
      )
      .then(() => qc.invalidateQueries({ queryKey: ['purchase-orders'] }));
  };

  // «Комплект…» — render the selected orders through SEVERAL forms at once and
  // download one combined PDF. `templateIds` carries the ticked forms (null =
  // standard «Заказ поставщику» form). Flips printed=true like bulk-print.
  const kitPrint = (templateIds: Array<string | null>) => {
    if (selectedCount === 0 || templateIds.length === 0) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    void api
      .postDownload(
        '/purchase-orders/kit-print',
        { ids: selectedIdsArray, templateIds },
        `purchase-orders-kit-${selectedIdsArray.length}-${stamp}.pdf`,
      )
      .then(() => qc.invalidateQueries({ queryKey: ['purchase-orders'] }));
  };

  // The «Комплект…» dialog lists the same forms as the «Печать» menu: the
  // standard form (id null) first, then the account's own custom templates.
  const kitForms: KitPrintForm[] = [
    { id: null, name: t('print_order_form') },
    ...(printForms ?? []).map((f) => ({ id: f.id, name: f.name })),
  ];

  const printMenuItems = [
    {
      id: 'orders-list',
      label: t('print_orders_list'),
      onSelect: () => window.print(),
    },
    // moysklad-parity: the account's own «Заказ поставщику» print forms,
    // isDefault first. Empty for accounts with no custom templates.
    ...(printForms ?? []).map((f) => ({
      id: `form-${f.id}`,
      label: f.name,
      disabled: selectedCount === 0,
      onSelect: () => printSelected(f.id),
    })),
    {
      id: 'order-form',
      label: t('print_order_form'),
      // Standard «Заказ поставщику» form for the selected orders (no
      // templateId → account default, else built-in). Selection-gated.
      disabled: selectedCount === 0,
      onSelect: () => printSelected(),
    },
    {
      id: 'set',
      label: t('print_set'),
      // «Комплект…» — bundle several forms into one PDF for the selected
      // orders. Selection-gated like the other per-order print items.
      disabled: selectedCount === 0,
      onSelect: () => setKitPrintOpen(true),
    },
    {
      id: 'configure',
      label: t('print_configure'),
      // «Настроить…» opens the right-side «Настройка шаблонов» slide-over
      // scoped to purchase orders (moysklad parity — no settings page).
      onSelect: () => openTemplates('purchaseorder'),
    },
  ];

  // moysklad-parity «Запросить форму» promo block — live-confirmed on
  // online.moysklad.uz #purchaseorder (print-popup-menu-bar > div
  // .print-custom-template-request-header + subtitle + «Как запросить»
  // button). LOCAL bilingual labels (NOT ru/uz.json): the i18n message
  // files are owned by a parallel session right now, and this list page
  // is outside the i18n no-hardcoded gate (which scans only /new + /[id]
  // form pages). TODO(i18n): migrate to a `print_menu.request_*` key set
  // once the message files are free. «Как запросить» opens the
  // purchase-orders help, matching moysklad's how-to link.
  const printRequestForm = {
    header: locale === 'uz' ? "Forma so'rash" : 'Запросить форму',
    subtitle:
      locale === 'uz'
        ? "Yordam xizmatimizdan individual chop etish formasini so'rashingiz mumkin"
        : 'Вы можете запросить индивидуальную печатную форму у нашей службы поддержки',
    buttonLabel: locale === 'uz' ? "Qanday so'rash" : 'Как запросить',
    onRequest: () => window.open('/help/purchase-orders', '_blank'),
  };

  // moysklad-parity «Создать ▾» dropdown items — purchase-order's «from
  // selected» creators. Grounded live on climart (2026-06-18): with ≥1 PO
  // selected moysklad shows ONLY «Исходящие платежи» + «Расходные ордера».
  // Supply/invoice creation lives on the per-order DETAIL page, NOT this
  // bulk list menu — earlier make-supply/make-invoice-in items were a
  // misground (built off stale placeholders) and were removed.
  const createMenuItems: BulkActionItem[] = [
    {
      key: 'payment-out',
      label: t('bulk_create_payment_out'),
      disabled: bulkAnyPending,
      onClick: () => bulkCreatePaymentOut.mutate(selectedIdsArray),
    },
    {
      key: 'cash-out',
      label: t('bulk_create_cash_out'),
      disabled: bulkAnyPending,
      onClick: () => bulkCreateCashOut.mutate(selectedIdsArray),
    },
  ];

  // ListView's `selectionCount` prop already renders the [☑ N] badge
  // between search and the action dropdowns; rendering a second count
  // span here would show «[☑1] 1 O'zgartirish ▾» — the duplicate the
  // user flagged. Keep this slot for the dropdowns only.
  // moysklad-parity «Изменить ▾ / Создать ▾» as TYPED ListView dropdowns, so they
  // render inside the joined segmented toolbar group next to «Печать ▾» (one
  // render path = one seamless segmented control). Trigger disabled when nothing
  // is selected (bulk actions need a selection), matching moysklad.
  const editMenuConfig = {
    label: t('bulk_change'),
    disabled: selectedCount === 0,
    items: changeMenuItems.map((it) => ({
      id: it.key,
      label: it.label,
      onSelect: it.onClick,
      disabled: it.disabled,
      destructive: it.destructive,
    })),
  };
  const createMenuConfig = {
    label: t('bulk_create'),
    disabled: selectedCount === 0,
    items: createMenuItems.map((it) => ({
      id: it.key,
      label: it.label,
      onSelect: it.onClick,
      disabled: it.disabled,
    })),
  };

  return (
    <>
      <ListView
        testId="purchase-orders-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        onHelp={() => window.open('/help/purchase-orders', '_blank')}
        selectionCount={bulk.selectedIds.size}
        createHref="/purchase-orders/new"
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
        rowTestId={(o) => `purchase-order-row-${o.id}`}
        rowActions={(o) => bulk.rowDelete(o.id)}
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
        richEmpty={{
          heading: t('empty_rich_heading'),
          cta: { label: t('create_button'), href: '/purchase-orders/new' },
          // helper.label has the trailing "приёмку" link inline in
          // moysklad — for now we link the whole sentence to the supply
          // create page; once we add inline-link support to RichEmpty
          // we'll split the trailing word into its own anchor.
          helper: { label: t('empty_rich_helper'), href: '/supplies/new' },
          resources: [
            { label: t('empty_resource_guide'), href: '/help/purchase-orders' },
            { label: t('empty_resource_video'), href: '/help/purchase-orders/video' },
            { label: t('empty_resource_course'), href: '/help/purchase-orders/course' },
          ],
        }}
        footerRow={showTotals ? footerRow : undefined}
        printMenu={{
          label: tPrintMenu('trigger'),
          items: printMenuItems,
          requestForm: printRequestForm,
        }}
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
        editMenu={editMenuConfig}
        createDocMenu={createMenuConfig}
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
        title={tFields('supplier')}
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
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'org'}
        onClose={() => setPickerOpen(null)}
        title={tFields('organization')}
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
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'agentAccount'}
        onClose={() => setPickerOpen(null)}
        title={t('filter_agent_account')}
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
          setFilterValues({
            ...filterValues,
            agentAccountId: item.id,
            agentAccountLabel: String(item.primary),
          });
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'orgAccount'}
        onClose={() => setPickerOpen(null)}
        title={t('filter_org_account')}
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
          setFilterValues({
            ...filterValues,
            organizationAccountId: item.id,
            organizationAccountLabel: String(item.primary),
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

      <KitPrintModal
        open={kitPrintOpen}
        onOpenChange={setKitPrintOpen}
        forms={kitForms}
        selectedCount={selectedCount}
        labels={{
          title: t('print_set'),
          // LOCAL bilingual labels (NOT ru/uz.json) — same reason as the
          // «Печать» request-form block above: the message files are owned by
          // a parallel session, and this list page is outside the i18n
          // no-hardcoded gate. TODO(i18n): `print_menu.kit_*` keys once free.
          confirm: locale === 'uz' ? 'Chop etish' : 'Распечатать',
          cancel: locale === 'uz' ? 'Bekor qilish' : 'Отменить',
        }}
        onConfirm={kitPrint}
      />
    </>
  );
}
