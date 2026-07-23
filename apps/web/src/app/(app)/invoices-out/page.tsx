'use client';

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useDocEditMenuItems } from '@/components/money/document-toolbar-menus';
import { usePrintTemplatesManager } from '@/components/print/print-templates-provider';
import { type KitPrintForm, KitPrintModal } from '@/components/purchase-orders/kit-print-modal';
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
  type ListToolbarMenuItem,
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
  state: string;
  applicable: boolean;
  sumMinor: string;
  payedSumMinor: string;
  shippedSumMinor: string;
  // moysklad parity (v2.2 audit): backend Prisma currency surfaced.
  currency: string;
  moment: string;
  paymentPlannedMoment: string | null;
  printed: boolean;
  published: boolean;
  description: string | null;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string };
  store: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  customerOrder: { id: string; name: string } | null;
  // «Статус» — account custom status (coloured pill), NOT the FSM `state`.
  status: { id: string; name: string; color: string | null } | null;
  _count: { positions: number };
}

interface ListResponse {
  items: InvoiceRow[];
  nextCursor?: string;
  total: number;
}

// Moysklad parity — 100 rows per page (same as CO list).
const LIMIT = 100;

/** Tri-state ✓ / — / (unset) select — mirrors demand's YesNoSelect for the
 *  boolean flag filters (Проведено / Напечатано / Отправлено). The empty
 *  option clears the filter exactly like moysklad. */
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

type RefMulti = { id: string; label: string };
type ComboItem = { value: string; label: string; sublabel?: string };

/**
 * Multi-select inline reference filter field — moysklad checkbox-dropdown
 * («Товар или группа» → click opens an in-place dropdown with a search box +
 * checkboxes, pick several). Wraps MultiCombobox + the id↔label merge so each
 * field is a one-liner. MUST be module-level: an inline component is a NEW type
 * each render → React remounts it → the dropdown closes on every keystroke.
 */
function MultiRefField({
  value,
  onChange,
  onSearch,
  testId,
}: {
  value: RefMulti[];
  onChange: (next: RefMulti[]) => void;
  onSearch: (q: string) => Promise<ComboItem[]>;
  testId: string;
}) {
  return (
    <MultiCombobox
      value={value.map((x) => x.id)}
      items={value.map((x) => ({ value: x.id, label: x.label }))}
      onSearch={onSearch}
      onChange={(nextIds, toggled) => {
        onChange(
          nextIds.map((id) => {
            const ex = value.find((p) => p.id === id);
            if (ex) return ex;
            if (toggled?.value === id) return { id, label: String(toggled.label) };
            return { id, label: id };
          }),
        );
      }}
      placeholder=""
      testId={testId}
    />
  );
}

// Module-level fetchers (API list → MultiCombobox items). `api` is module-scoped
// so these live outside the component (stable identity, no remount churn).
const refFetcher =
  (path: string) =>
  async (q: string): Promise<ComboItem[]> => {
    const r = await api.get<{ items: { id: string; name: string }[] }>(
      `${path}?search=${encodeURIComponent(q)}&limit=20`,
    );
    return r.items.map((x) => ({ value: x.id, label: x.name }));
  };
const fetchCounterparties = refFetcher('/counterparties');
const fetchOrganizations = refFetcher('/organizations');
const fetchStores = refFetcher('/stores');
const fetchEmployees = refFetcher('/employees');
const fetchProjects = refFetcher('/projects');
const fetchContracts = refFetcher('/contracts');
const fetchGroups = refFetcher('/groups');
const fetchSalesChannels = refFetcher('/sales-channels');
const fetchProducts = async (q: string): Promise<ComboItem[]> => {
  const r = await api.get<{ items: { id: string; name: string; code?: string | null }[] }>(
    `/products?search=${encodeURIComponent(q)}&limit=20`,
  );
  return r.items.map((x) => ({ value: x.id, label: x.name, sublabel: x.code ?? undefined }));
};

