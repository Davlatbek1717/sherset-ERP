'use client';

/**
 * «Настроить столбцы» gear — moysklad parity. A small ⚙ on the position table's
 * «Сумма» header opens a checkbox popover toggling the optional position columns
 * (Изображение / Отгружено / Доступно / Остаток / Зарезерв. / Ожидание / Вес /
 * Объём / Сумма НДС). The page derives its column list from the toggles.
 */

import { Checkbox } from '@moysklad/ui';
import * as Popover from '@radix-ui/react-popover';
import { Settings2 } from 'lucide-react';

export interface ColumnToggleOption {
  key: string;
  label: string;
}

export function PositionColumnCustomizer({
  options,
  visible,
  onToggle,
  ariaLabel,
}: {
  options: ColumnToggleOption[];
  visible: Record<string, boolean>;
  onToggle: (key: string, next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          title={ariaLabel}
          className="inline-flex h-4 w-4 items-center justify-center align-middle text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
          data-test-id="position-column-customizer"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className="z-[var(--ms-z-popover)] w-56 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-2 shadow-[var(--ms-shadow-md)]"
          data-test-id="position-column-customizer-popover"
        >
          <div className="flex flex-col gap-0.5">
            {options.map((o) => (
              <label
                key={o.key}
                className="flex cursor-pointer items-center gap-2 rounded-[var(--ms-radius-sm)] px-2 py-1 text-[12px] hover:bg-[var(--ms-bg-hover)]"
              >
                <Checkbox
                  checked={visible[o.key] ?? false}
                  onCheckedChange={(v) => onToggle(o.key, Boolean(v))}
                  data-test-id={`position-column-toggle-${o.key}`}
                />
                <span className="text-[var(--ms-text-primary)]">{o.label}</span>
              </label>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
