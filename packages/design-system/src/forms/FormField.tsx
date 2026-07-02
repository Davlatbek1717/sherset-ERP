import { Info } from 'lucide-react';
import type * as React from 'react';
import { cn } from '../lib/cn.ts';
import { Label } from '../primitives/Label.tsx';

export interface FormFieldProps {
  id: string;
  label?: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  inline?: boolean;
}

/**
 * Universal form field wrapper — label + control + hint/error.
 * Every EditForm field must use this for consistent styling.
 */
export function FormField({
  id,
  label,
  required,
  hint,
  error,
  description,
  children,
  className,
  inline,
}: FormFieldProps) {
  return (
    <div
      className={cn('flex', inline ? 'flex-row items-center gap-3' : 'flex-col gap-1.5', className)}
    >
      {label && (
        <Label htmlFor={id} required={required} className={inline ? 'min-w-[140px]' : ''}>
          {label}
          {/* moysklad parity: field hints render as a small ⓘ next to the label
              (tooltip on hover), not as always-visible text below the field. */}
          {hint && (
            <span
              className="ml-1 inline-flex cursor-help align-middle text-[var(--ms-text-muted)]"
              title={typeof hint === 'string' ? hint : undefined}
              data-test-id={`${id}-hint`}
            >
              <Info className="inline h-3.5 w-3.5" aria-hidden />
            </span>
          )}
        </Label>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        {description && !inline && (
          <p className="text-[var(--ms-text-muted)] text-xs">{description}</p>
        )}
        {children}
        {/* Fallback for the rare label-less field: keep the hint visible. */}
        {!label && hint && !error && <p className="text-[var(--ms-text-muted)] text-xs">{hint}</p>}
        {error && (
          <p className="text-[var(--ms-text-destructive)] text-xs" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
