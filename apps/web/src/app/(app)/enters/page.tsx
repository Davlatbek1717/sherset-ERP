'use client';

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { EnterBulkActionsDropdown } from '@/components/enters/bulk-actions-dropdown';
import { EnterPrintDropdown } from '@/components/enters/print-dropdown';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { stashBulkEdit } from '@/lib/bulk-edit-nav';
import { documentStateTone } from '@/lib/document-state-tone';
import {
  Badge,
  CatalogPicker,
  CatalogPickerField,
  type CsvColumn,
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
import { useMemo, useState } from 'react';

interface EnterRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  currency: string;
  moment: string;
  reason: string;
  // moysklad «Оприходования» grid columns (parity with the moves
  // gold-standard): Валюта / Отправлено / Напечатано / Комментарий.
  published: boolean;
  printed: boolean;
  description: string | null;
  organization: { id: string; name: string };
  store: { id: string; name: string };
  owner: { id: string; name: string } | null;
  _count: { positions: number };
}

interface ListResponse {
  items: EnterRow[];
  nextCursor?: string;
  total: number;
}

// Moysklad parity — 100 rows per page.
const LIMIT = 100;

type EnterStateKey = 'draft' | 'posted' | 'cancelled';

/** Tri-state Yes/No/All select for boolean filter fields — mirrors the
 *  supplies / moves gold-standard control (✓ / — / unset). */
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

/** «Статус» single-select — Enter's FSM has exactly 3 states (draft /
 *  posted / cancelled); moysklad surfaces it as a plain dropdown (no
 *  multi-tag picker, mirrors moves). */
