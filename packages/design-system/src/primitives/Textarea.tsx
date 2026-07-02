import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  /** Auto-grow with content. Default false (fixed height honoured). */
  autoResize?: boolean;
}

/**
 * Multi-line text input. Mirrors the look of `Input` so a form switching
 * a single field from one to the other doesn't visually jump.
 *
 * autoResize uses the standard "grow with scrollHeight" trick — cheap, no
 * dependency, works with controlled and uncontrolled values.
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, autoResize, onChange, rows = 3, ...props }, ref) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

    // Forward ref while keeping the local handle for autoResize.
    React.useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement, []);

    const resize = React.useCallback(() => {
      const el = innerRef.current;
      if (!el || !autoResize) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }, [autoResize]);

    React.useEffect(() => {
      resize();
    }, [resize]);

    return (
      <textarea
        ref={innerRef}
        rows={rows}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          onChange?.(e);
          resize();
        }}
        className={cn(
          'block w-full px-3 py-2 text-[12px] leading-relaxed',
          'bg-[var(--ms-bg-surface)] text-[var(--ms-text-primary)]',
          'border',
          'placeholder:text-[var(--ms-text-placeholder)]',
          'transition-colors duration-[var(--ms-duration-fast)]',
          'focus-visible:outline-none focus-visible:border-[var(--ms-border-focus)]',
          'disabled:cursor-not-allowed disabled:bg-[var(--ms-bg-muted)] disabled:text-[var(--ms-text-disabled)]',
          'resize-y',
          autoResize && 'resize-none overflow-hidden',
          invalid ? 'border-[var(--ms-action-destructive)]' : 'border-[var(--ms-border-input)]',
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';
