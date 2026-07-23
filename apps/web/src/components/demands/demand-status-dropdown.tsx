'use client';

/**
 * "Статус ▾" quick-change dropdown for Отгрузки (demands) — moysklad parity.
 *
 * Mirrors the supply StatusDropdown but demand-specific. The demand FSM
 * lifecycle («Провести»/«Снять проведение») lives in the «Изменить» menu
 * (DemandBulkActionsDropdown); this dropdown ONLY assigns the account's custom
 * statuses (State rows, entityType="demand") via POST /demands/bulk-set-status,
 * which sends `statusId` (a State id or null to clear) — never an enum slug.
 *
 * This pairs with the list's «Статус» custom-status column (grey «Status»
 * placeholder until a status is set), both keyed off the same
 * /states?entityType=demand query — they light up together once an account has
 * configured custom shipment statuses.
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

/** One account-defined custom demand status (a State row). */
export interface DemandCustomStatus {
  id: string;
  name: string;
  color: string | null;
}

export interface DemandStatusDropdownProps {
  selectedIds: Set<string>;
  listQueryKey: readonly unknown[];
  onClearSelection: () => void;
  /**
   * Account-defined custom statuses (State rows, entityType="demand"). When
   * non-empty, the dropdown lists these and applies them via bulk-set-status
   * (statusId). Mirrors the list «Статус» column, which keys off the same
   * /states?entityType=demand query.
   */
  customStatuses?: DemandCustomStatus[];
}

export function DemandStatusDropdown({
  selectedIds,
  listQueryKey,
  onClearSelection,
  customStatuses = [],
}: DemandStatusDropdownProps) {
  const t = useTranslations('status_change');
  const tBulk = useTranslations('bulk');
  const { confirm } = useConfirm();
  const qc = useQueryClient();
  const ids = Array.from(selectedIds);
  const hasSelection = ids.length > 0;

  const hasCustom = customStatuses.length > 0;

  const bulkSetStatus = useApiMutation({
    mutationFn: async (input: { ids: string[]; statusId: string | null }) =>
      api.post<BulkResult>('/demands/bulk-set-status', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listQueryKey });
      onClearSelection();
    },
  });

  const isPending = bulkSetStatus.isPending;

  const handlePickCustom = (status: DemandCustomStatus) => async () => {
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
      testId="demand-status-dropdown"
    >
      {hasCustom ? (
        customStatuses.map((s) => (
          <DropdownMenu.Item
            key={s.id}
            onSelect={handlePickCustom(s)}
            disabled={!hasSelection || isPending}
            testId={`demand-status-option-${s.id}`}
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
        <DropdownMenu.Item disabled testId="demand-status-configure-hint">
          {t('configure_hint')}
        </DropdownMenu.Item>
      )}
      <DropdownMenu.Item
        onSelect={handleClear}
        disabled={!hasSelection || isPending}
        testId="demand-status-option-clear"
      >
        {t('clear')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
