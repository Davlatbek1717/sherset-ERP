'use client';

import { AlertCircle } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.ts';
import { Button } from '../primitives/Button.tsx';

export interface ErrorStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
}

export const ErrorState = React.forwardRef<HTMLDivElement, ErrorStateProps>(
  ({ className, title, description, onRetry, retryLabel = 'Qayta urinish', ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-8 text-center',
        'rounded-[var(--ms-radius-md)] border border-[var(--ms-destructive-100)] bg-[var(--ms-destructive-50)]',
        className,
      )}
      {...props}
    >
      <AlertCircle className="w-6 h-6 text-[var(--ms-text-destructive)]" />
      <div className="space-y-1 max-w-sm px-4">
        <p className="text-sm font-medium text-[var(--ms-text-destructive)]">
          {title ?? 'Xato yuz berdi'}
        </p>
        {description && (
          <p className="text-xs text-[var(--ms-text-destructive)] opacity-90">{description}</p>
        )}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  ),
);
ErrorState.displayName = 'ErrorState';
