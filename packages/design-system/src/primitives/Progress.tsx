import { cn } from '../lib/cn.ts';

export interface ProgressProps {
  /** Current value, clamped to [0, max]. */
  value: number;
  max?: number;
  /** Indeterminate (animated stripe) when true — ignores `value`. */
  indeterminate?: boolean;
  tone?: 'brand' | 'success' | 'warning' | 'destructive';
  size?: 'sm' | 'md';
  /** Show "{value}/{max}" inside the bar. */
  showLabel?: boolean;
  className?: string;
  ariaLabel?: string;
}

const TONE: Record<NonNullable<ProgressProps['tone']>, string> = {
  brand: 'bg-[var(--ms-action-primary)]',
  success: 'bg-[var(--ms-text-success)]',
  warning: 'bg-[var(--ms-text-warning)]',
  destructive: 'bg-[var(--ms-action-destructive)]',
};

/**
 * Linear progress bar. Drives import wizards, bulk-action progress,
 * file-upload spinners, and onboarding completion meters.
 *
 * Use `indeterminate` for unknown-duration tasks (server processing
 * before the first chunk arrives) — the stripe pattern subtly tells the
 * user "I'm working" without a misleading percentage.
 */
export function Progress({
  value,
  max = 100,
  indeterminate,
  tone = 'brand',
  size = 'md',
  showLabel,
  className,
  ariaLabel,
}: ProgressProps) {
  const safeMax = Math.max(1, max);
  const clamped = Math.max(0, Math.min(safeMax, value));
  const pct = (clamped / safeMax) * 100;

  return (
    // biome-ignore lint/a11y/useFocusableInteractive: ARIA `progressbar` is a RANGE role, not a widget — it is explicitly not required to be focusable (a bare readout has nothing to operate)
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={indeterminate ? undefined : clamped}
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-[var(--ms-bg-muted)]',
        size === 'sm' ? 'h-1.5' : 'h-2.5',
        className,
      )}
    >
      {indeterminate ? (
        <div
          className={cn(
            'absolute inset-y-0 w-1/3 animate-[progress-slide_1.4s_linear_infinite] rounded-full',
            TONE[tone],
          )}
          style={{
            // Inline keyframes — avoids growing the global stylesheet for one
            // animation. The transform values keep the stripe in-bounds.
            animationName: 'ms-progress-slide',
          }}
        />
      ) : (
        <div
          className={cn('h-full rounded-full transition-[width] duration-200', TONE[tone])}
          style={{ width: `${pct}%` }}
        />
      )}
      {showLabel && !indeterminate && (
        <span className="absolute inset-0 flex items-center justify-center font-medium text-[10px] text-white drop-shadow">
          {clamped}/{safeMax}
        </span>
      )}
      {/* Keyframes injected once per page via a style tag — cheap and
          self-contained so a consumer doesn't have to add CSS. */}
      <style>
        {
          '@keyframes ms-progress-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }'
        }
      </style>
    </div>
  );
}
