'use client';

import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface SegmentOption<V extends string = string> {
  value: V;
  label: React.ReactNode;
  disabled?: boolean;
  /** Forwarded to the segment's hidden radio input (e.g. a test hook). */
  'data-test-id'?: string;
}

export interface SegmentedControlProps<V extends string = string> {
  value: V | undefined;
  onChange: (next: V) => void;
  options: SegmentOption<V>[];
  /** Disable every segment. */
  disabled?: boolean;
  name?: string;
  className?: string;
  /** Used by screen readers; falls back to a surrounding `<Label>`. */
  ariaLabel?: string;
}

/**
 * Segmented single-select control — a row of equal-width "pill" segments,
 * the selected one filled brand. Built on hidden (`sr-only`)
 * `<input type="radio">`s wrapped in styled `<label>`s, so it keeps native
 * form semantics, keyboard radio behaviour (arrow keys + tab), and
 * accessible labelling while rendering the moysklad segmented look.
 *
 * Use for short, mutually-exclusive choices that read better as a toggle
 * row than a dropdown — direction increase/decrease, page size A4/A5/A6,
 * barcode format. For a vertical labelled radio list with dots + secondary
 * descriptions use {@link RadioGroup} instead.
 *
 * The segment box is the canonical control radius (`--ms-radius-default`,
 * matching Button/NativeSelect); hand-rolled copies had drifted between
 * `radius-sm` and `radius-default`. Hover affordance is shown only on the
 * unselected, enabled segments; the whole control or a single option can be
 * disabled.
 */
export function SegmentedControl<V extends string = string>({
  value,
  onChange,
  options,
  disabled = false,
  name,
  className,
  ariaLabel,
}: SegmentedControlProps<V>) {
  const reactId = React.useId();
  const groupName = name ?? `sc-${reactId}`;
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('flex gap-1', className)}>
      {options.map((opt) => {
        const selected = value === opt.value;
        const isDisabled = disabled || opt.disabled === true;
        return (
          <label
            key={opt.value}
            className={cn(
              'flex flex-1 cursor-pointer items-center justify-center rounded-[var(--ms-radius-default)] border px-3 py-1.5 text-center text-sm',
              'transition-colors duration-[var(--ms-duration-fast)]',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ms-border-focus)] has-[:focus-visible]:ring-offset-1',
              selected
                ? 'border-[var(--ms-text-brand)] bg-[var(--ms-bg-brand-subtle)] font-medium text-[var(--ms-text-brand)]'
                : 'border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] text-[var(--ms-text-muted)]',
              isDisabled
                ? 'cursor-not-allowed opacity-50'
                : !selected && 'hover:border-[var(--ms-border-strong)]',
            )}
          >
            <input
              type="radio"
              name={groupName}
              value={opt.value}
              checked={selected}
              disabled={isDisabled}
              onChange={() => onChange(opt.value)}
              className="sr-only"
              data-test-id={opt['data-test-id']}
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}
