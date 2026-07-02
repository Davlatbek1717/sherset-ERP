import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  backHref?: string;
  actions?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
}

export const PageHeader = React.forwardRef<HTMLElement, PageHeaderProps>(
  ({ className, title, subtitle, backHref, actions, breadcrumbs, ...props }, ref) => (
    <header ref={ref} className={cn('flex flex-col gap-2 py-4', className)} {...props}>
      {breadcrumbs}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          {backHref && (
            <a
              href={backHref}
              className="inline-flex items-center text-xs text-[var(--ms-text-muted)] hover:text-[var(--ms-text-brand)] hover:underline underline-offset-2 mb-1"
            >
              ← Назад
            </a>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ms-text-primary)] truncate">
            {title}
          </h1>
          {subtitle && <p className="text-sm text-[var(--ms-text-muted)] mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </header>
  ),
);
PageHeader.displayName = 'PageHeader';
