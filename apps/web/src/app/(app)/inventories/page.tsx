'use client';

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { YesNoSelect } from '@/components/filters/filter-fields';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { InventoryBulkActionsDropdown } from '@/components/inventories/bulk-actions-dropdown';
import { InventoryPrintDropdown } from '@/components/inventories/print-dropdown';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { documentStateTone } from '@/lib/document-state-tone';
import {
  Badge,
  Button,
  CatalogPicker,
  CatalogPickerField,
  type CsvColumn,
  type DataTableColumn,
  type FilterDrawerValues,
  InlineFilterPanel,
  ListView,
  Modal,
  MoneyInput,
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
import { useState } from 'react';

interface InventoryRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  moment: string;
  organization: { id: string; name: string };
  store: { id: string; name: string };
  owner: { id: string; name: string } | null;
  _count: { positions: number };
}

interface ListResponse {
  items: InventoryRow[];
  nextCursor?: string;
  total: number;
}

// Moysklad parity — 100 rows per page.
const LIMIT = 100;

type InventoryStateKey = 'draft' | 'posted' | 'cancelled';

/** «Статус» single-select — Inventory's FSM has exactly 3 states (draft /
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
  labeler: (s: InventoryStateKey) => string;
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
 * Inventory-specific extension fields stored alongside the shared
 * FilterDrawerValues shape. Local to this page (the shared
 * `useMoyskladDocFilter` hook is intentionally NOT used here —
 * Inventories mirrors the moves / supplies inline-field gold standard).
 *
 * NOTE: Inventory is a physical recount with NO counterparty —
 * deliberately omits agentId / agentAccountId / contractId /
 * organizationAccountId / salesChannelId.
 */
type ExtraFilterFields = {
  applicable?: 'true' | 'false';
  printed?: 'true' | 'false';
  published?: 'true' | 'false';
  ownerId?: string;
  ownerLabel?: string;
  updatedFrom?: string;
  updatedTo?: string;
  groupId?: string;
  groupLabel?: string;
  projectId?: string;
  projectLabel?: string;
};

/** Multi-select reference field — moysklad checkbox-dropdown holds {id,label}[]. */
type RefMulti = { id: string; label: string };

