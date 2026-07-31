'use client';

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { SupplyBulkActionsDropdown } from '@/components/supplies/bulk-actions-dropdown';
import { SupplyCreateDocDropdown } from '@/components/supplies/create-doc-dropdown';
import { SupplyPrintDropdown } from '@/components/supplies/print-dropdown';
import {
  type SupplyCustomStatus,
  SupplyStatusDropdown,
} from '@/components/supplies/supply-status-dropdown';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { stashBulkEdit } from '@/lib/bulk-edit-nav';
import { filterFromQueryString } from '@/lib/filter-from-query';
import {
  CatalogPicker,
  type CsvColumn,
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
  buildCsv,
  csvTimestamp,
  downloadCsv,
  formatDate,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

interface SupplyRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  // moysklad parity (v2.2 audit): backend Prisma scalars surfaced.
  payedSumMinor: string;
  currency: string;
  printed: boolean;
  published: boolean;
  description: string | null;
  incomingDate: string | null;
  moment: string;
  incomingNumber: string | null;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string };
  store: { id: string; name: string };
  owner: { id: string; name: string } | null;
  // moysklad «Статус» column = account-defined CUSTOM workflow status (coloured
  // pill), NOT the FSM `state`. The list() service already includes it.
  status: { id: string; name: string; color: string | null } | null;
  _count: { positions: number };
}

interface ListResponse {
  items: SupplyRow[];
  nextCursor?: string;
  total: number;
}

// Moysklad parity — 100 rows per page.
const LIMIT = 100;

type RefMulti = { id: string; label: string };
type ComboItem = { value: string; label: string; sublabel?: string };

/**
 * Multi-select inline reference filter field — moysklad checkbox-dropdown
 * (click opens an in-place dropdown with a search box + checkboxes, pick
 * several). Wraps MultiCombobox + the id↔label merge so each field is a
 * one-liner. MUST be module-level: an inline component is a NEW type each
 * render → React remounts it → the dropdown closes on every keystroke.
 * Mirror demand's MultiRefField.
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
// Mirror demand.
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
const fetchProducts = async (q: string): Promise<ComboItem[]> => {
  const r = await api.get<{ items: { id: string; name: string; code?: string | null }[] }>(
    `/products?search=${encodeURIComponent(q)}&limit=20`,
  );
  return r.items.map((x) => ({ value: x.id, label: x.name, sublabel: x.code ?? undefined }));
};

/** Tri-state Yes/No/All select for boolean filter fields — mirrors the
 *  purchase-orders gold-standard control (✓ / — / unset). */
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

/** «Статус» single-select — Supply's FSM has exactly 3 states
 *  (draft / posted / cancelled); moysklad surfaces it as a plain dropdown
 *  (no multi-tag picker, unlike purchase-orders' 7-state set). */
function StateSelect({
  value,
  onChange,
  labels,
  testId,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  labels: Record<string, string>;
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
          {labels[s] ?? s}
        </option>
      ))}
    </NativeSelect>
  );
}

/**
 * Supply-specific NON-reference filter fields (selects / bools / date ranges /
 * text) stored alongside the shared FilterDrawerValues shape (which still backs
 * the Период momentFrom/To). The reference fields (agent, organization, store,
 * product, …) moved to the RefMulti[] arrays inside the component as moysklad
 * inline checkbox-dropdowns (mirror demand). Local to this page (the shared
 * `useMoyskladDocFilter` hook is intentionally NOT used here).
 */
type ExtraFilterFields = {
  applicable?: 'true' | 'false';
  printed?: 'true' | 'false';
  published?: 'true' | 'false';
  // «Общий доступ» — Supply.shared. moysklad #supply filter field.
  shared?: 'true' | 'false';
  // «Входящий номер» — Supply.incomingNumber (contains). moysklad dedicated field.
  incomingNumber?: string;
  // «Входящая дата» — Supply.incomingDate range. moysklad #supply filter field.
  incomingDateFrom?: string;
  incomingDateTo?: string;
  // «Когда изменен» — updatedAt range.
  updatedFrom?: string;
  updatedTo?: string;
  // «Оплата» — payment progress (moysklad #supply «Оплата» select).
  paymentStatus?: 'unpaid' | 'partial' | 'paid';
  // «Тип возврата» — return progress (none/partial/full) vs linked purchase-returns.
  returnStatus?: 'none' | 'partial' | 'full';
};

