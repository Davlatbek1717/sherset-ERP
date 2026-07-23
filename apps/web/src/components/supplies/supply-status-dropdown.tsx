'use client';

/**
 * "Статус ▾" quick-change dropdown for Приёмки (supplies) — moysklad parity.
 *
 * Mirrors the customer-order StatusChangeDropdown but supply-specific and
 * SIMPLER: there is no FSM fallback / bulk-transition here. The supply FSM
 * lifecycle («Провести»/«Снять проведение») lives in the «Изменить» menu
 * (SupplyBulkActionsDropdown); this dropdown ONLY assigns the account's custom
 * statuses (State rows, entityType="supply") via POST /supplies/bulk-set-status,
 * which sends `statusId` (a State id or null to clear) — never an enum slug.
 *
 * This pairs with the list's custom-status column and «Статус» filter, which
 * key off the same /states?entityType=supply query — all three light up
 * together for an account that has configured custom supply statuses.
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

/** One account-defined custom supply status (a State row). */
export interface SupplyCustomStatus {
  id: string;
  name: string;
  color: string | null;
}

export interface SupplyStatusDropdownProps {
  selectedIds: Set<string>;
  listQueryKey: readonly unknown[];
  onClearSelection: () => void;
  /**
   * Account-defined custom statuses (State rows, entityType="supply"). When
   * non-empty, the dropdown lists these and applies them via bulk-set-status
   * (statusId). Mirrors the list column + «Статус» filter, which key off the
   * same /states?entityType=supply query.
   */
  customStatuses?: SupplyCustomStatus[];
}

export function SupplyStatusDropdown({
  selectedIds,
  listQueryKey,
  onClearSelection,
  customStatuses = [],
}: SupplyStatusDropdownProps) {
  const t = useTranslations('status_change');
  const tBulk = useTranslations('bulk');
  const { confirm } = useConfirm();
  const qc = useQueryClient();
  const ids = Array.from(selectedIds);
  const hasSelection = ids.length > 0;

  const hasCustom = customStatuses.length > 0;

  const bulkSetStatus = useApiMutation({
    mutationFn: async (input: { ids: string[]; statusId: string | null }) =>
      api.post<BulkResult>('/supplies/bulk-set-status', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listQueryKey });
      onClearSelection();
    },
  });

  const isPending = bulkSetStatus.isPending;

  const handlePickCustom = (status: SupplyCustomStatus) => async () => {
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
      testId="supply-status-dropdown"
    >
      {hasCustom ? (
        customStatuses.map((s) => (
          <DropdownMenu.Item
            key={s.id}
            onSelect={handlePickCustom(s)}
            disabled={!hasSelection || isPending}
            testId={`supply-status-option-${s.id}`}
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
        <DropdownMenu.Item disabled testId="supply-status-configure-hint">
          {t('configure_hint')}
        </DropdownMenu.Item>
      )}
      <DropdownMenu.Item
        onSelect={handleClear}
        disabled={!hasSelection || isPending}
        testId="supply-status-option-clear"
      >
        {t('clear')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
