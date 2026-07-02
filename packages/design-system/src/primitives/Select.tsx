'use client';

import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import type * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface SelectOption<V extends string = string> {
  value: V;
  label: React.ReactNode;
  disabled?: boolean;
  /** Optional secondary text rendered to the right of the label. */
  hint?: React.ReactNode;
}

export interface SelectProps<V extends string = string> {
  value: V | undefined;
  onChange: (next: V) => void;
  options: SelectOption<V>[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  name?: string;
  className?: string;
  testId?: string;
  /** Used by screen readers when the trigger has no visible label. */
  ariaLabel?: string;
}

/**
 * Single-select dropdown built on Radix Select. Use for ≤30 fixed
 * options (currency, status, role). For long server-fetched lists prefer
 * `Combobox` (keyboard search + virtualised list).
 *
 * Visual: matches the height/border treatment of `Input` so a row of
 * mixed controls aligns cleanly.
 */
export function Select<V extends string = string>({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  invalid,
  id,
  name,
  className,
  testId,
  ariaLabel,
}: SelectProps<V>) {
  return (
    <RadixSelect.Root
      value={value ?? ''}
      onValueChange={(next) => onChange(next as V)}
      disabled={disabled}
      name={name}
    >
      <RadixSelect.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        data-testid={testId}
        className={cn(
          'inline-flex h-[var(--ms-control-h)] w-full items-center justify-between gap-2 px-2 text-[12px]',
          'border bg-[var(--ms-bg-surface)] text-left text-[var(--ms-text-primary)]',
          'transition-colors duration-[var(--ms-duration-fast)]',
          'focus-visible:outline-none focus-visible:border-[var(--ms-border-focus)]',
          'data-[placeholder]:text-[var(--ms-text-muted)]',
          'disabled:cursor-not-allowed disabled:bg-[var(--ms-bg-muted)] disabled:text-[var(--ms-text-disabled)]',
          invalid
            ? 'border-[var(--ms-action-destructive)]'
            : // moysklad parity: #bfbfbf resting control border.
              'border-[var(--ms-border-input)]',
          className,
        )}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon className="text-[var(--ms-text-muted)]">
          <ChevronDown className="h-4 w-4" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className={cn(
            'z-[var(--ms-z-popover)] min-w-[var(--radix-select-trigger-width)]',
            'rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]',
            'bg-[var(--ms-bg-surface)] shadow-[var(--ms-shadow-md)]',
            'overflow-hidden',
            'data-[state=closed]:animate-out data-[state=open]:animate-in',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'duration-150',
          )}
        >
          <RadixSelect.Viewport className="max-h-[300px] py-1">
            {options.map((opt) => (
              <RadixSelect.Item
                key={opt.value}
                value={opt.value}
                disabled={opt.disabled}
                className={cn(
                  'relative flex cursor-default select-none items-center gap-2',
                  'px-3 py-1.5 text-sm outline-none',
                  'data-[highlighted]:bg-[var(--ms-bg-hover)] data-[highlighted]:text-[var(--ms-text-primary)]',
                  'data-[state=checked]:font-medium',
                  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
                )}
              >
                <RadixSelect.ItemIndicator className="text-[var(--ms-text-brand)]">
                  <Check className="h-3.5 w-3.5" />
                </RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                {opt.hint != null && (
                  <span className="ml-auto text-[var(--ms-text-muted)] text-xs">{opt.hint}</span>
                )}
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
