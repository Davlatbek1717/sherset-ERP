'use client';

/**
 * "Статус ▾" quick-change dropdown for Возвраты покупателей (sales-returns) —
 * moysklad parity. Mirrors the purchase-return / supply StatusChangeDropdown:
 * there is no FSM fallback / bulk-transition here. The return FSM lifecycle
 * («Провести»/«Снять проведение») lives in the «Изменить» menu
 * (SalesReturnBulkActionsDropdown); this dropdown ONLY assigns the account's
 * custom statuses (State rows, entityType="salesreturn") via
 * POST /sales-returns/bulk-set-status, which sends `statusId` (a State id or
 * null to clear) — never an enum slug.
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

/** One account-defined custom sales-return status (a State row). */
export interface SalesReturnCustomStatus {
  id: string;
  name: string;
  color: string | null;
}

export interface SalesReturnStatusDropdownProps {
  selectedIds: Set<string>;
  listQueryKey: readonly unknown[];
  onClearSelection: () => void;
  /**
   * Account-defined custom statuses (State rows, entityType="salesreturn").
   * When non-empty, the dropdown lists these and applies them via
   * bulk-set-status (statusId).
   */
  customStatuses?: SalesReturnCustomStatus[];
}

export function SalesReturnStatusDropdown({
  selectedIds,
  listQueryKey,
  onClearSelection,
  customStatuses = [],
}: SalesReturnStatusDropdownProps) {
  const t = useTranslations('status_change');
  const tBulk = useTranslations('bulk');
  const { confirm } = useConfirm();
  const qc = useQueryClient();
  const ids = Array.from(selectedIds);
  const hasSelection = ids.length > 0;

  const hasCustom = customStatuses.length > 0;

  const bulkSetStatus = useApiMutation({
    mutationFn: async (input: { ids: string[]; statusId: string | null }) =>
      api.post<BulkResult>('/sales-returns/bulk-set-status', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listQueryKey });
      onClearSelection();
    },
  });

  const isPending = bulkSetStatus.isPending;

  const handlePickCustom = (status: SalesReturnCustomStatus) => async () => {
    const ok = await confirm({
      title: tBulk('transition_confirm', { count: ids.length, target: status.name }),
      confirmLabel: status.name,
      cancelLabel: tBulk('clear_selection'),
    });
    if (ok) bulkSetStatus.mutate({ ids, statusId: status.id });
  };

  const handleClear = async () => {
    const ok = await confirm({
      title: tBulk('transition_confirm', { count: ids.length, target: t('clear') }),
      confirmLabel: t('clear'),
      cancelLabel: tBulk('clear_selection'),
    });
    if (ok) bulkSetStatus.mutate({ ids, statusId: null });
  };

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary" disabled={!hasSelection || isPending}>
          {t('trigger')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="sales-return-status-dropdown"
    >
      {hasCustom ? (
        customStatuses.map((s) => (
          <DropdownMenu.Item
            key={s.id}
            onSelect={handlePickCustom(s)}
            disabled={!hasSelection || isPending}
            testId={`sales-return-status-option-${s.id}`}
            icon={
              <span
                className="block h-3 w-3 rounded-sm border border-[var(--ms-border-default)]"
                style={{ backgroundColor: s.color ?? 'var(--ms-text-muted)' }}
                aria-hidden
              />
            }
          >
            {s.name}
          </DropdownMenu.Item>
        ))
      ) : (
        <DropdownMenu.Item disabled testId="sales-return-status-configure-hint">
          {t('configure_hint')}
        </DropdownMenu.Item>
      )}
      <DropdownMenu.Item
        onSelect={handleClear}
        disabled={!hasSelection || isPending}
        testId="sales-return-status-option-clear"
      >
        {t('clear')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
