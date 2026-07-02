'use client';

/**
 * Inventory list — "Изменить ▾" bulk-actions dropdown — moysklad parity.
 *
 * Source-of-truth: docs/moysklad-reference/inventories/states/metadata.json
 * (captured 2026-05-30 via `pnpm capture-moysklad inventories`).
 *
 * Authoritative moysklad item set — ONLY 3 items (inventories don't post/unpost
 * or get cloned the way other warehouse docs do — they're a snapshot-then-
 * adjust pattern):
 *   1. Удалить
 *   2. Массовое редактирование
 *   3. Объединить       (disabled placeholder)
 *
 * NOTE: No Копировать / Провести / Снять проведение — confirmed via
 * `pnpm capture-moysklad inventories` 2026-05-30 metadata dump.
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

export interface InventoryBulkActionsDropdownProps {
  selectedIds: Set<string>;
  listQueryKey: readonly unknown[];
  onClearSelection: () => void;
  onMassEdit?: () => void;
}

export function InventoryBulkActionsDropdown({
  selectedIds,
  listQueryKey,
  onClearSelection,
  onMassEdit,
}: InventoryBulkActionsDropdownProps) {
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
      api.post<BulkResult>('/inventories/bulk-delete', { ids: rowIds }),
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

  const isPending = bulkDelete.isPending;

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary" disabled={!hasSelection || isPending}>
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="inventory-bulk-actions-dropdown"
    >
      <DropdownMenu.Item
        onSelect={handleDelete}
        destructive
        disabled={!hasSelection || isPending}
        testId="inventory-bulk-action-delete"
      >
        {t('delete')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={onMassEdit}
        disabled={!hasSelection || isPending || !onMassEdit}
        testId="inventory-bulk-action-mass-edit"
      >
        {t('mass_edit')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="inventory-bulk-action-merge">
        {t('merge')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