export default function InvoicesOutPage() {
  const t = useTranslations('pages.invoices_out');
  const tPrintMenu = useTranslations('print_menu');
  const tBulkActions = useTranslations('bulk_actions');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tStates = useTranslations('states.invoice_out');
  const tFilters = useTranslations('filters');
  const tMass = useTranslations('mass_edit_modal');
  const tCreate = useTranslations('create_related');
  const router = useRouter();

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [filterOpen, setFilterOpen] = useState(true);
  // «Фильтр» 🔖 save-filter + ⚙ field-visibility (moysklad parity, mirror
  // invoices-in). `saveFilterOpen` is shared with the SavedFiltersPills add
  // mode; `filterHidden.visibleKeys` holds the HIDDEN filter-field keys
  // (default [] → all 24 shown, matching the live ⚙ checklist).
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  const filterHidden = useColumnVisibility('invoices-out-filter-hidden', []);
  const [pickerOpen, setPickerOpen] = useState<null | 'massEditOwner' | 'massEditProject'>(null);
  const [kitPrintOpen, setKitPrintOpen] = useState(false);
  const { openTemplates } = usePrintTemplatesManager();

  // moysklad «Печать» — the account's own «Счёт покупателю» print forms (PDF),
  // listed by name (mirror PO-list). View-permission read; empty for accounts
  // with no custom templates.
  const { data: printForms } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['invoice-out-print-forms'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('/invoices-out/print-forms'),
    staleTime: 60_000,
  });

  // Multi-select inline filter state — moysklad checkbox-dropdowns (mirror
  // invoices-in). Each holds the picked {id,label} pairs; the request sends the
  // ids as `*Ids` (CSV). Replaces the old single-pick CatalogPicker modals.
  const [agents, setAgents] = useState<RefMulti[]>([]);
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);
  const [stores, setStores] = useState<RefMulti[]>([]);
  const [owners, setOwners] = useState<RefMulti[]>([]);
  const [products, setProducts] = useState<RefMulti[]>([]);
  const [projects, setProjects] = useState<RefMulti[]>([]);
  const [contracts, setContracts] = useState<RefMulti[]>([]);
  const [agentGroups, setAgentGroups] = useState<RefMulti[]>([]);
  const [agentOwners, setAgentOwners] = useState<RefMulti[]>([]);
  const [agentAccounts, setAgentAccounts] = useState<RefMulti[]>([]);
  const [orgAccounts, setOrgAccounts] = useState<RefMulti[]>([]);
  const [salesChannels, setSalesChannels] = useState<RefMulti[]>([]);
  const [groups, setGroups] = useState<RefMulti[]>([]);
  const [modifiedBys, setModifiedBys] = useState<RefMulti[]>([]);

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
  const [cursor, setCursor] = useState<string | undefined>();
  // Click-to-sort headers — moysklad-parity. Default mirrors backend default.
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterValues, setFilterValues] = useState<FilterDrawerValues>({});
  // Extended filter state — fields beyond what FilterDrawerValues covers
  // (moysklad «Счета покупателям» parity: Оплата / Проект / Договор / Счёт
  // организации / Группа контрагента / Счёт контрагента / Канал продаж /
  // Статус / Заказ покупателя / Владелец-отдел / Проведено / Напечатано /
  // Отправлено / Когда изменен).
  // Non-reference filter state (selects / bools / date ranges). The reference
  // fields (agent, organization, product, …) moved to the RefMulti[] arrays
  // above as moysklad inline checkbox-dropdowns.
  const [extFilter, setExtFilter] = useState<{
    paymentStatus?: 'unpaid' | 'partial' | 'paid';
    // «Отгружено» — shipment progress (shippedSumMinor vs sumMinor).
    shippedStatus?: 'not_shipped' | 'partial' | 'shipped';
    // «План. дата оплаты» — paymentPlannedMoment range.
    paymentPlannedFrom?: string;
    paymentPlannedTo?: string;
    state?: string;
    // tri-state flag filters ('true' | 'false')
    applicable?: 'true' | 'false';
    printed?: 'true' | 'false';
    published?: 'true' | 'false';
    // «Общий доступ» — shared flag.
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
  if (extFilter.paymentStatus) paramsRecord.paymentStatus = extFilter.paymentStatus;
  if (extFilter.shippedStatus) paramsRecord.shippedStatus = extFilter.shippedStatus;
  if (extFilter.paymentPlannedFrom) paramsRecord.paymentPlannedFrom = extFilter.paymentPlannedFrom;
  if (extFilter.paymentPlannedTo) paramsRecord.paymentPlannedTo = extFilter.paymentPlannedTo;
  if (extFilter.state) paramsRecord.state = extFilter.state;
  if (extFilter.applicable) paramsRecord.applicable = extFilter.applicable;
  if (extFilter.printed) paramsRecord.printed = extFilter.printed;
  if (extFilter.published) paramsRecord.published = extFilter.published;
  if (extFilter.shared) paramsRecord.shared = extFilter.shared;
  if (extFilter.updatedFrom) paramsRecord.updatedFrom = extFilter.updatedFrom;
  if (extFilter.updatedTo) paramsRecord.updatedTo = extFilter.updatedTo;
  // Multi-select reference fields → CSV `*Ids` (moysklad inline checkbox-dropdowns).
  const csvIds = (a: RefMulti[]) => a.map((x) => x.id).join(',');
  if (agents.length) paramsRecord.agentIds = csvIds(agents);
  if (organizations.length) paramsRecord.organizationIds = csvIds(organizations);
  if (stores.length) paramsRecord.storeIds = csvIds(stores);
  if (owners.length) paramsRecord.ownerIds = csvIds(owners);
  if (products.length) paramsRecord.productIds = csvIds(products);
  if (projects.length) paramsRecord.projectIds = csvIds(projects);
  if (contracts.length) paramsRecord.contractIds = csvIds(contracts);
  if (agentGroups.length) paramsRecord.agentGroupIds = csvIds(agentGroups);
  if (agentOwners.length) paramsRecord.agentOwnerIds = csvIds(agentOwners);
  if (agentAccounts.length) paramsRecord.agentAccountIds = csvIds(agentAccounts);
  if (orgAccounts.length) paramsRecord.organizationAccountIds = csvIds(orgAccounts);
  if (salesChannels.length) paramsRecord.salesChannelIds = csvIds(salesChannels);
  if (groups.length) paramsRecord.groupIds = csvIds(groups);
  if (modifiedBys.length) paramsRecord.modifiedByIds = csvIds(modifiedBys);
  const params = new URLSearchParams(paramsRecord);

  // Saved-filter round-trip — serialise the filter-state objects AND the
  // multi-select reference arrays as JSON so a re-applied bookmark restores every
  // field INCLUDING reference labels (a params-only encoding drops labels → chips
  // show raw UUIDs). Empty when nothing is set, which disables the «+» save pill.
  const refArrays: Record<string, RefMulti[]> = {
    agents,
    organizations,
    stores,
    owners,
    products,
    projects,
    contracts,
    agentGroups,
    agentOwners,
    agentAccounts,
    orgAccounts,
    salesChannels,
    groups,
    modifiedBys,
  };
  const refSetters: Record<string, (v: RefMulti[]) => void> = {
    agents: setAgents,
    organizations: setOrganizations,
    stores: setStores,
    owners: setOwners,
    products: setProducts,
    projects: setProjects,
    contracts: setContracts,
    agentGroups: setAgentGroups,
    agentOwners: setAgentOwners,
    agentAccounts: setAgentAccounts,
    orgAccounts: setOrgAccounts,
    salesChannels: setSalesChannels,
    groups: setGroups,
    modifiedBys: setModifiedBys,
  };
  const savedFilterQuery = (() => {
    const hasRefs = Object.values(refArrays).some((a) => a.length > 0);
    const hasAny =
      hasRefs ||
      Object.values(filterValues).some((v) => v != null && v !== '') ||
      Object.values(extFilter).some((v) => v != null && v !== '');
    if (!hasAny) return '';
    const sp = new URLSearchParams();
    sp.set('fv', JSON.stringify(filterValues));
    sp.set('ef', JSON.stringify(extFilter));
    sp.set('refs', JSON.stringify(refArrays));
    return sp.toString();
  })();

  const applySavedFilter = (qs: string) => {
    const sp = qs.startsWith('?') ? new URLSearchParams(qs.slice(1)) : new URLSearchParams(qs);
    const fvRaw = sp.get('fv');
    if (fvRaw) {
      try {
        const fv: unknown = JSON.parse(fvRaw);
        setFilterValues(fv as typeof filterValues);
      } catch {
        setFilterValues(filterFromQueryString(qs));
      }
    } else {
      // Legacy params-only saves (pre-JSON) still decode the basic fields.
      setFilterValues(filterFromQueryString(qs));
    }
    const efRaw = sp.get('ef');
    try {
      setExtFilter(efRaw ? (JSON.parse(efRaw) as typeof extFilter) : {});
    } catch {
      setExtFilter({});
    }
    // Restore each multi-select reference array (clear those absent from the save).
    let refs: Record<string, RefMulti[]> = {};
    const refsRaw = sp.get('refs');
    if (refsRaw) {
      try {
        refs = JSON.parse(refsRaw) as Record<string, RefMulti[]>;
      } catch {
        refs = {};
      }
    }
    for (const [k, setter] of Object.entries(refSetters)) {
      const arr = refs[k];
      setter(
        Array.isArray(arr)
          ? arr
              .filter((x): x is RefMulti => !!x && typeof x.id === 'string')
              .map((x) => ({ id: x.id, label: String(x.label ?? x.id) }))
          : [],
      );
    }
    setCursor(undefined);
  };

  // moysklad list footer «Итого» — totals across the WHOLE filtered set (not just
  // the visible page); same filter params minus pagination/sort. Mirror invoices-in.
  const totalsParams = new URLSearchParams(params);
  for (const k of ['cursor', 'limit', 'sortBy', 'sortDir']) totalsParams.delete(k);
  const totalsQs = totalsParams.toString();
  const { data: totals } = useQuery<{
    count: number;
    sumMinor: string;
    payedSumMinor: string;
    shippedSumMinor: string;
    currencies: string[];
  }>({
    queryKey: ['invoices-out-totals', totalsQs],
    queryFn: () => api.get(`/invoices-out/aggregate/totals${totalsQs ? `?${totalsQs}` : ''}`),
    staleTime: 30_000,
  });
  // Pinned footer money cells (keys match the sum/paid/shipped column keys);
  // footerMoneyCells shows «—» when the filtered set mixes currencies.
  const footerRow = footerMoneyCells(totals, {
    sum: totals?.sumMinor ?? '0',
    paid: totals?.payedSumMinor ?? '0',
    shipped: totals?.shippedSumMinor ?? '0',
  });

  const listQueryKey = [
    'invoices-out',
    search,
    cursor,
    sortKey,
    sortDir,
    // params.toString() captures filterValues + extFilter + the multi-select
    // reference arrays (*Ids) — so changing ANY filter (incl. a MultiCombobox
    // pick) refetches. Without it, array changes wouldn't invalidate the query.
    params.toString(),
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/invoices-out?${params.toString()}`),
  });

  const openMassEdit = (ids: string[]) => {
    stashBulkEdit({ entity: 'invoices-out', ids, from: '/invoices-out' });
    router.push('/bulk-edit');
  };
  const bulk = useBulkDocumentActions('invoices-out', listQueryKey, {
    hasFSM: true,
    hasBulkPrint: true,
    onMassEditClick: openMassEdit,
  });
  const selectedIdsArray = Array.from(bulk.selectedIds);
  const selectedCount = bulk.selectedIds.size;

  // «Копировать» — bulk clone the selected invoices (one draft each, mirror the
  // detail «Скопировать»). Fans out `:id/clone`; opens nothing (list refreshes).
  const bulkCopy = useApiMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => api.post(`/invoices-out/${id}/clone`, {})));
      return { ok: true } as const;
    },
    onSuccess: () => {
      bulk.clearSelection();
      refetch();
    },
  });
  // «Объединить» — combine the selected invoices into ONE new draft and open it
  // (BE `/invoices-out/merge`, mirror PO). Needs ≥2; same currency + VAT mode.
  const bulkMerge = useApiMutation({
    mutationFn: (ids: string[]) => api.post<{ id: string }>('/invoices-out/merge', { ids }),
    onSuccess: (created) => {
      bulk.clearSelection();
      router.push(`/invoices-out/${created.id}`);
    },
  });

  // moysklad «Изменить» — Удалить · Копировать · Массовое редактирование ·
  // Провести · Снять проведение · Объединить (all wired now, `f07b95c9`-style
  // metadata parity). FSM post/unpost fan out `/invoices-out/bulk-transition`.
  const editMenuItems = useDocEditMenuItems({
    selectedIds: bulk.selectedIds,
    allRowIds: (data?.items ?? []).map((r) => r.id),
    onBulkDelete: (ids) => bulk.bulkDelete.mutate(ids),
    deletePending: bulk.bulkDelete.isPending,
    onMassEdit: openMassEdit,
    includeMerge: true,
    onBulkCopy: (ids) => bulkCopy.mutate(ids),
    copyPending: bulkCopy.isPending,
    onBulkPost: (ids) => bulk.bulkTransition.mutate({ ids, target: 'post' }),
    onBulkUnpost: (ids) => bulk.bulkTransition.mutate({ ids, target: 'unpost' }),
    transitionPending: bulk.bulkTransition.isPending,
    onMerge: (ids) => bulkMerge.mutate(ids),
    mergePending: bulkMerge.isPending,
  });

  // moysklad «Печать ▾» — Список счетов (browser print) · account forms ·
  // standard «Счет покупателю» (bulk-print) · Комплект… (kit-print) · Настроить…
  // (mirror PO-list dynamic menu). Selection-gated per-invoice items.
  const printSelected = (templateId?: string) => {
    if (selectedCount === 0) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    void api
      .postDownload(
        '/invoices-out/bulk-print',
        { ids: selectedIdsArray, ...(templateId ? { templateId } : {}) },
        `invoices-out-${selectedIdsArray.length}-${stamp}.pdf`,
      )
      .then(() => refetch());
  };
  const kitPrint = (templateIds: Array<string | null>) => {
    if (selectedCount === 0 || templateIds.length === 0) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    void api
      .postDownload(
        '/invoices-out/kit-print',
        { ids: selectedIdsArray, templateIds },
        `invoices-out-kit-${selectedIdsArray.length}-${stamp}.pdf`,
      )
      .then(() => refetch());
  };
  const kitForms: KitPrintForm[] = [
    { id: null, name: t('print_invoice_form') },
    ...(printForms ?? []).map((f) => ({ id: f.id, name: f.name })),
  ];
  const printMenuItems: ListToolbarMenuItem[] = [
    { id: 'invoices-list', label: t('print_invoices_list'), onSelect: () => window.print() },
    ...(printForms ?? []).map((f) => ({
      id: `form-${f.id}`,
      label: f.name,
      disabled: selectedCount === 0,
      onSelect: () => printSelected(f.id),
    })),
    {
      id: 'invoice-form',
      label: t('print_invoice_form'),
      disabled: selectedCount === 0,
      onSelect: () => printSelected(),
    },
    {
      id: 'set',
      label: tPrintMenu('set'),
      disabled: selectedCount === 0,
      onSelect: () => setKitPrintOpen(true),
    },
    {
      id: 'configure',
      label: tPrintMenu('configure'),
      onSelect: () => openTemplates('invoiceout'),
    },
  ];

  // moysklad «Создать ▾» — LIVE-GROUNDED sibling (invoices-in list 2026-06-25,
  // mirrored to the sales side): with rows selected moysklad offers exactly
  // «Входящие платежи» + «Приходные ордера». Each creates one draft per selected
  // invoice (BE bulk-create endpoints) then routes to that doc list. Disabled
  // until ≥1 row is selected (matches the greyed «Создать» on empty selection).
  const bulkCreatePaymentIn = useApiMutation({
    mutationFn: (ids: string[]) => api.post('/payments-in/bulk-create-from-invoice-out', { ids }),
    onSuccess: () => {
      bulk.clearSelection();
      router.push('/payments-in');
    },
  });
  const bulkCreateCashIn = useApiMutation({
    mutationFn: (ids: string[]) => api.post('/cash-in/bulk-create-from-invoice-out', { ids }),
    onSuccess: () => {
      bulk.clearSelection();
      router.push('/cash-in');
    },
  });
  const createDocItems: ListToolbarMenuItem[] = [
    {
      id: 'payment_in',
      label: t('bulk_create_payment_in'),
      onSelect: () => bulkCreatePaymentIn.mutate(selectedIdsArray),
      disabled: bulkCreatePaymentIn.isPending,
    },
    {
      id: 'cash_in',
      label: t('bulk_create_cash_in'),
      onSelect: () => bulkCreateCashIn.mutate(selectedIdsArray),
      disabled: bulkCreateCashIn.isPending,
    },
  ];

  // Default visible columns mirror moysklad's "Счета покупателям" list.
  // See visual-captures/03-module/invoiceout/01-default.png — order:
  // №, Время, Контрагент, Организация, Со склада, Сумма, План. дата оплаты,
  // Оплачено, Отгружено, Отправлено, Напечатано, Комментарий
  // moysklad parity (re-grounded LIVE #invoiceout 2026-06-26): /invoiceout
  // default columns are № · Время · Контрагент · Организация · Со склада ·
  // Сумма · Валюта · План. дата оплаты · Оплачено · Отгружено · Отправлено ·
  // Напечатано · Комментарий (13 cols). `state` and `customer_order` stay
  // available via the table-header ⚙ but hidden by default to match moysklad.
  // `currency` is shown by default — the live grid HAS «Валюта» (an earlier
  // 2026-05 audit removed it from a stale capture that pre-dated the column;
  // live ground wins). The previous bogus 'all'/'draft'/'posted' tab keys (not
  // columns) and the duplicate 'paid' were cleaned up here.
  const cols = useColumnVisibility('invoices-out', [
    'name',
    'moment',
    'agent',
    'organization',
    'store',
    'sum',
    'currency',
    'payment_planned',
    'paid',
    'shipped',
    'published',
    'printed',
    'description',
  ]);

  // moysklad parity: column-width persistence per user (Tour 5 D7).
  const colWidths = useColumnWidths('invoices-out');

  // moysklad's "Счета покупателям" list does NOT use pill sub-tabs for
  // the status quick-filter — verified against
  // docs/moysklad-reference/visual-captures/03-module/invoiceout/dom/
  // 00-clean-default.html (the only "segment" control there is the
  // icon-only view-mode toggle; "Проведено" appears solely as edit-form
  // checkbox labels). Status filtering is surfaced as a "Статус" select
  // inside the inline filter panel below, matching the customer-orders
  // gold standard.

  const columns: DataTableColumn<InvoiceRow>[] = [
    {
      key: 'name',
      header: '№',
      width: '140px',
      sortable: true,
      cell: (i) => (
        <a
          href={`/invoices-out/${i.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {i.name}
        </a>
      ),
      cellText: (r: InvoiceRow) => r.name,
    },
    {
      key: 'moment',
      header: tFields('time'),
      width: '140px',
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
      width: '220px',
      sortable: true,
      cell: (i) => (
        <div>
          <div className="max-w-[300px] truncate font-medium">{i.agent.name}</div>
          {i.agent.legalTitle && (
            <div className="max-w-[300px] truncate text-[var(--ms-text-muted)] text-[11px]">
              {i.agent.legalTitle}
            </div>
          )}
        </div>
      ),
      cellText: (r: InvoiceRow) =>
        r.agent?.legalTitle ? `${r.agent.name} (${r.agent.legalTitle})` : (r.agent?.name ?? ''),
    },
    {
      key: 'organization',
      header: tFields('organization'),
      width: '180px',
      sortable: true,
      cell: (i) => (
        <span className="max-w-[200px] truncate text-sm">{i.organization?.name ?? '—'}</span>
      ),
      cellText: (r: InvoiceRow) => r.organization?.name ?? '',
    },
    {
      key: 'store',
      header: tFields('store_from'),
      width: '150px',
      cell: (i) => <span className="max-w-[150px] truncate text-sm">{i.store?.name ?? '—'}</span>,
      cellText: (r: InvoiceRow) => r.store?.name ?? '',
    },
    {
      key: 'sum',
      sortField: 'sumMinor',
      header: tFields('sum'),
      align: 'right',
      width: '140px',
      sortable: true,
      cell: (i) => (
        <span className="font-medium tabular-nums">
          {formatMoney(i.sumMinor, 'UZS', { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: InvoiceRow) => (r.sumMinor ? formatMoney(r.sumMinor) : ''),
    },
    // moysklad parity (v2.2 audit): «Валюта» between Сумма and План.
    // дата оплаты — backend Prisma currency surfaced.
    {
      key: 'currency',
      header: tFields('currency'),
      width: '90px',
      align: 'center',
      cell: (i) => (
        <span className="text-[var(--ms-text-muted)] text-xs uppercase">{i.currency}</span>
      ),
      cellText: (r: InvoiceRow) => r.currency,
    },
    {
      key: 'payment_planned',
      header: tFields('payment_planned'),
      width: '150px',
      cell: (i) =>
        i.paymentPlannedMoment ? (
          <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
            {formatDate(i.paymentPlannedMoment)}
          </span>
        ) : (
          <span className="text-[var(--ms-text-muted)]">—</span>
        ),
      cellText: (r: InvoiceRow) =>
        r.paymentPlannedMoment ? formatDate(r.paymentPlannedMoment) : '',
    },
    {
      key: 'paid',
      sortField: 'payedSumMinor',
      header: tFields('payed_sum'),
      align: 'right',
      width: '130px',
      sortable: true,
      cell: (i) => (
        <span className="text-sm tabular-nums">
          {formatMoney(i.payedSumMinor, 'UZS', { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: InvoiceRow) => (r.payedSumMinor ? formatMoney(r.payedSumMinor) : ''),
    },
    {
      key: 'shipped',
      header: tFields('shipped_sum'),
      align: 'right',
      width: '130px',
      cell: (i) => (
        <span className="text-sm tabular-nums">
          {formatMoney(i.shippedSumMinor, 'UZS', { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: InvoiceRow) => (r.shippedSumMinor ? formatMoney(r.shippedSumMinor) : ''),
    },
    {
      key: 'state',
      header: tFields('state'),
      width: '160px',
      cell: (i) => (
        <Badge tone={documentStateTone(i.state, INVOICE_STATE_TONE)}>
          {tStates(
            i.state as
              | 'draft'
              | 'posted'
              | 'sent'
              | 'partially_paid'
              | 'paid'
              | 'overdue'
              | 'cancelled',
          )}
        </Badge>
      ),
      cellText: (r: InvoiceRow) => r.state,
    },
    {
      // moysklad «Статус» — account custom status (coloured pill), NOT the FSM
      // `state`. Hidden by default (June ground: not in the 13 default cols),
      // available via the ⚙ column customizer — mirror supply list's status col.
      key: 'custom_status',
      header: tFields('state'),
      width: '150px',
      cell: (i) =>
        i.status ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] px-2 py-0.5 font-medium text-white text-xs"
            style={{ backgroundColor: i.status.color ?? 'var(--ms-text-muted)' }}
            data-test-id="invoice-out-status-pill"
          >
            {i.status.name}
          </span>
        ) : (
          <span
            className="text-[var(--ms-text-muted)] text-xs"
            data-test-id="invoice-out-status-placeholder"
          >
            {tFields('custom_status_placeholder')}
          </span>
        ),
      cellText: (r: InvoiceRow) => r.status?.name ?? '',
    },
    {
      key: 'published',
      header: tFields('published'),
      width: '110px',
      // moysklad parity: cyan (#00bfe6) filled pill «Отправлен» when sent, EMPTY
      // otherwise (NOT ✓/«—»). Live-grounded rgb(0,191,230); mirror CO/demands.
      cell: (i) =>
        i.published ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] bg-[#00bfe6] px-2 py-0.5 font-medium text-white text-xs"
            data-test-id="published-badge"
          >
            {tFields('published_badge')}
          </span>
        ) : null,
      cellText: (r: InvoiceRow) => (r.published ? tFields('published_badge') : ''),
    },
    {
      key: 'printed',
      header: tFields('printed'),
      width: '110px',
      cell: (i) =>
        i.printed ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] bg-[#00bfe6] px-2 py-0.5 font-medium text-white text-xs"
            data-test-id="printed-badge"
          >
            {tFields('printed_badge')}
          </span>
        ) : null,
      cellText: (r: InvoiceRow) => (r.printed ? tFields('printed_badge') : ''),
    },
    {
      key: 'description',
      header: tFields('description'),
      cell: (i) => (
        <span className="max-w-[200px] truncate text-[var(--ms-text-muted)] text-[11px]">
          {i.description ?? ''}
        </span>
      ),
      cellText: (r: InvoiceRow) => r.description ?? '',
    },
    {
      key: 'customer_order',
      header: tFields('linked_order'),
      width: '150px',
      cell: (i) =>
        i.customerOrder ? (
          <a
            href={`/customer-orders/${i.customerOrder.id}`}
            className="text-[var(--ms-text-brand)] text-sm underline-offset-2 hover:underline"
          >
            {i.customerOrder.name}
          </a>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">{tCommon('none')}</span>
        ),
    },
  ];

  // Any active filter → show the «no results» empty state (not the rich «create
  // your first invoice» one). Covers ALL controls: search, every non-reference
  // filter (payment/shipped status, flags, period, plan-date, updated range) and
  // every multi-select reference array (adversarial-review finding — was checking
  // only search/state/refs, so a zero-match «Оплата»/period filter wrongly showed
  // the empty account state).
  const hasFilter =
    !!search ||
    Object.values(filterValues).some((v) => v != null && v !== '') ||
    Object.values(extFilter).some((v) => v != null && v !== '') ||
    Object.values(refArrays).some((a) => a.length > 0);

  return (
    <>
      <ListView
        testId="invoices-out-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        onHelp={() => window.open('/help/invoices-out', '_blank')}
        selectionCount={bulk.selectedIds.size}
        createHref="/invoices-out/new"
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
        rowTestId={(i) => `invoice-out-row-${i.id}`}
        rowActions={(i) => bulk.rowDelete(i.id)}
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
          heading: t('empty_rich_heading'),
          cta: { label: t('create_button'), href: '/invoices-out/new' },
          helper: { label: t('empty_rich_helper'), href: '/demands/new' },
        }}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          setCursor(undefined);
        }}
        editMenu={{ label: tBulkActions('trigger'), items: editMenuItems }}
        createDocMenu={{
          label: tCreate('trigger'),
          items: createDocItems,
          disabled: bulk.selectedIds.size === 0,
          testId: 'invoices-out-create-doc',
        }}
        printMenu={{ label: tPrintMenu('trigger'), items: printMenuItems }}
        {...bulk.listViewProps}
        // bulkActionBar omitted — toolbar dropdowns replace it.
        visibleColumnKeys={cols.visibleKeys}
        headerSlot={
          /* Inline filter panel — moysklad «Счета покупателям» parity
             (~18 fields), ordered to match the invoice-out filter reference
             (01-default.html): Период · Контрагент · Группа контрагента ·
             Договор · Организация · Счёт организации · Проект · Статус ·
             Заказ покупателя · Оплата · Проведено · Напечатано · Отправлено ·
             Канал продаж · Владелец-сотрудник · Владелец-отдел · Сумма ·
             Когда изменен. */
          <InlineFilterPanel
            hidden={!filterOpen}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onApply={() => refetch()}
            onClear={() => {
              setFilterValues({});
              setExtFilter({});
              for (const setter of Object.values(refSetters)) setter([]);
              setCursor(undefined);
            }}
            // 🔖 «Закладки» — live #invoiceout: the bookmark icon opens a save-
            // current-filter prompt; shares its open-state with the pill strip's
            // inline «+» input (sibling pattern, invoices-in).
            onBookmarkClick={() => setSaveFilterOpen(true)}
            // ⚙ «Поля фильтра» — live #invoiceout: the gear opens a checklist of
            // all 24 fields, ALL checked by default (default-hidden = []).
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
                entity="invoiceout"
                currentQueryString={savedFilterQuery}
                onApply={applySavedFilter}
                adding={saveFilterOpen}
                onAddingChange={setSaveFilterOpen}
              />
            }
            testId="invoices-out-inline-filter"
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

            <InlineFilterPanel.Field label={tFilters('payment_status')} expandable={false}>
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

            <InlineFilterPanel.Field label={tFilters('shipped_status')} expandable={false}>
              <NativeSelect
                value={extFilter.shippedStatus ?? ''}
                onChange={(e) => {
                  setExtFilter({
                    ...extFilter,
                    shippedStatus: (e.target.value || undefined) as
                      | 'not_shipped'
                      | 'partial'
                      | 'shipped'
                      | undefined,
                  });
                  setCursor(undefined);
                }}
                data-test-id="filter-shipped-status"
              >
                <option value="" />
                <option value="not_shipped">{tFilters('shipped_unshipped')}</option>
                <option value="partial">{tFilters('shipped_partial')}</option>
                <option value="shipped">{tFilters('shipped_shipped')}</option>
              </NativeSelect>
            </InlineFilterPanel.Field>

            <InlineFilterPanel.Field
              label={tFields('payment_planned')}
              inlineSuffix={
                <PeriodShortcuts
                  onChange={({ from, to }) => {
                    setExtFilter({ ...extFilter, paymentPlannedFrom: from, paymentPlannedTo: to });
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
                from={extFilter.paymentPlannedFrom}
                to={extFilter.paymentPlannedTo}
                onChange={({ from, to }) => {
                  setExtFilter({ ...extFilter, paymentPlannedFrom: from, paymentPlannedTo: to });
                  setCursor(undefined);
                }}
                testId="filter-payment-planned"
              />
            </InlineFilterPanel.Field>

            <InlineFilterPanel.Field label={tFilters('product_or_group')} expandable>
              <MultiRefField
                value={products}
                onChange={(v) => {
                  setProducts(v);
                  setCursor(undefined);
                }}
                onSearch={fetchProducts}
                testId="filter-product"
              />
            </InlineFilterPanel.Field>

            <InlineFilterPanel.Field label={tFilters('store')} expandable>
              <MultiRefField
                value={stores}
                onChange={(v) => {
                  setStores(v);
                  setCursor(undefined);
                }}
                onSearch={fetchStores}
                testId="filter-store"
              />
            </InlineFilterPanel.Field>

            <InlineFilterPanel.Field label={tFilters('project')} expandable>
              <MultiRefField
                value={projects}
                onChange={(v) => {
                  setProjects(v);
                  setCursor(undefined);
                }}
                onSearch={fetchProjects}
                testId="filter-project"
              />
            </InlineFilterPanel.Field>

            <InlineFilterPanel.Field label={tFilters('agent')} expandable>
              <MultiRefField
                value={agents}
                onChange={(v) => {
                  setAgents(v);
                  setCursor(undefined);
                }}
                onSearch={fetchCounterparties}
                testId="filter-agent"
              />
            </InlineFilterPanel.Field>

            <InlineFilterPanel.Field label={tFilters('agent_group')} expandable>
              <MultiRefField
                value={agentGroups}
                onChange={(v) => {
                  setAgentGroups(v);
                  setCursor(undefined);
                }}
                onSearch={fetchGroups}
                testId="filter-agent-group"
              />
            </InlineFilterPanel.Field>

            <InlineFilterPanel.Field label={tFilters('agent_account')} expandable={false}>
              <MultiRefField
                value={agentAccounts}
                onChange={(v) => {
                  setAgentAccounts(v);
                  setCursor(undefined);
                }}
                onSearch={async (q) => {
                  // «Счёт контрагента» — bank accounts of ALL selected counterparties.
                  if (!agents.length) return [];
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
                testId="filter-agent-account"
              />
            </InlineFilterPanel.Field>

            <InlineFilterPanel.Field label={tFilters('contract')} expandable>
              <MultiRefField
                value={contracts}
                onChange={(v) => {
                  setContracts(v);
                  setCursor(undefined);
                }}
                onSearch={fetchContracts}
                testId="filter-contract"
              />
            </InlineFilterPanel.Field>

            <InlineFilterPanel.Field label={tFilters('agent_owner')} expandable>
              <MultiRefField
                value={agentOwners}
                onChange={(v) => {
                  setAgentOwners(v);
                  setCursor(undefined);
                }}
                onSearch={fetchEmployees}
                testId="filter-agent-owner"
              />
            </InlineFilterPanel.Field>

            <InlineFilterPanel.Field label={tFilters('organization')} expandable>
              <MultiRefField
                value={organizations}
                onChange={(v) => {
                  setOrganizations(v);
                  setCursor(undefined);
                }}
                onSearch={fetchOrganizations}
                testId="filter-org"
              />
            </InlineFilterPanel.Field>

            <InlineFilterPanel.Field label={tFilters('organization_account')} expandable={false}>
              <MultiRefField
                value={orgAccounts}
                onChange={(v) => {
                  setOrgAccounts(v);
                  setCursor(undefined);
                }}
                onSearch={async (q) => {
                  // «Счёт организации» — accounts of ALL selected organizations.
                  if (!organizations.length) return [];
                  const lists = await Promise.all(
                    organizations.map((o) => {
                      const p = new URLSearchParams({
                        search: q,
                        limit: '50',
                        organizationId: o.id,
                      });
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
                testId="filter-org-account"
              />
            </InlineFilterPanel.Field>

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
                {['draft', 'posted', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled'].map(
                  (s) => (
                    <option key={s} value={s}>
                      {tStates(s)}
                    </option>
                  ),
                )}
              </NativeSelect>
            </InlineFilterPanel.Field>

            <InlineFilterPanel.Field label={tFilters('applicable')} expandable={false}>
              <YesNoSelect
                value={extFilter.applicable}
                onChange={(v) => {
                  setExtFilter({ ...extFilter, applicable: v });
                  setCursor(undefined);
                }}
                testId="filter-applicable"
              />
            </InlineFilterPanel.Field>

            <InlineFilterPanel.Field label={tFilters('printed')} expandable={false}>
              <YesNoSelect
                value={extFilter.printed}
                onChange={(v) => {
                  setExtFilter({ ...extFilter, printed: v });
                  setCursor(undefined);
                }}
                testId="filter-printed"
              />
            </InlineFilterPanel.Field>

            <InlineFilterPanel.Field label={tFilters('published')} expandable={false}>
              <YesNoSelect
                value={extFilter.published}
                onChange={(v) => {
                  setExtFilter({ ...extFilter, published: v });
                  setCursor(undefined);
                }}
                testId="filter-published"
              />
            </InlineFilterPanel.Field>

            <InlineFilterPanel.Field label={tFilters('sales_channel')} expandable>
              <MultiRefField
                value={salesChannels}
                onChange={(v) => {
                  setSalesChannels(v);
                  setCursor(undefined);
                }}
                onSearch={fetchSalesChannels}
                testId="filter-sales-channel"
              />
            </InlineFilterPanel.Field>

            <InlineFilterPanel.Field label={tFilters('owner_employee')} expandable>
              <MultiRefField
                value={owners}
                onChange={(v) => {
                  setOwners(v);
                  setCursor(undefined);
                }}
                onSearch={fetchEmployees}
                testId="filter-owner"
              />
            </InlineFilterPanel.Field>

            <InlineFilterPanel.Field label={tFilters('owner_group')} expandable>
              <MultiRefField
                value={groups}
                onChange={(v) => {
                  setGroups(v);
                  setCursor(undefined);
                }}
                onSearch={fetchGroups}
                testId="filter-group"
              />
            </InlineFilterPanel.Field>

            <InlineFilterPanel.Field label={tFilters('shared')} expandable={false}>
              <YesNoSelect
                value={extFilter.shared}
                onChange={(v) => {
                  setExtFilter({ ...extFilter, shared: v });
                  setCursor(undefined);
                }}
                testId="filter-shared"
              />
            </InlineFilterPanel.Field>

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

            <InlineFilterPanel.Field label={tFilters('modified_by')} expandable={false}>
              <MultiRefField
                value={modifiedBys}
                onChange={(v) => {
                  setModifiedBys(v);
                  setCursor(undefined);
                }}
                onSearch={fetchEmployees}
                testId="filter-modified-by"
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

      {/* «Печать ▸ Комплект…» — bundle several forms into one PDF for the
          selected invoices (mirror PO-list). */}
      <KitPrintModal
        open={kitPrintOpen}
        onOpenChange={setKitPrintOpen}
        forms={kitForms}
        selectedCount={selectedCount}
        labels={{
          title: tPrintMenu('set'),
          confirm: tPrintMenu('kit_confirm'),
          cancel: tPrintMenu('kit_cancel'),
        }}
        onConfirm={kitPrint}
      />
    </>
  );
}
