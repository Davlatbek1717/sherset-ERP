'use client';

/**
 * Project list — "Изменить ▾" bulk-actions dropdown — moysklad parity.
 *
 * Source-of-truth: docs/moysklad-reference/projects/states/metadata.json
 * (captured 2026-05-30 via `pnpm capture-moysklad projects`).
 *
 * Authoritative moysklad item set — 5 items (Проекты is the counterparties
 * pattern: archive/restore catalog, NOT post/unpost FSM document). Captured
 * with 0 rows selected, so only «Массовое редактирование» is enabled; the
 * other four become enabled once ≥1 row is checked. No «Печать» (the print
 * button is absent on this catalog — same as Сотрудники):
 *   1. Удалить                (bulk-delete — POST /projects/bulk-delete)
 *   2. Копировать             (disabled placeholder — no clone backend, the
 *                              parity-honest convention used by assortment)
 *   3. Массовое редактирование (delegates to the page-owned MassEditModal)
 *   4. Поместить в архив      (bulk-archive — POST /projects/bulk-archive)
 *   5. Извлечь из архива      (bulk-restore — POST /projects/bulk-restore)
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { Button, DropdownMenu, Icons, useConfirm } from '@moysklad/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

interface BulkResult {
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

export interface ProjectBulkActionsDropdownProps {
  selectedIds: Set<string>;
  listQueryKey: readonly unknown[];
  onClearSelection: () => void;
  /** Opens the page-owned MassEditModal (Массовое редактирование). */
  onMassEdit?: () => void;
}

export function ProjectBulkActionsDropdown({
  selectedIds,
  listQueryKey,
  onClearSelection,
  onMassEdit,
}: ProjectBulkActionsDropdownProps) {
  const t = useTranslations('bulk_actions');
  const tBulk = useTranslations('bulk');
  const { confirm } = useConfirm();
  const qc = useQueryClient();
  const ids = Array.from(selectedIds);
  const hasSelection = ids.length > 0;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: listQueryKey });
    onClearSelection();
  };

  const bulkDelete = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<BulkResult>('/projects/bulk-delete', { ids: rowIds }),
    onSuccess: invalidate,
  });

  const bulkArchive = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<BulkResult>('/projects/bulk-archive', { ids: rowIds }),
    onSuccess: invalidate,
  });

  const bulkRestore = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<BulkResult>('/projects/bulk-restore', { ids: rowIds }),
    onSuccess: invalidate,
  });

  const handleDelete = async () => {
    const ok = await confirm({
      title: tBulk('delete_confirm', { count: ids.length }),
      confirmLabel: tBulk('delete'),
      cancelLabel: tBulk('clear_selection'),
      tone: 'destructive',
    });
    if (ok) bulkDelete.mutate(ids);
  };

  const handleArchive = async () => {
    const ok = await confirm({
      title: tBulk('archive_confirm', { count: ids.length }),
      confirmLabel: tBulk('archive'),
      cancelLabel: tBulk('clear_selection'),
      tone: 'default',
    });
    if (ok) bulkArchive.mutate(ids);
  };

  const handleRestore = async () => {
    const ok = await confirm({
      title: tBulk('restore_confirm', { count: ids.length }),
      confirmLabel: tBulk('restore'),
      cancelLabel: tBulk('clear_selection'),
      tone: 'default',
    });
    if (ok) bulkRestore.mutate(ids);
  };

  const isPending = bulkDelete.isPending || bulkArchive.isPending || bulkRestore.isPending;

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary" disabled={isPending}>
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="project-bulk-actions-dropdown"
    >
      <DropdownMenu.Item
        onSelect={handleDelete}
        destructive
        disabled={!hasSelection || isPending}
        testId="project-bulk-action-delete"
      >
        {t('delete')}
      </DropdownMenu.Item>
      {/* «Копировать» — label-parity placeholder. No /projects/:id/clone
          backend (and copying would need to null the unique code); kept
          disabled like the assortment «Копировать», never wired to a 404. */}
      <DropdownMenu.Item disabled testId="project-bulk-action-copy">
        {t('copy')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={onMassEdit}
        disabled={isPending || !onMassEdit}
        testId="project-bulk-action-mass-edit"
      >
        {t('mass_edit')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handleArchive}
        disabled={!hasSelection || isPending}
        testId="project-bulk-action-archive"
      >
        {tBulk('archive')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handleRestore}
        disabled={!hasSelection || isPending}
        testId="project-bulk-action-restore"
      >
        {tBulk('restore')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
