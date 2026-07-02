'use client';

/**
 * HR Employees list — "Изменить ▾" bulk-actions dropdown — moysklad parity.
 *
 * Source-of-truth: docs/moysklad-reference/employees/states/metadata.json +
 * 03-edit-dropdown.png (captured 2026-05-30 via `pnpm capture-moysklad
 * employees`). moysklad's #employee is a real Settings → Справочники catalog
 * list, and its «Изменить» menu — enabled once ≥1 row is selected — has
 * exactly THREE items, in this order:
 *   1. Удалить            (bulk-delete  — hard delete, FK-guarded server-side)
 *   2. Поместить в архив  (bulk-archive — POST /hr/employees/bulk-archive)
 *   3. Извлечь из архива  (bulk-restore — POST /hr/employees/bulk-restore)
 * No «Копировать» / «Массовое редактирование» / «Переместить» / «Цены» —
 * the employee catalog menu is thinner than products/counterparties.
 *
 * Hard delete usually fails for real employees (FK Restrict on Payroll,
 * CashierSession, attendance/KPI logs, …), so each action runs per-id via the
 * server's runBulk and we surface a partial-result toast ("3 done, 2 failed:
 * has linked records — archive instead") rather than a silent invalidate.
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { hrEmployeeApi } from '@/lib/hr-api';
import type { HrBulkResult } from '@/lib/hr-api';
import { Button, DropdownMenu, Icons, useConfirm, useToast } from '@moysklad/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

export interface EmployeeBulkActionsDropdownProps {
  selectedIds: Set<string>;
  /**
   * Whether the list is currently showing the ARCHIVED view. moysklad enables
   * «Поместить в архив» only in the active view and «Извлечь из архива» only in
   * the archived view, so we gate the two items on this.
   */
  archivedView: boolean;
  onClearSelection: () => void;
}

export function EmployeeBulkActionsDropdown({
  selectedIds,
  archivedView,
  onClearSelection,
}: EmployeeBulkActionsDropdownProps) {
  const t = useTranslations('bulk_actions');
  const tBulk = useTranslations('bulk');
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const qc = useQueryClient();
  const ids = Array.from(selectedIds);
  const hasSelection = ids.length > 0;

  // runBulk never throws — it resolves with per-id outcomes even when every
  // id failed. So success-path handling must inspect the body and report.
  const report = (res: HrBulkResult) => {
    // Broad invalidate (not the exact tuple) so BOTH the active and archived
    // views refresh — an archive moves a row between them.
    qc.invalidateQueries({ queryKey: ['hr-employees'] });
    onClearSelection();
    if (res.failed.length === 0) {
      toast.success(tBulk('result_all_ok', { count: res.total }));
      return;
    }
    // Surface the (usually identical) failure reason so the user knows WHY —
    // e.g. "Bog'liq yozuvlar bor — …, arxivga oling" for FK-restricted rows.
    const reason = res.failed[0]?.error ?? '';
    if (res.succeeded.length === 0) {
      toast.error(tBulk('result_all_failed', { count: res.total }), { description: reason });
    } else {
      toast.error(
        tBulk('result_partial', { ok: res.succeeded.length, failed: res.failed.length }),
        {
          description: reason,
        },
      );
    }
  };

  const bulkDelete = useApiMutation({
    mutationFn: (rowIds: string[]) => hrEmployeeApi.bulkDelete(rowIds),
    onSuccess: report,
  });
  const bulkArchive = useApiMutation({
    mutationFn: (rowIds: string[]) => hrEmployeeApi.bulkArchive(rowIds),
    onSuccess: report,
  });
  const bulkRestore = useApiMutation({
    mutationFn: (rowIds: string[]) => hrEmployeeApi.bulkRestore(rowIds),
    onSuccess: report,
  });

  const isPending = bulkDelete.isPending || bulkArchive.isPending || bulkRestore.isPending;

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

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary" disabled={!hasSelection || isPending}>
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="employee-bulk-actions-dropdown"
    >
      <DropdownMenu.Item
        onSelect={handleDelete}
        destructive
        disabled={!hasSelection || isPending}
        testId="employee-bulk-action-delete"
      >
        {t('delete')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handleArchive}
        disabled={!hasSelection || isPending || archivedView}
        testId="employee-bulk-action-archive"
      >
        {tBulk('archive')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={handleRestore}
        disabled={!hasSelection || isPending || !archivedView}
        testId="employee-bulk-action-restore"
      >
        {tBulk('restore')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