export default function InventoriesPage() {
  const router = useRouter();
  const t = useTranslations('pages.inventories');
  const tPO = useTranslations('pages.purchase_orders');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tStates = useTranslations('states.inventory');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [filterValues, setFilterValues] = useState<FilterDrawerValues & ExtraFilterFields>({});
  // «Организация» — moysklad-parity inline multi-select checkbox dropdown
  // (MultiCombobox), was a single-select modal. Holds the picked {id,label}
  // pairs; on the wire it goes out as `organizationIds` CSV.
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);
  const [filterOpen, setFilterOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState<null | 'store' | 'owner' | 'group' | 'project'>(
    null,
  );
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const onResetCursor = () => setCursor(undefined);

  // 🔖 «Закладки» (saved filters) + ⚙ field-visibility — moysklad's two round
  // buttons next to «Очистить» (both were dead placeholders; owner report
  // 2026-07-14 band 1). Mirrors moves (b91610e1) / picking-waves (b2f7d774).
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  // Semantics: the stored key set = HIDDEN filter fields (default empty ⇒ all shown).
  const filterHidden = useColumnVisibility('inventories-filter-hidden', []);
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
    if (filterValues.sumMinorFrom !== undefined)
      p.set('sumMinorFrom', String(filterValues.sumMinorFrom));
    if (filterValues.sumMinorTo !== undefined) p.set('sumMinorTo', String(filterValues.sumMinorTo));
    for (const [idKey, labelKey] of [
      ['storeId', 'storeLabel'],
      ['projectId', 'projectLabel'],
      ['ownerId', 'ownerLabel'],
      ['groupId', 'groupLabel'],
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
      sumMinorFrom: g('sumMinorFrom') !== undefined ? Number(g('sumMinorFrom')) : undefined,
      sumMinorTo: g('sumMinorTo') !== undefined ? Number(g('sumMinorTo')) : undefined,
      storeId: g('storeId'),
      storeLabel: g('storeLabel'),
      projectId: g('projectId'),
      projectLabel: g('projectLabel'),
      ownerId: g('ownerId'),
      ownerLabel: g('ownerLabel'),
      groupId: g('groupId'),
      groupLabel: g('groupLabel'),
    });
    onResetCursor();
  };

  // «+ Инвентаризация» → «Выберите склад для инвентаризации» modal (band 2.1,
  // user screenshot №4): pick the warehouse FIRST, then the editor opens with
  // «Склад» prefilled + locked (?warehouseId=…).
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [storeModalPick, setStoreModalPick] = useState<string | null>(null);
  const { data: storeModalData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['stores', 'inventory-create-modal'],
    queryFn: () => api.get('/stores?limit=100'),
    enabled: storeModalOpen,
  });

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
    ...(organizations.length ? { organizationIds: organizations.map((x) => x.id).join(',') } : {}),
    ...(filterValues.storeId ? { storeId: filterValues.storeId } : {}),
    ...(filterValues.ownerId ? { ownerId: filterValues.ownerId } : {}),
    ...(filterValues.groupId ? { groupId: filterValues.groupId } : {}),
    ...(filterValues.projectId ? { projectId: filterValues.projectId } : {}),
    ...(filterValues.applicable ? { applicable: filterValues.applicable } : {}),
    ...(filterValues.printed ? { printed: filterValues.printed } : {}),
    ...(filterValues.published ? { published: filterValues.published } : {}),
    ...(filterValues.updatedFrom ? { updatedFrom: filterValues.updatedFrom } : {}),
    ...(filterValues.updatedTo ? { updatedTo: filterValues.updatedTo } : {}),
  });

  const listQueryKey = [
    'inventories',
    search,
    stateFilter,
    cursor,
    sortKey,
    sortDir,
    params.toString(),
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/inventories?${params.toString()}`),
  });

  const bulk = useBulkDocumentActions('inventories', listQueryKey, {
    hasFSM: true,
    transitionTargets: ['post', 'cancel'] as const,
  });

  const handleListExport = () => {
    const items = data?.items ?? [];
    const active = columns
      .filter((c) => cols.visibleKeys.has(c.key))
      .filter((c) => typeof c.cellText === 'function');
    if (active.length === 0 || items.length === 0) return;
    const csvCols: CsvColumn<InventoryRow>[] = active.map((c) => ({
      header: c.headerText ?? (typeof c.header === 'string' ? c.header : c.key),
      // biome-ignore lint/style/noNonNullAssertion: filtered above
      cellText: c.cellText!,
    }));
    const csv = buildCsv(csvCols, items);
    downloadCsv(`inventories_${csvTimestamp()}.csv`, csv);
  };

  // moysklad parity (E4 audit, 2026-05-21): state removed from defaults
  // (status surfaces via Фильтр).
  const cols = useColumnVisibility('inventories', [
    'all',
    'draft',
    'posted',
    'cancelled',
    'name',
    'moment',
    'store',
    'organization',
    'sum',
    'positions',
  ]);
  const colWidths = useColumnWidths('inventories');

  // moysklad's "Инвентаризации" list has no status pill sub-tabs (shared
  // GWT list chrome). Status filtering is the "Статус" select inside the
  // inline filter panel below.

  const columns: DataTableColumn<InventoryRow>[] = [
    {
      key: 'name',
      header: tFields('number'),
      width: '140px',
      sortable: true,
      cell: (r) => (
        <a
          href={`/inventories/${r.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {r.name}
        </a>
      ),
      cellText: (r: InventoryRow) => r.name,
    },
    {
      key: 'moment',
      header: tFields('time'),
      width: '120px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(r.moment)}</span>
      ),
      cellText: (r: InventoryRow) => formatDate(r.moment),
    },
    {
      key: 'store',
      header: tFields('store_from'),
      sortable: true,
      cell: (r) => <span className="text-sm">{r.store.name}</span>,
    },
    {
      key: 'organization',
      header: tFields('organization'),
      width: '180px',
      sortable: true,
      cell: (r) => (
        <span className="max-w-[180px] truncate text-sm">{r.organization?.name ?? '—'}</span>
      ),
      cellText: (r: InventoryRow) => r.organization?.name ?? '',
    },
    {
      key: 'state',
      header: tFields('state'),
      width: '150px',
      cell: (r) => (
        <Badge tone={documentStateTone(r.state)}>{tStates(r.state as InventoryStateKey)}</Badge>
      ),
      cellText: (r: InventoryRow) => r.state,
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
      cellText: (r: InventoryRow) => (r.sumMinor ? formatMoney(r.sumMinor) : ''),
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
      cellText: (r: InventoryRow) => String(r._count?.positions ?? ''),
    },
  ];

  const hasFilter =
    !!search ||
    !!stateFilter ||
    organizations.length > 0 ||
    !!filterValues.storeId ||
    !!filterValues.ownerId ||
    !!filterValues.groupId ||
    !!filterValues.projectId ||
    !!filterValues.applicable ||
    !!filterValues.printed ||
    !!filterValues.published ||
    !!filterValues.momentFrom ||
    !!filterValues.momentTo ||
    !!filterValues.updatedFrom ||
    !!filterValues.updatedTo ||
    filterValues.sumMinorFrom !== undefined ||
    filterValues.sumMinorTo !== undefined;

  // moysklad-parity inline filter panel — fields ordered per the standard
  // warehouse-doc reference filter set (the captured reference DOM at
  // docs/moysklad-reference/visual-captures/06-module/inventory/dom/01-default.html
  // is the marketing landing page, mislabeled per the established
  // adversarial pattern; we fall back to the well-known warehouse-doc
  // filter set enshrined by the E1 moves commit). Order: Период · Склад ·
  // Организация · Проект · Статус · Проведено · Напечатано · Отправлено ·
  // Владелец-сотрудник · Владелец-отдел · Сумма · Когда изменен.
  // «Кто изменил» SKIPPED — Inventory has no updatedById column.
  // Inventory.sumMinor IS backed (schema.prisma:5913), so «Сумма» is
  // INCLUDED. Inventory has NO Контрагент / Договор / Счёт* — it's a
  // physical recount (no counterparty), so those fields are intentionally
  // absent.
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
      pills={
        <SavedFiltersPills
          entity="inventory"
          currentQueryString={savedFilterQuery}
          onApply={applySavedFilter}
          adding={saveFilterOpen}
          onAddingChange={setSaveFilterOpen}
        />
      }
      onClear={() => {
        setFilterValues({});
        setOrganizations([]);
        setStateFilter(null);
        onResetCursor();
      }}
      testId="inventories-inline-filter"
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
      {/* 2. Склад */}
      <InlineFilterPanel.Field label={tFields('store')} fieldKey="store" expandable>
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
          onClear={() => {
            setFilterValues({ ...filterValues, storeId: undefined, storeLabel: undefined });
            onResetCursor();
          }}
          testId="filter-store"
        />
      </InlineFilterPanel.Field>
      {/* 3. Организация — moysklad-parity inline multi-select checkbox dropdown
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
      {/* 4. Проект */}
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
      {/* 5. Статус */}
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
      {/* 6. Проведено */}
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
      {/* 7. Напечатано */}
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
      {/* 8. Отправлено */}
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
      {/* 9. Владелец-сотрудник */}
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
      {/* 10. Владелец-отдел */}
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
      {/* 11. Сумма (range) — backed by Inventory.sumMinor (schema.prisma:5913) */}
      <InlineFilterPanel.Field label={`${tFields('sum')}:`} fieldKey="sum" expandable>
        <div className="flex items-center gap-1">
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
              onResetCursor();
            }}
            data-test-id="filter-sum-from"
            className="h-7 w-full rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 text-[var(--ms-text-primary)] text-sm focus:border-[var(--ms-border-focus)] focus:outline-none"
          />
          <span className="text-[var(--ms-text-muted)]">—</span>
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
              onResetCursor();
            }}
            data-test-id="filter-sum-to"
            className="h-7 w-full rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 text-[var(--ms-text-primary)] text-sm focus:border-[var(--ms-border-focus)] focus:outline-none"
          />
        </div>
      </InlineFilterPanel.Field>
      {/* 12. Когда изменен */}
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
        testId="inventories-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        onHelp={() => window.open('/help/inventories', '_blank')}
        selectionCount={bulk.selectedIds.size}
        // Band 2.1 (user screenshot №4): «+ Инвентаризация» opens the
        // «Выберите склад для инвентаризации» modal instead of navigating.
        onCreate={() => {
          setStoreModalPick(null);
          setStoreModalOpen(true);
        }}
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
        rowTestId={(r) => `inventory-row-${r.id}`}
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
            <InventoryBulkActionsDropdown
              selectedIds={bulk.selectedIds}
              listQueryKey={listQueryKey}
              onClearSelection={bulk.clearSelection}
            />
            <InventoryPrintDropdown
              selectedIds={bulk.selectedIds}
              onExportList={handleListExport}
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

      {/* «Выберите склад для инвентаризации» — band 2.1 (screenshot №4):
          the warehouse list under a «Склады» root; «Выбрать» opens /new with
          the picked warehouse prefilled + locked. */}
      <Modal
        open={storeModalOpen}
        onOpenChange={(open) => {
          setStoreModalOpen(open);
          if (!open) setStoreModalPick(null);
        }}
        title={t('store_modal_title')}
        testId="inventory-store-modal"
        footer={
          <>
            <Button
              type="button"
              variant="success"
              size="sm"
              disabled={!storeModalPick}
              onClick={() => {
                if (!storeModalPick) return;
                setStoreModalOpen(false);
                router.push(`/inventories/new?warehouseId=${storeModalPick}`);
              }}
              data-test-id="inventory-store-modal-choose"
            >
              {t('store_modal_choose')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setStoreModalOpen(false)}
            >
              {t('store_modal_cancel')}
            </Button>
          </>
        }
      >
        <div className="min-h-[280px] px-4 py-3 text-sm">
          <div className="mb-1 text-[var(--ms-text-primary)]">{t('store_modal_root')}</div>
          <ul>
            {(storeModalData?.items ?? []).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setStoreModalPick(s.id)}
                  onDoubleClick={() => {
                    setStoreModalOpen(false);
                    router.push(`/inventories/new?warehouseId=${s.id}`);
                  }}
                  className={`w-full px-6 py-1.5 text-left ${
                    storeModalPick === s.id
                      ? 'bg-[#d5e8f5] text-[var(--ms-text-primary)]'
                      : 'text-[var(--ms-text-brand)] hover:bg-[var(--ms-bg-hover)]'
                  }`}
                  data-test-id={`inventory-store-option-${s.id}`}
                >
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Modal>

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
    </>
  );
}
