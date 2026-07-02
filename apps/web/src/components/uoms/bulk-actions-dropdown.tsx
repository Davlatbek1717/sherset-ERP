'use client';

/**
 * Unit-of-measure list — "Изменить ▾" bulk-actions dropdown — moysklad parity.
 *
 * Source-of-truth: docs/moysklad-reference/uoms/states/metadata.json + FINDING.md
 * (captured 2026-05-30 via `pnpm capture-moysklad uoms`).
 *
 * moysklad's Единицы измерения «Изменить» menu has exactly TWO items (it is the
 * 2-item system-catalog menu, NOT the 4-item archive catalog — uoms have no
 * archived state):
 *   1. Удалить                 (bulk-delete — POST /uoms/bulk-delete)
 *   2. Массовое редактирование  (DISABLED label-parity placeholder)
 *
 * «Массовое редактирование» is disabled on purpose: moysklad itself errors when
 * you try to mass-edit the system uoms ("Массовое редактирование разных типов
 * справочников недоступно, выставите фильтр по конкретному типу справочника" —
 * captured live), so there is no faithful behaviour to wire. Kept visible+greyed
 * (the assortment/projects «Копировать» convention) rather than silently dropped.
 * No «Печать» (the print button is absent on this catalog).
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

export interface UomBulkActionsDropdownProps {
  selectedIds: Set<string>;
  listQueryKey: readonly unknown[];
  onClearSelection: () => void;
}

export function UomBulkActionsDropdown({
  selectedIds,
  listQueryKey,
  onClearSelection,
}: UomBulkActionsDropdownProps) {
  const t = useTranslations('bulk_actions');
  const tBulk = useTranslations('bulk');
  const { confirm } = useConfirm();
  const qc = useQueryClient();
  const ids = Array.from(selectedIds);
  const hasSelection = ids.length > 0;

  const bulkDelete = useApiMutation({
    mutationFn: async (rowIds: string[]) =>
      api.post<BulkResult>('/uoms/bulk-delete', { ids: rowIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listQueryKey });
      onClearSelection();
    },
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

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary" disabled={!hasSelection || bulkDelete.isPending}>
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="uom-bulk-actions-dropdown"
    >
      <DropdownMenu.Item
        onSelect={handleDelete}
        destructive
        disabled={!hasSelection || bulkDelete.isPending}
        testId="uom-bulk-action-delete"
      >
        {t('delete')}
      </DropdownMenu.Item>
      {/* «Массовое редактирование» — label-parity placeholder. moysklad errors
          on mass-editing system uoms, so there is no faithful behaviour to wire;
          kept disabled like the assortment «Копировать». */}
      <DropdownMenu.Item disabled testId="uom-bulk-action-mass-edit">
        {t('mass_edit')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
