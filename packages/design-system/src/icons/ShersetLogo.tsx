import type * as React from 'react';

/**
 * Sherset brand logo. Renders the «SHERSET» wordmark (or the square «S»
 * mark) from the app's `/brand/` public assets, generated from the source
 * logo by `scripts/gen-brand-assets.py`.
 *
 * Variants:
 *  - `wordmark`     blue «SHERSET» — for light backgrounds (login on white)
 *  - `white`        white «SHERSET» — for the blue navbar / coloured panels
 *  - `mark`         square blue «S» — for tight spaces
 *  - `mark-white`   square white «S» — for the blue navbar at small sizes
 *
 * Size is driven by `height` (px); width keeps the logo's aspect ratio.
 * Both consuming apps (web, marketing) serve these assets at `/brand/...`.
 */
export function ShersetLogo({
  variant = 'wordmark',
  height = 24,
  className,
}: {
  variant?: 'wordmark' | 'white' | 'mark' | 'mark-white';
  height?: number;
  className?: string;
}): React.ReactElement {
  const src =
    variant === 'white'
      ? '/brand/sherset-wordmark-white.png'
      : variant === 'mark'
        ? '/brand/sherset-mark.png'
        : variant === 'mark-white'
          ? '/brand/sherset-mark-white.png'
          : '/brand/sherset-wordmark.png';

  return (
    <img
      src={src}
      alt="Sherset"
      height={height}
      style={{ height, width: 'auto' }}
      className={className}
      draggable={false}
    />
  );
}
