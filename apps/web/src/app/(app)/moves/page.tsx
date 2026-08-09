'use client';

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { YesNoSelect } from '@/components/filters/filter-fields';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { MoveBulkActionsDropdown } from '@/components/moves/bulk-actions-dropdown';
import { MovePrintDropdown } from '@/components/moves/print-dropdown';
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

interface MoveRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  // moysklad list grid (climart, live-grounded 2026-06-19) shows
  // «Отправлено»/«Напечатано» as filled pills and «Комментарий» as text —
  // BE list() returns these Move scalars already (include-only, no select).
  printed: boolean;
  published: boolean;
  description: string | null;
  sumMinor: string;
  currency: string;
  moment: string;
  organization: { id: string; name: string };
  sourceStore: { id: string; name: string };
  destinationStore: { id: string; name: string };
  owner: { id: string; name: string } | null;
  _count: { positions: number };
}

interface ListResponse {
  items: MoveRow[];
  nextCursor?: string;
  total: number;
}

// Moysklad parity — 100 rows per page.
const LIMIT = 100;

type MoveStateKey = 'draft' | 'posted' | 'cancelled';

/** «Статус» single-select — Move's FSM has exactly 3 states (draft /
 *  posted / cancelled); moysklad surfaces it as a plain dropdown (no
 *  multi-tag picker, mirrors supplies). */
