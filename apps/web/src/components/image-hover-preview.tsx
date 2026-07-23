'use client';

/**
 * ThumbWithHoverPreview — a small list thumbnail that, on hover, floats a large
 * preview of the same image to its right (moysklad parity: hovering a product's
 * image in the «Товары и услуги» list pops the full picture beside the row).
 *
 * The preview is portalled to <body> with `position: fixed` so it escapes the
 * table's overflow clipping and paints above the grid; it's `pointer-events-none`
 * so it never steals the hover. It anchors to the thumbnail's right edge and
 * flips to the left when it would overflow the viewport, and is clamped
 * vertically so it always stays on-screen.
 */

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PREVIEW = 300; // px — max preview box side

export function ThumbWithHoverPreview({
  src,
  alt,
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const show = () => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    // Default: to the right of the thumbnail; flip left if it would overflow.
    let left = r.right + 10;
    if (left + PREVIEW > window.innerWidth - 8) left = r.left - PREVIEW - 10;
    // Vertically centre on the thumbnail, clamped into the viewport.
    const top = Math.max(
      8,
      Math.min(r.top + r.height / 2 - PREVIEW / 2, window.innerHeight - PREVIEW - 8),
    );
    setPos({ left, top });
  };
  const hide = () => setPos(null);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- raw API byte stream */}
      <img
        ref={ref}
        src={src}
        alt={alt ?? ''}
        loading="lazy"
        className={className}
        onMouseEnter={show}
        onMouseLeave={hide}
        data-test-id="thumb-hover"
      />
      {pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[90] rounded border border-[var(--ms-border-default)] bg-white p-1 shadow-xl"
            style={{ left: pos.left, top: pos.top }}
            data-test-id="thumb-hover-preview"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- raw API byte stream */}
            <img
              src={src}
              alt=""
              className="block object-contain"
              style={{ maxWidth: `${PREVIEW}px`, maxHeight: `${PREVIEW}px` }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
