import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../lib/cn.ts';

const badgeStyles = cva(
  'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-[var(--ms-radius-sm)] leading-tight',
  {
    variants: {
      tone: {
        neutral: 'bg-[var(--ms-bg-muted)] text-[var(--ms-text-secondary)]',
        brand: 'bg-[var(--ms-brand-50)] text-[var(--ms-text-brand)]',
        success: 'bg-[var(--ms-success-50)] text-[var(--ms-text-success)]',
        warning: 'bg-[var(--ms-warning-50)] text-[var(--ms-text-warning)]',
        destructive: 'bg-[var(--ms-destructive-50)] text-[var(--ms-text-destructive)]',
        info: 'bg-[var(--ms-info-50)] text-[var(--ms-info-700)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeStyles> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, ...props }, ref) => (
    <span ref={ref} className={cn(badgeStyles({ tone }), className)} {...props} />
  ),
);
Badge.displayName = 'Badge';
