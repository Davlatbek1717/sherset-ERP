'use client';

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { DemandBulkActionsDropdown } from '@/components/demands/bulk-actions-dropdown';
import { DemandCreateRelatedDropdown } from '@/components/demands/create-related-dropdown';
import {
  type DemandCustomStatus,
  DemandStatusDropdown,
} from '@/components/demands/demand-status-dropdown';
import { DemandPrintDropdown } from '@/components/demands/print-dropdown';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { useOffsetPager } from '@/hooks/use-offset-pager';
import { api } from '@/lib/api-client';
import { stashBulkEdit } from '@/lib/bulk-edit-nav';
import { filterFromQueryString } from '@/lib/filter-from-query';
import {
  CatalogPicker,
  CatalogPickerField,
  type CsvColumn,
  type DataTableColumn,
  type FilterDrawerValues,
  Icons,
  InlineFilterPanel,
  Input,
  ListView,
  type ListViewFilter,
  MassEditModal,
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
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
  // «Грузополучатель» — optional consignee counterparty (moysklad column).
  consignee: { id: string; name: string } | null;
  // «Статус» — account-defined custom status (State row); null = none set.
  status: { id: string; name: string; color: string | null } | null;
  // moysklad gear columns (available-but-hidden) — see the columns array.
  agentAccount: { id: string; accountNumber: string; bankName: string | null } | null;
  organizationAccount: { id: string; accountNumber: string | null; name: string } | null;
  project: { id: string; name: string } | null;
  contract: { id: string; name: string } | null;
  salesChannel: { id: string; name: string } | null;
  overheadSumMinor: string;
  returnSumMinor: string; // «Сумма возвратов» (computed, BE batch)
  shipmentAddress: string | null;
  shipmentAddressComment: string | null; // «Комментарий к адресу доставки» (BE batch)
  shared: boolean;
  group: { id: string; name: string } | null; // «Владелец-отдел» (BE batch)
  updatedAt: string;
  modifiedByName: string | null; // «Кто изменил» (BE batch, last auditLog actor)
  attributes: Record<string, unknown> | null;
  attributeDisplay: Record<string, string>; // reference-attr → resolved name (BE)
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

type RefMulti = { id: string; label: string };
type ComboItem = { value: string; label: string; sublabel?: string };

/** Account-defined custom field («Дополнительные поля») definition — drives the
 *  dynamic filter fields at the end of the panel (moysklad shows «Уста» here).
 *  Mirrors the AttributeMetadata the demand form loads. */
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
 *  (e.g. «Уста» → Контрагент) filters via an inline typeahead. Mirror CO. */
const ATTR_REF_ENDPOINT: Record<string, string> = {
  Counterparty: '/counterparties',
  Employee: '/employees',
  Product: '/products',
  Organization: '/organizations',
  Project: '/projects',
  Store: '/stores',
  Contract: '/contracts',
};

/**
 * Multi-select inline reference filter field — moysklad checkbox-dropdown
 * (click opens an in-place dropdown with a search box + checkboxes, pick
 * several). Wraps MultiCombobox + the id↔label merge so each field is a
 * one-liner. MUST be module-level: an inline component is a NEW type each
 * render → React remounts it → the dropdown closes on every keystroke.
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

export default function DemandsPage() {
  const t = useTranslations('pages.demands');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tMass = useTranslations('mass_edit_modal');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  // Click-to-sort headers — moysklad-parity. Default mirrors backend default.
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterValues, setFilterValues] = useState<FilterDrawerValues>({});
  const [filterOpen, setFilterOpen] = useState(true);
  // «Количество строк» — rows-per-page, chosen in the column ⚙ (25 / 50 / 100).
  const [pageSize, setPageSize] = useState(LIMIT);
  // moysklad 1:1 pager — offset («page-number») pagination: true previous /
  // first / LAST jumps + absolute "M-N из total" range. (Cursor pagination
  // could only reset «previous» to page 1.) See use-offset-pager.ts.
  const pager = useOffsetPager(pageSize);
  // Legacy shim: the many `setCursor(undefined)` filter-reset calls below mean
  // «return to page 1 after a filter change» → route them to the pager reset.
  const setCursor = (v?: string) => {
    if (v === undefined) pager.reset();
  };
  // «Фильтр» 🔖 save-filter + ⚙ field-visibility (moysklad parity, mirror
  // invoices-out). `saveFilterOpen` shares state with the SavedFiltersPills add
  // mode; `filterHidden.visibleKeys` holds the HIDDEN filter-field keys (default
  // [] → all fields shown, matching the live ⚙ checklist).
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  const filterHidden = useColumnVisibility('demands-filter-hidden', []);
  const [pickerOpen, setPickerOpen] = useState<null | 'massEditOwner' | 'massEditProject'>(null);

  // Multi-select inline filter state — moysklad checkbox-dropdowns (mirror
  // invoices-out). Each holds the picked {id,label} pairs; the request sends the
  // ids as `*Ids` (CSV). Replaces the old single-pick CatalogPicker modals.
  const [agents, setAgents] = useState<RefMulti[]>([]);
  const [consignees, setConsignees] = useState<RefMulti[]>([]);
  const [products, setProducts] = useState<RefMulti[]>([]);
  const [stores, setStores] = useState<RefMulti[]>([]);
  const [owners, setOwners] = useState<RefMulti[]>([]);
  const [projects, setProjects] = useState<RefMulti[]>([]);
  const [contracts, setContracts] = useState<RefMulti[]>([]);
  const [agentGroups, setAgentGroups] = useState<RefMulti[]>([]);
  const [agentOwners, setAgentOwners] = useState<RefMulti[]>([]);
  const [agentAccounts, setAgentAccounts] = useState<RefMulti[]>([]);
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);
  const [orgAccounts, setOrgAccounts] = useState<RefMulti[]>([]);
  const [salesChannels, setSalesChannels] = useState<RefMulti[]>([]);
  const [groups, setGroups] = useState<RefMulti[]>([]);
  const [modifiedBys, setModifiedBys] = useState<RefMulti[]>([]);

  // Account-defined custom fields («Дополнительные поля») → one dynamic filter
  // field each, rendered at the END of the panel (moysklad-parity: climart shows
  // «Уста» there). Same endpoint the demand form uses. Mirror customer-orders.
  const { data: attrMetaData } = useQuery<{ items: AttrMeta[] }>({
    queryKey: ['attribute-metadata', 'Demand'],
    queryFn: () => api.get<{ items: AttrMeta[] }>('/attribute-metadata/entity/Demand'),
    staleTime: 5 * 60 * 1000,
  });
  const attrMetas = (attrMetaData?.items ?? [])
    .filter((a) => !a.archived)
    .sort((a, b) => a.position - b.position);

  // moysklad «Статус» — the account's custom demand statuses (State rows,
  // entityType="demand", archived=false). Drives BOTH the «Статус» column pill
  // (grey «Status» placeholder until set) AND the «Статус ▾» toolbar dropdown +
  // the «Статус» filter — all keyed off the same /states query.
  const { data: statusData } = useQuery<{ items: DemandCustomStatus[] }>({
    queryKey: ['states', 'demand', false],
    queryFn: () =>
      api.get<{ items: DemandCustomStatus[] }>(
        '/states?entityType=demand&archived=false&limit=250',
      ),
    staleTime: 5 * 60 * 1000,
  });
  const demandStatuses = statusData?.items ?? [];
  const [attrFilters, setAttrFilters] = useState<Record<string, AttrFilterValue>>({});
  const setAttr = (code: string, patch: AttrFilterValue) => {
    setAttrFilters((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));
    setCursor(undefined);
  };

  const router = useRouter();

  const [massEditOpen, setMassEditOpen] = useState(false);
  const [massEditIds, setMassEditIds] = useState<string[]>([]);
  const [massEditOwner, setMassEditOwner] = useState<{ id: string; label: string } | null>(null);
  const [massEditProject, setMassEditProject] = useState<{ id: string; label: string } | null>(
    null,
  );
  // «Владелец-отдел» (groupId) options for the mass-edit wizard — mirrors losses.
  const { data: massGroupsData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['groups', 'mass-edit'],
    queryFn: () => api.get('/groups?limit=100'),
    enabled: massEditOpen,
    staleTime: 5 * 60 * 1000,
  });

  // Non-reference filter state (selects / bools / date ranges / text). The
  // reference fields (agent, organization, product, …) moved to the RefMulti[]
  // arrays above as moysklad inline checkbox-dropdowns.
  const [extFilter, setExtFilter] = useState<{
    paymentStatus?: 'unpaid' | 'partial' | 'paid';
    // «Тип возврата» — return progress (none/partial/full) vs linked sales-returns.
    returnStatus?: 'none' | 'partial' | 'full';
    // «Статус» — account-defined custom status id (State row, entityType="demand").
    statusId?: string;
    // tri-state flag filters ('true' | 'false')
    applicable?: 'true' | 'false';
    printed?: 'true' | 'false';
    published?: 'true' | 'false';
    // «Общий доступ» — shared flag.
    shared?: 'true' | 'false';
    // «Адрес доставки» — shipmentAddress contains-match.
    shipmentAddress?: string;
    // «Комментарий к адресу доставки» — shipmentAddressFull.comment contains-match.
    shipmentAddressComment?: string;
    // «Когда изменен» period
    updatedFrom?: string;
    updatedTo?: string;
  }>({});

  const paramsRecord: Record<string, string> = {
    limit: String(pageSize),
    sortBy: sortKey,
    sortDir,
  };
  if (search) paramsRecord.search = search;
  paramsRecord.page = String(pager.page);
  if (filterValues.momentFrom) paramsRecord.momentFrom = filterValues.momentFrom;
  if (filterValues.momentTo) paramsRecord.momentTo = filterValues.momentTo;
  if (extFilter.paymentStatus) paramsRecord.paymentStatus = extFilter.paymentStatus;
  if (extFilter.returnStatus) paramsRecord.returnStatus = extFilter.returnStatus;
  if (extFilter.statusId) paramsRecord.statusIds = extFilter.statusId;
  if (extFilter.applicable) paramsRecord.applicable = extFilter.applicable;
  if (extFilter.printed) paramsRecord.printed = extFilter.printed;
  if (extFilter.published) paramsRecord.published = extFilter.published;
  if (extFilter.shared) paramsRecord.shared = extFilter.shared;
  if (extFilter.shipmentAddress) paramsRecord.shipmentAddress = extFilter.shipmentAddress;
  if (extFilter.shipmentAddressComment)
    paramsRecord.shipmentAddressComment = extFilter.shipmentAddressComment;
  if (extFilter.updatedFrom) paramsRecord.updatedFrom = extFilter.updatedFrom;
  if (extFilter.updatedTo) paramsRecord.updatedTo = extFilter.updatedTo;
  // Multi-select reference fields → CSV `*Ids` (moysklad inline checkbox-dropdowns).
  const csvIds = (a: RefMulti[]) => a.map((x) => x.id).join(',');
  if (agents.length) paramsRecord.agentIds = csvIds(agents);
  if (consignees.length) paramsRecord.consigneeIds = csvIds(consignees);
  if (products.length) paramsRecord.productIds = csvIds(products);
  if (stores.length) paramsRecord.storeIds = csvIds(stores);
  if (owners.length) paramsRecord.ownerIds = csvIds(owners);
  if (projects.length) paramsRecord.projectIds = csvIds(projects);
  if (contracts.length) paramsRecord.contractIds = csvIds(contracts);
  if (agentGroups.length) paramsRecord.agentGroupIds = csvIds(agentGroups);
  if (agentOwners.length) paramsRecord.agentOwnerIds = csvIds(agentOwners);
  if (agentAccounts.length) paramsRecord.agentAccountIds = csvIds(agentAccounts);
  if (organizations.length) paramsRecord.organizationIds = csvIds(organizations);
  if (orgAccounts.length) paramsRecord.organizationAccountIds = csvIds(orgAccounts);
  if (salesChannels.length) paramsRecord.salesChannelIds = csvIds(salesChannels);
  if (groups.length) paramsRecord.groupIds = csvIds(groups);
  if (modifiedBys.length) paramsRecord.modifiedByIds = csvIds(modifiedBys);
  // Custom-attribute («Дополнительные поля») filters → JSON-encoded `attrs` array
  // of {code, value?|from?/to?} clauses (date attrs send from/to). Mirror CO.
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

  // Saved-filter round-trip — serialise the filter-state objects AND the
  // multi-select reference arrays as JSON so a re-applied bookmark restores every
  // field INCLUDING reference labels (a params-only encoding drops labels → chips
  // show raw UUIDs). Empty when nothing is set, which disables the «+» save pill.
  const refArrays: Record<string, RefMulti[]> = {
    agents,
    consignees,
    products,
    stores,
    owners,
    projects,
    contracts,
    agentGroups,
    agentOwners,
    agentAccounts,
    organizations,
    orgAccounts,
    salesChannels,
    groups,
    modifiedBys,
  };
  const refSetters: Record<string, (v: RefMulti[]) => void> = {
    agents: setAgents,
    consignees: setConsignees,
    products: setProducts,
    stores: setStores,
    owners: setOwners,
    projects: setProjects,
    contracts: setContracts,
    agentGroups: setAgentGroups,
    agentOwners: setAgentOwners,
    agentAccounts: setAgentAccounts,
    organizations: setOrganizations,
    orgAccounts: setOrgAccounts,
    salesChannels: setSalesChannels,
    groups: setGroups,
    modifiedBys: setModifiedBys,
  };
  const savedFilterQuery = (() => {
    const hasRefs = Object.values(refArrays).some((a) => a.length > 0);
    const hasAttrs = Object.keys(attrFilters).length > 0;
    const hasAny =
      hasRefs ||
      hasAttrs ||
      Object.values(filterValues).some((v) => v != null && v !== '') ||
      Object.values(extFilter).some((v) => v != null && v !== '');
    if (!hasAny) return '';
    const sp = new URLSearchParams();
    sp.set('fv', JSON.stringify(filterValues));
    sp.set('ef', JSON.stringify(extFilter));
    sp.set('refs', JSON.stringify(refArrays));
    sp.set('af', JSON.stringify(attrFilters));
    return sp.toString();
  })();

  const applySavedFilter = (qs: string) => {
    const sp = qs.startsWith('?') ? new URLSearchParams(qs.slice(1)) : new URLSearchParams(qs);
    const fvRaw = sp.get('fv');
    if (fvRaw) {
      try {
        setFilterValues(JSON.parse(fvRaw) as typeof filterValues);
      } catch {
        setFilterValues(filterFromQueryString(qs));
      }
    } else {
      setFilterValues(filterFromQueryString(qs));
    }
    const efRaw = sp.get('ef');
    try {
      setExtFilter(efRaw ? (JSON.parse(efRaw) as typeof extFilter) : {});
    } catch {
      setExtFilter({});
    }
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
    // Restore custom-attribute («Дополнительные поля») filters.
    const afRaw = sp.get('af');
    try {
      setAttrFilters(afRaw ? (JSON.parse(afRaw) as Record<string, AttrFilterValue>) : {});
    } catch {
      setAttrFilters({});
    }
    setCursor(undefined);
  };

  // moysklad list footer «Итого» — totals across the WHOLE filtered set (not just
  // the visible page); same filter params minus pagination/sort. Mirror invoices-out.
  const totalsParams = new URLSearchParams(params);
  for (const k of ['page', 'cursor', 'limit', 'sortBy', 'sortDir']) totalsParams.delete(k);
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
  // «Не оплачено» footer = Σ(Сумма) − Σ(Оплачено) (clamp ≥ 0). Keys match the
  // sum/payedSum/unpaid column keys; footerMoneyCells shows «—» when the
  // filtered set mixes currencies.
  const totalsUnpaid = (() => {
    if (!totals) return '0';
    const d = BigInt(totals.sumMinor) - BigInt(totals.payedSumMinor);
    return (d > 0n ? d : 0n).toString();
  })();
  const footerRow = footerMoneyCells(totals, {
    sum: totals?.sumMinor ?? '0',
    payedSum: totals?.payedSumMinor ?? '0',
    unpaid: totalsUnpaid,
  });

  const listQueryKey = [
    'demands',
    search,
    pager.page,
    sortKey,
    sortDir,
    params.toString(),
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
  const postedCount = (() => {
    if (!data?.items?.length) return 0;
    let n = 0;
    for (const d of data.items) {
      if (bulk.selectedIds.has(d.id) && d.state === 'posted') n++;
    }
    return n;
  })();

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

  // moysklad parity (LIVE #demand, 2026-06-26): /demand default columns are
  // № · Время · Со склада · Контрагент · Грузополучатель · Организация ·
  // Сумма · Валюта · Оплачено · Не оплачено · Статус · Отправлено ·
  // Напечатано · Комментарий. (customer_order + positions stay available via
  // the ⚙ but hidden by default — moysklad hides them too.)
  const cols = useColumnVisibility('demands', [
    'name',
    'moment',
    'store',
    'agent',
    'consignee',
    'organization',
    'sum',
    'currency',
    'payedSum',
    'unpaid',
    'state',
    'published',
    'printed',
    'description',
  ]);

  // moysklad parity: column-width persistence per user (Tour 5 D7).
  const colWidths = useColumnWidths('demands');

  // moysklad has no toolbar status-tabs on the shipment list.
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
      // Контрагент on /demand (goods ship FROM a store).
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
            <div className="max-w-[300px] truncate text-[var(--ms-text-muted)] text-[11px]">
              {d.agent.legalTitle}
            </div>
          )}
        </div>
      ),
      cellText: (r: DemandRow) =>
        r.agent?.legalTitle ? `${r.agent.name} (${r.agent.legalTitle})` : (r.agent?.name ?? ''),
    },
    // moysklad gear: «Счёт контрагента» (hidden by default).
    {
      key: 'agentAccount',
      header: tFields('agent_account'),
      width: '160px',
      cell: (d) => (
        <span className="max-w-[160px] truncate text-sm">
          {d.agentAccount?.accountNumber ?? ''}
        </span>
      ),
      cellText: (r: DemandRow) => r.agentAccount?.accountNumber ?? '',
    },
    {
      // moysklad parity: «Грузополучатель» (consignee) column — col 5 on
      // /demand. Empty when no separate consignee is set (most shipments).
      key: 'consignee',
      header: tFields('consignee'),
      width: '180px',
      // «Грузополучатель» — relation like «Контрагент», which is sortable;
      // this column offered no sort at all (prod QA 2026-07-31).
      sortable: true,
      cell: (d) => (
        <span className="max-w-[180px] truncate text-sm">{d.consignee?.name ?? ''}</span>
      ),
      cellText: (r: DemandRow) => r.consignee?.name ?? '',
    },
    {
      // moysklad parity: «Организация» column on /demand.
      key: 'organization',
      header: tFields('organization'),
      width: '180px',
      sortable: true,
      cell: (d) => (
        <span className="max-w-[180px] truncate text-sm">{d.organization?.name ?? '—'}</span>
      ),
      cellText: (r: DemandRow) => r.organization?.name ?? '',
    },
    // moysklad gear: «Счёт организации» (hidden by default).
    {
      key: 'organizationAccount',
      header: tFields('organization_account'),
      width: '160px',
      cell: (d) => (
        <span className="max-w-[160px] truncate text-sm">
          {d.organizationAccount?.accountNumber ?? d.organizationAccount?.name ?? ''}
        </span>
      ),
      cellText: (r: DemandRow) =>
        r.organizationAccount?.accountNumber ?? r.organizationAccount?.name ?? '',
    },
    {
      key: 'sum',
      sortField: 'sumMinor',
      header: tFields('sum'),
      align: 'right',
      width: '160px',
      sortable: true,
      cell: (d) => (
        <span className="font-medium tabular-nums">
          {formatMoney(d.sumMinor, d.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: DemandRow) => (r.sumMinor ? formatMoney(r.sumMinor, r.currency) : ''),
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
      width: '150px',
      sortable: true,
      cell: (d) => (
        <span className="font-medium tabular-nums">
          {formatMoney(d.payedSumMinor, d.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: DemandRow) => formatMoney(r.payedSumMinor, r.currency),
    },
    // moysklad gear: «Проект» (hidden by default).
    {
      key: 'project',
      header: tFields('project'),
      width: '160px',
      cell: (d) => <span className="max-w-[160px] truncate text-sm">{d.project?.name ?? ''}</span>,
      cellText: (r: DemandRow) => r.project?.name ?? '',
    },
    // moysklad gear: «Договор» (hidden by default).
    {
      key: 'contract',
      header: tFields('contract'),
      width: '160px',
      cell: (d) => <span className="max-w-[160px] truncate text-sm">{d.contract?.name ?? ''}</span>,
      cellText: (r: DemandRow) => r.contract?.name ?? '',
    },
    // moysklad gear: «Накладные расходы» (overhead, document currency).
    {
      key: 'overhead',
      header: tFields('overhead_sum'),
      align: 'right',
      width: '150px',
      cell: (d) => (
        <span className="font-medium tabular-nums">
          {formatMoney(d.overheadSumMinor, d.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: DemandRow) => formatMoney(r.overheadSumMinor, r.currency),
    },
    // moysklad gear: «Сумма возвратов» — Σ active SalesReturn linked to this demand.
    {
      key: 'returnSum',
      header: tFields('return_sum'),
      align: 'right',
      width: '150px',
      cell: (d) => (
        <span className="font-medium tabular-nums">
          {formatMoney(d.returnSumMinor, d.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: DemandRow) => formatMoney(r.returnSumMinor, r.currency),
    },
    // moysklad gear: «Канал продаж» (hidden by default).
    {
      key: 'salesChannel',
      header: tFields('sales_channel'),
      width: '160px',
      cell: (d) => (
        <span className="max-w-[160px] truncate text-sm">{d.salesChannel?.name ?? ''}</span>
      ),
      cellText: (r: DemandRow) => r.salesChannel?.name ?? '',
    },
    // moysklad gear: «Адрес доставки».
    {
      key: 'shipmentAddress',
      header: tFields('delivery_address'),
      width: '200px',
      cell: (d) => (
        <span className="block max-w-[200px] truncate text-[var(--ms-text-muted)] text-[11px]">
          {d.shipmentAddress ?? ''}
        </span>
      ),
      cellText: (r: DemandRow) => r.shipmentAddress ?? '',
    },
    // moysklad gear: «Комментарий к адресу доставки» (shipmentAddressFull.comment).
    {
      key: 'shipmentAddressComment',
      header: tFields('delivery_address_comment'),
      width: '200px',
      cell: (d) => (
        <span className="block max-w-[200px] truncate text-[var(--ms-text-muted)] text-[11px]">
          {d.shipmentAddressComment ?? ''}
        </span>
      ),
      cellText: (r: DemandRow) => r.shipmentAddressComment ?? '',
    },
    // moysklad gear: «Общий доступ» — green ✓ when shared, blank otherwise (grounded).
    {
      key: 'shared',
      header: tFields('shared'),
      align: 'center',
      width: '110px',
      cell: (d) =>
        d.shared ? (
          <Icons.check
            className="mx-auto h-4 w-4 text-[var(--ms-text-success)]"
            aria-label={tCommon('yes')}
          />
        ) : (
          ''
        ),
      cellText: (r: DemandRow) => (r.shared ? tCommon('yes') : ''),
    },
    // moysklad gear: «Владелец-отдел» (group name — BE-resolved).
    {
      key: 'group',
      header: tFields('owner_group'),
      width: '160px',
      cell: (d) => <span className="max-w-[160px] truncate text-sm">{d.group?.name ?? ''}</span>,
      cellText: (r: DemandRow) => r.group?.name ?? '',
    },
    // moysklad gear: «Владелец-сотрудник» (owner employee).
    {
      key: 'owner',
      header: tFields('owner_employee'),
      width: '160px',
      cell: (d) => <span className="max-w-[160px] truncate text-sm">{d.owner?.name ?? ''}</span>,
      cellText: (r: DemandRow) => r.owner?.name ?? '',
    },
    // moysklad parity: «Отправлено» renders a cyan (#00bfe6) filled pill «Отправлен»
    // when sent, and an EMPTY cell otherwise (NOT «Да»/«—»). Colour + word-pill
    // live-grounded on online.moysklad.ru #demand (rgb(0,191,230)); mirror CO list.
    {
      key: 'published',
      header: tFields('published'),
      width: '120px',
      cell: (d) =>
        d.published ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] bg-[#00bfe6] px-2 py-0.5 font-medium text-white text-xs"
            data-test-id="published-badge"
          >
            {tFields('published_badge')}
          </span>
        ) : null,
      cellText: (r: DemandRow) => (r.published ? tFields('published_badge') : ''),
    },
    {
      key: 'printed',
      header: tFields('printed'),
      width: '120px',
      cell: (d) =>
        d.printed ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] bg-[#00bfe6] px-2 py-0.5 font-medium text-white text-xs"
            data-test-id="printed-badge"
          >
            {tFields('printed_badge')}
          </span>
        ) : null,
      cellText: (r: DemandRow) => (r.printed ? tFields('printed_badge') : ''),
    },
    // moysklad parity: «Комментарий».
    {
      key: 'description',
      header: tFields('description'),
      width: '220px',
      cell: (d) => (
        <span className="block max-w-[220px] truncate text-[var(--ms-text-muted)] text-[11px]">
          {d.description ?? ''}
        </span>
      ),
      cellText: (r: DemandRow) => r.description ?? '',
    },
    // Bizning QO`SHIMCHA ustunlarimiz — moysklad capture`ida yo`q. Ular
    // moysklad ketma-ketligidan KEYIN turadi: aks holda yonma-yon
    // solishtirganda ustun tartibi mos kelmaydi (2026-07-31 prod QA).
    // moysklad parity: «Не оплачено» = Сумма − Оплачено (clamp ≥ 0).
    {
      key: 'unpaid',
      header: tFields('unpaid'),
      align: 'right',
      width: '150px',
      cell: (d) => {
        const diff = BigInt(d.sumMinor) - BigInt(d.payedSumMinor);
        const unpaid = (diff > 0n ? diff : 0n).toString();
        return (
          <span className="font-medium tabular-nums">
            {formatMoney(unpaid, d.currency, { displayAs: 'none' })}
          </span>
        );
      },
      cellText: (r: DemandRow) => {
        const diff = BigInt(r.sumMinor) - BigInt(r.payedSumMinor);
        return formatMoney((diff > 0n ? diff : 0n).toString(), r.currency);
      },
    },
    // moysklad parity: «Статус» column = the account-defined CUSTOM status
    // (coloured pill), NOT the FSM state. A grey «Status» placeholder shows until
    // a status is assigned (live-grounded #demand: every row shows «Status»).
    // Posting state lives in the «Проведено» filter, not this column.
    {
      key: 'state',
      header: tFields('state'),
      width: '150px',
      cell: (d) =>
        d.status ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] px-2 py-0.5 font-medium text-white text-xs"
            style={{ backgroundColor: d.status.color ?? 'var(--ms-text-muted)' }}
            data-test-id="demand-status-pill"
          >
            {d.status.name}
          </span>
        ) : (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] bg-[var(--ms-bg-muted)] px-2 py-0.5 text-[var(--ms-text-muted)] text-xs"
            data-test-id="demand-status-placeholder"
          >
            {tFields('custom_status_placeholder')}
          </span>
        ),
      cellText: (r: DemandRow) => r.status?.name ?? '',
    },
    // moysklad gear: «Когда изменен» (updatedAt). moysklad labels this column
    // «Когда изменен» (not «Обновлено») — reuse the filter's matching string.
    {
      key: 'updatedAt',
      header: tFilters('updated_period'),
      width: '140px',
      cell: (d) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(d.updatedAt)}</span>
      ),
      cellText: (r: DemandRow) => formatDate(r.updatedAt),
    },
    // moysklad gear: «Кто изменил» (last auditLog actor — BE-resolved).
    {
      key: 'modifiedBy',
      header: tFields('modified_by'),
      width: '160px',
      cell: (d) => <span className="max-w-[160px] truncate text-sm">{d.modifiedByName ?? ''}</span>,
      cellText: (r: DemandRow) => r.modifiedByName ?? '',
    },
    // moysklad gear: account custom «Дополнительные поля» columns (e.g. «Уста»),
    // one per active attribute. Reference attrs resolve to the referenced entity
    // name (BE attributeDisplay); other types render the raw stored value. Driven
    // by the same attribute metadata as the dynamic filter fields (NOT hardcoded).
    ...attrMetas.map(
      (attr): DataTableColumn<DemandRow> => ({
        key: `attr_${attr.code}`,
        header: attr.name,
        width: '160px',
        cell: (d) => {
          const display = d.attributeDisplay?.[attr.code];
          const raw = d.attributes?.[attr.code];
          const text = display ?? (raw == null ? '' : String(raw));
          return <span className="max-w-[160px] truncate text-sm">{text}</span>;
        },
        cellText: (r: DemandRow) => {
          const display = r.attributeDisplay?.[attr.code];
          const raw = r.attributes?.[attr.code];
          return display ?? (raw == null ? '' : String(raw));
        },
      }),
    ),
  ];

  const hasFilter =
    !!search ||
    Object.values(refArrays).some((a) => a.length > 0) ||
    Object.keys(attrFilters).length > 0 ||
    Object.values(filterValues).some((v) => v != null && v !== '') ||
    Object.values(extFilter).some((v) => v != null && v !== '');

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
        limit={pageSize}
        {...pager.props(data?.total)}
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
          /* Inline filter panel — moysklad «Отгрузки» parity (LIVE-grounded
             2026-06-26, 6-col grid), ordered to match the live filter:
             Период · Грузополучатель · Оплата · Товар или группа · Склад ·
             Проект · Контрагент · Группа контрагента · Счёт контрагента ·
             Договор · Владелец контрагента · Организация · Счёт организации ·
             Статус · Проведено · Напечатано · Отправлено · Канал продаж ·
             Адрес доставки · Владелец-сотрудник · Владелец-отдел ·
             Общий доступ · Когда изменен · Кто изменил.
             (Account-custom fields «Тип возврата»/«Уста…» + «Комментарий к
             адресу доставки» [no backing column] are NOT replicated.) */
          <InlineFilterPanel
            hidden={!filterOpen}
            columns={6}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onApply={() => refetch()}
            onClear={() => {
              setFilterValues({});
              setExtFilter({});
              for (const setter of Object.values(refSetters)) setter([]);
              setAttrFilters({});
              setCursor(undefined);
            }}
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
                entity="demand"
                currentQueryString={savedFilterQuery}
                onApply={applySavedFilter}
                adding={saveFilterOpen}
                onAddingChange={setSaveFilterOpen}
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
            {/* 2. Грузополучатель */}
            <InlineFilterPanel.Field label={tFields('consignee')} expandable>
              <MultiRefField
                value={consignees}
                onChange={(v) => {
                  setConsignees(v);
                  setCursor(undefined);
                }}
                onSearch={fetchCounterparties}
                testId="filter-consignee"
              />
            </InlineFilterPanel.Field>
            {/* 3. Оплата */}
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
            {/* 4. Товар или группа */}
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
            {/* 5. Тип возврата — return progress (none/partial/full) vs linked sales-returns.
                Option order + labels grounded LIVE from moysklad #demand. */}
            <InlineFilterPanel.Field
              fieldKey="return_type"
              label={tFilters('return_type')}
              expandable={false}
            >
              <NativeSelect
                value={extFilter.returnStatus ?? ''}
                onChange={(e) => {
                  setExtFilter({
                    ...extFilter,
                    returnStatus: (e.target.value || undefined) as
                      | 'none'
                      | 'partial'
                      | 'full'
                      | undefined,
                  });
                  setCursor(undefined);
                }}
                data-test-id="filter-return-type"
              >
                <option value="" />
                <option value="partial">{tFilters('return_partial')}</option>
                <option value="none">{tFilters('return_none')}</option>
                <option value="full">{tFilters('return_full')}</option>
              </NativeSelect>
            </InlineFilterPanel.Field>
            {/* 6. Склад */}
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
            {/* 6. Проект */}
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
            {/* 7. Контрагент */}
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
            {/* 8. Группа контрагента */}
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
            {/* 9. Счёт контрагента — accounts of ALL selected counterparties. */}
            <InlineFilterPanel.Field label={tFilters('agent_account')} expandable={false}>
              <MultiRefField
                value={agentAccounts}
                onChange={(v) => {
                  setAgentAccounts(v);
                  setCursor(undefined);
                }}
                onSearch={async (q) => {
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
            {/* 10. Договор */}
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
            {/* 11. Владелец контрагента */}
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
            {/* 12. Организация */}
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
            {/* 13. Счёт организации — accounts of ALL selected organizations. */}
            <InlineFilterPanel.Field label={tFilters('organization_account')} expandable={false}>
              <MultiRefField
                value={orgAccounts}
                onChange={(v) => {
                  setOrgAccounts(v);
                  setCursor(undefined);
                }}
                onSearch={async (q) => {
                  if (!organizations.length) return [];
                  const lists = await Promise.all(
                    organizations.map((o) => {
                      const sp = new URLSearchParams({
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
                        }>(`/organization-accounts?${sp.toString()}`)
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
            {/* 14. Статус — account-defined custom status (State rows,
                entityType="demand"). moysklad's «Статус» filter lists the account's
                custom statuses; it's empty until any are configured in
                Настройки → Статусы отгрузок (then column + dropdown light up too). */}
            <InlineFilterPanel.Field label={tFilters('state')} expandable>
              <NativeSelect
                value={extFilter.statusId ?? ''}
                onChange={(e) => {
                  setExtFilter({ ...extFilter, statusId: e.target.value || undefined });
                  setCursor(undefined);
                }}
                data-test-id="filter-status"
              >
                <option value="" />
                {demandStatuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </InlineFilterPanel.Field>
            {/* 15. Проведено */}
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
            {/* 16. Напечатано */}
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
            {/* 17. Отправлено */}
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
            {/* 18. Канал продаж */}
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
            {/* 19. Адрес доставки — shipmentAddress contains-match. */}
            <InlineFilterPanel.Field label={tFields('delivery_address')} expandable={false}>
              <Input
                value={extFilter.shipmentAddress ?? ''}
                onChange={(e) => {
                  setExtFilter({ ...extFilter, shipmentAddress: e.target.value || undefined });
                  setCursor(undefined);
                }}
                data-test-id="filter-delivery-address"
              />
            </InlineFilterPanel.Field>
            {/* 20. Комментарий к адресу доставки — shipmentAddressFull.comment contains. */}
            <InlineFilterPanel.Field label={tFields('delivery_address_comment')} expandable={false}>
              <Input
                value={extFilter.shipmentAddressComment ?? ''}
                onChange={(e) => {
                  setExtFilter({
                    ...extFilter,
                    shipmentAddressComment: e.target.value || undefined,
                  });
                  setCursor(undefined);
                }}
                data-test-id="filter-delivery-address-comment"
              />
            </InlineFilterPanel.Field>
            {/* 21. Владелец-сотрудник */}
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
            {/* 22. Владелец-отдел */}
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
            {/* 23. Общий доступ */}
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
            {/* 24. Когда изменен — updatedAt range. */}
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
            {/* 25. Кто изменил — auditLog userId → entityIds. */}
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
            {/* 26+. Custom «Дополнительные поля» — one dynamic field per active Demand
                attribute (moysklad shows «Уста» here, at the END). Type-aware controls:
                reference → inline typeahead; date → from–to; enum → select; boolean →
                ✓/—; else a contains text box. Source = Настройки → Доп. поля (Demand). */}
            {attrMetas.map((attr) => {
              const fieldKey = `attr_${attr.code}`;
              const fv = attrFilters[attr.code] ?? {};
              if (attr.type === 'date') {
                return (
                  <InlineFilterPanel.Field
                    key={attr.code}
                    fieldKey={fieldKey}
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
              // string / text / link / long / double / unsupported reference → contains box.
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
          // moysklad parity: toolbar carries the dropdowns; gear for column
          // visibility lives on the table header via headerEndSlot.
          <>
            <DemandBulkActionsDropdown
              selectedIds={bulk.selectedIds}
              listQueryKey={listQueryKey}
              onClearSelection={bulk.clearSelection}
              postedCount={postedCount}
              onMassEdit={() => {
                stashBulkEdit({
                  entity: 'demands',
                  ids:
                    bulk.selectedIds.size > 0
                      ? Array.from(bulk.selectedIds)
                      : (data?.items ?? []).map((r) => r.id),
                  from: '/demands',
                });
                router.push('/bulk-edit');
              }}
            />
            <DemandStatusDropdown
              selectedIds={bulk.selectedIds}
              listQueryKey={listQueryKey}
              onClearSelection={bulk.clearSelection}
              customStatuses={demandStatuses}
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
            rowsPerPage={pageSize}
            onRowsPerPageChange={(n) => {
              setPageSize(n);
              setCursor(undefined);
            }}
          />
        }
        columnWidths={colWidths.values}
        onColumnResize={colWidths.set}
      />

      {/* Mass-edit pickers (Владелец / Проект) — opened from the MassEditModal. */}
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
