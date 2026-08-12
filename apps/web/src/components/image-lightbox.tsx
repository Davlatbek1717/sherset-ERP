'use client';

/**
 * ImageLightbox — full-size image overlay (moysklad parity: clicking a product
 * thumbnail opens the picture large). A full-backdrop close button sits behind
 * the image; clicking the backdrop or pressing Escape closes it, clicking the
 * image does nothing (it paints above the backdrop button). Rendered through a
 * portal so it escapes any clipped/scrolled ancestor.
 */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  // dismissible-by-design: a picture viewer holds no user input — Escape and a
  // backdrop click are the fastest way out and cost nothing. Every dialog that
  // DOES carry input closes on deliberate action only (`noAccidentalClose`).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      // z at MODAL tier (--ms-z-modal:400): a full-screen image overlay must sit
      // above the navbar (z-auto) AND any sticky document toolbar (--ms-z-sticky:200).
      // The old z-[100] (=dropdown tier) was below sticky toolbars, so a pinned
      // Save-toolbar could bleed through the lightbox.
      className="fixed inset-0 z-[var(--ms-z-modal)] flex items-center justify-center bg-black/80 p-6"
      data-test-id="image-lightbox"
    >
      {/* Full-backdrop close affordance — a real button (keyboard-accessible),
          painted behind the image. */}
      <button
        type="button"
        aria-label="close"
        onClick={onClose}
        className="absolute inset-0 cursor-zoom-out"
        data-test-id="image-lightbox-backdrop"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- raw API byte stream */}
      <img
        src={src}
        alt={alt ?? ''}
        className="relative max-h-full max-w-full rounded object-contain shadow-2xl"
      />
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-5 text-4xl text-white/90 leading-none hover:text-white"
        aria-label="close"
        data-test-id="image-lightbox-close"
      >
        ×
      </button>
    </div>,
    document.body,
  );
}
