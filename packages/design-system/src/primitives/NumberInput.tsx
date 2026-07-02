'use client';

import { Minus, Plus } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface NumberInputProps {
  value: number | null;
  onChange: (next: number | null) => void;
  /** Increment per stepper click / arrow press. Default 1. */
  step?: number;
  min?: number;
  max?: number;
  /** Decimal places to render. Default 0. */
  precision?: number;
  /** Show the +/− stepper buttons. Default true. */
  steppers?: boolean;
  /** Suffix unit shown inside the field (e.g. "сум", "%"). */
  suffix?: React.ReactNode;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  name?: string;
  className?: string;
  testId?: string;
  ariaLabel?: string;
}

/**
 * Localised numeric input with stepper buttons.
 *
 * Why a wrapper instead of `<input type="number" />`: native number inputs
 * scroll on wheel, accept exponent notation, and have inconsistent
 * min/max enforcement across browsers. Money/quantity fields need
 * predictable formatting + paste-safe parsing.
 *
 * Decimal handling: caller passes/receives a JS `number` (or null when
 * empty). Internal display rounds to `precision`. We never coerce the
 * incoming `value` — caller is the source of truth.
 */
export function NumberInput({
  value,
  onChange,
  step = 1,
  min,
  max,
  precision = 0,
  steppers = true,
  suffix,
  placeholder,
  disabled,
  invalid,
  id,
  name,
  className,
  testId,
  ariaLabel,
}: NumberInputProps) {
  const [draft, setDraft] = React.useState<string>(formatValue(value, precision));

  // Resync when the parent value changes outside our edit cycle.
  React.useEffect(() => {
    setDraft(formatValue(value, precision));
  }, [value, precision]);

  const commit = React.useCallback(
    (raw: string) => {
      const trimmed = raw.trim().replace(/\s+/g, '').replace(',', '.');
      if (trimmed === '' || trimmed === '-') {
        onChange(null);
        return;
      }
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return;
      const clamped = clamp(n, min, max);
      onChange(precision > 0 ? Math.round(clamped * 10 ** precision) / 10 ** precision : clamped);
    },
    [onChange, min, max, precision],
  );

  const bump = (delta: number) => {
    const current = value ?? 0;
    const next = clamp(current + delta, min, max);
    onChange(next);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      bump(step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      bump(-step);
    } else if (e.key === 'Enter') {
      commit(e.currentTarget.value);
    }
  };

  return (
    <div
      className={cn(
        'inline-flex w-full items-center',
        'border bg-[var(--ms-bg-surface)]',
        'transition-colors duration-[var(--ms-duration-fast)]',
        'focus-within:border-[var(--ms-border-focus)]',
        invalid ? 'border-[var(--ms-action-destructive)]' : 'border-[var(--ms-border-input)]',
        disabled && 'cursor-not-allowed bg-[var(--ms-bg-muted)] text-[var(--ms-text-disabled)]',
        className,
      )}
      data-testid={testId}
    >
      {steppers && (
        <button
          type="button"
          onClick={() => bump(-step)}
          disabled={disabled || (min !== undefined && value !== null && value <= min)}
          aria-label="Decrease"
          className="flex h-9 w-8 shrink-0 items-center justify-center text-[var(--ms-text-muted)] transition-colors hover:bg-[var(--ms-bg-hover)] hover:text-[var(--ms-text-primary)] disabled:opacity-40"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
      )}
      <input
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={handleKey}
        className="h-9 min-w-0 flex-1 bg-transparent px-2 text-center text-sm focus:outline-none disabled:cursor-not-allowed"
      />
      {suffix && <span className="pr-2 text-[var(--ms-text-muted)] text-xs">{suffix}</span>}
      {steppers && (
        <button
          type="button"
          onClick={() => bump(step)}
          disabled={disabled || (max !== undefined && value !== null && value >= max)}
          aria-label="Increase"
          className="flex h-9 w-8 shrink-0 items-center justify-center text-[var(--ms-text-muted)] transition-colors hover:bg-[var(--ms-bg-hover)] hover:text-[var(--ms-text-primary)] disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function formatValue(value: number | null, precision: number): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return value.toFixed(precision);
}

function clamp(n: number, min?: number, max?: number): number {
  if (min !== undefined && n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
}
