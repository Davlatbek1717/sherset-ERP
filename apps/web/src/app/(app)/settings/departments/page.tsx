'use client';

/**
 * /settings/departments — «Отделы» (departments / owner-groups) management.
 *
 * moysklad's `Group` reference: the «Отдел» behind every document's «Доступ»
 * widget and each employee's «Владелец-отдел». In moysklad these are managed
 * inside the Сотрудники/access admin; we surface a dedicated reference page
 * (consistent with our other Справочники settings) so they can be added /
 * renamed / deleted — previously they were seed-only (read via GET /groups).
 *
 * Single-page inline CRUD (name only) — a heavy detail page would be overkill.
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import {
  Button,
  type DataTableColumn,
  Input,
  ListView,
  Modal,
  useConfirm,
  useDebounce,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface DepartmentRow {
  id: string;
  name: string;
  index: number;
}
interface ListResponse {
  items: DepartmentRow[];
  total: number;
}

const LIMIT = 500;

export default function DepartmentsPage() {
  const t = useTranslations('departments');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { confirm } = useConfirm();

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams({ ...(search ? { search } : {}), limit: String(LIMIT) });

  const {
    data,
    isLoading,
    error: loadError,
    refetch,
  } = useQuery<ListResponse>({
    queryKey: ['departments', search],
    queryFn: () => api.get<ListResponse>(`/groups?${params.toString()}`),
  });

  const upsertMut = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim() };
      if (editing) return api.patch(`/groups/${editing.id}`, payload);
      return api.post('/groups', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      // every «Отдел» picker reads /groups — refresh them too
      qc.invalidateQueries({ queryKey: ['groups'] });
      closeModal();
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useApiMutation({
    mutationFn: (row: DepartmentRow) => api.delete(`/groups/${row.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  function openCreate() {
    setEditing(null);
    setName('');
    setError(null);
    setModalOpen(true);
  }
  function openEdit(row: DepartmentRow) {
    setEditing(row);
    setName(row.name);
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

  const columns: DataTableColumn<DepartmentRow>[] = [
    {
      key: 'name',
      header: t('name'),
      cell: (row) => (
        <button
          type="button"
          onClick={() => openEdit(row)}
          className="text-left font-medium text-[var(--ms-text-primary)] hover:text-[var(--ms-text-brand)] hover:underline"
          data-test-id={`department-name-${row.id}`}
        >
          {row.name}
        </button>
      ),
      cellText: (row) => row.name,
    },
    {
      key: 'actions',
      header: t('actions'),
      width: '120px',
      cell: (row) => (
        <button
          type="button"
          className="text-[var(--ms-text-destructive)] text-sm hover:underline"
          onClick={async () => {
            const ok = await confirm({
              title: t('delete_confirm', { name: row.name }),
              description: t('delete_hint'),
              confirmLabel: t('delete'),
              tone: 'destructive',
            });
            if (ok) deleteMut.mutate(row);
          }}
          disabled={deleteMut.isPending}
          data-test-id={`department-delete-${row.id}`}
        >
          {t('delete')}
        </button>
      ),
      cellText: () => '',
    },
  ];

  return (
    <>
      <ListView
        testId="departments-page"
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
        rowTestId={(row) => `department-row-${row.id}`}
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
        hasActiveFilter={false}
      />

      <Modal
        open={modalOpen}
        onOpenChange={(v) => (v ? undefined : closeModal())}
        title={editing ? editing.name : t('new')}
        widthClass="w-[440px]"
        testId="department-modal"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal}>
              {t('cancel')}
            </Button>
            <Button onClick={submit} disabled={upsertMut.isPending} data-test-id="department-save">
              {editing ? t('save') : t('create')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="department-name"
            className="font-medium text-[var(--ms-text-primary)] text-sm"
          >
            {t('name')}
          </label>
          <Input
            id="department-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            data-test-id="department-name-input"
          />
          {error && (
            <div
              className="mt-1 text-[var(--ms-text-destructive)] text-sm"
              data-test-id="department-error"
            >
              {error}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
