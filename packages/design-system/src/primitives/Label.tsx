import * as LabelPrimitive from '@radix-ui/react-label';
import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface LabelProps extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> {
  required?: boolean;
  hint?: string;
}

export const Label = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, LabelProps>(
  ({ className, required, hint, children, ...props }, ref) => (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(
        'text-sm font-medium leading-snug',
        'text-[var(--ms-text-primary)]',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      )}
      {...props}
    >
      {children}
      {required && (
        <span className="text-[var(--ms-action-destructive)] ml-0.5" aria-hidden>
          *
        </span>
      )}
      {hint && <span className="ml-2 text-xs font-normal text-[var(--ms-text-muted)]">{hint}</span>}
    </LabelPrimitive.Root>
  ),
);
Label.displayName = 'Label';
