'use client';

/**
 * "Статус ▾" quick-change dropdown for Возвраты поставщикам (purchase-returns) —
 * moysklad parity. Mirrors the supply StatusChangeDropdown: there is no FSM
 * fallback / bulk-transition here. The return FSM lifecycle
 * («Провести»/«Снять проведение») lives in the «Изменить» menu
 * (PurchaseReturnBulkActionsDropdown); this dropdown ONLY assigns the account's
 * custom statuses (State rows, entityType="purchasereturn") via
 * POST /purchase-returns/bulk-set-status, which sends `statusId` (a State id or
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

/** One account-defined custom purchase-return status (a State row). */
export interface PurchaseReturnCustomStatus {
  id: string;
  name: string;
  color: string | null;
}

export interface PurchaseReturnStatusDropdownProps {
  selectedIds: Set<string>;
  listQueryKey: readonly unknown[];
  onClearSelection: () => void;
  /**
   * Account-defined custom statuses (State rows, entityType="purchasereturn").
   * When non-empty, the dropdown lists these and applies them via
   * bulk-set-status (statusId).
   */
  customStatuses?: PurchaseReturnCustomStatus[];
}

export function PurchaseReturnStatusDropdown({
  selectedIds,
  listQueryKey,
  onClearSelection,
  customStatuses = [],
}: PurchaseReturnStatusDropdownProps) {
  const t = useTranslations('status_change');
  const tBulk = useTranslations('bulk');
  const { confirm } = useConfirm();
  const qc = useQueryClient();
  const ids = Array.from(selectedIds);
  const hasSelection = ids.length > 0;

  const hasCustom = customStatuses.length > 0;

  const bulkSetStatus = useApiMutation({
    mutationFn: async (input: { ids: string[]; statusId: string | null }) =>
      api.post<BulkResult>('/purchase-returns/bulk-set-status', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listQueryKey });
      onClearSelection();
    },
  });

  const isPending = bulkSetStatus.isPending;

  const handlePickCustom = (status: PurchaseReturnCustomStatus) => async () => {
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
      testId="purchase-return-status-dropdown"
    >
      {hasCustom ? (
        customStatuses.map((s) => (
          <DropdownMenu.Item
            key={s.id}
            onSelect={handlePickCustom(s)}
            disabled={!hasSelection || isPending}
            testId={`purchase-return-status-option-${s.id}`}
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
        <DropdownMenu.Item disabled testId="purchase-return-status-configure-hint">
          {t('configure_hint')}
        </DropdownMenu.Item>
      )}
      <DropdownMenu.Item
        onSelect={handleClear}
        disabled={!hasSelection || isPending}
        testId="purchase-return-status-option-clear"
      >
        {t('clear')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
