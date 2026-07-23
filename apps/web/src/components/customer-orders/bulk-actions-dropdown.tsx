'use client';

/**
 * Bulk-actions toolbar dropdown for /customer-orders — moysklad parity.
 *
 * Mirrors the moysklad "Изменить ▾" GWT popup-button-popup-menu (8 items
 * + 1 separator), captured 2026-04-30 in
 * docs/moysklad-reference/visual-captures/03-module/customerorder/
 *   screenshots/i-dropdown-izmenit.dom.html
 *
 * Item enabled-state logic mirrors moysklad: bulk-confirm is disabled
 * if every selected row is already confirmed; bulk-unconfirm is enabled
 * when ≥1 row is confirmed. Wired actions: Удалить (bulk-delete),
 * Копировать (per-id :id/clone fan-out), Массовое редактирование,
 * Провести/Снять проведение (bulk-transition), Объединить (POST /merge →
 * navigate to the new draft), Зарезервировать / Очистить резерв
 * (bulk-reserve / bulk-clear-reserve). Объединить needs ≥2 rows (a single
 * order can't be merged), mirroring moysklad's disabled-on-one-row state.
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { Button, DropdownMenu, Icons, useConfirm } from '@moysklad/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

interface BulkResult {
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

export interface BulkActionsDropdownProps {
  selectedIds: Set<string>;
  listQueryKey: readonly unknown[];
  onClearSelection: () => void;
  /** Number of rows that are already in `confirmed` state (for FSM gating). */
  confirmedCount?: number;
  /** Opens the mass-edit modal (Массовое редактирование). Wired in page.tsx. */
  onMassEdit?: () => void;
}

