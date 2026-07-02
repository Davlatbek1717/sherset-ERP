'use client';

import * as RadixTooltip from '@radix-ui/react-tooltip';
import type * as React from 'react';
import { cn } from '../lib/cn.ts';

/**
 * Tooltip primitive — wraps Radix's tooltip with moysklad's visual
 * language (dark popover, 12px text, 200ms open delay).
 *
 * Two ways to use:
 *
 * 1. Single-use:
 *    <Tooltip content="Hujjatni saqlash">
 *      <Button><Icons.save /></Button>
 *    </Tooltip>
 *
 * 2. Form-field hint with icon:
 *    <FormField label={<>Ism <FieldHelp content="Mijozning to'liq ismi" /></>}>
 *      <Input ... />
 *    </FormField>
 *
 * Wrap the app once with <TooltipProvider /> (we wire it next to the
 * ToastProvider in apps/web/src/app/layout.tsx).
 */

export const TooltipProvider = ({
  children,
  delayDuration = 200,
  skipDelayDuration = 100,
}: {
  children: React.ReactNode;
  delayDuration?: number;
  skipDelayDuration?: number;
}) => (
  <RadixTooltip.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration}>
    {children}
  </RadixTooltip.Provider>
);

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** Disable the tooltip without unmounting children. */
  disabled?: boolean;
  /** Force the tooltip open (controlled). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Override default 200ms delay. */
  delayDuration?: number;
  /** Hide the small arrow that points at the trigger. Default: show. */
  hideArrow?: boolean;
  className?: string;
}

export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  disabled,
  open,
  onOpenChange,
  delayDuration,
  hideArrow,
  className,
}: TooltipProps) {
  if (disabled || content == null || content === '') {
    return <>{children}</>;
  }
  return (
    <RadixTooltip.Root open={open} onOpenChange={onOpenChange} delayDuration={delayDuration}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'z-[var(--ms-z-tooltip)]',
            'rounded-[var(--ms-radius-default)] bg-[var(--ms-neutral-900)] px-2 py-1.5',
            'font-normal text-[var(--ms-text-inverse)] text-xs leading-tight',
            'max-w-[260px]',
            'shadow-[var(--ms-shadow-md)]',
            'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out',
            'data-[state=delayed-open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=delayed-open]:zoom-in-95 data-[state=closed]:zoom-out-95',
            'duration-150',
            className,
          )}
        >
          {content}
          {!hideArrow && (
            <RadixTooltip.Arrow width={10} height={5} className="fill-[var(--ms-neutral-900)]" />
          )}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

/**
 * Inline help-icon trigger for form fields. Renders a small "?" circle
 * the user can hover/focus to see field-specific guidance — the standard
 * moysklad pattern for "what does this checkbox do?".
 */
export function FieldHelp({
  content,
  className,
  side = 'top',
  ariaLabel = 'Yordam',
}: {
  content: React.ReactNode;
  className?: string;
  side?: TooltipProps['side'];
  ariaLabel?: string;
}) {
  return (
    <Tooltip content={content} side={side}>
      <button
        type="button"
        aria-label={ariaLabel}
        className={cn(
          'inline-flex h-4 w-4 items-center justify-center rounded-full',
          'border border-[var(--ms-border-strong)] text-[10px] font-semibold leading-none',
          'text-[var(--ms-text-muted)]',
          'transition-colors',
          'hover:border-[var(--ms-text-brand)] hover:text-[var(--ms-text-brand)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)]',
          className,
        )}
      >
        ?
      </button>
    </Tooltip>
  );
}
