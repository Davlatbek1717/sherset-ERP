import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  /**
   * Classes applied to the inner `<select>` itself (not the wrapper). `className`
   * lands on the positioning wrapper, so to RESTYLE the control (e.g. a white
   * border for the navbar locale switcher on the blue bar) pass it here — this
   * avoids the double-border bug where a `border` in `className` sat on the
   * wrapper while the select kept its own border.
   */
  selectClassName?: string;
  /**
   * Classes applied to the dropdown chevron. Opt-in — e.g. borderless in-grid
   * cells (moysklad parity) pass `opacity-0 group-hover:opacity-100` so the caret
   * appears only on row hover/focus, reading as plain text at rest. Default keeps
   * the chevron always visible (every other usage is unaffected).
   */
  chevronClassName?: string;
}

/**
 * Native `<select>` styled to match `<Input>`. Drop-in replacement for
 * raw `<select>` elements — keep the same `<option>` children, just
 * swap the tag.
 *
 * For richer pickers (search, fetch-on-type, custom row content) use
 * `<Select>` (Radix-backed) or `<Combobox>`. NativeSelect is for the
 * common "fixed list of 2-10 enum values" case where the OS-native
 * dropdown is the right UX (mobile uses platform picker, screen
 * readers read it natively).
 */
export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  (
    { className, selectClassName, chevronClassName, invalid, disabled, children, ...props },
    ref,
  ) => (
    <div className={cn('relative w-full', className)}>
      <select
        ref={ref}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn(
          'h-[var(--ms-control-h)] w-full appearance-none px-2 pr-7 text-[13px]',
          'bg-[var(--ms-bg-surface)] text-[var(--ms-text-primary)]',
          'border',
          'transition-colors duration-[var(--ms-duration-fast)]',
          'focus-visible:border-[var(--ms-border-focus)] focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:bg-[var(--ms-bg-muted)] disabled:text-[var(--ms-text-disabled)]',
          invalid
            ? 'border-[var(--ms-action-destructive)]'
            : // crisp dark resting control border (user 2026-06-23). Tagged with
              // the "color:" arbitrary tag (visually identical) so a caller's
              // `border-transparent` (e.g. borderless in-grid cells) dedupes via
              // twMerge instead of leaving the box — same fix as the Input primitive.
              'border-[color:var(--ms-border-input)]',
          selectClassName,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className={cn(
          '-translate-y-1/2 pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 text-[var(--ms-text-muted)]',
          chevronClassName,
        )}
        aria-hidden
      />
    </div>
  ),
);
NativeSelect.displayName = 'NativeSelect';
