'use client';

/**
 * Counterparty list «Статус ▾» — bulk CRM-status quick-set (moysklad parity,
 * live-grounded on farrux@climart_santex_group: a toolbar dropdown, disabled
 * until rows are selected, listing the account's counterparty States as
 * coloured items; clicking one applies it to every selected row).
 *
 * Unlike the customer-order variant (FSM enum, no statusId FK), counterparties
 * carry a real `stateId` FK, so the items ARE the tenant's `State` rows
 * (entityType='counterparty') and we POST the chosen state id directly.
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { Button, DropdownMenu, Icons } from '@moysklad/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

export interface CounterpartyState {
  id: string;
  name: string;
  color: string | null;
}

interface BulkResult {
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

export interface CounterpartyStatusDropdownProps {
  selectedIds: Set<string>;
  states: CounterpartyState[];
  listQueryKey: readonly unknown[];
  onClearSelection: () => void;
}

export function CounterpartyStatusDropdown({
  selectedIds,
  states,
  listQueryKey,
  onClearSelection,
}: CounterpartyStatusDropdownProps) {
  const t = useTranslations('pages.counterparties');
  const qc = useQueryClient();
  const ids = Array.from(selectedIds);
  const hasSelection = ids.length > 0;

  const setState = useApiMutation({
    mutationFn: (input: { ids: string[]; stateId: string | null }) =>
      api.post<BulkResult>('/counterparties/bulk-set-state', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listQueryKey });
      onClearSelection();
    },
  });

  const disabled = !hasSelection || setState.isPending;

  return (
    <DropdownMenu
      trigger={
        <Button variant="secondary" disabled={disabled}>
          {t('status_button')}
          <Icons.down className="h-4 w-4" />
        </Button>
      }
      testId="counterparty-status-dropdown"
    >
      {states.length === 0 ? (
        <DropdownMenu.Item disabled testId="counterparty-status-empty">
          {t('status_empty')}
        </DropdownMenu.Item>
      ) : (
        states.map((s) => (
          <DropdownMenu.Item
            key={s.id}
            onSelect={() => setState.mutate({ ids, stateId: s.id })}
            disabled={disabled}
            testId={`counterparty-status-option-${s.id}`}
            icon={
              <span
                className="block h-3 w-3 rounded-sm border border-[var(--ms-border-default)]"
                style={{ backgroundColor: s.color ?? 'var(--ms-bg-muted)' }}
                aria-hidden
              />
            }
          >
            {s.name}
          </DropdownMenu.Item>
        ))
      )}
    </DropdownMenu>
  );
}
