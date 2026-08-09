'use client';

/**
 * /settings/projects — Проекты catalog (Настройки → Справочники → Проекты).
 *
 * moysklad parity (capture 2026-05-30, docs/moysklad-reference/projects):
 * title «Проекты», create «+ Проект», search by name/code/description,
 * columns Наименование · Код · Описание, no «Печать». The «Изменить ▾»
 * bulk menu (ProjectBulkActionsDropdown) = {Удалить, Копировать[disabled],
 * Массовое редактирование, Поместить в архив, Извлечь из архива}. Archive
 * is surfaced through the inline «Состояние» filter (mirrors expense-items)
 * rather than pill sub-tabs.
 */

import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { ProjectBulkActionsDropdown } from '@/components/projects/bulk-actions-dropdown';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { stashBulkEdit } from '@/lib/bulk-edit-nav';
import type { ListEnvelope as ListResponse } from '@moysklad/contracts';
import {
  Badge,
  CatalogPicker,
  type DataTableColumn,
  InlineFilterPanel,
  ListView,
  MassEditModal,
  NativeSelect,
  type PickerItem,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface ProjectRow {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  archived: boolean;
}

const LIMIT = 100;

export default function ProjectsPage() {
  const t = useTranslations('pages.projects');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [archived, setArchived] = useState<'active' | 'archived'>('active');
  const [cursor, setCursor] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterOpen, setFilterOpen] = useState(true);

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
  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false);

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    archived: archived === 'archived' ? 'true' : 'false',
    limit: String(LIMIT),
    sortBy: sortKey,
    sortDir,
    withTotal: 'true',
    ...(cursor ? { cursor } : {}),
  });

  const listQueryKey = ['projects', search, archived, cursor, sortKey, sortDir] as const;

  const { data, isLoading, error, refetch } = useQuery<ListResponse<ProjectRow>>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ListResponse<ProjectRow>>(`/projects?${params.toString()}`),
  });

  const openMassEdit = (ids: string[]) => {
    stashBulkEdit({ entity: 'projects', ids, from: '/settings/projects' });
    router.push('/bulk-edit');
  };

  const bulk = useBulkDocumentActions('projects', listQueryKey, {
    hasFSM: false,
    hasArchive: true,
    onMassEditClick: openMassEdit,
  });

  const columns: DataTableColumn<ProjectRow>[] = [
    {
      key: 'name',
      header: t('col_name'),
      sortable: true,
      sortField: 'name',
      cell: (row) => (
        <a
          href={`/settings/projects/${row.id}`}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {row.name}
        </a>
      ),
      cellText: (row) => row.name,
    },
    {
      key: 'code',
      header: t('col_code'),
      width: '140px',
      sortable: true,
      sortField: 'code',
      cell: (row) => (
        <span className="font-mono text-[var(--ms-text-muted)] text-sm">{row.code ?? '—'}</span>
      ),
      cellText: (row) => row.code ?? '',
    },
    {
      key: 'description',
      header: t('col_description'),
      cell: (row) => (
        <span className="block max-w-[480px] truncate text-[var(--ms-text-muted)] text-sm">
          {row.description ?? '—'}
        </span>
      ),
      cellText: (row) => row.description ?? '',
    },
    {
      key: 'state',
      header: t('col_state'),
      width: '120px',
      cell: (row) => (
        <Badge tone={archivedTone(row.archived)}>
          {row.archived ? tCommon('archived') : tCommon('active')}
        </Badge>
      ),
      cellText: (row) => (row.archived ? 'archived' : 'active'),
    },
  ];

  const hasFilter = !!search || archived === 'archived';

  return (
    <>
      <ListView
        {...bulk.listViewProps}
        editMenu={bulk.editMenu}
        testId="projects-page"
        title={t('title')}
        moyskladToolbar
        onRefresh={() => refetch()}
        selectionCount={bulk.selectedIds.size}
        createHref="/settings/projects/new"
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
        rowTestId={(row) => `project-row-${row.id}`}
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
        headerSlot={
          <InlineFilterPanel
            hidden={!filterOpen}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onClear={() => {
              setArchived('active');
              setCursor(undefined);
            }}
            testId="projects-inline-filter"
          >
            <InlineFilterPanel.Field label={tFields('state')} expandable>
              <NativeSelect
                value={archived}
                onChange={(e) => {
                  setArchived(e.target.value as 'active' | 'archived');
                  setCursor(undefined);
                }}
                data-test-id="filter-archived"
              >
                <option value="active">{tCommon('active')}</option>
                <option value="archived">{tCommon('archived')}</option>
              </NativeSelect>
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
        extraActions={
          <ProjectBulkActionsDropdown
            selectedIds={bulk.selectedIds}
            listQueryKey={listQueryKey}
            onClearSelection={bulk.clearSelection}
            onMassEdit={() =>
              openMassEdit(
                bulk.selectedIds.size > 0
                  ? Array.from(bulk.selectedIds)
                  : (data?.items ?? []).map((r) => r.id),
              )
            }
          />
        }
      />

      <CatalogPicker
        open={ownerPickerOpen}
        onClose={() => setOwnerPickerOpen(false)}
        title={tFilters('owner_employee')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/employees?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setMassEditOwner({ id: item.id, label: String(item.primary) });
          setOwnerPickerOpen(false);
        }}
      />

      <MassEditModal
        open={massEditOpen}
        onOpenChange={setMassEditOpen}
        selectedCount={massEditIds.length}
        submitting={bulk.massEdit.isPending}
        hideProject
        ownerValue={massEditOwner}
        onOwnerPick={() => setOwnerPickerOpen(true)}
        onOwnerClear={() => setMassEditOwner(null)}
        projectValue={null}
        onProjectPick={() => undefined}
        onProjectClear={() => undefined}
        groupOptions={(massGroupsData?.items ?? []).map((g) => ({ value: g.id, label: g.name }))}
        showShared
        labels={{
          title: t('mass_edit_title'),
          ownerLabel: tFilters('owner_employee'),
          projectLabel: tFilters('project'),
          descriptionLabel: t('col_description'),
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