function StateSelect({
  value,
  onChange,
  labeler,
  testId,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  labeler: (s: MoveStateKey) => string;
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
 * Move-specific extension fields stored alongside the shared
 * FilterDrawerValues shape. Local to this page (the shared
 * `useMoyskladDocFilter` hook is intentionally NOT used here — Moves
 * mirrors the supplies / invoices-in inline-field gold standard).
 *
 * NOTE: Move is an internal warehouse transfer with NO counterparty —
 * deliberately omits agentId / agentAccountId / contractId /
 * organizationAccountId / salesChannelId. Adds BOTH source and
 * destination store pickers (moysklad «Откуда» + «Куда»).
 */
type ExtraFilterFields = {
  applicable?: 'true' | 'false';
  printed?: 'true' | 'false';
  published?: 'true' | 'false';
  ownerId?: string;
  ownerLabel?: string;
  updatedFrom?: string;
  updatedTo?: string;
  // Move has two stores — the shared FilterDrawerValues only carries one
  // (storeId), so we mount source/destination as locally-typed fields.
  sourceStoreId?: string;
  sourceStoreLabel?: string;
  destinationStoreId?: string;
  destinationStoreLabel?: string;
  groupId?: string;
  groupLabel?: string;
  projectId?: string;
  projectLabel?: string;
  // «Товар или группа» — a product whose presence in the positions filters
  // the list. «Движение по складу» — a store on EITHER leg. «Общий доступ» —
  // the owner-access shared flag. (moysklad #move filter parity.)
  productId?: string;
  productLabel?: string;
  stockStoreId?: string;
  stockStoreLabel?: string;
  shared?: 'true' | 'false';
  // «Кто изменил» — last editor (Move.modifiedById).
  modifiedById?: string;
  modifiedByLabel?: string;
};

/** Multi-select reference field — moysklad checkbox-dropdown holds {id,label}[]. */
type RefMulti = { id: string; label: string };

export default function MovesPage() {
  const t = useTranslations('pages.moves');
  const tPO = useTranslations('pages.purchase_orders');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tMass = useTranslations('mass_edit_modal');
  const tStates = useTranslations('states.move');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [filterValues, setFilterValues] = useState<FilterDrawerValues & ExtraFilterFields>({});
  // «Организация» — moysklad-parity inline multi-select checkbox dropdown
  // (MultiCombobox), replacing the single-select catalog modal. Holds the
  // picked {id,label} pairs; on the wire they go out as `organizationIds` CSV.
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);
  const [filterOpen, setFilterOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState<
    | null
    | 'sourceStore'
    | 'destinationStore'
    | 'stockStore'
    | 'product'
    | 'owner'
    | 'group'
    | 'project'
    | 'modifiedBy'
    | 'massEditOwner'
    | 'massEditProject'
  >(null);
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // 🔖 «Закладки» (saved filters) + ⚙ field-visibility — moysklad's two round
  // buttons next to «Очистить» (both were dead placeholders; owner report
  // 2026-07-14 band 1). Mirrors picking-waves (b2f7d774).
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  // Semantics: the stored key set = HIDDEN filter fields (default empty ⇒ all shown).
  const filterHidden = useColumnVisibility('moves-filter-hidden', []);
  // Serialize the ENTIRE current filter state (ids + labels, so a restored
  // bookmark shows proper pill labels, not bare ids).
  const savedFilterQuery = (() => {
    const p = new URLSearchParams();
    const put = (k: string, v: string | undefined) => {
      if (v) p.set(k, v);
    };
    put('momentFrom', filterValues.momentFrom);
    put('momentTo', filterValues.momentTo);
    put('updatedFrom', filterValues.updatedFrom);
    put('updatedTo', filterValues.updatedTo);
    put('state', stateFilter ?? undefined);
    put('applicable', filterValues.applicable);
    put('printed', filterValues.printed);
    put('published', filterValues.published);
    put('shared', filterValues.shared);
    for (const [idKey, labelKey] of [
      ['productId', 'productLabel'],
      ['sourceStoreId', 'sourceStoreLabel'],
      ['destinationStoreId', 'destinationStoreLabel'],
      ['stockStoreId', 'stockStoreLabel'],
      ['projectId', 'projectLabel'],
      ['ownerId', 'ownerLabel'],
      ['groupId', 'groupLabel'],
      ['modifiedById', 'modifiedByLabel'],
    ] as const) {
      put(idKey, filterValues[idKey]);
      put(labelKey, filterValues[labelKey]);
    }
    if (organizations.length) p.set('orgs', JSON.stringify(organizations));
    return p.toString();
  })();
  const applySavedFilter = (qs: string) => {
    const p = new URLSearchParams(qs);
    const g = (k: string) => p.get(k) ?? undefined;
    let orgs: RefMulti[] = [];
    try {
      const parsed: unknown = JSON.parse(p.get('orgs') ?? '[]');
      if (Array.isArray(parsed)) orgs = parsed as RefMulti[];
    } catch {
      orgs = [];
    }
    setOrganizations(orgs);
    setStateFilter(g('state') ?? null);
    setFilterValues({
      momentFrom: g('momentFrom'),
      momentTo: g('momentTo'),
      updatedFrom: g('updatedFrom'),
      updatedTo: g('updatedTo'),
      applicable: g('applicable') as ExtraFilterFields['applicable'],
      printed: g('printed') as ExtraFilterFields['printed'],
      published: g('published') as ExtraFilterFields['published'],
      shared: g('shared') as ExtraFilterFields['shared'],
      productId: g('productId'),
      productLabel: g('productLabel'),
      sourceStoreId: g('sourceStoreId'),
      sourceStoreLabel: g('sourceStoreLabel'),
      destinationStoreId: g('destinationStoreId'),
      destinationStoreLabel: g('destinationStoreLabel'),
      stockStoreId: g('stockStoreId'),
      stockStoreLabel: g('stockStoreLabel'),
      projectId: g('projectId'),
      projectLabel: g('projectLabel'),
      ownerId: g('ownerId'),
      ownerLabel: g('ownerLabel'),
      groupId: g('groupId'),
      groupLabel: g('groupLabel'),
      modifiedById: g('modifiedById'),
      modifiedByLabel: g('modifiedByLabel'),
    });
    onResetCursor();
  };

  // «Массовое редактирование» (Ommaviy tahrirlash) modal state — mirrors
  // supplies. The shared MassEditModal patches ownerId / projectId /
  // description across the selected moves via bulk.massEdit → POST /moves/mass-edit.
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
    ...(filterValues.productId ? { productId: filterValues.productId } : {}),
    ...(filterValues.sourceStoreId ? { sourceStoreId: filterValues.sourceStoreId } : {}),
    ...(filterValues.destinationStoreId
      ? { destinationStoreId: filterValues.destinationStoreId }
      : {}),
    ...(filterValues.stockStoreId ? { stockStoreId: filterValues.stockStoreId } : {}),
    ...(filterValues.ownerId ? { ownerId: filterValues.ownerId } : {}),
    ...(filterValues.groupId ? { groupId: filterValues.groupId } : {}),
    ...(filterValues.projectId ? { projectId: filterValues.projectId } : {}),
    ...(filterValues.shared ? { shared: filterValues.shared } : {}),
    ...(filterValues.applicable ? { applicable: filterValues.applicable } : {}),
    ...(filterValues.printed ? { printed: filterValues.printed } : {}),
    ...(filterValues.published ? { published: filterValues.published } : {}),
    ...(filterValues.updatedFrom ? { updatedFrom: filterValues.updatedFrom } : {}),
    ...(filterValues.updatedTo ? { updatedTo: filterValues.updatedTo } : {}),
    ...(filterValues.modifiedById ? { modifiedById: filterValues.modifiedById } : {}),
  });

  const listQueryKey = [
    'moves',
    search,
    stateFilter,
    cursor,
    sortKey,
    sortDir,
    params.toString(),
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/moves?${params.toString()}`),
  });

  // moysklad «Итого» — the grand total over the ENTIRE active filter set (all
  // pages), shown pinned in the footer. The aggregate endpoint reuses the same
  // buildListWhere as list(), so it always reflects ALL matching moves — not
  // just the current page's 100 rows.
  const { data: totals } = useQuery<{
    count: number;
    sumMinor: string;
    // Distinct currencies in the filtered set; >1 → footer shows «—».
    currencies: string[];
  }>({
    queryKey: ['moves-totals', params.toString()],
    queryFn: () => api.get(`/moves/aggregate/totals?${params.toString()}`),
    staleTime: 30_000,
  });

  const bulk = useBulkDocumentActions('moves', listQueryKey, { hasFSM: true });

  // moysklad pinned footer «Итого» — the all-pages grand total rendered under
  // the «Сумма» column. «…» while loading, «—» if the filtered set mixes
  // currencies (moves default to UZS but the model allows others), else the
  // exact single-currency total.
  const footerRow: Record<string, string> = footerMoneyCells(totals, {
    sum: totals?.sumMinor ?? '0',
  });

  // postedCount gates the Provedeno/Snyat-provedenie items in the toolbar
  // dropdown (mirrors moysklad's gwt-MenuItem-disabled behaviour).
  const postedCount = useMemo(() => {
    if (!data?.items?.length) return 0;
    let n = 0;
    for (const m of data.items) {
      if (bulk.selectedIds.has(m.id) && m.state === 'posted') n++;
    }
    return n;
  }, [data?.items, bulk.selectedIds]);

  // Programmatic CSV export — reused by MovePrintDropdown's "Список перемещений".
  const handleListExport = () => {
    const items = data?.items ?? [];
    const active = columns
      .filter((c) => cols.visibleKeys.has(c.key))
      .filter((c) => typeof c.cellText === 'function');
    if (active.length === 0 || items.length === 0) return;
    const csvCols: CsvColumn<MoveRow>[] = active.map((c) => ({
      header: c.headerText ?? (typeof c.header === 'string' ? c.header : c.key),
      // biome-ignore lint/style/noNonNullAssertion: filtered above
      cellText: c.cellText!,
    }));
    const csv = buildCsv(csvCols, items);
    downloadCsv(`moves_${csvTimestamp()}.csv`, csv);
  };

  // moysklad parity — live-grounded on online.moysklad.uz #move (climart,
  // 2026-06-19): the default grid is № · Время · Со склада · На склад ·
  // Организация · Сумма · Валюта · Отправлено · Напечатано · Комментарий.
  // `state` (Статус) and `positions` stay available via the ⚙ gear but off
  // by default — moysklad surfaces status only via Фильтр on warehouse docs.
  // (The prior all/draft/posted/cancelled defaults were a status-tab
  // copy-paste artifact — no matching column, so they were no-ops.)
  const cols = useColumnVisibility('moves', [
    'name',
    'moment',
    'source_store',
    'destination_store',
    'organization',
    'sum',
    'currency',
    'published',
    'printed',
    'description',
  ]);
  const colWidths = useColumnWidths('moves');

  // moysklad's "Перемещения" list has no status pill sub-tabs (shared
  // GWT list chrome). Status filtering is the "Статус" select inside the
  // inline filter panel below.

  const columns: DataTableColumn<MoveRow>[] = [
    {
      key: 'name',
      header: tFields('number'),
      width: '140px',
      sortable: true,
      cell: (r) => (
        <a
          href={`/moves/${r.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {r.name}
        </a>
      ),
      cellText: (r: MoveRow) => r.name,
    },
    {
      key: 'moment',
      header: tFields('time'),
      width: '120px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(r.moment)}</span>
      ),
      cellText: (r: MoveRow) => formatDate(r.moment),
    },
    {
      key: 'source_store',
      sortField: 'sourceStore',
      header: tFields('store_from'),
      sortable: true,
      cell: (r) => <span className="text-sm">{r.sourceStore.name}</span>,
    },
    {
      key: 'destination_store',
      sortField: 'destinationStore',
      header: tFields('store_to'),
      sortable: true,
      cell: (r) => <span className="text-sm">{r.destinationStore.name}</span>,
    },
    // moysklad parity (E1 audit, 2026-05-23): «Организация» is a default
    // column on #move. MoveRow already carries it.
    {
      key: 'organization',
      header: tFields('organization'),
      width: '180px',
      sortable: true,
      cell: (r) => (
        <span className="max-w-[180px] truncate text-sm">{r.organization?.name ?? '—'}</span>
      ),
      cellText: (r: MoveRow) => r.organization?.name ?? '',
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
      cellText: (r: MoveRow) => (r.sumMinor ? formatMoney(r.sumMinor, r.currency) : ''),
    },
    {
      // moysklad shows «Валюта» as a separate column right after «Сумма» —
      // lowercase «сум» (not «UZS»). Mirrors the customer-orders list.
      key: 'currency',
      header: tFields('currency'),
      width: '70px',
      align: 'center',
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs">
          {r.currency === 'UZS' ? 'сум' : r.currency}
        </span>
      ),
      cellText: (r: MoveRow) => r.currency,
    },
    {
      // moysklad renders a blue filled pill «Отправлен» when sent, empty
      // cell otherwise (NOT a ✓ icon). Mirrors the customer-orders list.
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
      cellText: (r: MoveRow) => (r.published ? tFields('published_badge') : ''),
    },
    {
      // moysklad renders a blue filled pill «Напечатан» when printed, empty
      // cell otherwise. Mirrors the customer-orders list.
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
      cellText: (r: MoveRow) => (r.printed ? tFields('printed_badge') : ''),
    },
    {
      key: 'description',
      header: tFields('description'),
      cell: (r) => (
        <span className="max-w-[200px] truncate text-[var(--ms-text-muted)] text-[11px]">
          {r.description ?? ''}
        </span>
      ),
      cellText: (r: MoveRow) => r.description ?? '',
    },
    // ⚙ gear-only extras (off by default — moysklad surfaces neither in the
    // default grid; Статус lives in Фильтр, positions-count is our addition).
    {
      key: 'state',
      header: tFields('state'),
      width: '150px',
      cell: (r) => (
        <Badge tone={documentStateTone(r.state)}>{tStates(r.state as MoveStateKey)}</Badge>
      ),
      cellText: (r: MoveRow) => r.state,
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
      cellText: (r: MoveRow) => String(r._count?.positions ?? ''),
    },
  ];

  const hasFilter =
    !!search ||
    !!stateFilter ||
    organizations.length > 0 ||
    !!filterValues.productId ||
    !!filterValues.sourceStoreId ||
    !!filterValues.destinationStoreId ||
    !!filterValues.stockStoreId ||
    !!filterValues.ownerId ||
    !!filterValues.groupId ||
    !!filterValues.projectId ||
    !!filterValues.shared ||
    !!filterValues.applicable ||
    !!filterValues.printed ||
    !!filterValues.published ||
    !!filterValues.momentFrom ||
    !!filterValues.momentTo ||
    !!filterValues.updatedFrom ||
    !!filterValues.updatedTo ||
    !!filterValues.modifiedById;

  // moysklad-parity inline filter panel — fields ordered EXACTLY per the live
  // climart #move filter (online.moysklad.uz, re-grounded 2026-06-19):
  // Период · Товар или группа · Со склада · На склад · Движение по складу ·
  // Проект · Организация · Статус · Проведено · Напечатано · Отправлено ·
  // Владелец-сотрудник · Владелец-отдел · Общий доступ · Когда изменен ·
  // Кто изменил. (Move has NO Контрагент / Договор / Счёт — internal transfer.
  // There is NO «Сумма» filter on moysklad's move list — removed.)
  // «Кто изменил» needs a Move.modifiedById column — added in a follow-up.
  const filterPanel = (
    <InlineFilterPanel
      hidden={!filterOpen}
      applyLabel={tFilters('find')}
      clearLabel={tFilters('clear')}
      onClear={() => {
        setFilterValues({});
        setOrganizations([]);
        setStateFilter(null);
        onResetCursor();
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
          entity="move"
          currentQueryString={savedFilterQuery}
          onApply={applySavedFilter}
          adding={saveFilterOpen}
          onAddingChange={setSaveFilterOpen}
        />
      }
      testId="moves-inline-filter"
    >
      {/* 1. Период */}
      <InlineFilterPanel.Field
        label={`${tFilters('period')}:`}
        fieldKey="period"
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
      {/* 2. Товар или группа */}
      <InlineFilterPanel.Field label={tPO('filter_product')} fieldKey="product" expandable>
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
      {/* 3. Со склада (sourceStore) */}
      <InlineFilterPanel.Field label={tFields('store_from')} fieldKey="sourceStore" expandable>
        <CatalogPickerField
          value={
            filterValues.sourceStoreId
              ? {
                  id: filterValues.sourceStoreId,
                  label: filterValues.sourceStoreLabel ?? filterValues.sourceStoreId,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('sourceStore')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              sourceStoreId: undefined,
              sourceStoreLabel: undefined,
            });
            onResetCursor();
          }}
          testId="filter-source-store"
        />
      </InlineFilterPanel.Field>
      {/* 4. На склад (destinationStore) */}
      <InlineFilterPanel.Field label={tFields('store_to')} fieldKey="destinationStore" expandable>
        <CatalogPickerField
          value={
            filterValues.destinationStoreId
              ? {
                  id: filterValues.destinationStoreId,
                  label: filterValues.destinationStoreLabel ?? filterValues.destinationStoreId,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('destinationStore')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              destinationStoreId: undefined,
              destinationStoreLabel: undefined,
            });
            onResetCursor();
          }}
          testId="filter-destination-store"
        />
      </InlineFilterPanel.Field>
      {/* 5. Движение по складу (source OR destination) */}
      <InlineFilterPanel.Field
        label={tPO('filter_stock_movement')}
        fieldKey="stockStore"
        expandable
      >
        <CatalogPickerField
          value={
            filterValues.stockStoreId
              ? {
                  id: filterValues.stockStoreId,
                  label: filterValues.stockStoreLabel ?? filterValues.stockStoreId,
                }
              : null
          }
          placeholder=""
          onPick={() => setPickerOpen('stockStore')}
          onClear={() => {
            setFilterValues({
              ...filterValues,
              stockStoreId: undefined,
              stockStoreLabel: undefined,
            });
            onResetCursor();
          }}
          testId="filter-stock-store"
        />
      </InlineFilterPanel.Field>
      {/* 6. Проект */}
      <InlineFilterPanel.Field label={tPO('filter_project')} fieldKey="project" expandable>
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
      {/* 7. Организация — moysklad-parity inline multi-select checkbox dropdown
          (was a single-select modal). */}
      <InlineFilterPanel.Field label={tFields('organization')} fieldKey="organization" expandable>
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
      {/* 8. Статус */}
      <InlineFilterPanel.Field label={tPO('filter_status_multi')} fieldKey="state" expandable>
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
      {/* 9. Проведено */}
      <InlineFilterPanel.Field label={tFields('applicable')} fieldKey="applicable" expandable>
        <YesNoSelect
          value={filterValues.applicable}
          onChange={(v) => {
            setFilterValues({ ...filterValues, applicable: v });
            onResetCursor();
          }}
          testId="filter-applicable"
        />
      </InlineFilterPanel.Field>
      {/* 10. Напечатано */}
      <InlineFilterPanel.Field label={tFields('printed')} fieldKey="printed" expandable>
        <YesNoSelect
          value={filterValues.printed}
          onChange={(v) => {
            setFilterValues({ ...filterValues, printed: v });
            onResetCursor();
          }}
          testId="filter-printed"
        />
      </InlineFilterPanel.Field>
      {/* 11. Отправлено */}
      <InlineFilterPanel.Field label={tFields('published')} fieldKey="published" expandable>
        <YesNoSelect
          value={filterValues.published}
          onChange={(v) => {
            setFilterValues({ ...filterValues, published: v });
            onResetCursor();
          }}
          testId="filter-published"
        />
      </InlineFilterPanel.Field>
      {/* 12. Владелец-сотрудник */}
      <InlineFilterPanel.Field label={tPO('filter_owner_employee')} fieldKey="owner" expandable>
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
      {/* 13. Владелец-отдел */}
      <InlineFilterPanel.Field label={tPO('filter_owner_group')} fieldKey="group" expandable>
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
      {/* 14. Общий доступ */}
      <InlineFilterPanel.Field label={tPO('filter_shared')} fieldKey="shared" expandable>
        <YesNoSelect
          value={filterValues.shared}
          onChange={(v) => {
            setFilterValues({ ...filterValues, shared: v });
            onResetCursor();
          }}
          testId="filter-shared"
        />
      </InlineFilterPanel.Field>
      {/* 15. Когда изменен */}
      <InlineFilterPanel.Field
        label={`${tPO('filter_updated_period')}:`}
        fieldKey="updated"
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
      {/* 16. Кто изменил */}
      <InlineFilterPanel.Field label={tPO('filter_modified_by')} fieldKey="modifiedBy" expandable>
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
        testId="moves-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        onHelp={() => window.open('/help/moves', '_blank')}
        selectionCount={bulk.selectedIds.size}
        createHref="/moves/new"
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
        rowTestId={(r) => `move-row-${r.id}`}
        rowActions={(r) => bulk.rowDelete(r.id)}
        // moysklad de-emphasises non-posted (draft) rows in grey + italic.
        rowClassName={(r) =>
          r.state === 'draft'
            ? 'italic text-[var(--ms-text-muted)] [&_a]:text-[var(--ms-text-muted)]'
            : undefined
        }
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
            <MoveBulkActionsDropdown
              selectedIds={bulk.selectedIds}
              listQueryKey={listQueryKey}
              onClearSelection={bulk.clearSelection}
              postedCount={postedCount}
              onMassEdit={() => {
                stashBulkEdit({
                  entity: 'moves',
                  ids:
                    bulk.selectedIds.size > 0
                      ? Array.from(bulk.selectedIds)
                      : (data?.items ?? []).map((r) => r.id),
                  from: '/moves',
                });
                router.push('/bulk-edit');
              }}
            />
            <MovePrintDropdown onExportList={handleListExport} selectedIds={bulk.selectedIds} />
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
        open={pickerOpen === 'product'}
        onClose={() => setPickerOpen(null)}
        title={tPO('filter_product')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string; code?: string }[] }>(
            `/products?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name, secondary: x.code }));
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
        open={pickerOpen === 'sourceStore'}
        onClose={() => setPickerOpen(null)}
        title={tFields('store_from')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/stores?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            sourceStoreId: item.id,
            sourceStoreLabel: String(item.primary),
          });
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'destinationStore'}
        onClose={() => setPickerOpen(null)}
        title={tFields('store_to')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/stores?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            destinationStoreId: item.id,
            destinationStoreLabel: String(item.primary),
          });
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'stockStore'}
        onClose={() => setPickerOpen(null)}
        title={tPO('filter_stock_movement')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/stores?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFilterValues({
            ...filterValues,
            stockStoreId: item.id,
            stockStoreLabel: String(item.primary),
          });
          onResetCursor();
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'project'}
        onClose={() => setPickerOpen(null)}
        title={tPO('filter_project')}
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
        open={pickerOpen === 'owner'}
        onClose={() => setPickerOpen(null)}
        title={tPO('filter_owner_employee')}
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
        open={pickerOpen === 'modifiedBy'}
        onClose={() => setPickerOpen(null)}
        title={tPO('filter_modified_by')}
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
        open={pickerOpen === 'group'}
        onClose={() => setPickerOpen(null)}
        title={tPO('filter_owner_group')}
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
      {/* «Массовое редактирование» pickers + modal (mirrors supplies). */}
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
        onSelect={(item) => setMassEditOwner({ id: item.id, label: String(item.primary) })}
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
