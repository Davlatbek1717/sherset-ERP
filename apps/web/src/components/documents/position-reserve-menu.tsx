'use client';

/**
 * «Зарезерв. ▾» bulk-reserve menu — moysklad parity. A caret on the position
 * table's «Зарезерв.» header opens «Снять резерв» (clear this order's reserve)
 * and «Поставить резерв» (reserve the full ordered quantity of every line).
 *
 * On a NEW order the reservation can't lock stock until the order exists, so the
 * page sets each line's reserve column to its quantity and reserves the goods
 * (reusing the concurrency-safe bulk-reserve endpoint) right after save.
 */

import { DropdownMenu } from '@moysklad/ui';
import { ChevronDown } from 'lucide-react';

export function PositionReserveMenu({
  label,
  setReserveLabel,
  clearReserveLabel,
  onSetReserve,
  onClearReserve,
}: {
  label: string;
  setReserveLabel: string;
  clearReserveLabel: string;
  onSetReserve: () => void;
  onClearReserve: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {label}
      <DropdownMenu
        trigger={
          <button
            type="button"
            aria-label={setReserveLabel}
            className="inline-flex h-4 w-4 items-center justify-center align-middle text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
            data-test-id="position-reserve-menu"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        }
      >
        <DropdownMenu.Item onSelect={onClearReserve} testId="position-clear-reserve">
          {clearReserveLabel}
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={onSetReserve} testId="position-set-reserve">
          {setReserveLabel}
        </DropdownMenu.Item>
      </DropdownMenu>
    </span>
  );
}
