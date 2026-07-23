import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, leading, trailing, disabled, ...props }, ref) => {
    const input = (
      <input
        ref={ref}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn(
          'h-[var(--ms-control-h)] w-full px-2 text-[13px]',
          'bg-[var(--ms-bg-surface)] text-[var(--ms-text-primary)]',
          'border',
          'placeholder:text-[var(--ms-text-placeholder)]',
          'transition-colors duration-[var(--ms-duration-fast)]',
          'focus-visible:outline-none focus-visible:border-[var(--ms-border-focus)]',
          'disabled:cursor-not-allowed disabled:bg-[var(--ms-bg-muted)] disabled:text-[var(--ms-text-disabled)]',
          invalid
            ? 'border-[color:var(--ms-action-destructive)]'
            : // moysklad parity: controls use the #bfbfbf (border-strong) resting
              // border, not the lighter #e6e6e6 divider tone. The "color:" arbitrary
              // tag lets tailwind-merge recognise it as a border-COLOR (a bare
              // arbitrary border value is width/color-ambiguous), so a caller's
              // `border-transparent` (borderless grid cells) actually overrides it.
              'border-[color:var(--ms-border-input)]',
          leading && 'pl-9',
          trailing && 'pr-9',
          className,
        )}
        {...props}
      />
    );

    if (!leading && !trailing) return input;

    return (
      <div className="relative">
        {leading && (
          <div className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 text-[var(--ms-text-muted)]">
            {leading}
          </div>
        )}
        {input}
        {trailing && (
          <div className="-translate-y-1/2 absolute top-1/2 right-3 text-[var(--ms-text-muted)]">
            {trailing}
          </div>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';
