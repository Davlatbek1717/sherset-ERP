'use client';

/**
 * Demand list — "Изменить ▾" bulk-actions dropdown — moysklad parity.
 *
 * Source-of-truth: docs/moysklad-reference/demands/states/metadata.json
 * (captured 2026-05-29 via `pnpm capture-moysklad demands`).
 *
 * Authoritative moysklad item set — 6 items, no separators, no «soon» hints
 * (no Зарезервировать / Очистить резерв since demands are post-shipment
 * and reservations don't apply):
 *   1. Удалить
 *   2. Копировать
 *   3. Массовое редактирование
 *   4. Провести        (disabled when all selected are already posted)
 *   5. Снять проведение (enabled when ≥1 is posted)
 *   6. Объединить      (disabled placeholder — no backend endpoint yet)
 *
 * The transition slugs match Demand's FSM verb-style schema (`post` /
 * `unpost`) — NOT the state names (`posted` / `draft`). Verified
 * against apps/api/src/modules/demand/demand.schema.ts
 * `DemandTransitionSchema = z.enum(['post','unpost','cancel'])`.
 *
 * Audit 2026-05-29 (Phase 2 vs metadata.json): removed the mid-list
 * separator and the «(soon)» suffixes that moysklad does not show;
 * wired Копировать via the per-id /clone fan-out pattern and exposed
 * the Массовое редактирование callback so the dropdown opens the
 * page-owned MassEditModal (same UX as the bulk action bar).
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

export interface DemandBulkActionsDropdownProps {
  selectedIds: Set<string>;
  listQueryKey: readonly unknown[];
  onClearSelection: () => void;
  /** Number of rows already in `posted` state — used to gate the
   *  Провести / Снять проведение items per moysklad's UI. */
  postedCount?: number;
  /** Opens the page-owned MassEditModal (Массовое редактирование). */
  onMassEdit?: () => void;
}

export function DemandBulkActionsDropdown({
  selectedIds,
  listQueryKey,
  onClearSelection,
  postedCount = 0,
  onMassEdit,
}: DemandBulkActionsDropdownProps) {
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
      api.post<BulkResult>('/demands/bulk-delete', { ids: rowIds }),
    onSuccess: invalidate,
  });

  const bulkTransition = useApiMutation({
    mutationFn: async (input: { ids: string[]; target: string }) =>
      api.post<BulkResult>('/demands/bulk-transition', input),
    onSuccess: invalidate,
  });

  // Копировать — moysklad clones each selected demand into a fresh draft.
  // There is no bulk-clone endpoint; the per-id POST :id/clone is fanned out
  // with allSettled so a single failure doesn't abort the rest (mirrors
  // CustomerOrder dropdown — same runBulk partial-success semantics).
  const bulkClone = useApiMutation({
    mutationFn: async (rowIds: string[]) => {
      await Promise.allSettled(rowIds.map((id) => api.post(`/demands/${id}/clone`, {})));
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
      title: tBulk('transition_confirm', {
        count: ids.length,
        target: t('confirm'),
      }),
      confirmLabel: t('confirm'),
      cancelLabel: tBulk('clear_selection'),
      tone: 'default',
    });
    if (ok) bulkTransition.mutate({ ids, target: 'post' });
  };

  const handleUnpost = async () => {
    const ok = await confirm({
      title: tBulk('transition_confirm', {
        count: ids.length,
        target: t('unconfirm'),
      }),
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
        <Button variant="secondary" disabled={!hasSelection || isPending}>
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="demand-bulk-actions-dropdown"
    >
      <DropdownMenu.Item
        onSelect={handleDelete}
        destructive
        disabled={!hasSelection || isPending}
        testId="demand-bulk-action-delete"
      >
        {t('delete')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handleCopy}
        disabled={!hasSelection || isPending}
        testId="demand-bulk-action-copy"
      >
        {t('copy')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={onMassEdit}
        disabled={!hasSelection || isPending || !onMassEdit}
        testId="demand-bulk-action-mass-edit"
      >
        {t('mass_edit')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handlePost}
        disabled={!hasSelection || isPending || allPosted}
        testId="demand-bulk-action-confirm"
      >
        {t('confirm')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handleUnpost}
        disabled={!hasSelection || isPending || !somePosted}
        testId="demand-bulk-action-unconfirm"
      >
        {t('unconfirm')}
      </DropdownMenu.Item>
      <DropdownMenu.Item disabled testId="demand-bulk-action-merge">
        {t('merge')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
