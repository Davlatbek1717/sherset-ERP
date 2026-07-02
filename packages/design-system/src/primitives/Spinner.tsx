import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface SpinnerProps extends Omit<React.SVGAttributes<SVGSVGElement>, 'children'> {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Optional accessible label — defaults to "Loading". */
  label?: string;
}

const SIZE: Record<NonNullable<SpinnerProps['size']>, string> = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

/**
 * Standalone spinner. `Button` uses its own internal spinner via the
 * `loading` prop — use this one for inline status next to text, table
 * cell loading states, or skeleton-style placeholder slots.
 */
export const Spinner = React.forwardRef<SVGSVGElement, SpinnerProps>(
  ({ className, size = 'sm', label = 'Loading', ...props }, ref) => (
    <Loader2
      ref={ref}
      role="status"
      aria-label={label}
      className={cn('animate-spin text-[var(--ms-text-muted)]', SIZE[size], className)}
      {...props}
    />
  ),
);
Spinner.displayName = 'Spinner';
