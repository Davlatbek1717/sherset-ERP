'use client';

/**
 * /settings/task-types — moysklad «Типы задач» parity.
 *
 * Account-wide lookup for the «Тип задачи» dropdown inside the task
 * create modal. Single-page CRUD with inline create/edit modal, since
 * each row only has name + colour + position — heavy detail page
 * would be overkill.
 *
 * Defaults are seeded on first GET /task-types (server-side
 * seedDefaultsIfEmpty), so the page is never empty on a fresh account.
 */

import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import type { ListEnvelope as ListResponse } from '@moysklad/contracts';
import {
  Badge,
  Button,
  type DataTableColumn,
  InlineFilterPanel,
  Input,
  ListView,
  Modal,
  NativeSelect,
  useConfirm,
  useDebounce,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface TaskTypeRow {
  id: string;
  name: string;
  color: string | null;
  position: number;
  archived: boolean;
}
const LIMIT = 200;

const DEFAULT_PALETTE = [
  '#3B82F6',
  '#16A34A',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#0EA5E9',
  '#EC4899',
  '#6B7280',
];

export default function TaskTypesPage() {
  const t = useTranslations('task_types');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const qc = useQueryClient();
  const { confirm } = useConfirm();

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [archived, setArchived] = useState<'active' | 'archived'>('active');
  const [filterOpen, setFilterOpen] = useState(false);
  const [editing, setEditing] = useState<TaskTypeRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(DEFAULT_PALETTE[0] ?? '#3B82F6');
  const [position, setPosition] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    archived: archived === 'archived' ? 'true' : 'false',
    sortBy: 'position',
    sortDir: 'asc',
  });

  const {
    data,
    isLoading,
    error: loadError,
    refetch,
  } = useQuery<ListResponse<TaskTypeRow>>({
    queryKey: ['task-types', archived, search],
    queryFn: () => api.get<ListResponse<TaskTypeRow>>(`/task-types?${params.toString()}`),
  });

  const upsertMut = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim(), color, position };
      if (editing) {
        return api.patch(`/task-types/${editing.id}`, payload);
      }
      return api.post('/task-types', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-types'] });
      closeModal();
    },
    onError: (e: Error) => setError(e.message),
  });

  const archiveMut = useApiMutation({
    mutationFn: (row: TaskTypeRow) =>
      api.post(`/task-types/${row.id}/${row.archived ? 'restore' : 'archive'}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-types'] }),
  });

  const deleteMut = useApiMutation({
    mutationFn: (row: TaskTypeRow) => api.delete(`/task-types/${row.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-types'] }),
  });

  function openCreate() {
    setEditing(null);
    setName('');
    setColor(DEFAULT_PALETTE[0] ?? '#3B82F6');
    setPosition((data?.items.length ?? 0) * 10);
    setError(null);
    setModalOpen(true);
  }
  function openEdit(row: TaskTypeRow) {
    setEditing(row);
    setName(row.name);
    setColor(row.color ?? DEFAULT_PALETTE[0] ?? '#3B82F6');
    setPosition(row.position);
    setError(null);
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setError(null);
  }
  function submit() {
    if (!name.trim()) {
      setError(t('name_required'));
      return;
    }
    upsertMut.mutate();
  }

  const columns: DataTableColumn<TaskTypeRow>[] = [
    {
      key: 'name',
      header: t('name'),
      cell: (row) => (
        <button
          type="button"
          onClick={() => openEdit(row)}
          className="flex items-center gap-2 text-left text-[var(--ms-text-primary)] hover:text-[var(--ms-text-brand)] hover:underline"
        >
          <span
            className="inline-block h-3 w-3 shrink-0 rounded-full border border-[var(--ms-border-default)]"
            style={{ backgroundColor: row.color ?? '#E5E7EB' }}
            aria-hidden
          />
          <span className="font-medium">{row.name}</span>
        </button>
      ),
      cellText: (row) => row.name,
    },
    {
      key: 'color',
      header: t('color'),
      width: '120px',
      cell: (row) =>
        row.color ? (
          <span className="font-mono text-[var(--ms-text-muted)] text-xs">{row.color}</span>
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs">—</span>
        ),
      cellText: (row) => row.color ?? '',
    },
    {
      key: 'position',
      header: t('position'),
      width: '90px',
      cell: (row) => <span className="text-[var(--ms-text-muted)] text-sm">{row.position}</span>,
      cellText: (row) => String(row.position),
    },
    {
      key: 'state',
      header: tFields('state'),
      width: '120px',
      cell: (row) => (
        <Badge tone={archivedTone(row.archived)}>
          {row.archived ? tCommon('archived') : tCommon('active')}
        </Badge>
      ),
      cellText: (row) => (row.archived ? 'archived' : 'active'),
    },
    {
      key: 'actions',
      header: t('actions'),
      width: '220px',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-[var(--ms-text-brand)] text-sm hover:underline"
            onClick={() => archiveMut.mutate(row)}
            disabled={archiveMut.isPending}
            data-test-id={`task-type-archive-${row.id}`}
          >
            {row.archived ? t('restore') : t('archive')}
          </button>
          <button
            type="button"
            className="text-[var(--ms-text-destructive)] text-sm hover:underline"
            onClick={async () => {
              const ok = await confirm({
                title: t('delete_confirm'),
                confirmLabel: t('delete'),
                tone: 'destructive',
              });
              if (ok) deleteMut.mutate(row);
            }}
            disabled={deleteMut.isPending}
            data-test-id={`task-type-delete-${row.id}`}
          >
            {t('delete')}
          </button>
        </div>
      ),
      cellText: () => '',
    },
  ];

  return (
    <>
      <ListView
        testId="task-types-page"
        title={t('title')}
        subtitle={t('subtitle')}
        moyskladToolbar
        onCreate={openCreate}
        createLabel={t('new')}
        createPosition="start"
        onRefresh={() => refetch()}
        search={searchInput}
        onSearchChange={(v) => setSearchInput(v)}
        searchPlaceholder={t('search_placeholder')}
        columns={columns}
        rows={data?.items ?? []}
        keyField="id"
        rowTestId={(row) => `task-type-row-${row.id}`}
        total={data?.total ?? 0}
        limit={LIMIT}
        hasNext={false}
        hasPrevious={false}
        onNext={() => undefined}
        onPrevious={() => undefined}
        loading={isLoading}
        error={loadError as Error | null}
        onRetry={() => refetch()}
        emptyTitle={search ? tCommon('no_results') : t('empty')}
        hasActiveFilter={archived === 'archived'}
        headerSlot={
          <InlineFilterPanel
            hidden={!filterOpen}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onClear={() => setArchived('active')}
            testId="task-types-inline-filter"
          >
            <InlineFilterPanel.Field label={tFields('state')} expandable>
              <NativeSelect
                value={archived}
                onChange={(e) => setArchived(e.target.value as 'active' | 'archived')}
                data-test-id="task-types-filter-archived"
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
      />

      <Modal
        open={modalOpen}
        onOpenChange={(v) => (v ? undefined : closeModal())}
        title={editing ? editing.name : t('new')}
        widthClass="w-[480px]"
        testId="task-type-modal"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal}>
              {t('cancel')}
            </Button>
            <Button onClick={submit} disabled={upsertMut.isPending}>
              {editing ? t('save') : t('create')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="task-type-name"
              className="font-medium text-[var(--ms-text-primary)] text-sm"
            >
              {t('name')}
            </label>
            <Input
              id="task-type-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-test-id="task-type-name"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-[var(--ms-text-primary)] text-sm">{t('color')}</span>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_PALETTE.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 ${
                    color === c
                      ? 'border-[var(--ms-text-brand)]'
                      : 'border-[var(--ms-border-default)]'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                  data-test-id={`task-type-color-${c}`}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="task-type-position"
              className="font-medium text-[var(--ms-text-primary)] text-sm"
            >
              {t('position')}
            </label>
            <Input
              id="task-type-position"
              type="number"
              value={position}
              onChange={(e) => setPosition(Number(e.target.value) || 0)}
              data-test-id="task-type-position"
            />
          </div>

          {error && (
            <div
              className="text-[var(--ms-text-destructive)] text-sm"
              data-test-id="task-type-error"
            >
              {error}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
