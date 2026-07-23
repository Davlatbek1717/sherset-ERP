'use client';

/**
 * «Склады» list — moysklad #warehouse 1:1 (LIVE-grounded 2026-07-03,
 * docs/audits/stores-1to1-2026-07-03/GROUND.md).
 *
 * Composition mirrors the certified products/counterparties list machinery:
 *   · moysklad toolbar: (?) · «Склады» · ⟳ · «⊕ Склад» · «Фильтр» · search ·
 *     «0 | Изменить ▾» segmented counter + bulk dropdown
 *   · InlineFilterPanel: Наименование · Код · Адрес · Показывать (Только
 *     обычные/Все) · Владелец-сотрудник · Владелец-отдел · Общий доступ
 *     (-/Нет/Да) + bookmark «Закладки» + ⚙ field-visibility
 *   · left sidebar = warehouse hierarchy tree (root «Склады»); a node filters
 *     the table to that node's children
 *   · table: Наименование/Код/Адрес (default) + gear extras Общий доступ ·
 *     Владелец-отдел · Владелец-сотрудник; «Количество строк» 25/50/100
 *   · row click opens the card; hover ✕ deletes (house DataTable behavior)
 *
 * Pagination is client-side over one ≤500-row fetch (warehouse catalogs are
 * small; gives moysklad's ⏮◀▶⏭ jumps which cursor paging can't).
 */

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { StoresBulkActionsDropdown } from '@/components/stores/bulk-actions-dropdown';
import { StoresMassEditModal } from '@/components/stores/mass-edit-modal';
import { StoreTree } from '@/components/stores/store-tree';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { api } from '@/lib/api-client';
import {
  CatalogPicker,
  CatalogPickerField,
  type DataTableColumn,
  InlineFilterPanel,
  Input,
  ListView,
  NativeSelect,
  type PickerItem,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

interface RefName {
  id: string;
  name: string;
}

interface StoreRow {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  pathName: string | null;
  parentId: string | null;
  shared: boolean;
  archived: boolean;
  owner: RefName | null;
  group: RefName | null;
}

interface ListResponse {
  items: StoreRow[];
  nextCursor?: string;
  total: number;
}

export function StoresListView({ formBasePath = '/stores' }: { formBasePath?: string }) {
  const t = useTranslations('pages.stores');
  const tCommon = useTranslations('common');
  const tFilters = useTranslations('filters');
  const router = useRouter();

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  // moysklad keeps the panel open per-user; our lists default it open too.
  const [filterOpen, setFilterOpen] = useState(true);
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<null | 'owner' | 'dept'>(null);

  // Tree selection: null = «Склады» root (all stores), id = that node's children.
  const [treeId, setTreeId] = useState<string | null>(null);

  // Filter panel state (moysklad field set).
  const [fNameInput, setFNameInput] = useState('');
  const fName = useDebounce(fNameInput, 300);
  const [fCodeInput, setFCodeInput] = useState('');
  const fCode = useDebounce(fCodeInput, 300);
  const [fAddressInput, setFAddressInput] = useState('');
  const fAddress = useDebounce(fAddressInput, 300);
  const [show, setShow] = useState<'active' | 'all'>('active');
  const [ownerId, setOwnerId] = useState('');
  const [ownerLabel, setOwnerLabel] = useState('');
  const [deptId, setDeptId] = useState('');
  const [deptLabel, setDeptLabel] = useState('');
  const [sharedSel, setSharedSel] = useState<'' | 'true' | 'false'>('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const params = new URLSearchParams({
    limit: '500',
    sortBy: sortKey,
    sortDir,
    show,
    ...(search ? { search } : {}),
    ...(fName ? { name: fName } : {}),
    ...(fCode ? { code: fCode } : {}),
    ...(fAddress ? { address: fAddress } : {}),
    ...(ownerId ? { ownerId } : {}),
    ...(deptId ? { groupId: deptId } : {}),
    ...(sharedSel ? { shared: sharedSel } : {}),
    ...(treeId ? { parentId: treeId } : {}),
  });
  const queryString = params.toString();
  const listQueryKey = ['stores', 'list', queryString] as const;

  const { data, isLoading, error, refetch } = useQuery<ListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse>(`/admin/stores?${queryString}`),
  });

  const bulk = useBulkDocumentActions('admin/stores', listQueryKey, { hasFSM: false });

  const allRows = data?.items ?? [];
  const total = allRows.length;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, lastPage);
  const rows = useMemo(
    () => allRows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [allRows, safePage, pageSize],
  );

  const cols = useColumnVisibility('stores', ['name', 'code', 'address']);

  const columns: DataTableColumn<StoreRow>[] = [
    {
      key: 'name',
      header: t('name'),
      sortable: true,
      sortField: 'name',
      cell: (row) => (
        <span className="text-[var(--ms-text-primary)]">
          {row.archived ? `${row.name} (${tCommon('archived').toLowerCase()})` : row.name}
        </span>
      ),
      cellText: (row) => row.name,
    },
    {
      key: 'code',
      header: t('code'),
      width: '120px',
      sortable: true,
      sortField: 'code',
      cell: (row) => <span className="tabular-nums">{row.code ?? ''}</span>,
      cellText: (row) => row.code ?? '',
    },
    {
      key: 'address',
      header: t('address'),
      sortable: true,
      sortField: 'address',
      cell: (row) => <span className="block max-w-[320px] truncate">{row.address ?? ''}</span>,
      cellText: (row) => row.address ?? '',
    },
    // ⚙ extras — hidden by default (moysklad gear order: Общий доступ ·
    // Владелец-отдел · Владелец-сотрудник).
    {
      key: 'shared',
      header: tFilters('shared'),
      width: '120px',
      cell: (row) => <span>{row.shared ? t('shared_yes') : t('shared_no')}</span>,
      cellText: (row) => (row.shared ? 'yes' : 'no'),
    },
    {
      key: 'group',
      header: tFilters('owner_group'),
      width: '160px',
      cell: (row) => <span>{row.group?.name ?? ''}</span>,
      cellText: (row) => row.group?.name ?? '',
    },
    {
      key: 'owner',
      header: tFilters('owner_employee'),
      width: '160px',
      cell: (row) => <span>{row.owner?.name ?? ''}</span>,
      cellText: (row) => row.owner?.name ?? '',
    },
  ];

  const hasFilter =
    !!search ||
    !!fName ||
    !!fCode ||
    !!fAddress ||
    show !== 'active' ||
    !!ownerId ||
    !!deptId ||
    !!sharedSel ||
    !!treeId;

  // Saved-filter payload (the pills round-trip this query string).
  const savedFilterQuery = new URLSearchParams({
    ...(fName ? { name: fName } : {}),
    ...(fCode ? { code: fCode } : {}),
    ...(fAddress ? { address: fAddress } : {}),
    ...(show !== 'active' ? { show } : {}),
    ...(ownerId ? { ownerId, ownerLabel } : {}),
    ...(deptId ? { groupId: deptId, groupLabel: deptLabel } : {}),
    ...(sharedSel ? { shared: sharedSel } : {}),
  }).toString();

  const applySavedFilter = (qs: string) => {
    const p = new URLSearchParams(qs);
    setFNameInput(p.get('name') ?? '');
    setFCodeInput(p.get('code') ?? '');
    setFAddressInput(p.get('address') ?? '');
    setShow(p.get('show') === 'all' ? 'all' : 'active');
    setOwnerId(p.get('ownerId') ?? '');
    setOwnerLabel(p.get('ownerLabel') ?? '');
    setDeptId(p.get('groupId') ?? '');
    setDeptLabel(p.get('groupLabel') ?? '');
    setSharedSel((p.get('shared') as '' | 'true' | 'false') ?? '');
    setPage(1);
  };

  // ⚙ filter-field show/hide — the persisted Set holds the HIDDEN field keys
  // (default empty = all 7 fields shown, matching the live panel).
  const filterHidden = useColumnVisibility('stores-filter-hidden', []);

  return (
    <>
      <ListView
        testId="settings-stores-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        onHelp={() => window.open('https://support.moysklad.ru', '_blank')}
        sidebar={
          <StoreTree
            selectedId={treeId}
            onSelect={(id) => {
              setTreeId(id);
              setPage(1);
            }}
          />
        }
        createHref={`${formBasePath}/new`}
        createLabel={t('create_button')}
        createPosition="start"
        search={searchInput}
        onSearchChange={(v) => {
          setSearchInput(v);
          setPage(1);
        }}
        searchPlaceholder={t('search_placeholder')}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          setPage(1);
        }}
        columns={columns}
        rows={rows}
        keyField="id"
        rowTestId={(row) => `store-row-${row.id}`}
        onRowClick={(row) => router.push(`${formBasePath}/${row.id}`)}
        rowActions={(row) => bulk.rowDelete(row.id)}
        total={total}
        limit={pageSize}
        paginationOffset={(safePage - 1) * pageSize}
        hasPrevious={safePage > 1}
        hasNext={safePage < lastPage}
        onFirst={() => setPage(1)}
        onPrevious={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
        onLast={() => setPage(lastPage)}
        loading={isLoading}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyTitle={hasFilter ? tCommon('no_results') : t('empty_title')}
        hasActiveFilter={hasFilter}
        {...bulk.listViewProps}
        visibleColumnKeys={cols.visibleKeys}
        extraActionsLeft={
          <FilterToggleButton
            open={filterOpen}
            onToggle={() => setFilterOpen((v) => !v)}
            label={tFilters('trigger')}
          />
        }
        extraActions={
          // moysklad «0 | Изменить ▾» — one segmented group: count cap + dropdown.
          <div className="flex items-center" data-test-id="stores-action-group">
            <span
              className="inline-flex h-9 items-center rounded-l-[var(--ms-radius-default)] border border-[#cccccc] bg-[var(--ms-bg-surface)] px-3 text-[12px] text-[var(--ms-text-primary)] tabular-nums"
              data-test-id="toolbar-selection-count"
            >
              {bulk.selectedIds.size}
            </span>
            <StoresBulkActionsDropdown
              selectedIds={bulk.selectedIds}
              listQueryKey={listQueryKey}
              onClearSelection={bulk.clearSelection}
              onMassEdit={() => setMassEditOpen(true)}
              triggerClassName="-ml-px h-9 rounded-l-none rounded-r-[var(--ms-radius-default)] border-[#cccccc]"
            />
          </div>
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
              setPage(1);
            }}
          />
        }
        headerSlot={
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
                entity="store"
                currentQueryString={savedFilterQuery}
                onApply={applySavedFilter}
                adding={saveFilterOpen}
                onAddingChange={setSaveFilterOpen}
                showAdd={filterOpen}
              />
            }
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onClear={() => {
              setFNameInput('');
              setFCodeInput('');
              setFAddressInput('');
              setShow('active');
              setOwnerId('');
              setOwnerLabel('');
              setDeptId('');
              setDeptLabel('');
              setSharedSel('');
              setPage(1);
            }}
            testId="stores-inline-filter"
          >
            <InlineFilterPanel.Field label={t('name')}>
              <Input
                value={fNameInput}
                onChange={(e) => {
                  setFNameInput(e.target.value);
                  setPage(1);
                }}
                data-test-id="filter-name"
              />
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field label={t('code')} expandable>
              <Input
                value={fCodeInput}
                onChange={(e) => {
                  setFCodeInput(e.target.value);
                  setPage(1);
                }}
                data-test-id="filter-code"
              />
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field label={t('address')} expandable>
              <Input
                value={fAddressInput}
                onChange={(e) => {
                  setFAddressInput(e.target.value);
                  setPage(1);
                }}
                data-test-id="filter-address"
              />
            </InlineFilterPanel.Field>
            {/* «Показывать» — moysklad stores list has ONLY 2 options (live-verified):
                Только обычные / Все. NOT the 3-option products variant. */}
            <InlineFilterPanel.Field label={tFilters('show')}>
              <NativeSelect
                value={show}
                onChange={(e) => {
                  setShow(e.target.value === 'all' ? 'all' : 'active');
                  setPage(1);
                }}
                data-test-id="filter-show"
              >
                <option value="active">{tFilters('show_regular')}</option>
                <option value="all">{tFilters('all')}</option>
              </NativeSelect>
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field label={tFilters('owner_employee')} expandable>
              <CatalogPickerField
                value={ownerId ? { id: ownerId, label: ownerLabel || ownerId } : null}
                placeholder=""
                onPick={() => setPickerOpen('owner')}
                onClear={() => {
                  setOwnerId('');
                  setOwnerLabel('');
                  setPage(1);
                }}
                inlineFetcher={async (q) => {
                  const r = await api.get<{ items: RefName[] }>(
                    `/employees?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return r.items.map((x) => ({ id: x.id, primary: x.name }));
                }}
                onInlineSelect={(item) => {
                  setOwnerId(item.id);
                  setOwnerLabel(String(item.primary));
                  setPage(1);
                }}
                testId="filter-owner"
              />
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field label={tFilters('owner_group')} expandable>
              <CatalogPickerField
                value={deptId ? { id: deptId, label: deptLabel || deptId } : null}
                placeholder=""
                onPick={() => setPickerOpen('dept')}
                onClear={() => {
                  setDeptId('');
                  setDeptLabel('');
                  setPage(1);
                }}
                inlineFetcher={async (q) => {
                  const r = await api.get<{ items: RefName[] }>(
                    `/groups?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return r.items.map((x) => ({ id: x.id, primary: x.name }));
                }}
                onInlineSelect={(item) => {
                  setDeptId(item.id);
                  setDeptLabel(String(item.primary));
                  setPage(1);
                }}
                testId="filter-dept"
              />
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field label={tFilters('shared')} expandable>
              <NativeSelect
                value={sharedSel}
                onChange={(e) => {
                  setSharedSel(e.target.value as '' | 'true' | 'false');
                  setPage(1);
                }}
                data-test-id="filter-shared"
              >
                <option value="" />
                <option value="false">{t('shared_no')}</option>
                <option value="true">{t('shared_yes')}</option>
              </NativeSelect>
            </InlineFilterPanel.Field>
          </InlineFilterPanel>
        }
      />

      <CatalogPicker
        open={pickerOpen === 'owner'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('owner_employee')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: RefName[] }>(
            `/employees?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setOwnerId(item.id);
          setOwnerLabel(String(item.primary));
          setPage(1);
        }}
      />
      <CatalogPicker
        open={pickerOpen === 'dept'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('owner_group')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: RefName[] }>(
            `/groups?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setDeptId(item.id);
          setDeptLabel(String(item.primary));
          setPage(1);
        }}
      />

      <StoresMassEditModal
        open={massEditOpen}
        onClose={() => setMassEditOpen(false)}
        selectedIds={bulk.selectedIds}
        listQueryKey={listQueryKey}
        onDone={bulk.clearSelection}
      />
    </>
  );
}
