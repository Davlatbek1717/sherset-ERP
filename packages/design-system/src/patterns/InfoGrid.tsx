import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface InfoGridItem {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Pass when value should render monospace / tabular (money, codes) */
  tabular?: boolean;
  fullWidth?: boolean;
}

export interface InfoGridProps extends React.HTMLAttributes<HTMLDListElement> {
  items: InfoGridItem[];
  columns?: 1 | 2 | 3;
}

const colsMap = {
  1: 'sm:grid-cols-[160px,1fr]',
  2: 'sm:grid-cols-[160px,1fr_160px,1fr]',
  3: 'sm:grid-cols-[140px,1fr_140px,1fr_140px,1fr]',
} as const;

export const InfoGrid = React.forwardRef<HTMLDListElement, InfoGridProps>(
  ({ className, items, columns = 1, ...props }, ref) => (
    <dl
      ref={ref}
      className={cn(
        'grid grid-cols-[minmax(100px,auto),1fr] gap-x-4 gap-y-2 text-sm',
        colsMap[columns],
        className,
      )}
      {...props}
    >
      {items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: dt/dd pairs render straight from props with no state, and `label` is a ReactNode so it cannot serve as a key
        <React.Fragment key={i}>
          <dt className="text-[var(--ms-text-muted)] py-1 shrink-0">{item.label}</dt>
          <dd
            className={cn(
              'text-[var(--ms-text-primary)] py-1 break-words',
              item.tabular && 'font-mono tabular-nums text-xs',
              item.fullWidth && 'col-span-full',
            )}
          >
            {item.value ?? <span className="text-[var(--ms-text-muted)]">—</span>}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  ),
);
InfoGrid.displayName = 'InfoGrid';
