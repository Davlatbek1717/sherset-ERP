'use client';

/**
 * Money cell with a thin progress bar underneath.
 *
 * Source: docs/moysklad-reference/visual-captures/03-module/
 *   customerorder/screenshots/i-default.png — every money column
 *   in the Заказы покупателей list is rendered as the formatted
 *   amount on top of a tiny coloured progress bar that visualises
 *   the ratio against the row's total. Green when the value
 *   reaches the total, amber while in flight, no bar when 0.
 *
 * The bar widths are computed from the `value / total` ratio
 * (clamped 0-1). Pass `total` = sumMinor to show progress; pass
 * total = 0 to render only the value (no bar).
 */

import * as React from 'react';
import { formatMoney } from '../lib/format.ts';

export interface MoneyProgressProps {
  /** Amount in minor units (BigInt-string). */
  valueMinor: string;
  /** Reference total in minor units — used to compute the bar ratio. */
  totalMinor: string;
  /** Right-align the text content (default). */
  align?: 'left' | 'right';
  /** Override colour mapping; default = success when ratio>=1, warning otherwise. */
  tone?: 'success' | 'warning' | 'destructive' | 'neutral';
  className?: string;
}

const TONE_BAR: Record<NonNullable<MoneyProgressProps['tone']>, string> = {
  success: 'bg-[var(--ms-text-success)]',
  warning: 'bg-[var(--ms-text-warning)]',
  destructive: 'bg-[var(--ms-text-destructive)]',
  neutral: 'bg-[var(--ms-border-default)]',
};

export function MoneyProgress({
  valueMinor,
  totalMinor,
  align = 'right',
  tone,
  className,
}: MoneyProgressProps) {
  const value = safeBigInt(valueMinor);
  const total = safeBigInt(totalMinor);
  const ratio =
    total > 0n
      ? Number((value * 1000n) / total) / 1000
      : 0;
  const clampedRatio = Math.min(1, Math.max(0, ratio));
  const widthPct = `${(clampedRatio * 100).toFixed(1)}%`;

  // Auto-tone: full = success, partial = warning, zero = no bar.
  const effectiveTone: NonNullable<MoneyProgressProps['tone']> =
    tone ?? (clampedRatio >= 1 ? 'success' : clampedRatio > 0 ? 'warning' : 'neutral');

  const showBar = total > 0n && value > 0n;

  return (
    <div
      className={`flex flex-col gap-0.5 ${align === 'right' ? 'items-end' : 'items-start'} ${className ?? ''}`}
    >
      <span className="font-medium tabular-nums text-[var(--ms-text-primary)]">
        {formatMoney(valueMinor, 'UZS', { displayAs: 'none' })}
      </span>
      {showBar && (
        <span
          className="block h-[2px] w-16 rounded-full bg-[var(--ms-bg-muted)] overflow-hidden"
          aria-hidden
        >
          <span
            className={`block h-full ${TONE_BAR[effectiveTone]}`}
            style={{ width: widthPct }}
          />
        </span>
      )}
    </div>
  );
}

function safeBigInt(s: string | null | undefined): bigint {
  try {
    return BigInt(s ?? '0');
  } catch {
    return 0n;
  }
}
