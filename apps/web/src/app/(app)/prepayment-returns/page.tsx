'use client';

/**
 * /prepayment-returns — list of prepayment-return (avans qaytarish) docs.
 *
 * 1:1 with moysklad «Возвраты предоплат» (api-docs-official/
 * _prepayment_return.md + visual-captures/07-module/prepaymentreturn):
 *   - Columns: №, Время, Организация, Контрагент, Сумма, Манба авансы,
 *     Комментарий, Когда изменил, Кто изменил
 *   - No state column (moysklad has only `applicable`)
 *   - «Фильтр» InlineFilterPanel, not state pills
 *   - Sum shows leading «+» (return restores customer balance — INCREASE)
 */

import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useDocEditMenuItems } from '@/components/money/document-toolbar-menus';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { stashBulkEdit } from '@/lib/bulk-edit-nav';
import { filterFromQueryString, queryFromFilter } from '@/lib/filter-from-query';
import type { ListEnvelope as ListResponse } from '@moysklad/contracts';
import {
  CatalogPicker,
  type DataTableColumn,
  type FilterDrawerValues,
  InlineFilterPanel,
  ListView,
  MassEditModal,
  MoneyInput,
  MultiCombobox,
  PeriodInputs,
  PeriodShortcuts,
  type PickerItem,
  formatDate,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface PrepaymentReturnRow {
  id: string;
  name: string;
  state: string;
  applicable: boolean;
  sumMinor: string;
  moment: string;
  currency: string;
  description: string | null;
  updatedAt: string;
  agent: { id: string; name: string; legalTitle: string | null };
  organization: { id: string; name: string };
  prepayment: { id: string; name: string; sumMinor: string; state: string } | null;
  owner: { id: string; name: string } | null;
}

/** Multi-select reference field — moysklad checkbox-dropdown holds {id,label}[]. */
type RefMulti = { id: string; label: string };

// Moysklad parity — 100 rows per page.
const LIMIT = 100;

export default function PrepaymentReturnListPage() {
  const t = useTranslations('pages.prepayment_return');
  const tBulkActions = useTranslations('bulk_actions');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const tPrintMenu = useTranslations('print_menu');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [cursor, setCursor] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<string>('moment');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterValues, setFilterValues] = useState<FilterDrawerValues>({});
  // «Контрагент» / «Организация» — moysklad-parity inline multi-select checkbox
  // dropdowns (MultiCombobox), replacing the single-select CatalogPicker modals.
  // Each holds the picked {id,label} pairs; on the wire they go out as
  // `agentIds` / `organizationIds` CSV (BE committed fa8d319b).
  const [agents, setAgents] = useState<RefMulti[]>([]);
  const [organizations, setOrganizations] = useState<RefMulti[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<null | 'massEditOwner' | 'massEditProject'>(null);

  const router = useRouter();

  const [massEditOpen, setMassEditOpen] = useState(false);

  // «Владелец-отдел» options for the mass-edit wizard — mirrors losses/cash-in.

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

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    ...(cursor ? { cursor } : {}),
    ...(filterValues.momentFrom ? { momentFrom: filterValues.momentFrom } : {}),
    ...(filterValues.momentTo ? { momentTo: filterValues.momentTo } : {}),
    ...(agents.length ? { agentIds: agents.map((x) => x.id).join(',') } : {}),
    ...(organizations.length ? { organizationIds: organizations.map((x) => x.id).join(',') } : {}),
    ...(filterValues.sumMinorFrom !== undefined
      ? { sumMinorFrom: String(filterValues.sumMinorFrom) }
      : {}),
    ...(filterValues.sumMinorTo !== undefined
      ? { sumMinorTo: String(filterValues.sumMinorTo) }
      : {}),
  });

  const listQueryKey = [
    'prepayment-returns',
    search,
    cursor,
    sortKey,
    sortDir,
    filterValues,
    agents,
    organizations,
  ] as const;

  const { data, isLoading, error, refetch } = useQuery<ListResponse<PrepaymentReturnRow>>({
    queryKey: listQueryKey,
    queryFn: () =>
      api.get<ListResponse<PrepaymentReturnRow>>(`/prepayment-returns?${params.toString()}`),
  });

  const openMassEdit = (ids: string[]) => {
    stashBulkEdit({ entity: 'prepayment-returns', ids, from: '/prepayment-returns' });
    router.push('/bulk-edit');
  };
  const bulk = useBulkDocumentActions('prepayment-returns', listQueryKey, {
    hasFSM: true,
    hasBulkPrint: true,
    onMassEditClick: openMassEdit,
  });

  // moysklad parity (B7 audit, 2026-05-21): `updatedAt`/`owner` removed
  // from defaults (available via gear).
  const cols = useColumnVisibility('prepayment-returns', [
    'name',
    'moment',
    'organization',
    'agent',
    'sum',
    'prepayment',
    'description',
  ]);
  const colWidths = useColumnWidths('prepayment-returns');
  const hasActiveFilter =
    !!search ||
    agents.length > 0 ||
    organizations.length > 0 ||
    Object.values(filterValues).some((v) => v !== undefined && v !== '');

  // Saved-filter serialize — the shared `queryFromFilter` round-trips the
  // canonical FilterDrawerValues (period + sum range); the multi-select agent /
  // organization filters are appended as JSON ({id,label}[]) so a re-applied
  // pill restores the checkbox chips, not bare ids.
  const savedFilterQuery = (() => {
    const p = new URLSearchParams(queryFromFilter(filterValues));
    if (agents.length) p.set('agents', JSON.stringify(agents));
    if (organizations.length) p.set('organizations', JSON.stringify(organizations));
    return p.toString();
  })();

  // Saved-filter restore — rehydrate the canonical filterValues via the shared
  // decoder, then parse each multi-select JSON param back into its state array.
  const applySavedFilter = (qs: string) => {
    const p = qs.startsWith('?') ? new URLSearchParams(qs.slice(1)) : new URLSearchParams(qs);
    setFilterValues(filterFromQueryString(qs));
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
    setCursor(undefined);
  };

  const columns: DataTableColumn<PrepaymentReturnRow>[] = [
    {
      key: 'name',
      header: tFields('number'),
      width: '150px',
      sortable: true,
      cell: (r) => (
        <a
          href={`/prepayment-returns/${r.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {r.name}
        </a>
      ),
      cellText: (r) => r.name,
    },
    {
      key: 'moment',
      header: tFields('time'),
      width: '120px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(r.moment)}</span>
      ),
      cellText: (r) => formatDate(r.moment),
    },
    {
      key: 'organization',
      header: tFields('organization'),
      width: '180px',
      cell: (r) => (
        <span className="block max-w-[180px] truncate text-sm">{r.organization.name}</span>
      ),
      cellText: (r) => r.organization.name,
    },
    {
      key: 'agent',
      header: tFields('agent'),
      width: '220px',
      sortable: true,
      cell: (r) => (
        <div>
          <div className="max-w-[240px] truncate font-medium">{r.agent.name}</div>
          {r.agent.legalTitle && (
            <div className="max-w-[240px] truncate text-[var(--ms-text-muted)] text-[11px]">
              {r.agent.legalTitle}
            </div>
          )}
        </div>
      ),
      cellText: (r) =>
        r.agent.legalTitle ? `${r.agent.name} (${r.agent.legalTitle})` : r.agent.name,
    },
    {
      // Return restores customer balance → leading «+» (INCREASE).
      key: 'sum',
      sortField: 'sumMinor',
      header: tFields('sum'),
      align: 'right',
      width: '170px',
      sortable: true,
      cell: (r) => (
        <span className="font-medium text-[var(--ms-text-warning)] tabular-nums">
          {'+'}
          {formatMoney(r.sumMinor, r.currency, { displayAs: 'none' })}
        </span>
      ),
      cellText: (r) => `+${formatMoney(r.sumMinor)}`,
    },
    {
      key: 'prepayment',
      header: t('source_prepayment'),
      width: '180px',
      cell: (r) =>
        r.prepayment ? (
          <a
            href={`/prepayments/${r.prepayment.id}`}
            className="text-[var(--ms-text-brand)] text-xs underline-offset-2 hover:underline"
          >
            {r.prepayment.name}
          </a>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (r) => r.prepayment?.name ?? '',
    },
    {
      key: 'description',
      header: tFields('description'),
      cell: (r) => (
        <span className="block max-w-[220px] truncate text-[var(--ms-text-muted)] text-[11px]">
          {r.description ?? tCommon('none')}
        </span>
      ),
      cellText: (r) => r.description ?? '',
    },
    {
      key: 'updatedAt',
      sortField: 'updatedAt',
      header: tFields('updated'),
      width: '140px',
      sortable: true,
      cell: (r) => (
        <span className="text-[var(--ms-text-muted)] text-[12px] tabular-nums">
          {formatDate(r.updatedAt)}
        </span>
      ),
      cellText: (r) => formatDate(r.updatedAt),
    },
    {
      key: 'owner',
      header: tFields('owner'),
      width: '160px',
      cell: (r) => (
        <span className="block max-w-[160px] truncate text-[var(--ms-text-muted)] text-sm">
          {r.owner?.name ?? '—'}
        </span>
      ),
      cellText: (r) => r.owner?.name ?? '',
    },
  ];

  const editMenuItems = useDocEditMenuItems({
    selectedIds: bulk.selectedIds,
    allRowIds: (data?.items ?? []).map((r) => r.id),
    onBulkDelete: (ids) => bulk.bulkDelete.mutate(ids),
    deletePending: bulk.bulkDelete.isPending,
    onMassEdit: openMassEdit,
  });
  const printMenuItems = [
    { id: 'print', label: tPrintMenu('document_blank'), onSelect: () => window.print() },
  ];

  return (
    <>
      <ListView
        testId="prepayment-returns-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        createHref="/prepayment-returns/new"
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
        rowTestId={(r) => `prepayment-return-row-${r.id}`}
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
        emptyTitle={hasActiveFilter ? tCommon('no_results') : t('empty_title')}
        hasActiveFilter={hasActiveFilter}
        selectionCount={bulk.selectedIds.size}
        editMenu={{ label: tBulkActions('trigger'), items: editMenuItems }}
        printMenu={{ label: tPrintMenu('trigger'), items: printMenuItems }}
        visibleColumnKeys={cols.visibleKeys}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          setCursor(undefined);
        }}
        {...bulk.listViewProps}
        extraActionsLeft={
          <FilterToggleButton
            open={filterOpen}
            onToggle={() => setFilterOpen((v) => !v)}
            label={tFilters('trigger')}
          />
        }
        headerEndSlot={
          <ColumnSettings
            columns={columns.map((c) => ({
              key: c.key,
              label: c.header,
              alwaysVisible: c.key === 'name',
            }))}
            visibleKeys={cols.visibleKeys}
            onChange={cols.setVisibleKeys}
            onReset={cols.reset}
          />
        }
        columnWidths={colWidths.values}
        onColumnResize={colWidths.set}
        headerSlot={
          <InlineFilterPanel
            hidden={!filterOpen}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onClear={() => {
              setFilterValues({});
              setAgents([]);
              setOrganizations([]);
              setCursor(undefined);
            }}
            pills={
              <SavedFiltersPills
                entity="prepaymentreturn"
                currentQueryString={savedFilterQuery}
                onApply={applySavedFilter}
              />
            }
            testId="prepayment-return-inline-filter"
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
            {/* Контрагент — moysklad-parity inline multi-select checkbox dropdown:
                type a name OR phone, results appear inline (each row shows the
                phone as a sublabel), tick as many as needed. Was a single-select
                modal. */}
            <InlineFilterPanel.Field label={tFilters('agent')} expandable>
              <MultiCombobox
                value={agents.map((x) => x.id)}
                items={agents.map((x) => ({ value: x.id, label: x.label }))}
                onSearch={async (q) => {
                  const r = await api.get<{
                    items: { id: string; name: string; phone?: string | null }[];
                  }>(`/counterparties?search=${encodeURIComponent(q)}&limit=20`);
                  return r.items.map((x) => ({
                    value: x.id,
                    label: x.name,
                    sublabel: x.phone || undefined,
                  }));
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
                  setCursor(undefined);
                }}
                placeholder=""
                testId="filter-agent"
              />
            </InlineFilterPanel.Field>
            {/* Организация — moysklad-parity inline multi-select checkbox dropdown
                (was a single-select modal). */}
            <InlineFilterPanel.Field label={tFilters('organization')} expandable>
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
                  setCursor(undefined);
                }}
                placeholder=""
                testId="filter-org"
              />
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field label={tFilters('sum_from')} expandable>
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
                  setCursor(undefined);
                }}
                data-test-id="filter-sum-from"
              />
            </InlineFilterPanel.Field>
            <InlineFilterPanel.Field label={tFilters('sum_to')} expandable>
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
                  setCursor(undefined);
                }}
                data-test-id="filter-sum-to"
              />
            </InlineFilterPanel.Field>
          </InlineFilterPanel>
        }
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
        }}
        onSubmit={async (patch) => {
          await bulk.massEdit.mutateAsync({ ids: massEditIds, ...patch });
          setMassEditOpen(false);
        }}
      />
    </>
  );
}
