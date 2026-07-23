'use client';

import { imageFilesFromDataTransfer } from '@/lib/product-image';
import { useEffect, useRef } from 'react';

/**
 * Document-level Ctrl+V / Cmd+V image paste (user 2026-07-06).
 *
 * While `enabled`, a paste that carries image data calls `onImages` with the
 * extracted File(s) and prevents the browser's default paste. A paste with NO
 * image is ignored — so pasting text into a form field is never disturbed. Only
 * one product form is mounted at a time, so a single document listener is
 * unambiguous; the callback is held in a ref so the listener isn't re-bound on
 * every render.
 */
export function useImagePaste(onImages: (files: File[]) => void, enabled = true): void {
  const ref = useRef(onImages);
  ref.current = onImages;
  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = imageFilesFromDataTransfer(e.clipboardData);
      if (files.length > 0) {
        e.preventDefault();
        ref.current(files);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [enabled]);
}
