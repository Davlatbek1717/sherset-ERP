import type * as React from 'react';

/**
 * moysklad row-hover «quick-delete» glyph — a filled grey disc with a white
 * cross, revealed at the right edge of a list row on hover (measured live on
 * online.moysklad.uz «Товары и услуги», 2026-06-19: a ~16px medium-grey circle
 * carrying a white ✕).
 *
 * Recreated as our OWN vector (a generic disc + cross), NOT extracted from
 * moysklad's sprite sheet. Unlike the lucide LINE icons in `Icons` this is a
 * TWO-tone FILLED glyph, so it gets its own component instead of a lucide
 * reference:
 *   - the disc paints with `currentColor`, so the container's text colour
 *     drives it (grey when idle, darker/red on the button's own hover);
 *   - the cross paints with the surface colour so it reads as a clean cut-out
 *     even over the yellow hovered-row tint (moysklad's cross stays white).
 * Render at 14–16px inside the trailing row-action cell.
 */
export function RowDeleteCircle({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      aria-hidden="true"
      role="img"
      {...props}
    >
      <circle cx="8" cy="8" r="8" fill="currentColor" />
      <path
        d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"
        stroke="var(--ms-bg-surface)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
