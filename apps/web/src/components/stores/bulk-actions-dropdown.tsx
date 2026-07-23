'use client';

/**
 * «Склады» list — «Изменить ▾» bulk dropdown — moysklad #warehouse parity.
 *
 * LIVE-grounded 2026-07-03 (docs/audits/stores-1to1-2026-07-03/GROUND.md,
 * ms-edit-menu-0/1.png). Exact item set + enable rules:
 *   1. Удалить                    (bulk-delete;   needs selection)
 *   2. Копировать                 (bulk-copy;     needs selection)
 *   ── separator ──
 *   3. Массовое редактирование    (ALWAYS enabled — even with 0 selected)
 *   4. Переместить                (bulk-move → «Выбор склада» picker; needs selection)
 *   5. Поместить в архив          (bulk-archive;  needs selection)
 *   6. Извлечь из архива          (bulk-restore;  needs selection — moysklad grays it
 *      for non-archived rows; we keep it actionable on any selection, the BE restore
 *      is a no-op for active rows)
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { Button, DropdownMenu, Icons, useConfirm } from '@moysklad/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { StorePickerDialog } from './store-picker-dialog';

interface BulkResult {
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

export function StoresBulkActionsDropdown({
  selectedIds,
  listQueryKey,
  onClearSelection,
  onMassEdit,
  triggerClassName,
}: {
  selectedIds: Set<string>;
  listQueryKey: readonly unknown[];
  onClearSelection: () => void;
  onMassEdit: () => void;
  triggerClassName?: string;
}) {
  const t = useTranslations('bulk_actions');
  const tBulk = useTranslations('bulk');
  const tStores = useTranslations('pages.stores');
  const { confirm } = useConfirm();
  const qc = useQueryClient();
  const [moveOpen, setMoveOpen] = useState(false);
  const ids = Array.from(selectedIds);
  const hasSelection = ids.length > 0;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: listQueryKey });
    qc.invalidateQueries({ queryKey: ['stores'] });
    onClearSelection();
  };

  const bulkDelete = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<BulkResult>('/admin/stores/bulk-delete', { ids: rowIds }),
    onSuccess: invalidate,
  });
  const bulkCopy = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<BulkResult>('/admin/stores/bulk-copy', { ids: rowIds }),
    onSuccess: invalidate,
  });
  const bulkArchive = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<BulkResult>('/admin/stores/bulk-archive', { ids: rowIds }),
    onSuccess: invalidate,
  });
  const bulkRestore = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<BulkResult>('/admin/stores/bulk-restore', { ids: rowIds }),
    onSuccess: invalidate,
  });
  const bulkMove = useApiMutation({
    mutationFn: async (parentId: string | null) =>
      api.post<BulkResult>('/admin/stores/bulk-move', { ids, parentId }),
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

  const isPending =
    bulkDelete.isPending ||
    bulkCopy.isPending ||
    bulkArchive.isPending ||
    bulkRestore.isPending ||
    bulkMove.isPending;

  return (
    <>
      <DropdownMenu
        trigger={
          <Button
            variant="secondary"
            disabled={isPending}
            className={triggerClassName}
            data-test-id="stores-bulk-trigger"
          >
            {t('trigger')}
            <Icons.down className="h-4 w-4" />
          </Button>
        }
        testId="stores-bulk-actions-dropdown"
      >
        <DropdownMenu.Item
          onSelect={handleDelete}
          destructive
          disabled={!hasSelection || isPending}
          testId="stores-bulk-delete"
        >
          {t('delete')}
        </DropdownMenu.Item>
        <DropdownMenu.Item
          onSelect={() => bulkCopy.mutate(ids)}
          disabled={!hasSelection || isPending}
          testId="stores-bulk-copy"
        >
          {t('copy')}
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        {/* moysklad: enabled even with nothing selected (opens over the filtered list). */}
        <DropdownMenu.Item
          onSelect={onMassEdit}
          disabled={isPending}
          testId="stores-bulk-mass-edit"
        >
          {t('mass_edit')}
        </DropdownMenu.Item>
        <DropdownMenu.Item
          onSelect={() => setMoveOpen(true)}
          disabled={!hasSelection || isPending}
          testId="stores-bulk-move"
        >
          {tStores('bulk_move')}
        </DropdownMenu.Item>
        <DropdownMenu.Item
          onSelect={handleArchive}
          disabled={!hasSelection || isPending}
          testId="stores-bulk-archive"
        >
          {tBulk('archive')}
        </DropdownMenu.Item>
        <DropdownMenu.Item
          onSelect={handleRestore}
          disabled={!hasSelection || isPending}
          testId="stores-bulk-restore"
        >
          {tBulk('restore')}
        </DropdownMenu.Item>
      </DropdownMenu>

      <StorePickerDialog
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        allowRoot
        excludeIds={ids}
        onSelect={(picked) => bulkMove.mutate(picked?.id ?? null)}
      />
    </>
  );
}
