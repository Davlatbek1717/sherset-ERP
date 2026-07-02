import { ChevronRight } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface BreadcrumbItem {
  label: React.ReactNode;
  href?: string;
}

export interface BreadcrumbProps extends React.HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
}

export const Breadcrumb = React.forwardRef<HTMLElement, BreadcrumbProps>(
  ({ className, items, ...props }, ref) => (
    <nav
      ref={ref}
      aria-label="Breadcrumb"
      className={cn('text-xs text-[var(--ms-text-muted)]', className)}
      {...props}
    >
      <ol className="flex items-center gap-1 flex-wrap">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1">
              {item.href && !isLast ? (
                <a
                  href={item.href}
                  className="hover:text-[var(--ms-text-brand)] hover:underline underline-offset-2"
                >
                  {item.label}
                </a>
              ) : (
                <span className={isLast ? 'text-[var(--ms-text-primary)]' : ''}>{item.label}</span>
              )}
              {!isLast && <ChevronRight className="w-3 h-3 shrink-0" />}
            </li>
          );
        })}
      </ol>
    </nav>
  ),
);
Breadcrumb.displayName = 'Breadcrumb';
