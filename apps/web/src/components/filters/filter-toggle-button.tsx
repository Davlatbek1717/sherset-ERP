'use client';

import { Button, cn } from '@moysklad/ui';

/**
 * The list-toolbar «Фильтр» toggle — Convention 2 canonical surface
 * (docs/audits/_UI-CONVENTIONS.md). One shared component so the ~40 list
 * pages cannot drift; built on DS Button variant="secondary" size="sm".
 *
 * moysklad parity: the «Фильтр» button has NO chevron prefix — just plain
 * text. Closed = white like the sibling toolbar buttons; open = pressed
 * grey (bg ≈ #e0e0e0, darker border) — grounded on
 * docs/audits/commission-reports-list-2026-06-27/moysklad/10-filter-open.png
 * vs 75-list-closed-filter.png. aria-expanded carries the state for
 * screen readers.
 */
export function FilterToggleButton({
  open,
  onToggle,
  label,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  /** Optional override — e.g. to match a segmented toolbar's height/border tone
   *  (twMerge keeps the last conflicting class). Default keeps the shared
   *  secondary-sm shape so the ~40 other list pages are unaffected. */
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={onToggle}
      aria-expanded={open}
      data-test-id="filter-toggle"
      className={cn(
        open &&
          'border-[var(--ms-neutral-500)] bg-[var(--ms-neutral-200)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)] hover:bg-[var(--ms-neutral-200)]',
        className,
      )}
    >
      {label}
    </Button>
  );
}