export default function SuppliesPage() {
  const t = useTranslations('pages.supplies');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tMass = useTranslations('mass_edit_modal');
  const tStates = useTranslations('states.supply');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [filterValues, setFilterValues] = useState<FilterDrawerValues & ExtraFilterFields>({});
  const [filterOpen, setFilterOpen] = useState(true);
  // 🔖 «Сохранить фильтр» open-state (SavedFiltersPills «+») + ⚙ filter-field
  // visibility — mirror the counterparties list so the bookmark + gear toolbar
  // buttons work (they were disabled: no onBookmarkClick / fieldVisibility were
  // passed to InlineFilterPanel). Distinct key from the column-gear `cols`.
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  const filterHidden = useColumnVisibility('supplies-filter-hidden', []);
  // Only the mass-edit pickers still use a modal CatalogPicker; the filter's
  // reference fields are now inline checkbox-dropdowns (MultiRefField).
  const [pickerOpen, setPickerOpen] = useState<null | 'massEditOwner' | 'massEditProject'>(null);

  // Multi-select inline filter state — moysklad checkbox-dropdowns (mirror
  // demand). Each holds the picked {id,label} pairs; the request sends the ids
  // as `*Ids` (CSV). Replaces the old single-pick CatalogPicker modals.
  const [agents, setAgents] = useState<RefMulti[]>([]);
  const [stores, setStores] = useState<RefMulti[]>([]);
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);
  const [projects, setProjects] = useState<RefMulti[]>([]);
  const [contracts, setContracts] = useState<RefMulti[]>([]);
  const [agentGroups, setAgentGroups] = useState<RefMulti[]>([]);
  const [agentOwners, setAgentOwners] = useState<RefMulti[]>([]);
  const [agentAccounts, setAgentAccounts] = useState<RefMulti[]>([]);
  const [orgAccounts, setOrgAccounts] = useState<RefMulti[]>([]);
  const [owners, setOwners] = useState<RefMulti[]>([]);
  const [groups, setGroups] = useState<RefMulti[]>([]);
  const [products, setProducts] = useState<RefMulti[]>([]);
  const [modifiedBys, setModifiedBys] = useState<RefMulti[]>([]);

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

  // Multi-select reference fields → registry (params CSV build + clear + saved-
  // filter round-trip). Mirror demand.
  const refArrays: Record<string, RefMulti[]> = {
    agents,
    stores,
    organizations,
    projects,
    contracts,
    agentGroups,
    agentOwners,
    agentAccounts,
    orgAccounts,
    owners,
    groups,
    products,
    modifiedBys,
  };
  const refSetters: Record<string, (v: RefMulti[]) => void> = {
    agents: setAgents,
    stores: setStores,
    organizations: setOrganizations,
    projects: setProjects,
    contracts: setContracts,
    agentGroups: setAgentGroups,
    agentOwners: setAgentOwners,
    agentAccounts: setAgentAccounts,
    orgAccounts: setOrgAccounts,
    owners: setOwners,
    groups: setGroups,
    products: setProducts,
    modifiedBys: setModifiedBys,
  };
  const csvIds = (a: RefMulti[]) => a.map((x) => x.id).join(',');

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(stateFilter ? { state: stateFilter } : {}),
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
    ...(filterValues.momentFrom ? { momentFrom: filterValues.momentFrom } : {}),
    ...(filterValues.momentTo ? { momentTo: filterValues.momentTo } : {}),
    ...(filterValues.paymentStatus ? { paymentStatus: filterValues.paymentStatus } : {}),
    ...(filterValues.returnStatus ? { returnStatus: filterValues.returnStatus } : {}),
    ...(filterValues.applicable ? { applicable: filterValues.applicable } : {}),
    ...(filterValues.printed ? { printed: filterValues.printed } : {}),
    ...(filterValues.published ? { published: filterValues.published } : {}),
    ...(filterValues.shared ? { shared: filterValues.shared } : {}),
    ...(filterValues.incomingNumber ? { incomingNumber: filterValues.incomingNumber } : {}),
    ...(filterValues.incomingDateFrom ? { incomingDateFrom: filterValues.incomingDateFrom } : {}),
    ...(filterValues.incomingDateTo ? { incomingDateTo: filterValues.incomingDateTo } : {}),
    ...(filterValues.updatedFrom ? { updatedFrom: filterValues.updatedFrom } : {}),
    ...(filterValues.updatedTo ? { updatedTo: filterValues.updatedTo } : {}),
    // Multi-select reference fields → CSV `*Ids` (moysklad inline checkbox-dropdowns).
    ...(agents.length ? { agentIds: csvIds(agents) } : {}),
    ...(stores.length ? { storeIds: csvIds(stores) } : {}),
    ...(organizations.length ? { organizationIds: csvIds(organizations) } : {}),
    ...(projects.length ? { projectIds: csvIds(projects) } : {}),
    ...(contracts.length ? { contractIds: csvIds(contracts) } : {}),
    ...(agentGroups.length ? { agentGroupIds: csvIds(agentGroups) } : {}),
    ...(agentOwners.length ? { agentOwnerIds: csvIds(agentOwners) } : {}),
    ...(agentAccounts.length ? { agentAccountIds: csvIds(agentAccounts) } : {}),
    ...(orgAccounts.length ? { organizationAccountIds: csvIds(orgAccounts) } : {}),
    ...(owners.length ? { ownerIds: csvIds(owners) } : {}),
    ...(groups.length ? { groupIds: csvIds(groups) } : {}),
    ...(products.length ? { productIds: csvIds(products) } : {}),
    ...(modifiedBys.length ? { modifiedByIds: csvIds(modifiedBys) } : {}),
  });

  // Saved-filter round-trip — serialise the filter-state objects AND the
  // multi-select reference arrays as JSON so a re-applied bookmark restores
  // every field INCLUDING reference labels (a params-only encoding drops labels
  // → chips show raw UUIDs). Empty when nothing is set (disables the «+» save
  // pill). Mirror demand.
  const savedFilterQuery = (() => {
    const hasRefs = Object.values(refArrays).some((a) => a.length > 0);
    const hasAny =
      hasRefs || !!stateFilter || Object.values(filterValues).some((v) => v != null && v !== '');
    if (!hasAny) return '';
    const sp = new URLSearchParams();
    sp.set('fv', JSON.stringify(filterValues));
    sp.set('sf', stateFilter ?? '');
    sp.set('refs', JSON.stringify(refArrays));
    return sp.toString();
  })();

  const applySavedFilter = (qs: string) => {
    const sp = qs.startsWith('?') ? new URLSearchParams(qs.slice(1)) : new URLSearchParams(qs);
    const fvRaw = sp.get('fv');
    if (fvRaw) {
      try {
        setFilterValues(JSON.parse(fvRaw) as FilterDrawerValues & ExtraFilterFields);
      } catch {
        setFilterValues(filterFromQueryString(qs));
      }
    } else {
      setFilterValues(filterFromQueryString(qs));
    }
    setStateFilter(sp.get('sf') || null);
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
    onResetCursor();
  };

  const listQueryKey = [
    'supplies',
    search,
    stateFilter,
    cursor,
    sortKey,
    sortDir,
    params.toString(),
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/supplies?${params.toString()}`),
  });

  // moysklad pinned footer «Итого» — Сумма + Оплачено raw-summed across ALL
  // filtered rows (not just the page), same filter as the list minus
  // pagination/sort. Live-grounded: moysklad shows a number even on a mixed
  // доллар/сум set (no «—»), so we raw-sum and format with no symbol.
  const totalsParams = new URLSearchParams(params);
  totalsParams.delete('cursor');
  totalsParams.delete('limit');
  totalsParams.delete('sortBy');
  totalsParams.delete('sortDir');
  const { data: totals } = useQuery<{ count: number; sumMinor: string; payedSumMinor: string }>({
    queryKey: ['supplies-totals', totalsParams.toString()],
    queryFn: () => api.get(`/supplies/aggregate/totals?${totalsParams.toString()}`),
    staleTime: 30_000,
  });

  // moysklad «Статус» dropdown — the account's custom supply statuses (State
  // rows, entityType="supply"). archived=false: a retired status must not be
  // OFFERED for assigning. The supply FSM («Провести») stays in «Изменить».
  const { data: statusData } = useQuery<{ items: SupplyCustomStatus[] }>({
    queryKey: ['states', 'supply'],
    queryFn: () =>
      api.get<{ items: SupplyCustomStatus[] }>(
        '/states?entityType=supply&archived=false&limit=250',
      ),
    staleTime: 60_000,
  });
  const supplyStatuses = statusData?.items ?? [];

  const bulk = useBulkDocumentActions('supplies', listQueryKey, {
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
  // SupplyBulkActionsDropdown — disable Provedeno when every selected
  // row is already posted (mirrors moysklad's gwt-MenuItem-disabled).
  const postedCount = useMemo(() => {
    if (!data?.items?.length) return 0;
    let n = 0;
    for (const s of data.items) {
      if (bulk.selectedIds.has(s.id) && s.state === 'posted') n++;
    }
    return n;
  }, [data?.items, bulk.selectedIds]);

  // Programmatic CSV export — reused by SupplyPrintDropdown's "Список приемок".
  const handleListExport = () => {
    const items = data?.items ?? [];
    const active = columns
      .filter((c) => cols.visibleKeys.has(c.key))
      .filter((c) => typeof c.cellText === 'function');
    if (active.length === 0 || items.length === 0) return;
    const csvCols: CsvColumn<SupplyRow>[] = active.map((c) => ({
      header: c.headerText ?? (typeof c.header === 'string' ? c.header : c.key),
      // biome-ignore lint/style/noNonNullAssertion: filtered above
      cellText: c.cellText!,
    }));
    const csv = buildCsv(csvCols, items);
    downloadCsv(`supplies_${csvTimestamp()}.csv`, csv);
  };

  // moysklad parity (C2 audit, 2026-05-21): /supply default columns
  // are № · Время · На склад · Контрагент · Организация · Сумма ·
  // Валюта · Оплачено · Входящая дата · Входящий номер · Отправлено ·
  // Напечатано · Комментарий. `state` removed from defaults (still
  // available via gear). All scalar fields surfaced from Prisma —
  // backend already returns them.
  const cols = useColumnVisibility('supplies', [
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
    'currency',
    'paid',
    'incomingDate',
    'incomingNumber',
    'state',
    'published',
    'printed',
    'description',
  ]);
  const colWidths = useColumnWidths('supplies');

  // moysklad's "Приёмки" list has no status pill sub-tabs (shared GWT
  // list chrome). Status filtering is the "Статус" select inside the
  // inline filter panel below.

  const columns: DataTableColumn<SupplyRow>[] = [
    {
      key: 'name',
      header: tFields('number'),
      width: '140px',
      sortable: true,
      cell: (s) => (
        <a
          href={`/supplies/${s.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {s.name}
        </a>
      ),
      cellText: (r: SupplyRow) => r.name,
    },
    {
      key: 'moment',
      header: tFields('time'),
      width: '120px',
      sortable: true,
      cell: (s) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(s.moment)}</span>
      ),
      cellText: (r: SupplyRow) => formatDate(r.moment),
    },
    {
      // moysklad parity: «На склад» column on /supply (verified C2 audit).
      key: 'store',
      header: tFields('store_to'),
      width: '160px',
      sortable: true,
      cell: (s) => <span className="max-w-[160px] truncate text-sm">{s.store?.name ?? '—'}</span>,
      cellText: (r: SupplyRow) => r.store?.name ?? '',
    },
    {
      key: 'agent',
      header: tFields('agent'),
      width: '220px',
      sortable: true,
      cell: (s) => (
        <div>
          <div className="max-w-[300px] truncate font-medium">{s.agent.name}</div>
          {s.agent.legalTitle && (
            <div className="max-w-[300px] truncate text-[var(--ms-text-muted)] text-[11px]">
              {s.agent.legalTitle}
            </div>
          )}
        </div>
      ),
      cellText: (r: SupplyRow) =>
        r.agent?.legalTitle ? `${r.agent.name} (${r.agent.legalTitle})` : (r.agent?.name ?? ''),
    },
    {
      // moysklad parity: «Организация» column on /supply.
      key: 'organization',
      header: tFields('organization'),
      width: '180px',
      sortable: true,
      cell: (s) => (
        <span className="max-w-[180px] truncate text-sm">{s.organization?.name ?? '—'}</span>
      ),
      cellText: (r: SupplyRow) => r.organization?.name ?? '',
    },
    // moysklad column order (#supply, live-grounded 2026-06-27): after
    // «Организация» → Сумма · Валюта · Оплачено · Входящая дата · Входящий
    // номер · Статус · Отправлено · Напечатано · Комментарий. Сумма (and
    // Оплачено) format in the ROW's OWN currency — rows can be доллар or сум.
    {
      key: 'sum',
      sortField: 'sumMinor',
      header: tFields('sum'),
      align: 'right',
      width: '180px',
      sortable: true,
      cell: (s) => (
        <span className="font-medium tabular-nums">
          {formatMoney(s.sumMinor, s.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: SupplyRow) => (r.sumMinor ? formatMoney(r.sumMinor) : ''),
    },
    {
      key: 'currency',
      header: tFields('currency'),
      width: '90px',
      align: 'center',
      cell: (s) => (
        <span className="text-[var(--ms-text-muted)] text-xs uppercase">{s.currency}</span>
      ),
      cellText: (r: SupplyRow) => r.currency,
    },
    {
      key: 'paid',
      sortField: 'payedSumMinor',
      header: tFields('paid'),
      align: 'right',
      width: '160px',
      sortable: true,
      cell: (s) => (
        <span className="font-medium tabular-nums">
          {formatMoney(s.payedSumMinor, s.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: SupplyRow) => formatMoney(r.payedSumMinor),
    },
    {
      key: 'incomingDate',
      header: tFields('incoming_date'),
      width: '140px',
      cell: (s) => (
        <span className="text-[var(--ms-text-muted)] text-xs">
          {s.incomingDate ? formatDate(s.incomingDate) : '—'}
        </span>
      ),
      cellText: (r: SupplyRow) => (r.incomingDate ? formatDate(r.incomingDate) : ''),
    },
    {
      key: 'incomingNumber',
      header: tFields('incoming_number'),
      width: '140px',
      cell: (s) => <span className="text-xs">{s.incomingNumber ?? '—'}</span>,
    },
    {
      // gear-only: moysklad #supply has NO positions-count column — kept as an
      // optional column, hidden by default (not in the visibleKeys default).
      key: 'positions',
      header: tFields('positions_count'),
      width: '70px',
      align: 'right',
      cell: (s) => (
        <span className="text-[var(--ms-text-muted)] text-sm tabular-nums">
          {s._count.positions}
        </span>
      ),
      cellText: (r: SupplyRow) => String(r._count?.positions ?? ''),
    },
    // moysklad parity: «Отправлено» renders a cyan (#00bfe6) filled pill
    // «Отправлен» when sent, and an EMPTY cell otherwise (NOT «Да»/«—»). Colour +
    // word-pill live-grounded on online.moysklad.ru #supply; mirror demand/CO list.
    {
      key: 'published',
      header: tFields('published'),
      width: '120px',
      cell: (s) =>
        s.published ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] bg-[#00bfe6] px-2 py-0.5 font-medium text-white text-xs"
            data-test-id="published-badge"
          >
            {tFields('published_badge')}
          </span>
        ) : null,
      cellText: (r: SupplyRow) => (r.published ? 'yes' : ''),
    },
    {
      key: 'printed',
      header: tFields('printed'),
      width: '120px',
      cell: (s) =>
        s.printed ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] bg-[#00bfe6] px-2 py-0.5 font-medium text-white text-xs"
            data-test-id="printed-badge"
          >
            {tFields('printed_badge')}
          </span>
        ) : null,
      cellText: (r: SupplyRow) => (r.printed ? 'yes' : ''),
    },
    {
      key: 'description',
      header: tFields('description'),
      width: '220px',
      cell: (s) => (
        <span className="block max-w-[220px] truncate text-[var(--ms-text-muted)] text-[11px]">
          {s.description ?? ''}
        </span>
      ),
      cellText: (r: SupplyRow) => r.description ?? '',
    },
    // Bizning QO`SHIMCHA ustunimiz — capture`da yo`q, shuning uchun moysklad
    // ketma-ketligidan KEYIN turadi (2026-07-31 prod QA, demands bilan bir xil).
    // Ground-truth: №·Время·На склад·Контрагент·Организация·Сумма·Оплачено·
    // Входящая дата·Входящий номер·Отправлено·Напечатано·Комментарий
    {
      // moysklad parity: «Статус» column = the account-defined CUSTOM status
      // (coloured pill), NOT the FSM state. A grey «Status» placeholder shows
      // until a status is assigned (live-grounded #supply: «Кирилди» orange pill).
      // Posting state lives in the «Проведено» flag, not this column. Mirror demands.
      key: 'state',
      header: tFields('state'),
      width: '150px',
      cell: (s) =>
        s.status ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] px-2 py-0.5 font-medium text-white text-xs"
            style={{ backgroundColor: s.status.color ?? 'var(--ms-text-muted)' }}
            data-test-id="supply-status-pill"
          >
            {s.status.name}
          </span>
        ) : (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] bg-[var(--ms-bg-muted)] px-2 py-0.5 text-[var(--ms-text-muted)] text-xs"
            data-test-id="supply-status-placeholder"
          >
            {tFields('custom_status_placeholder')}
          </span>
        ),
      cellText: (r: SupplyRow) => r.status?.name ?? '',
    },
  ];

  const hasFilter =
    !!search ||
    !!stateFilter ||
    Object.values(refArrays).some((a) => a.length > 0) ||
    !!filterValues.applicable ||
    !!filterValues.printed ||
    !!filterValues.published ||
    !!filterValues.shared ||
    !!filterValues.incomingNumber ||
    !!filterValues.incomingDateFrom ||
    !!filterValues.incomingDateTo ||
    !!filterValues.momentFrom ||
    !!filterValues.momentTo ||
    !!filterValues.updatedFrom ||
    !!filterValues.updatedTo ||
    !!filterValues.paymentStatus ||
    !!filterValues.returnStatus;

  // moysklad-parity inline filter panel — field SET + ORDER 1:1 with the real
  // #supply (Приёмки) filter (2026-06-27, live-grounded):
  //   Период · Входящий номер · Входящая дата · Оплата · Товар или группа ·
  //   Тип возврата · Склад · Проект · Контрагент · Группа контрагента · Счёт контрагента ·
  //   Договор · Владелец контрагента · Организация · Счёт организации ·
  //   Статус · Проведено · Напечатано · Отправлено · Владелец-сотрудник ·
  //   Владелец-отдел · Общий доступ · Когда изменен · Кто изменил.
  // «Счёт контрагента» / «Счёт организации» mirror the purchase-orders gold
  // standard (disabled until the parent agent/org is picked).
  // NOT present in moysklad #supply (deliberately absent): «Заказ поставщику»
  // and the «Сумма» range — neither is a #supply filter.
  const filterPanel = (
    <InlineFilterPanel
      hidden={!filterOpen}
      columns={6}
      applyLabel={tFilters('find')}
      clearLabel={tFilters('clear')}
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
      onClear={() => {
        setFilterValues({});
        setStateFilter(null);
        for (const setter of Object.values(refSetters)) setter([]);
        onResetCursor();
      }}
      pills={
        <SavedFiltersPills
          entity="supply"
          currentQueryString={savedFilterQuery}
          onApply={applySavedFilter}
          adding={saveFilterOpen}
          onAddingChange={setSaveFilterOpen}
          showAdd={filterOpen}
        />
      }
      testId="supplies-inline-filter"
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
      {/* «Входящий номер» — moysklad #supply filter field (also covered by search). */}
      <InlineFilterPanel.Field label={tFields('incoming_number')} expandable>
        <Input
          value={filterValues.incomingNumber ?? ''}
          onChange={(e) => {
            setFilterValues({ ...filterValues, incomingNumber: e.target.value || undefined });
            onResetCursor();
          }}
          data-test-id="filter-incoming-number"
        />
      </InlineFilterPanel.Field>
      {/* «Входящая дата» — moysklad #supply filter field (incomingDate range). */}
      <InlineFilterPanel.Field label={tFields('incoming_date')} expandable>
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
      {/* 4. Оплата — payment progress (moysklad #supply «Оплата» select). */}
      <InlineFilterPanel.Field label={tFilters('payment_status')} expandable={false}>
        <NativeSelect
          value={filterValues.paymentStatus ?? ''}
          onChange={(e) => {
            setFilterValues({
              ...filterValues,
              paymentStatus: (e.target.value || undefined) as
                | 'unpaid'
                | 'partial'
                | 'paid'
                | undefined,
            });
            onResetCursor();
          }}
          data-test-id="filter-payment-status"
        >
          <option value="" />
          <option value="unpaid">{tFilters('payment_unpaid')}</option>
          <option value="partial">{tFilters('payment_partial')}</option>
          <option value="paid">{tFilters('payment_paid')}</option>
        </NativeSelect>
      </InlineFilterPanel.Field>
      {/* 5. Товар или группа — narrows to supplies containing the product. */}
      <InlineFilterPanel.Field label={tFilters('product_or_group')} expandable>
        <MultiRefField
          value={products}
          onChange={(v) => {
            setProducts(v);
            onResetCursor();
          }}
          onSearch={fetchProducts}
          testId="filter-product"
        />
      </InlineFilterPanel.Field>
      {/* 5b. Тип возврата — return progress (none/partial/full) vs linked
           Возврат поставщику. Option order + labels grounded LIVE from moysklad
           #supply (mirror #demand). */}
      <InlineFilterPanel.Field
        fieldKey="return_type"
        label={tFilters('return_type')}
        expandable={false}
      >
        <NativeSelect
          value={filterValues.returnStatus ?? ''}
          onChange={(e) => {
            setFilterValues({
              ...filterValues,
              returnStatus: (e.target.value || undefined) as
                | 'none'
                | 'partial'
                | 'full'
                | undefined,
            });
            onResetCursor();
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
      <InlineFilterPanel.Field label={tFields('store')} expandable>
        <MultiRefField
          value={stores}
          onChange={(v) => {
            setStores(v);
            onResetCursor();
          }}
          onSearch={fetchStores}
          testId="filter-store"
        />
      </InlineFilterPanel.Field>
      {/* 7. Проект */}
      <InlineFilterPanel.Field label={t('filter_project')} expandable>
        <MultiRefField
          value={projects}
          onChange={(v) => {
            setProjects(v);
            onResetCursor();
          }}
          onSearch={fetchProjects}
          testId="filter-project"
        />
      </InlineFilterPanel.Field>
      {/* 8. Контрагент */}
      <InlineFilterPanel.Field label={tFields('agent')} expandable>
        <MultiRefField
          value={agents}
          onChange={(v) => {
            setAgents(v);
            onResetCursor();
          }}
          onSearch={fetchCounterparties}
          testId="filter-agent"
        />
      </InlineFilterPanel.Field>
      {/* 3. Группа контрагента */}
      <InlineFilterPanel.Field label={t('filter_agent_group')} expandable>
        <MultiRefField
          value={agentGroups}
          onChange={(v) => {
            setAgentGroups(v);
            onResetCursor();
          }}
          onSearch={fetchGroups}
          testId="filter-agent-group"
        />
      </InlineFilterPanel.Field>
      {/* 4. Счёт контрагента — accounts of ALL selected counterparties (mirror
          demand: the dropdown lists the union of every picked agent's bank
          accounts; empty until at least one Контрагент is chosen). */}
      <InlineFilterPanel.Field label={t('filter_agent_account')} expandable={false}>
        <MultiRefField
          value={agentAccounts}
          onChange={(v) => {
            setAgentAccounts(v);
            onResetCursor();
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
      {/* 5. Договор */}
      <InlineFilterPanel.Field label={t('filter_contract')} expandable>
        <MultiRefField
          value={contracts}
          onChange={(v) => {
            setContracts(v);
            onResetCursor();
          }}
          onSearch={fetchContracts}
          testId="filter-contract"
        />
      </InlineFilterPanel.Field>
      {/* 6. Владелец контрагента — the agent (Counterparty)'s owner employee
         (agent.ownerId). §4-grounded on the supply filter capture
         (00-clean-default.html, ordered Договор → Владелец контрагента →
         Организация). Distinct from «Владелец-сотрудник» (the supply's own
         owner). Narrows the same `agent` relation as «Группа контрагента»,
         merged server-side into one clause. */}
      <InlineFilterPanel.Field label={tFilters('agent_owner')} expandable>
        <MultiRefField
          value={agentOwners}
          onChange={(v) => {
            setAgentOwners(v);
            onResetCursor();
          }}
          onSearch={fetchEmployees}
          testId="filter-agent-owner"
        />
      </InlineFilterPanel.Field>
      {/* 7. Организация */}
      <InlineFilterPanel.Field label={tFields('organization')} expandable>
        <MultiRefField
          value={organizations}
          onChange={(v) => {
            setOrganizations(v);
            onResetCursor();
          }}
          onSearch={fetchOrganizations}
          testId="filter-org"
        />
      </InlineFilterPanel.Field>
      {/* 7. Счёт организации — accounts of ALL selected organizations (mirror
          demand: union of every picked Организация's accounts; empty until at
          least one Организация is chosen). */}
      <InlineFilterPanel.Field label={t('filter_org_account')} expandable={false}>
        <MultiRefField
          value={orgAccounts}
          onChange={(v) => {
            setOrgAccounts(v);
            onResetCursor();
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
      {/* 15. Статус */}
      <InlineFilterPanel.Field label={t('filter_status_multi')} expandable>
        <StateSelect
          value={stateFilter ?? undefined}
          onChange={(v) => {
            setStateFilter(v ?? null);
            onResetCursor();
          }}
          labels={{
            draft: tStates('draft'),
            posted: tStates('posted'),
            cancelled: tStates('cancelled'),
          }}
          testId="filter-state"
        />
      </InlineFilterPanel.Field>
      {/* 16. Проведено */}
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
      {/* 17. Напечатано */}
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
      {/* 18. Отправлено */}
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
      {/* 19. Владелец-сотрудник */}
      <InlineFilterPanel.Field label={t('filter_owner_employee')} expandable>
        <MultiRefField
          value={owners}
          onChange={(v) => {
            setOwners(v);
            onResetCursor();
          }}
          onSearch={fetchEmployees}
          testId="filter-owner"
        />
      </InlineFilterPanel.Field>
      {/* 20. Владелец-отдел */}
      <InlineFilterPanel.Field label={t('filter_owner_group')} expandable>
        <MultiRefField
          value={groups}
          onChange={(v) => {
            setGroups(v);
            onResetCursor();
          }}
          onSearch={fetchGroups}
          testId="filter-group"
        />
      </InlineFilterPanel.Field>
      {/* 21. Общий доступ — moysklad #supply filter field (Supply.shared). */}
      <InlineFilterPanel.Field label={t('filter_shared')} expandable>
        <YesNoSelect
          value={filterValues.shared}
          onChange={(v) => {
            setFilterValues({ ...filterValues, shared: v });
            onResetCursor();
          }}
          testId="filter-shared"
        />
      </InlineFilterPanel.Field>
      {/* 22. Когда изменен */}
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
      {/* 23. Кто изменил — employee who last edited (auditLog userId → entityIds). */}
      <InlineFilterPanel.Field label={tFilters('modified_by')} expandable>
        <MultiRefField
          value={modifiedBys}
          onChange={(v) => {
            setModifiedBys(v);
            onResetCursor();
          }}
          onSearch={fetchEmployees}
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

  // «Итого» footer row (moysklad #supply): raw-summed Сумма + Оплачено under
  // their own columns, formatted with no currency symbol. «…» until loaded.
  const footerRow: Record<string, string> = totals
    ? {
        sum: formatMoney(totals.sumMinor, 'UZS', { displayAs: 'none' }),
        paid: formatMoney(totals.payedSumMinor, 'UZS', { displayAs: 'none' }),
      }
    : { sum: '…', paid: '…' };

  return (
    <>
      <ListView
        testId="supplies-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        onHelp={() => window.open('/help/supplies', '_blank')}
        selectionCount={bulk.selectedIds.size}
        createHref="/supplies/new"
        createLabel={t('create_button')}
        createPosition="start"
        search={searchInput}
        onSearchChange={(v) => {
          setSearchInput(v);
          setCursor(undefined);
        }}
        searchPlaceholder={t('search_placeholder')}
        columns={columns}
        footerRow={footerRow}
        rows={data?.items ?? []}
        keyField="id"
        rowTestId={(s) => `supply-row-${s.id}`}
        rowActions={(s) => bulk.rowDelete(s.id)}
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
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          setCursor(undefined);
        }}
        emptyDescription={!hasFilter ? t('empty_rich_helper') : undefined}
        {...bulk.listViewProps}
        // bulkActionBar omitted — toolbar dropdowns replace it.
        visibleColumnKeys={cols.visibleKeys}
        headerSlot={filterPanel}
        extraActionsLeft={filterToggleButton}
        extraActions={
          <>
            <SupplyBulkActionsDropdown
              selectedIds={bulk.selectedIds}
              listQueryKey={listQueryKey}
              onClearSelection={bulk.clearSelection}
              postedCount={postedCount}
              onMassEdit={() => {
                stashBulkEdit({
                  entity: 'supplies',
                  ids:
                    bulk.selectedIds.size > 0
                      ? Array.from(bulk.selectedIds)
                      : (data?.items ?? []).map((r) => r.id),
                  from: '/supplies',
                });
                router.push('/bulk-edit');
              }}
            />
            <SupplyStatusDropdown
              selectedIds={bulk.selectedIds}
              listQueryKey={listQueryKey}
              onClearSelection={bulk.clearSelection}
              customStatuses={supplyStatuses}
            />
            {/* moysklad toolbar order: Изменить · Статус · Создать · Печать */}
            <SupplyCreateDocDropdown
              selectedIds={bulk.selectedIds}
              listQueryKey={listQueryKey}
              onClearSelection={bulk.clearSelection}
            />
            <SupplyPrintDropdown selectedIds={bulk.selectedIds} onExportList={handleListExport} />
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
