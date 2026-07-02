'use client';

/**
 * Counterparty list — "Изменить ▾" bulk-actions dropdown — moysklad parity.
 *
 * Source-of-truth: docs/moysklad-reference/counterparties/states/metadata.json
 * (captured 2026-05-30 via `pnpm capture-moysklad counterparties`).
 *
 * Authoritative moysklad item set — 6 items, no separators, no «soon» hints.
 * NOTE: this is the CATALOG pattern (archive/restore not post/unpost — counterparties
 * aren't FSM-backed documents):
 *   1. Удалить
 *   2. Копировать
 *   3. Массовое редактирование
 *   4. Поместить в архив      (bulk-archive — backend: POST /counterparties/bulk-archive)
 *   5. Извлечь из архива      (bulk-restore — backend: POST /counterparties/bulk-restore)
 *   6. Объединить             (disabled placeholder)
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

export interface CounterpartyBulkActionsDropdownProps {
  selectedIds: Set<string>;
  listQueryKey: readonly unknown[];
  onClearSelection: () => void;
  /** Opens the page-owned MassEditModal (Массовое редактирование). */
  onMassEdit?: () => void;
}

export function CounterpartyBulkActionsDropdown({
  selectedIds,
  listQueryKey,
  onClearSelection,
  onMassEdit,
}: CounterpartyBulkActionsDropdownProps) {
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
      api.post<BulkResult>('/counterparties/bulk-delete', { ids: rowIds }),
    onSuccess: invalidate,
  });

  const bulkArchive = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<BulkResult>('/counterparties/bulk-archive', { ids: rowIds }),
    onSuccess: invalidate,
  });

  const bulkRestore = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<BulkResult>('/counterparties/bulk-restore', { ids: rowIds }),
    onSuccess: invalidate,
  });

  // NB: /counterparties/:id/clone endpoint does NOT exist on the backend
  // (counterparty is a catalog — only archive/restore/delete are wired).
  // Per moysklad metadata.json, Копировать is DISABLED by default in the
  // counterparty Изменить dropdown (label-parity placeholder, not a real
  // action). The earlier bulkClone fan-out silently 404'd — removed
  // 2026-05-31 to match moysklad exactly. See products dropdown comment
  // for the same pattern.

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
        <Button variant="secondary" disabled={!hasSelection || isPending}>
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="counterparty-bulk-actions-dropdown"
    >
      <DropdownMenu.Item
        onSelect={handleDelete}
        destructive
        disabled={!hasSelection || isPending}
        testId="counterparty-bulk-action-delete"
      >
        {t('delete')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="counterparty-bulk-action-copy">
        {t('copy')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={onMassEdit}
        disabled={!hasSelection || isPending || !onMassEdit}
        testId="counterparty-bulk-action-mass-edit"
      >
        {t('mass_edit')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handleArchive}
        disabled={!hasSelection || isPending}
        testId="counterparty-bulk-action-archive"
      >
        {tBulk('archive')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handleRestore}
        disabled={!hasSelection || isPending}
        testId="counterparty-bulk-action-restore"
      >
        {tBulk('restore')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="counterparty-bulk-action-merge">
        {t('merge')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
