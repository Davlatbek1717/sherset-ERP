'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import type * as React from 'react';
import { Icons } from '../icons/action-icons.ts';
import { cn } from '../lib/cn.ts';
import { Button } from '../primitives/Button.tsx';
import { Checkbox } from '../primitives/Checkbox.tsx';

export interface ColumnCustomizerColumn {
  /** Column key — must match DataTableColumn.key. */
  key: string;
  /** Display label shown in the dropdown. */
  label: React.ReactNode;
  /** Columns with alwaysVisible=true cannot be toggled off. */
  alwaysVisible?: boolean;
}

export interface ColumnCustomizerProps {
  columns: ColumnCustomizerColumn[];
  visibleKeys: Set<string>;
  onChange: (next: Set<string>) => void;
  /**
   * Optional visible trigger label rendered next to the gear icon. Omit
   * for an icon-only trigger (moysklad parity — their control hides the
   * label, exposing it only as the accessible name; see `ariaLabel`).
   */
  label?: React.ReactNode;
  /**
   * Accessible name for the icon-only trigger. Locale-agnostic component,
   * so the consuming app passes a localized string (e.g. "Настроить
   * колонки" / "Ustunlarni sozlash"). Defaults to English for standalone use.
   */
  ariaLabel?: string;
  resetLabel?: React.ReactNode;
  /** Callback invoked when user clicks "Reset" — caller restores defaults. */
  onReset?: () => void;
  /**
   * moysklad «Количество строк» — optional page-size selector rendered in the
   * popup footer (25 / 50 / 100). Only shown when both `rowsPerPage` and
   * `onRowsPerPageChange` are provided, so existing lists are unaffected.
   */
  rowsPerPage?: number;
  rowsPerPageOptions?: number[];
  rowsPerPageLabel?: React.ReactNode;
  onRowsPerPageChange?: (n: number) => void;
}

/**
 * Popover-based column-visibility toggle — the gear-icon button opens a
 * checkbox list matching moysklad.uz's "Настройка колонок" dropdown.
 * alwaysVisible columns are locked on (e.g. primary-key name column).
 */
export function ColumnCustomizer({
  columns,
  visibleKeys,
  onChange,
  label,
  ariaLabel = 'Customize columns',
  resetLabel = 'Reset',
  onReset,
  rowsPerPage,
  rowsPerPageOptions = [25, 50, 100],
  rowsPerPageLabel,
  onRowsPerPageChange,
}: ColumnCustomizerProps) {
  const toggle = (key: string) => {
    const col = columns.find((c) => c.key === key);
    if (col?.alwaysVisible) return;
    const next = new Set(visibleKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <Button
          variant="tertiary"
          size="sm"
          data-test-id="column-customizer-trigger"
          aria-label={ariaLabel}
        >
          <Icons.settings className="h-4 w-4" />
          {label}
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={6}
          className={cn(
            // z above modals (--ms-z-modal=400) so the gear popover opens ON TOP
            // when the table is inside a dialog (e.g. the analog «Выбор товара»
            // picker), not hidden behind it. Safe on list pages too (500 < tooltip).
            'z-[var(--ms-z-popover)] w-60 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]',
            'bg-[var(--ms-bg-surface)] shadow-[var(--ms-shadow-lg,0_8px_24px_rgba(0,0,0,0.1))]',
            'p-2',
          )}
          data-test-id="column-customizer-panel"
        >
          <div className="max-h-80 overflow-y-auto">
            {columns.map((col) => {
              const checked = visibleKeys.has(col.key);
              return (
                <label
                  key={col.key}
                  className={cn(
                    'flex items-center gap-2 rounded-[var(--ms-radius-sm)] px-2 py-1.5 text-sm',
                    col.alwaysVisible
                      ? 'cursor-not-allowed opacity-60'
                      : 'cursor-pointer hover:bg-[var(--ms-bg-hover)]',
                  )}
                  data-test-id={`column-toggle-${col.key}`}
                >
                  <Checkbox
                    checked={checked}
                    disabled={col.alwaysVisible}
                    onCheckedChange={() => toggle(col.key)}
                  />
                  <span>{col.label}</span>
                </label>
              );
            })}
          </div>
          {onReset && (
            <div className="mt-2 border-[var(--ms-border-default)] border-t pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onReset}
                className="w-full justify-start"
                data-test-id="column-reset"
              >
                {resetLabel}
              </Button>
            </div>
          )}
          {rowsPerPage !== undefined && onRowsPerPageChange && (
            <div
              className="mt-2 flex items-center gap-2 border-[var(--ms-border-default)] border-t px-2 pt-2 text-sm"
              data-test-id="rows-per-page"
            >
              {rowsPerPageLabel && (
                <span className="text-[var(--ms-text-muted)]">{rowsPerPageLabel}</span>
              )}
              <div className="ml-auto flex items-center gap-1">
                {rowsPerPageOptions.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onRowsPerPageChange(n)}
                    aria-pressed={n === rowsPerPage}
                    className={cn(
                      'min-w-8 rounded-[var(--ms-radius-sm)] border px-2 py-0.5 text-xs tabular-nums',
                      n === rowsPerPage
                        ? 'border-[var(--ms-text-brand)] bg-[var(--ms-bg-brand-soft)] text-[var(--ms-text-brand)]'
                        : 'border-[var(--ms-border-default)] text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-hover)]',
                    )}
                    data-test-id={`rows-per-page-${n}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
