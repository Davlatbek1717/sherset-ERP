import { type VariantProps, cva } from 'class-variance-authority';
import { AlertCircle, CheckCircle2, Info, XCircle } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.ts';

const alertStyles = cva('flex gap-3 items-start rounded-[var(--ms-radius-md)] border p-3 text-sm', {
  variants: {
    tone: {
      info: 'border-[var(--ms-info-100)] bg-[var(--ms-info-50)] text-[var(--ms-info-700)]',
      success:
        'border-[var(--ms-success-100)] bg-[var(--ms-success-50)] text-[var(--ms-text-success)]',
      warning:
        'border-[var(--ms-warning-100)] bg-[var(--ms-warning-50)] text-[var(--ms-text-warning)]',
      destructive:
        'border-[var(--ms-destructive-100)] bg-[var(--ms-destructive-50)] text-[var(--ms-text-destructive)]',
    },
  },
  defaultVariants: { tone: 'info' },
});

const iconByTone = {
  info: Info,
  success: CheckCircle2,
  warning: AlertCircle,
  destructive: XCircle,
} as const;

export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>,
    VariantProps<typeof alertStyles> {
  title?: React.ReactNode;
  hideIcon?: boolean;
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, tone = 'info', title, hideIcon, children, ...props }, ref) => {
    const Icon = iconByTone[tone ?? 'info'];
    return (
      <div ref={ref} role="alert" className={cn(alertStyles({ tone }), className)} {...props}>
        {!hideIcon && <Icon className="w-4 h-4 mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          {title && <div className="font-medium">{title}</div>}
          {children && <div className={cn(title && 'mt-0.5 text-xs opacity-90')}>{children}</div>}
        </div>
      </div>
    );
  },
);
Alert.displayName = 'Alert';
