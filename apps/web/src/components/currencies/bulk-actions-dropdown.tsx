'use client';

/**
 * Currency list — "Изменить ▾" bulk-actions dropdown — moysklad parity.
 *
 * Source-of-truth: docs/moysklad-reference/currencies/states/metadata.json +
 * FINDING.md (captured 2026-05-30 via `pnpm capture-moysklad currencies`).
 *
 * moysklad's Валюты «Изменить» menu is the 4-item archive catalog (the
 * counterparties/projects pattern, minus «Копировать» — you don't clone a
 * currency). Captured with 0 rows selected, so only «Массовое редактирование»
 * is enabled; the other three enable once ≥1 row is checked. No «Печать».
 *   1. Удалить                 (bulk-delete  — POST /currencies/bulk-delete)
 *   2. Массовое редактирование  (DISABLED label-parity placeholder)
 *   3. Поместить в архив        (bulk-archive — POST /currencies/bulk-archive)
 *   4. Извлечь из архива        (bulk-restore — POST /currencies/bulk-restore)
 *
 * «Массовое редактирование» is disabled on purpose: moysklad's currency
 * mass-edit modal edits ONLY the «Доступ» block (owner-employee /
 * owner-department / shared — captured live), and our Currency model carries
 * none of those columns (it is deliberately a simpler reference table). Editing
 * anything else (rate / name / code) would be fake parity, so the item is kept
 * visible+greyed rather than wired to invented fields. The base (валюта учёта)
 * and system currencies reject delete/archive server-side; bulk ops surface
 * that as a per-id partial failure (the row simply stays in the list).
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

export interface CurrencyBulkActionsDropdownProps {
  selectedIds: Set<string>;
  listQueryKey: readonly unknown[];
  onClearSelection: () => void;
}

export function CurrencyBulkActionsDropdown({
  selectedIds,
  listQueryKey,
  onClearSelection,
}: CurrencyBulkActionsDropdownProps) {
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
      api.post<BulkResult>('/currencies/bulk-delete', { ids: rowIds }),
    onSuccess: invalidate,
  });

  const bulkArchive = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<BulkResult>('/currencies/bulk-archive', { ids: rowIds }),
    onSuccess: invalidate,
  });

  const bulkRestore = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<BulkResult>('/currencies/bulk-restore', { ids: rowIds }),
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
        <Button variant="secondary" disabled={!hasSelection || isPending}>
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="currency-bulk-actions-dropdown"
    >
      <DropdownMenu.Item
        onSelect={handleDelete}
        destructive
        disabled={!hasSelection || isPending}
        testId="currency-bulk-action-delete"
      >
        {t('delete')}
      </DropdownMenu.Item>
      {/* «Массовое редактирование» — label-parity placeholder. moysklad's
          currency mass-edit edits only the Доступ block (owner/dept/shared),
          which our Currency model doesn't carry; kept disabled like the
          assortment «Копировать». */}
      <DropdownMenu.Item disabled testId="currency-bulk-action-mass-edit">
        {t('mass_edit')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handleArchive}
        disabled={!hasSelection || isPending}
        testId="currency-bulk-action-archive"
      >
        {tBulk('archive')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handleRestore}
        disabled={!hasSelection || isPending}
        testId="currency-bulk-action-restore"
      >
        {tBulk('restore')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
