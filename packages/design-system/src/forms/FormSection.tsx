import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface FormSectionProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title?: React.ReactNode;
  description?: React.ReactNode;
}

export const FormSection = React.forwardRef<HTMLElement, FormSectionProps>(
  ({ className, title, description, children, ...props }, ref) => (
    <section
      ref={ref}
      className={cn(
        'rounded-[var(--ms-radius-md)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4 space-y-4',
        className,
      )}
      {...props}
    >
      {(title || description) && (
        <div className="space-y-0.5 pb-2 border-b border-[var(--ms-border-default)]">
          {title && (
            <h2 className="text-base font-semibold text-[var(--ms-text-primary)]">{title}</h2>
          )}
          {description && <p className="text-xs text-[var(--ms-text-muted)]">{description}</p>}
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </section>
  ),
);
FormSection.displayName = 'FormSection';
