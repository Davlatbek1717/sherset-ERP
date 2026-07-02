'use client';

import { Inbox } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon, title, description, action, ...props }, ref) => (
    <div
      ref={ref}
      data-test-id="empty-state"
      className={cn('flex flex-col items-center justify-center gap-3 py-12 text-center', className)}
      {...props}
    >
      <div className="w-12 h-12 flex items-center justify-center rounded-full bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)]">
        {icon ?? <Inbox className="w-6 h-6" />}
      </div>
      <div className="space-y-1 max-w-sm">
        <p className="text-sm font-medium text-[var(--ms-text-primary)]">{title}</p>
        {description && <p className="text-xs text-[var(--ms-text-muted)]">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  ),
);
EmptyState.displayName = 'EmptyState';
