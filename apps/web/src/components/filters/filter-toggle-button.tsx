'use client';

import { Button } from '@moysklad/ui';

/**
 * The list-toolbar «Фильтр» toggle — Convention 2 canonical surface
 * (docs/audits/_UI-CONVENTIONS.md). One shared component so the ~40 list
 * pages cannot drift; built on DS Button variant="secondary" size="sm".
 *
 * moysklad parity: the «Фильтр» button has NO chevron prefix — just plain
 * text. Active state is signaled by the open/closed filter panel below,
 * not a glyph in the button; aria-expanded carries it for screen readers.
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
      className={className}
    >
      {label}
    </Button>
  );
}
