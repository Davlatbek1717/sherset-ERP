import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
}

export const Divider = React.forwardRef<HTMLDivElement, DividerProps>(
  ({ className, orientation = 'horizontal', ...props }, ref) => (
    // biome-ignore lint/a11y/useFocusableInteractive: a static visual separator is a structure role, not a focusable splitter — it must NOT be in the tab order.
    <div
      ref={ref}
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'bg-[var(--ms-border-default)]',
        orientation === 'horizontal' ? 'h-px w-full' : 'w-px h-full',
        className,
      )}
      {...props}
    />
  ),
);
Divider.displayName = 'Divider';