export function BulkActionsDropdown({
  selectedIds,
  listQueryKey,
  onClearSelection,
  confirmedCount = 0,
  onMassEdit,
}: BulkActionsDropdownProps) {
  const t = useTranslations('bulk_actions');
  const tBulk = useTranslations('bulk');
  const { confirm } = useConfirm();
  const qc = useQueryClient();
  const router = useRouter();
  const ids = Array.from(selectedIds);
  const hasSelection = ids.length > 0;
  const canMerge = ids.length >= 2;
  const allConfirmed = hasSelection && confirmedCount === ids.length;
  const someConfirmed = confirmedCount > 0;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: listQueryKey });
    onClearSelection();
  };

  const bulkDelete = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<BulkResult>('/customer-orders/bulk-delete', { ids: rowIds }),
    onSuccess: invalidate,
  });

  const bulkTransition = useApiMutation({
    mutationFn: async (input: { ids: string[]; target: string }) =>
      api.post<BulkResult>('/customer-orders/bulk-transition', input),
    onSuccess: invalidate,
  });

  // Копировать — moysklad clones each selected order into a fresh draft.
  // There is no bulk-clone endpoint; the per-id POST :id/clone is fanned out
  // with allSettled so a single failure doesn't abort the rest (mirrors the
  // server-side runBulk partial-success semantics used by bulk-delete).
  const bulkClone = useApiMutation({
    mutationFn: async (rowIds: string[]) => {
      await Promise.allSettled(rowIds.map((id) => api.post(`/customer-orders/${id}/clone`, {})));
    },
    onSuccess: invalidate,
  });

  // Объединить — server combines the selected orders into ONE new draft and
  // returns its id; we navigate to that draft (the sources are left intact),
  // matching moysklad which opens the merged order for editing.
  const bulkMerge = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<{ id: string }>('/customer-orders/merge', { ids: rowIds }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: listQueryKey });
      onClearSelection();
      router.push(`/customer-orders/${res.id}`);
    },
  });

  const bulkReserve = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<BulkResult>('/customer-orders/bulk-reserve', { ids: rowIds }),
    onSuccess: invalidate,
  });

  const bulkClearReserve = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<BulkResult>('/customer-orders/bulk-clear-reserve', { ids: rowIds }),
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

  // Note on FSM target slugs: customer-order's bulk-transition endpoint
  // validates `target` against OrderStateSchema (the actual state enum
  // — draft / confirmed / cancelled / paid / etc.) — not against FSM
  // action verbs. So "Provedeno" (confirm) maps to `'confirmed'` and
  // "Snyat provedenie" (unconfirm) maps to `'draft'`. Sending verbs
  // like 'confirm' or 'unpost' would produce a 400 "Unknown state"
  // from the controller. This was the source of the silent failure
  // before this fix (existing useBulkDocumentActions used the wrong
  // slugs too — see the hook usage in page.tsx for the parallel fix).
  const handleConfirm = async () => {
    const ok = await confirm({
      title: tBulk('transition_confirm', {
        count: ids.length,
        target: t('confirm'),
      }),
      confirmLabel: t('confirm'),
      cancelLabel: tBulk('clear_selection'),
      tone: 'default',
    });
    if (ok) bulkTransition.mutate({ ids, target: 'confirmed' });
  };

  const handleUnconfirm = async () => {
    const ok = await confirm({
      title: tBulk('transition_confirm', {
        count: ids.length,
        target: t('unconfirm'),
      }),
      confirmLabel: t('unconfirm'),
      cancelLabel: tBulk('clear_selection'),
      tone: 'default',
    });
    if (ok) bulkTransition.mutate({ ids, target: 'draft' });
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

  const handleMerge = async () => {
    const ok = await confirm({
      title: tBulk('merge_confirm', { count: ids.length }),
      confirmLabel: t('merge'),
      cancelLabel: tBulk('clear_selection'),
      tone: 'default',
    });
    if (ok) bulkMerge.mutate(ids);
  };

  const handleReserve = async () => {
    const ok = await confirm({
      title: tBulk('reserve_confirm', { count: ids.length }),
      confirmLabel: t('reserve'),
      cancelLabel: tBulk('clear_selection'),
      tone: 'default',
    });
    if (ok) bulkReserve.mutate(ids);
  };

  const handleClearReserve = async () => {
    const ok = await confirm({
      title: tBulk('clear_reserve_confirm', { count: ids.length }),
      confirmLabel: t('clear_reserve'),
      cancelLabel: tBulk('clear_selection'),
      tone: 'default',
    });
    if (ok) bulkClearReserve.mutate(ids);
  };

  // Audit 2026-05-29 (protokol Phase 2 vs metadata.json source-of-truth):
  // moysklad ko'rsatadi 8 ta item bir guruhda (orasida separator yo'q) — all 8
  // are now wired (Объединить/Зарезервировать/Очистить резерв added 2026-06-19).

  const isPending =
    bulkDelete.isPending ||
    bulkTransition.isPending ||
    bulkClone.isPending ||
    bulkMerge.isPending ||
    bulkReserve.isPending ||
    bulkClearReserve.isPending;

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary" disabled={isPending}>
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="bulk-actions-dropdown"
    >
      <DropdownMenu.Item
        onSelect={handleDelete}
        destructive
        disabled={!hasSelection || isPending}
        testId="bulk-action-delete"
      >
        {t('delete')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handleCopy}
        disabled={!hasSelection || isPending}
        testId="bulk-action-copy"
      >
        {t('copy')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={onMassEdit}
        disabled={isPending || !onMassEdit}
        testId="bulk-action-mass-edit"
      >
        {t('mass_edit')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handleConfirm}
        disabled={!hasSelection || isPending || allConfirmed}
        testId="bulk-action-confirm"
      >
        {t('confirm')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handleUnconfirm}
        disabled={!hasSelection || isPending || !someConfirmed}
        testId="bulk-action-unconfirm"
      >
        {t('unconfirm')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handleMerge}
        disabled={!canMerge || isPending}
        testId="bulk-action-merge"
      >
        {t('merge')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handleReserve}
        disabled={!hasSelection || isPending}
        testId="bulk-action-reserve"
      >
        {t('reserve')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handleClearReserve}
        disabled={!hasSelection || isPending}
        testId="bulk-action-clear-reserve"
      >
        {t('clear_reserve')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
