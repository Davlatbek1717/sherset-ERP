'use client';

/**
 * Sales-return list — "Изменить ▾" bulk-actions dropdown — moysklad parity.
 *
 * Item set sibling-mirrored from SupplyBulkActionsDropdown (document-list
 * family) — 6 items, no separators, no «soon» hints (returns don't have
 * reservation, so no Зарезервировать / Очистить резерв):
 *   1. Удалить
 *   2. Копировать
 *   3. Массовое редактирование
 *   4. Провести        (disabled when all selected are already posted)
 *   5. Снять проведение (enabled when ≥1 is posted)
 *   6. Объединить      (disabled placeholder — no backend endpoint yet)
 *
 * SalesReturn's FSM uses verb-style transition slugs (`post` / `unpost`);
 * see apps/api/src/modules/sales-return/sales-return.schema.ts.
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

export interface SalesReturnBulkActionsDropdownProps {
  selectedIds: Set<string>;
  listQueryKey: readonly unknown[];
  onClearSelection: () => void;
  /** Number of rows already in `posted` state — used to gate the
   *  Провести / Снять проведение items per moysklad's UI. */
  postedCount?: number;
  /** Opens the page-owned MassEditModal (Массовое редактирование). */
  onMassEdit?: () => void;
}

export function SalesReturnBulkActionsDropdown({
  selectedIds,
  listQueryKey,
  onClearSelection,
  postedCount = 0,
  onMassEdit,
}: SalesReturnBulkActionsDropdownProps) {
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
      api.post<BulkResult>('/sales-returns/bulk-delete', { ids: rowIds }),
    onSuccess: invalidate,
  });

  const bulkTransition = useApiMutation({
    mutationFn: async (input: { ids: string[]; target: string }) =>
      api.post<BulkResult>('/sales-returns/bulk-transition', input),
    onSuccess: invalidate,
  });

  // Копировать — moysklad clones each selected return into a fresh draft.
  // Per-id POST :id/clone fanned out via allSettled (mirrors supplies —
  // same partial-success semantics as runBulk).
  const bulkClone = useApiMutation({
    mutationFn: async (rowIds: string[]) => {
      await Promise.allSettled(rowIds.map((id) => api.post(`/sales-returns/${id}/clone`, {})));
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
      testId="sales-return-bulk-actions-dropdown"
    >
      <DropdownMenu.Item
        onSelect={handleDelete}
        destructive
        disabled={!hasSelection || isPending}
        testId="sales-return-bulk-action-delete"
      >
        {t('delete')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handleCopy}
        disabled={!hasSelection || isPending}
        testId="sales-return-bulk-action-copy"
      >
        {t('copy')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={onMassEdit}
        disabled={isPending || !onMassEdit}
        testId="sales-return-bulk-action-mass-edit"
      >
        {t('mass_edit')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handlePost}
        disabled={!hasSelection || isPending || allPosted}
        testId="sales-return-bulk-action-confirm"
      >
        {t('confirm')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handleUnpost}
        disabled={!hasSelection || isPending || !somePosted}
        testId="sales-return-bulk-action-unconfirm"
      >
        {t('unconfirm')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="sales-return-bulk-action-merge">
        {t('merge')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
