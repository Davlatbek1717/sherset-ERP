'use client';

/**
 * Enter list — "Изменить ▾" bulk-actions dropdown — moysklad parity.
 *
 * Source-of-truth: docs/moysklad-reference/enters/states/metadata.json
 * (captured 2026-05-30 via `pnpm capture-moysklad enters`).
 *
 * Authoritative moysklad item set — 6 items, no separators, no «soon» hints:
 *   1. Удалить
 *   2. Копировать
 *   3. Массовое редактирование
 *   4. Провести
 *   5. Снять проведение
 *   6. Объединить       (disabled placeholder)
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

export interface EnterBulkActionsDropdownProps {
  selectedIds: Set<string>;
  listQueryKey: readonly unknown[];
  onClearSelection: () => void;
  postedCount?: number;
  onMassEdit?: () => void;
}

export function EnterBulkActionsDropdown({
  selectedIds,
  listQueryKey,
  onClearSelection,
  postedCount = 0,
  onMassEdit,
}: EnterBulkActionsDropdownProps) {
  const t = useTranslations('bulk_actions');
  const tBulk = useTranslations('bulk');
  const { confirm } = useConfirm();
  const qc = useQueryClient();
  const ids = Array.from(selectedIds);
  const hasSelection = ids.length > 0;
  const allPosted = hasSelection && postedCount === ids.length;
  const somePosted = postedCount > 0;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: listQueryKey });
    onClearSelection();
  };

  const bulkDelete = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<BulkResult>('/enters/bulk-delete', { ids: rowIds }),
    onSuccess: invalidate,
  });

  const bulkTransition = useApiMutation({
    mutationFn: async (input: { ids: string[]; target: string }) =>
      api.post<BulkResult>('/enters/bulk-transition', input),
    onSuccess: invalidate,
  });

  const bulkClone = useApiMutation({
    mutationFn: async (rowIds: string[]) => {
      await Promise.allSettled(rowIds.map((id) => api.post(`/enters/${id}/clone`, {})));
    },
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

  const handlePost = async () => {
    const ok = await confirm({
      title: tBulk('transition_confirm', { count: ids.length, target: t('confirm') }),
      confirmLabel: t('confirm'),
      cancelLabel: tBulk('clear_selection'),
      tone: 'default',
    });
    if (ok) bulkTransition.mutate({ ids, target: 'post' });
  };

  const handleUnpost = async () => {
    const ok = await confirm({
      title: tBulk('transition_confirm', { count: ids.length, target: t('unconfirm') }),
      confirmLabel: t('unconfirm'),
      cancelLabel: tBulk('clear_selection'),
      tone: 'default',
    });
    if (ok) bulkTransition.mutate({ ids, target: 'unpost' });
  };

  const handleCopy = async () => {
    const ok = await confirm({
      title: tBulk('copy_confirm', { count: ids.length }),
      confirmLabel: t('copy'),
      cancelLabel: tBulk('clear_selection'),
      tone: 'default',
    });
    if (ok) bulkClone.mutate(ids);
  };

  const isPending = bulkDelete.isPending || bulkTransition.isPending || bulkClone.isPending;

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary" disabled={isPending}>
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="enter-bulk-actions-dropdown"
    >
      <DropdownMenu.Item
        onSelect={handleDelete}
        destructive
        disabled={!hasSelection || isPending}
        testId="enter-bulk-action-delete"
      >
        {t('delete')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handleCopy}
        disabled={!hasSelection || isPending}
        testId="enter-bulk-action-copy"
      >
        {t('copy')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={onMassEdit}
        disabled={isPending || !onMassEdit}
        testId="enter-bulk-action-mass-edit"
      >
        {t('mass_edit')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handlePost}
        disabled={!hasSelection || isPending || allPosted}
        testId="enter-bulk-action-confirm"
      >
        {t('confirm')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handleUnpost}
        disabled={!hasSelection || isPending || !somePosted}
        testId="enter-bulk-action-unconfirm"
      >
        {t('unconfirm')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="enter-bulk-action-merge">
        {t('merge')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
