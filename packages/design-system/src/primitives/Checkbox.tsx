'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.ts';

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, checked, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    checked={checked}
    className={cn(
      // Mobile (≤767px): 20px visual box — the desktop 16px square is a hard
      // touch target on phones. Callers passing their own size still win (cn).
      'h-4 w-4 max-md:h-[20px] max-md:w-[20px] rounded-[var(--ms-radius-sm)]',
      'border border-[var(--ms-border-strong)] bg-[var(--ms-bg-surface)]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-1',
      'data-[state=checked]:bg-[var(--ms-action-primary)] data-[state=checked]:border-[var(--ms-action-primary)]',
      'data-[state=indeterminate]:bg-[var(--ms-action-primary)] data-[state=indeterminate]:border-[var(--ms-action-primary)]',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'transition-colors duration-[var(--ms-duration-fast)]',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-white">
      {checked === 'indeterminate' ? (
        <Minus className="h-3 w-3" strokeWidth={3} />
      ) : (
        <Check className="h-3 w-3" strokeWidth={3} />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';