function StateSelect({
  value,
  onChange,
  labeler,
  testId,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  labeler: (s: EnterStateKey) => string;
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
 * Enter-specific extension fields stored alongside the shared
 * FilterDrawerValues shape. Local to this page (the shared
 * `useMoyskladDocFilter` hook is intentionally NOT used here — Enters
 * mirrors the moves / supplies inline-field gold standard).
 *
 * NOTE: Enter is an ad-hoc stock entry with NO counterparty —
 * deliberately omits agentId / agentAccountId / contractId /
 * organizationAccountId / salesChannelId.
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
  groupId?: string;
  groupLabel?: string;
  projectId?: string;
  projectLabel?: string;
  // «Товар или группа» is now a MULTI-select (see `products` state below), so it
  // no longer lives in filterValues as a single productId.
  // «Кто изменил» — Enter.modifiedById (last editor).
  modifiedById?: string;
  modifiedByLabel?: string;
};

/** Multi-select reference field — moysklad checkbox-dropdown holds {id,label}[]. */
type RefMulti = { id: string; label: string };

export default function EntersPage() {
  const t = useTranslations('pages.enters');
  const tPO = useTranslations('pages.purchase_orders');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tMass = useTranslations('mass_edit_modal');
  const tStates = useTranslations('states.enter');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [filterValues, setFilterValues] = useState<FilterDrawerValues & ExtraFilterFields>({});
  const [filterOpen, setFilterOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState<
    | null
    | 'store'
    | 'owner'
    | 'group'
    | 'project'
    | 'modifiedBy'
    | 'massEditOwner'
    | 'massEditProject'
  >(null);
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // «Фильтр» 🔖 save-filter + ⚙ field-visibility (moysklad parity, mirrors the
  // purchase-orders list). `saveFilterOpen` is shared with the SavedFiltersPills
  // add mode; `filterHidden.visibleKeys` holds the HIDDEN filter-field keys
  // (empty default = every field shown).
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  const filterHidden = useColumnVisibility('enters-filter-hidden', []);

  // «Товар или группа» — moysklad multi-select checkbox dropdown (mirror PO).
  // Holds the picked {id,label}; on the wire goes out as `productIds` CSV.
  const [products, setProducts] = useState<RefMulti[]>([]);
  // «Организация» — moysklad-parity inline multi-select checkbox dropdown (was a
  // single-select modal). Holds the picked {id,label}; goes out as `organizationIds`
  // CSV. No sublabel (organizations have no phone). Mirrors the PO reference.
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);

  // «Массовое редактирование» (Ommaviy tahrirlash) modal state — mirrors moves.
  // The shared MassEditModal patches ownerId / projectId / description across the
  // selected enters via bulk.massEdit → POST /enters/mass-edit.
  const router = useRouter();
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
    ...(organizations.length ? { organizationIds: organizations.map((x) => x.id).join(',') } : {}),
    ...(filterValues.storeId ? { storeId: filterValues.storeId } : {}),
    ...(products.length ? { productIds: products.map((x) => x.id).join(',') } : {}),
    ...(filterValues.ownerId ? { ownerId: filterValues.ownerId } : {}),
    ...(filterValues.modifiedById ? { modifiedById: filterValues.modifiedById } : {}),
    ...(filterValues.groupId ? { groupId: filterValues.groupId } : {}),
    ...(filterValues.projectId ? { projectId: filterValues.projectId } : {}),
    ...(filterValues.applicable ? { applicable: filterValues.applicable } : {}),
    ...(filterValues.printed ? { printed: filterValues.printed } : {}),
    ...(filterValues.published ? { published: filterValues.published } : {}),
    ...(filterValues.shared ? { shared: filterValues.shared } : {}),
    ...(filterValues.updatedFrom ? { updatedFrom: filterValues.updatedFrom } : {}),
    ...(filterValues.updatedTo ? { updatedTo: filterValues.updatedTo } : {}),
  });

  const listQueryKey = [
    'enters',
    search,
    stateFilter,
    cursor,
    sortKey,
    sortDir,
    params.toString(),
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/enters?${params.toString()}`),
  });

  const bulk = useBulkDocumentActions('enters', listQueryKey, { hasFSM: true });

  // moysklad «Итого» — pinned footer total over the active filter set (not
  // just the page). Mirrors the moves / PO list footer; the currency-guard in
  // footerMoneyCells shows «—» on a mixed-currency set, «…» while loading.
  const { data: totals } = useQuery<{
    count: number;
    sumMinor: string;
    currencies: string[];
  }>({
    queryKey: ['enters-totals', params.toString()],
    queryFn: () => api.get(`/enters/aggregate/totals?${params.toString()}`),
  });
  const footerRow: Record<string, string> = footerMoneyCells(totals, {
    sum: totals?.sumMinor ?? '0',
  });

  const postedCount = useMemo(() => {
    if (!data?.items?.length) return 0;
    let n = 0;
    for (const e of data.items) {
      if (bulk.selectedIds.has(e.id) && e.state === 'posted') n++;
    }
    return n;
  }, [data?.items, bulk.selectedIds]);

  const handleListExport = () => {
    const items = data?.items ?? [];
    const active = columns
      .filter((c) => cols.visibleKeys.has(c.key))
      .filter((c) => typeof c.cellText === 'function');
    if (active.length === 0 || items.length === 0) return;
    const csvCols: CsvColumn<EnterRow>[] = active.map((c) => ({
      header: c.headerText ?? (typeof c.header === 'string' ? c.header : c.key),
      // biome-ignore lint/style/noNonNullAssertion: filtered above
      cellText: c.cellText!,
    }));
    const csv = buildCsv(csvCols, items);
    downloadCsv(`enters_${csvTimestamp()}.csv`, csv);
  };

  // moysklad «Оприходования» default grid (live-grounded 2026-06-21 from the
  // clean capture 06-module/enter/dom/00-clean-default.html — title
  // «Оприходования» — header cells: № · Время · На склад · Организация ·
  // Сумма · Валюта · Отправлено · Напечатано · Комментарий). Mirrors the
  // moves gold-standard. «Статус» / «Позиции» are gear-only extras (off by
  // default — moysklad surfaces neither in the default grid; Статус lives in
  // Фильтр). «Причина» is NOT a moysklad document-list column (reason is a
  // per-position string in moysklad, not a document field) → removed.
  const cols = useColumnVisibility('enters', [
    'name',
    'moment',
    'store',
    'organization',
    'sum',
    'currency',
    'published',
    'printed',
    'description',
  ]);
  const colWidths = useColumnWidths('enters');

  // moysklad's "Оприходования" list has no status pill sub-tabs (shared
  // GWT list chrome). Status filtering is the "Статус" select inside the
  // inline filter panel below.

  const columns: DataTableColumn<EnterRow>[] = [
    {
      key: 'name',
      header: tFields('number'),
      width: '140px',
      sortable: true,
      cell: (r) => (
        <a
          href={`/enters/${r.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {r.name}
        </a>
      ),
      cellText: (r: EnterRow) => r.name,
    },
    {
      key: 'moment',
      header: tFields('time'),
      width: '120px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(r.moment)}</span>
      ),
      cellText: (r: EnterRow) => formatDate(r.moment),
    },
    {
      // «На склад» — Enter is a single-warehouse stock-in (store_to label,
      // grounded against the moysklad capture header «На склад»).
      key: 'store',
      header: tFields('store_to'),
      sortable: true,
      cell: (r) => <span className="text-sm">{r.store.name}</span>,
      cellText: (r: EnterRow) => r.store.name,
    },
    {
      key: 'organization',
      header: tFields('organization'),
      width: '180px',
      sortable: true,
      cell: (r) => (
        <span className="max-w-[180px] truncate text-sm">{r.organization?.name ?? '—'}</span>
      ),
      cellText: (r: EnterRow) => r.organization?.name ?? '',
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
          {formatMoney(r.sumMinor, r.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (r: EnterRow) => (r.sumMinor ? formatMoney(r.sumMinor, r.currency) : ''),
    },
    {
      // moysklad shows «Валюта» as a separate column right after «Сумма» —
      // lowercase «сум» (not «UZS»). Mirrors the moves gold-standard.
      key: 'currency',
      header: tFields('currency'),
      width: '70px',
      align: 'center',
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs">
          {r.currency === 'UZS' ? 'сум' : r.currency}
        </span>
      ),
      cellText: (r: EnterRow) => r.currency,
    },
    {
      // moysklad renders a blue filled pill «Отправлен» when sent, empty
      // cell otherwise. Mirrors the moves gold-standard.
      key: 'published',
      header: tFields('published'),
      width: '110px',
      cell: (r) =>
        r.published ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] bg-[#186999] px-2 py-0.5 font-medium text-white text-xs"
            data-test-id="published-badge"
          >
            {tFields('published_badge')}
          </span>
        ) : null,
      cellText: (r: EnterRow) => (r.published ? tFields('published_badge') : ''),
    },
    {
      // moysklad renders a blue filled pill «Напечатан» when printed, empty
      // cell otherwise. Mirrors the moves gold-standard.
      key: 'printed',
      header: tFields('printed'),
      width: '110px',
      cell: (r) =>
        r.printed ? (
          <span
            className="inline-flex items-center whitespace-nowrap rounded-[3px] bg-[#186999] px-2 py-0.5 font-medium text-white text-xs"
            data-test-id="printed-badge"
          >
            {tFields('printed_badge')}
          </span>
        ) : null,
      cellText: (r: EnterRow) => (r.printed ? tFields('printed_badge') : ''),
    },
    {
      key: 'description',
      header: tFields('description'),
      cell: (r) => (
        <span className="max-w-[200px] truncate text-[var(--ms-text-muted)] text-[11px]">
          {r.description ?? ''}
        </span>
      ),
      cellText: (r: EnterRow) => r.description ?? '',
    },
    // ⚙ gear-only extras (off by default — moysklad surfaces neither in the
    // default grid; Статус lives in Фильтр, positions-count is our addition).
    {
      key: 'state',
      header: tFields('state'),
      width: '150px',
      cell: (r) => (
        <Badge tone={documentStateTone(r.state)}>{tStates(r.state as EnterStateKey)}</Badge>
      ),
      cellText: (r: EnterRow) => r.state,
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
      cellText: (r: EnterRow) => String(r._count?.positions ?? ''),
    },
  ];

  const hasFilter =
    !!search ||
    !!stateFilter ||
    organizations.length > 0 ||
    !!filterValues.storeId ||
    products.length > 0 ||
    !!filterValues.ownerId ||
    !!filterValues.modifiedById ||
    !!filterValues.groupId ||
    !!filterValues.projectId ||
    !!filterValues.applicable ||
    !!filterValues.printed ||
    !!filterValues.published ||
    !!filterValues.shared ||
    !!filterValues.momentFrom ||
    !!filterValues.momentTo ||
    !!filterValues.updatedFrom ||
    !!filterValues.updatedTo;

  // Saved-filter serialize/restore (🔖 bookmark) — enters has only single-value
  // filters, so the whole filterValues + the separate `stateFilter` round-trip
  // as one `fv` JSON. Labels are kept inside filterValues, so a re-applied pill
  // restores the picker chips (not bare ids).
  const savedFilterQuery = (() => {
    const p = new URLSearchParams();
    p.set('fv', JSON.stringify({ ...filterValues, __state: stateFilter ?? undefined }));
    // «Товар или группа» / «Организация» are multi-select state (not in
    // filterValues) → serialize separately so a re-applied pill restores the chips.
    if (products.length) p.set('products', JSON.stringify(products));
    if (organizations.length) p.set('organizations', JSON.stringify(organizations));
    return p.toString();
  })();
  const applySavedFilter = (qs: string) => {
    const p = qs.startsWith('?') ? new URLSearchParams(qs.slice(1)) : new URLSearchParams(qs);
    const fvRaw = p.get('fv');
    if (fvRaw) {
      try {
        const parsed = JSON.parse(fvRaw) as typeof filterValues & { __state?: string };
        const { __state, ...rest } = parsed;
        setFilterValues(rest);
        setStateFilter(__state ?? null);
      } catch {
        /* malformed saved query — ignore */
      }
    }
    const parseRefList = (key: string): RefMulti[] => {
      try {
        const raw = p.get(key);
        const arr: unknown = raw ? JSON.parse(raw) : [];
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
    setProducts(parseRefList('products'));
    setOrganizations(parseRefList('organizations'));
    onResetCursor();
  };

  // moysklad-parity reference fetchers — shared by each filter field's INLINE
  // type-to-search (CatalogPickerField.inlineFetcher) AND its chevron→modal
  // CatalogPicker (fetcher), so typing filters in place exactly like moysklad
  // and the chevron still opens the full browse dialog. (Склад LIST inline
  // conversion — was previously modal-only/legacy.)
  const fetchProducts = async (q: string): Promise<PickerItem[]> => {
    const r = await api.get<{ items: { id: string; name: string; code?: string }[] }>(
      `/products?search=${encodeURIComponent(q)}&limit=20`,
    );
    return r.items.map((x) => ({ id: x.id, primary: x.name, secondary: x.code }));
  };
  const fetchStores = async (q: string): Promise<PickerItem[]> => {
    const r = await api.get<{ items: { id: string; name: string }[] }>(
      `/stores?search=${encodeURIComponent(q)}&limit=20`,
    );
    return r.items.map((x) => ({ id: x.id, primary: x.name }));
  };
  const fetchProjects = async (q: string): Promise<PickerItem[]> => {
    const r = await api.get<{ items: { id: string; name: string }[] }>(
      `/projects?search=${encodeURIComponent(q)}&limit=20`,
    );
    return r.items.map((x) => ({ id: x.id, primary: x.name }));
  };
  const fetchEmployees = async (q: string): Promise<PickerItem[]> => {
    const r = await api.get<{ items: { id: string; name: string }[] }>(
      `/employees?search=${encodeURIComponent(q)}&limit=20`,
    );
    return r.items.map((x) => ({ id: x.id, primary: x.name }));
  };
  const fetchGroups = async (q: string): Promise<PickerItem[]> => {
    const r = await api.get<{ items: { id: string; name: string }[] }>(
      `/groups?search=${encodeURIComponent(q)}&limit=20`,
    );
    return r.items.map((x) => ({ id: x.id, primary: x.name }));
  };

  // moysklad-parity inline filter panel — LIVE-grounded 2026-06-21 against the
  // real #enter list filter (docs/audits/enters-live-2026-06-21/10-enter-list.png).
  // moysklad shows exactly: Период · Товар или группа · Склад · Проект ·
  // Организация · Статус · Проведено · Напечатано · Отправлено ·
  // Владелец-сотрудник · Владелец-отдел · Общий доступ · Когда изменен ·
  // Кто изменил. NO «Сумма» field (removed — was our extra). «Кто изменил»
  // DEFERRED — Enter has no updatedById column (needs a schema migration).
  // Enter has NO Контрагент / Договор / Счёт* — ad-hoc stock entry (no
  // counterparty), so those are intentionally absent.
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
        setStateFilter(null);
        setProducts([]);
        setOrganizations([]);
        onResetCursor();
      }}
      pills={
        <SavedFiltersPills
          entity="enter"
          currentQueryString={savedFilterQuery}
          onApply={applySavedFilter}
          adding={saveFilterOpen}
          onAddingChange={setSaveFilterOpen}
        />
      }
      testId="enters-inline-filter"
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
      {/* 2. Товар или группа — moysklad multi-select checkbox dropdown (mirror PO).
          Type to filter, tick several; selected render as inline chips. */}
      <InlineFilterPanel.Field label={tPO('filter_product')} expandable>
        <MultiCombobox
          value={products.map((x) => x.id)}
          items={products.map((x) => ({ value: x.id, label: x.label }))}
          onSearch={async (q) => {
            const items = await fetchProducts(q);
            return items.map((x) => ({
              value: x.id,
              label: String(x.primary),
              sublabel: x.secondary != null ? String(x.secondary) : undefined,
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
          ariaLabel={tPO('filter_product')}
        />
      </InlineFilterPanel.Field>
      {/* 3. Склад */}
      <InlineFilterPanel.Field label={tFields('store')} expandable>
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
          inlineFetcher={fetchStores}
          onInlineSelect={(item) => {
            setFilterValues({
              ...filterValues,
              storeId: item.id,
              storeLabel: String(item.primary),
            });
            onResetCursor();
          }}
          onPick={() => setPickerOpen('store')}
          onClear={() => {
            setFilterValues({ ...filterValues, storeId: undefined, storeLabel: undefined });
            onResetCursor();
          }}
          testId="filter-store"
        />
      </InlineFilterPanel.Field>
      {/* 4. Проект */}
      <InlineFilterPanel.Field label={tPO('filter_project')} expandable>
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
          inlineFetcher={fetchProjects}
          onInlineSelect={(item) => {
            setFilterValues({
              ...filterValues,
              projectId: item.id,
              projectLabel: String(item.primary),
            });
            onResetCursor();
          }}
          onPick={() => setPickerOpen('project')}
          onClear={() => {
            setFilterValues({ ...filterValues, projectId: undefined, projectLabel: undefined });
            onResetCursor();
          }}
          testId="filter-project"
        />
      </InlineFilterPanel.Field>
      {/* 5. Организация — moysklad-parity inline multi-select checkbox dropdown
          (was a single-select modal). Type to filter, tick several; selected
          render as inline chips. Mirrors the PO reference. */}
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
          ariaLabel={tFields('organization')}
        />
      </InlineFilterPanel.Field>
      {/* 6. Статус */}
      <InlineFilterPanel.Field label={tPO('filter_status_multi')} expandable>
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
      {/* 6. Проведено — boolean Да/Нет: moysklad shows NO «●» bullet (only
          value/date/status filters get the bullet). */}
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
      {/* 7. Напечатано — boolean: no «●» bullet (moysklad parity). */}
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
      {/* 8. Отправлено — boolean: no «●» bullet (moysklad parity). */}
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
      {/* 9. Владелец-сотрудник */}
      <InlineFilterPanel.Field label={tPO('filter_owner_employee')} expandable>
        <CatalogPickerField
          value={
            filterValues.ownerId
              ? { id: filterValues.ownerId, label: filterValues.ownerLabel ?? filterValues.ownerId }
              : null
          }
          placeholder=""
          inlineFetcher={fetchEmployees}
          onInlineSelect={(item) => {
            setFilterValues({
              ...filterValues,
              ownerId: item.id,
              ownerLabel: String(item.primary),
            });
            onResetCursor();
          }}
          onPick={() => setPickerOpen('owner')}
          onClear={() => {
            setFilterValues({ ...filterValues, ownerId: undefined, ownerLabel: undefined });
            onResetCursor();
          }}
          testId="filter-owner"
        />
      </InlineFilterPanel.Field>
      {/* 10. Владелец-отдел */}
      <InlineFilterPanel.Field label={tPO('filter_owner_group')} expandable>
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
          inlineFetcher={fetchGroups}
          onInlineSelect={(item) => {
            setFilterValues({
              ...filterValues,
              groupId: item.id,
              groupLabel: String(item.primary),
            });
            onResetCursor();
          }}
          onPick={() => setPickerOpen('group')}
          onClear={() => {
            setFilterValues({ ...filterValues, groupId: undefined, groupLabel: undefined });
            onResetCursor();
          }}
          testId="filter-group"
        />
      </InlineFilterPanel.Field>
      {/* 12. Общий доступ — boolean Да/Нет: no «●» bullet (moysklad parity). */}
      <InlineFilterPanel.Field label={tFilters('shared')} expandable={false}>
        <YesNoSelect
          value={filterValues.shared}
          onChange={(v) => {
            setFilterValues({ ...filterValues, shared: v });
            onResetCursor();
          }}
          testId="filter-shared"
        />
      </InlineFilterPanel.Field>
      {/* 13. Когда изменен */}
      <InlineFilterPanel.Field
        label={`${tPO('filter_updated_period')}:`}
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
      {/* 14. Кто изменил — Enter.modifiedById (mirror moves). */}
      <InlineFilterPanel.Field label={tPO('filter_modified_by')} expandable>
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
          inlineFetcher={fetchEmployees}
          onInlineSelect={(item) => {
            setFilterValues({
              ...filterValues,
              modifiedById: item.id,
              modifiedByLabel: String(item.primary),
            });
            onResetCursor();
          }}
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
        testId="enters-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        onHelp={() => window.open('/help/enters', '_blank')}
        selectionCount={bulk.selectedIds.size}
        createHref="/enters/new"
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
        rowTestId={(r) => `enter-row-${r.id}`}
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
            <EnterBulkActionsDropdown
              selectedIds={bulk.selectedIds}
              listQueryKey={listQueryKey}
              onClearSelection={bulk.clearSelection}
              postedCount={postedCount}
              onMassEdit={() => {
                stashBulkEdit({
                  entity: 'enters',
                  ids:
                    bulk.selectedIds.size > 0
                      ? Array.from(bulk.selectedIds)
                      : (data?.items ?? []).map((r) => r.id),
                  from: '/enters',
                });
                router.push('/bulk-edit');
              }}
            />
            <EnterPrintDropdown
              selectedIds={bulk.selectedIds}
              onExportList={handleListExport}
              canPrintEnter={bulk.selectedIds.size > 0}
              onPrintEnter={() => bulk.bulkPrint.mutateAsync(Array.from(bulk.selectedIds))}
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
        footerRow={footerRow}
      />

      <CatalogPicker
        open={pickerOpen === 'store'}
        onClose={() => setPickerOpen(null)}
        title={tFields('store')}
        fetcher={fetchStores}
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
        title={tPO('filter_project')}
        fetcher={fetchProjects}
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
        open={pickerOpen === 'owner'}
        onClose={() => setPickerOpen(null)}
        title={tPO('filter_owner_employee')}
        fetcher={fetchEmployees}
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
        title={tPO('filter_owner_group')}
        fetcher={fetchGroups}
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
        open={pickerOpen === 'modifiedBy'}
        onClose={() => setPickerOpen(null)}
        title={tPO('filter_modified_by')}
        fetcher={fetchEmployees}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            modifiedById: item.id,
            modifiedByLabel: String(item.primary),
          });
          onResetCursor();
        }}
      />
      {/* «Массовое редактирование» pickers + modal (mirrors moves). */}
      <CatalogPicker
        open={pickerOpen === 'massEditOwner'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('owner_employee')}
        fetcher={fetchEmployees}
        onSelect={(item) => setMassEditOwner({ id: item.id, label: String(item.primary) })}
      />
      <CatalogPicker
        open={pickerOpen === 'massEditProject'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('project')}
        fetcher={fetchProjects}
        onSelect={(item) => setMassEditProject({ id: item.id, label: String(item.primary) })}
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
