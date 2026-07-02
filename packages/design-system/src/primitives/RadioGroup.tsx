'use client';

import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface RadioOption<V extends string = string> {
  value: V;
  label: React.ReactNode;
  /** Optional secondary line shown beneath the label (small, muted). */
  description?: React.ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps<V extends string = string> {
  value: V | undefined;
  onChange: (next: V) => void;
  options: RadioOption<V>[];
  /** Vertical (default) or horizontal layout. */
  orientation?: 'vertical' | 'horizontal';
  name?: string;
  className?: string;
  /** Used by screen readers; falls back to the surrounding `<Label>`. */
  ariaLabel?: string;
}

/**
 * Accessible radio-group built on plain `<input type="radio">` so it
 * plays well with native form submission, the keyboard tab order, and
 * server-rendered HTML. Roving focus + arrow-key nav are handled by the
 * browser's built-in radio behaviour.
 *
 * Visuals are styled via a sibling `::after` pseudo trick — actual input
 * stays accessible (focus ring, screen reader label) but is visually
 * replaced with a circular dot.
 */
export function RadioGroup<V extends string = string>({
  value,
  onChange,
  options,
  orientation = 'vertical',
  name,
  className,
  ariaLabel,
}: RadioGroupProps<V>) {
  const reactId = React.useId();
  const groupName = name ?? `rg-${reactId}`;
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'flex',
        orientation === 'vertical' ? 'flex-col gap-2' : 'flex-row flex-wrap gap-4',
        className,
      )}
    >
      {options.map((opt) => {
        const inputId = `${groupName}-${opt.value}`;
        const checked = value === opt.value;
        return (
          <label
            key={opt.value}
            htmlFor={inputId}
            className={cn(
              'group/radio inline-flex cursor-pointer items-start gap-2',
              opt.disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <input
              type="radio"
              id={inputId}
              name={groupName}
              value={opt.value}
              checked={checked}
              disabled={opt.disabled}
              onChange={() => onChange(opt.value)}
              className={cn(
                'peer mt-0.5 h-4 w-4 shrink-0 cursor-pointer appearance-none',
                'rounded-full border border-[var(--ms-border-strong)] bg-[var(--ms-bg-surface)]',
                'transition-colors duration-[var(--ms-duration-fast)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1',
                'checked:border-[var(--ms-action-primary)] checked:bg-[var(--ms-action-primary)]',
                'disabled:cursor-not-allowed',
              )}
            />
            <span
              aria-hidden
              className="-ml-3 mt-0.5 hidden h-4 w-4 shrink-0 items-center justify-center rounded-full peer-checked:flex"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            <span className="min-w-0">
              <span className="text-[var(--ms-text-primary)] text-sm leading-tight">
                {opt.label}
              </span>
              {opt.description && (
                <span className="mt-0.5 block text-[var(--ms-text-muted)] text-xs leading-tight">
                  {opt.description}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
