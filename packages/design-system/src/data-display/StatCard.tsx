import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'destructive';
}

const toneMap = {
  neutral: '',
  success: 'text-[var(--ms-text-success)]',
  warning: 'text-[var(--ms-text-warning)]',
  destructive: 'text-[var(--ms-text-destructive)]',
} as const;

export const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ className, label, value, hint, tone = 'neutral', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-[var(--ms-radius-md)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4',
        className,
      )}
      {...props}
    >
      <p className="text-xs text-[var(--ms-text-muted)] uppercase tracking-wide">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', toneMap[tone])}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-[var(--ms-text-muted)]">{hint}</p>}
    </div>
  ),
);
StatCard.displayName = 'StatCard';
