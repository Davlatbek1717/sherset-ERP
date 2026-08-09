'use client';

/**
 * /settings/purchase-return-statuses — moysklad «Настроить статусы» parity
 * (for purchase-returns / Возвраты поставщикам).
 *
 * Account-wide editable statuses (State rows, entityType="purchasereturn") that
 * drive the coloured «Статус» dropdown on the return list toolbar. Until the
 * admin creates statuses here the return's «Статус» pill stays a grey «Статус»
 * (the FSM `state` + «Проведено» are separate). Single-page CRUD with an inline
 * create/edit modal — name + colour + position — mirroring
 * /settings/supply-statuses 1:1 (same State REST surface).
 *
 * The /states list endpoint returns {items, nextCursor} (no total / search /
 * sort), so search is applied client-side; the status list is small.
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

const ENTITY_TYPE = 'purchasereturn';

interface StatusRow {
  id: string;
  name: string;
  color: string | null;
  position: number;
  archived: boolean;
}
const LIMIT = 200;

// moysklad's account statuses use saturated badge colours; this palette
// matches the customer-order / supply palette so all status sets read identically.
const DEFAULT_PALETTE = [
  '#E92919',
  '#E68116',
  '#008739',
  '#A2C617',
  '#3B82F6',
  '#8B5CF6',
  '#0EA5E9',
  '#6B7280',
];

export default function PurchaseReturnStatusesPage() {
  const t = useTranslations('purchase_return_statuses');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');
  const qc = useQueryClient();
  const { confirm } = useConfirm();

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [archived, setArchived] = useState<'active' | 'archived'>('active');
  const [filterOpen, setFilterOpen] = useState(false);
  const [editing, setEditing] = useState<StatusRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(DEFAULT_PALETTE[0] ?? '#3B82F6');
  const [position, setPosition] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams({
    entityType: ENTITY_TYPE,
    archived: archived === 'archived' ? 'true' : 'false',
    limit: String(LIMIT),
  });

  const {
    data,
    isLoading,
    error: loadError,
    refetch,
  } = useQuery<ListResponse<StatusRow>>({
    queryKey: ['states', ENTITY_TYPE, archived],
    queryFn: () => api.get<ListResponse<StatusRow>>(`/states?${params.toString()}`),
  });

  // /states has no server-side search; filter the (small) status list locally.
  const allRows = data?.items ?? [];
  const rows = search
    ? allRows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
    : allRows;

  const upsertMut = useMutation({
    mutationFn: async () => {
      if (editing) {
        return api.patch(`/states/${editing.id}`, { name: name.trim(), color, position });
      }
      return api.post('/states', {
        entityType: ENTITY_TYPE,
        name: name.trim(),
        color,
        position,
      });
    },
    onSuccess: () => {
      // Invalidate the whole `states` key so the return toolbar dropdown picks up
      // the change too.
      qc.invalidateQueries({ queryKey: ['states'] });
      closeModal();
    },
    onError: (e: Error) => setError(e.message),
  });

  const archiveMut = useApiMutation({
    mutationFn: (row: StatusRow) =>
      api.post(`/states/${row.id}/${row.archived ? 'restore' : 'archive'}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['states'] }),
  });

  const deleteMut = useApiMutation({
    mutationFn: (row: StatusRow) => api.delete(`/states/${row.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['states'] }),
  });

  function openCreate() {
    setEditing(null);
    setName('');
    setColor(DEFAULT_PALETTE[0] ?? '#3B82F6');
    setPosition(allRows.length * 10);
    setError(null);
    setModalOpen(true);
  }
  function openEdit(row: StatusRow) {
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

  const columns: DataTableColumn<StatusRow>[] = [
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
            className="inline-block h-3 w-3 shrink-0 rounded-sm border border-[var(--ms-border-default)]"
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
            data-test-id={`purchase-return-status-archive-${row.id}`}
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
            data-test-id={`purchase-return-status-delete-${row.id}`}
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
        testId="purchase-return-statuses-page"
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
        rows={rows}
        keyField="id"
        rowTestId={(row) => `purchase-return-status-row-${row.id}`}
        total={rows.length}
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
            testId="purchase-return-statuses-inline-filter"
          >
            <InlineFilterPanel.Field label={tFields('state')} expandable>
              <NativeSelect
                value={archived}
                onChange={(e) => setArchived(e.target.value as 'active' | 'archived')}
                data-test-id="purchase-return-statuses-filter-archived"
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
        testId="purchase-return-status-modal"
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
              htmlFor="purchase-return-status-name"
              className="font-medium text-[var(--ms-text-primary)] text-sm"
            >
              {t('name')}
            </label>
            <Input
              id="purchase-return-status-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-test-id="purchase-return-status-name"
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
                  data-test-id={`purchase-return-status-color-${c}`}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="purchase-return-status-position"
              className="font-medium text-[var(--ms-text-primary)] text-sm"
            >
              {t('position')}
            </label>
            <Input
              id="purchase-return-status-position"
              type="number"
              value={position}
              onChange={(e) => setPosition(Number(e.target.value) || 0)}
              data-test-id="purchase-return-status-position"
            />
          </div>

          {error && (
            <div
              className="text-[var(--ms-text-destructive)] text-sm"
              data-test-id="purchase-return-status-error"
            >
              {error}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
