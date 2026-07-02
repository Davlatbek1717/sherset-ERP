'use client';

import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
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
  MassEditModal,
  NativeSelect,
  type PickerItem,
  formatDate,
  formatDateOnly,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type WorkOrderState = 'draft' | 'in_progress' | 'completed' | 'cancelled';

interface WorkOrder {
  id: string;
  name: string;
  state: WorkOrderState;
  bomId: string;
  storeId: string;
  plannedQty: string;
  producedQty: string;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  description: string | null;
  bom: { id: string; name: string; product: { id: string; name: string } };
  store: { id: string; name: string };
  owner: { id: string; name: string } | null;
}

interface WorkOrderListResponse {
  items: WorkOrder[];
  nextCursor?: string;
  total: number;
}

const ALL_STATES: WorkOrderState[] = ['draft', 'in_progress', 'completed', 'cancelled'];
const LIMIT = 25;

export default function WorkOrdersPage() {
  const t = useTranslations('pages.work_orders');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [stateFilter, setStateFilter] = useState<WorkOrderState | 'all'>('all');
  const [cursor, setCursor] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<string>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterValues, setFilterValues] = useState<FilterDrawerValues>({});
  const [filterOpen, setFilterOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState<null | 'store' | 'massEditOwner'>(null);

  // mass-edit (Изменить) — WorkOrder patches ownerId + description only
  // (no projectId column, so MassEditModal renders with hideProject).
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [massEditIds, setMassEditIds] = useState<string[]>([]);
  const [massEditOwner, setMassEditOwner] = useState<{ id: string; label: string } | null>(null);

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(stateFilter !== 'all' ? { state: stateFilter } : {}),
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
    ...(filterValues.storeId ? { storeId: filterValues.storeId } : {}),
    ...(filterValues.ownerId ? { ownerId: filterValues.ownerId } : {}),
  });

  const listQueryKey = [
    'work-orders',
    search,
    stateFilter,
    cursor,
    sortKey,
    sortDir,
    filterValues,
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<WorkOrderListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<WorkOrderListResponse>(`/work-orders?${params.toString()}`),
  });

  // Bulk actions: mass-edit + print + delete. FSM transitions are NOT
  // exposed here — the WorkOrder FSM (draft→in_progress→completed→cancelled)
  // doesn't map to the generic post/unpost/cancel verbs, and bulk-complete
  // needs a per-row producedQty the generic bar can't supply. Status changes
  // stay on the detail page; bulk-transition endpoint remains for targeted use.
  const bulk = useBulkDocumentActions('work-orders', listQueryKey, {
    hasFSM: false,
    hasBulkPrint: true,
    onMassEditClick: (ids) => {
      setMassEditIds(ids);
      setMassEditOwner(null);
      setMassEditOpen(true);
    },
  });

  // moysklad's work-order list uses moyskladToolbar + Фильтр panel
  // chrome, not status pill sub-tabs. Status + store filtering is the
  // inline filter panel below, backed by WorkOrderFilterSchema
  // (search/state/store/owner — no period/sum, intentionally omitted).

  const columns: DataTableColumn<WorkOrder>[] = [
    {
      key: 'name',
      header: tFields('number'),
      width: '160px',
      sortable: true,
      cell: (w) => (
        <a
          href={`/production/work-orders/${w.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {w.name}
        </a>
      ),
      cellText: (w) => w.name,
    },
    {
      key: 'createdAt',
      sortField: 'createdAt',
      header: tFields('time'),
      width: '140px',
      sortable: true,
      cell: (w) => (
        <span className="text-[var(--ms-text-muted)] text-xs tabular-nums">
          {formatDate(w.createdAt)}
        </span>
      ),
      cellText: (w) => formatDate(w.createdAt),
    },
    {
      key: 'bom',
      header: t('bom'),
      cell: (w) => (
        <a
          href={`/production/boms/${w.bomId}`}
          className="text-[var(--ms-text-secondary)] text-sm hover:underline"
        >
          {w.bom.name}
        </a>
      ),
      cellText: (w) => w.bom.name,
    },
    {
      key: 'planned_qty',
      header: t('planned_qty'),
      align: 'right',
      width: '120px',
      cell: (w) => <span className="text-sm tabular-nums">{w.plannedQty}</span>,
      cellText: (w) => w.plannedQty,
    },
    {
      key: 'produced_qty',
      header: t('produced_qty'),
      align: 'right',
      width: '120px',
      cell: (w) => <span className="text-sm tabular-nums">{w.producedQty}</span>,
      cellText: (w) => w.producedQty,
    },
    {
      key: 'store',
      header: t('store'),
      cell: (w) => <span className="text-[var(--ms-text-secondary)] text-sm">{w.store.name}</span>,
      cellText: (w) => w.store.name,
    },
    {
      key: 'state',
      header: t('state'),
      width: '130px',
      cell: (w) => <Badge tone={documentStateTone(w.state)}>{t(`statuses.${w.state}`)}</Badge>,
      cellText: (w) => t(`statuses.${w.state}`),
    },
    {
      key: 'planned_start_at',
      sortField: 'plannedStartAt',
      header: t('planned_start_at'),
      width: '160px',
      sortable: true,
      cell: (w) => (
        <span className="text-[var(--ms-text-muted)] text-sm">
          {formatDateOnly(w.plannedStartAt)}
        </span>
      ),
      cellText: (w) => (w.plannedStartAt ? formatDateOnly(w.plannedStartAt) : ''),
    },
    {
      key: 'planned_end_at',
      sortField: 'plannedEndAt',
      header: t('planned_end_at'),
      width: '160px',
      sortable: true,
      cell: (w) => (
        <span className="text-[var(--ms-text-muted)] text-sm">
          {formatDateOnly(w.plannedEndAt)}
        </span>
      ),
      cellText: (w) => (w.plannedEndAt ? formatDateOnly(w.plannedEndAt) : ''),
    },
    {
      key: 'owner',
      header: tCommon('owner'),
      cell: (w) => (
        <span className="text-[var(--ms-text-muted)] text-sm">{w.owner?.name ?? '—'}</span>
      ),
      cellText: (w) => w.owner?.name ?? '',
    },
    {
      key: 'description',
      header: tFields('description'),
      cell: (w) => (
        <span className="max-w-[240px] truncate text-[var(--ms-text-muted)] text-sm">
          {w.description ?? '—'}
        </span>
      ),
      cellText: (w) => w.description ?? '',
    },
  ];

  const hasActiveFilter = !!search || stateFilter !== 'all' || Object.keys(filterValues).length > 0;

  return (
    <>
      <ListView
        testId="work-orders-page"
        title={t('title')}
        moyskladToolbar
        selectionCount={bulk.selectedIds.size}
        subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
        createHref="/production/work-orders/new"
        createLabel={t('create_button')}
        createPosition="start"
        onRefresh={() => refetch()}
        search={searchInput}
        onSearchChange={(v) => {
          setSearchInput(v);
          setCursor(undefined);
        }}
        searchPlaceholder={t('search_placeholder')}
        columns={columns}
        rows={data?.items ?? []}
        keyField="id"
        rowTestId={(w) => `work-order-row-${w.id}`}
        total={data?.total ?? 0}
        limit={LIMIT}
        hasNext={!!data?.nextCursor}
        hasPrevious={!!cursor}
        onNext={() => setCursor(data?.nextCursor)}
        onPrevious={() => setCursor(undefined)}
        loading={isLoading}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyTitle={search ? tCommon('no_results') : t('empty_title')}
        hasActiveFilter={hasActiveFilter}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          setCursor(undefined);
        }}
        headerSlot={
          <InlineFilterPanel
            hidden={!filterOpen}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onClear={() => {
              setFilterValues({});
              setStateFilter('all');
              setCursor(undefined);
            }}
            pills={
              <SavedFiltersPills
                entity="workorder"
                currentQueryString={params.toString()}
                onApply={(qs) => {
                  setFilterValues(filterFromQueryString(qs));
                  setCursor(undefined);
                }}
              />
            }
            testId="work-orders-inline-filter"
          >
            <InlineFilterPanel.Field label={tFilters('store')} expandable>
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
                  setCursor(undefined);
                }}
                testId="filter-store"
              />
            </InlineFilterPanel.Field>
            {/* Статус — FSM state filter (moysklad surfaces this as a
              dropdown inside the filter panel, not pill sub-tabs). */}
            <InlineFilterPanel.Field label={t('state')} expandable>
              <NativeSelect
                value={stateFilter}
                onChange={(e) => {
                  setStateFilter(e.target.value as WorkOrderState | 'all');
                  setCursor(undefined);
                }}
                data-test-id="filter-state"
              >
                <option value="all">{tCommon('all')}</option>
                {ALL_STATES.map((s) => (
                  <option key={s} value={s}>
                    {t(`statuses.${s}`)}
                  </option>
                ))}
              </NativeSelect>
            </InlineFilterPanel.Field>
          </InlineFilterPanel>
        }
        {...bulk.listViewProps}
        editMenu={bulk.editMenu}
        extraActionsLeft={
          <FilterToggleButton
            open={filterOpen}
            onToggle={() => setFilterOpen((v) => !v)}
            label={tFilters('trigger')}
          />
        }
      />
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

      <MassEditModal
        open={massEditOpen}
        onOpenChange={setMassEditOpen}
        selectedCount={massEditIds.length}
        submitting={bulk.massEdit.isPending}
        hideProject
        ownerValue={massEditOwner}
        onOwnerPick={() => setPickerOpen('massEditOwner')}
        onOwnerClear={() => setMassEditOwner(null)}
        projectValue={null}
        onProjectPick={() => undefined}
        onProjectClear={() => undefined}
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
    </>
  );
}
