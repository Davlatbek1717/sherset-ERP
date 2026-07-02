'use client';

import * as React from 'react';

/**
 * One-shot clipboard copy with a transient "copied" flag the UI can
 * use to swap a check icon onto the trigger button.
 *
 * @example
 *   const { copy, copied } = useCopy();
 *   <button onClick={() => copy(invoice.id)}>
 *     {copied ? 'Nusxa olindi' : 'Nusxa olish'}
 *   </button>
 *
 * Falls back to the legacy `document.execCommand('copy')` path on browsers
 * without `navigator.clipboard` (older Safari, embedded webviews).
 */
export interface UseCopyResult {
  copy: (text: string) => Promise<boolean>;
  copied: boolean;
  reset: () => void;
}

export function useCopy(resetMs = 1500): UseCopyResult {
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = React.useCallback(
    async (text: string): Promise<boolean> => {
      let ok = false;
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          ok = true;
        } else if (typeof document !== 'undefined') {
          // Legacy fallback — keep document selection to preserve user's selection.
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          ok = document.execCommand('copy');
          document.body.removeChild(ta);
        }
      } catch {
        ok = false;
      }
      if (ok) {
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), resetMs);
      }
      return ok;
    },
    [resetMs],
  );

  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return {
    copy,
    copied,
    reset: () => {
      setCopied(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    },
  };
}
