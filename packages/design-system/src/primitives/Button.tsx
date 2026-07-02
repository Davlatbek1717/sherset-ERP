'use client';

import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../lib/cn.ts';

const buttonStyles = cva(
  [
    'inline-flex items-center justify-center gap-2',
    'whitespace-nowrap font-medium text-sm',
    'transition-colors duration-[var(--ms-duration-fast)]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ms-border-focus)] focus-visible:ring-offset-2',
    'disabled:opacity-50 disabled:pointer-events-none',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-[var(--ms-action-primary)] text-white',
          'hover:bg-[var(--ms-action-primary-hover)]',
          'active:bg-[var(--ms-action-primary-active)]',
        ],
        // moysklad «Сохранить» — FILLED lime-green gradient + white text
        // (live customerorder/edit?new: .b-popup-button gradient
        // #cce255→#a1b900, 1px #a1b900 border, white label). The earlier
        // "white bg + green outline" was a stale blueprint read. Used by the
        // document toolbar/detail save + list create buttons.
        success: [
          'bg-gradient-to-b from-[var(--ms-success-100)] to-[var(--ms-action-success-border)] text-white',
          'border border-[var(--ms-action-success-border)]',
          'hover:brightness-95',
        ],
        secondary: [
          'bg-[var(--ms-bg-surface)] text-[var(--ms-text-primary)]',
          'border border-[var(--ms-border-strong)]',
          'hover:bg-[var(--ms-bg-hover)]',
        ],
        tertiary: ['bg-transparent text-[var(--ms-text-primary)]', 'hover:bg-[var(--ms-bg-hover)]'],
        destructive: [
          'bg-[var(--ms-action-destructive)] text-white',
          'hover:bg-[var(--ms-action-destructive-hover)]',
        ],
        ghost: [
          'bg-transparent text-[var(--ms-text-secondary)]',
          'hover:bg-[var(--ms-bg-hover)] hover:text-[var(--ms-text-primary)]',
        ],
        link: [
          'bg-transparent text-[var(--ms-text-brand)]',
          'hover:underline underline-offset-2 px-0 h-auto',
        ],
      },
      size: {
        sm: 'h-8 px-3 rounded-[var(--ms-radius-default)]',
        md: 'h-9 px-4 rounded-[var(--ms-radius-default)]',
        lg: 'h-11 px-6 rounded-[var(--ms-radius-md)]',
        icon: 'h-9 w-9 rounded-[var(--ms-radius-default)]',
        'icon-sm': 'h-7 w-7 rounded-[var(--ms-radius-default)]',
      },
    },
    compoundVariants: [
      // link is an inline text link — it must not carry the size axis's
      // h-*/px-* box. cva emits compoundVariants AFTER the variant+size
      // classes and cn/twMerge keeps the LAST conflicting class, so without
      // this entry the default md size's `h-9 px-4` silently beat the link
      // variant's `px-0 h-auto` and a bare <Button variant="link"> rendered
      // as a 36px padded box (caught by the Convention-2 migration,
      // 2026-06-11; locked by apps/web button-conventions.test.tsx).
      { variant: 'link', class: 'h-auto px-0' },
    ],
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    // Radix Slot requires exactly one child element. Without asChild
    // we can render the optional spinner alongside children freely;
    // with asChild we must pass `children` straight through (the
    // spinner is dropped — asChild + loading is rare and the host
    // controls the element entirely).
    const content =
      asChild || !loading ? (
        children
      ) : (
        <>
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
          {children}
        </>
      );
    return (
      <Comp
        ref={ref}
        className={cn(buttonStyles({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {content}
      </Comp>
    );
  },
);
Button.displayName = 'Button';
