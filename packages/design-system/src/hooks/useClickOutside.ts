'use client';

import * as React from 'react';

/**
 * Fire `handler` when a click/touch lands outside the referenced
 * element. The handler receives the original event so callers can
 * inspect the target if they need to (e.g. to avoid closing on a
 * specific child portal).
 *
 * @example
 *   const ref = useRef<HTMLDivElement>(null);
 *   useClickOutside(ref, () => setOpen(false));
 *   return <div ref={ref}>{...}</div>;
 *
 * Mounts both `mousedown` and `touchstart` listeners so the close
 * happens on press (matching native popover behaviour) instead of after
 * the click completes — that prevents the target underneath from
 * receiving a stray click.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  handler: (event: MouseEvent | TouchEvent) => void,
  enabled = true,
): void {
  const handlerRef = React.useRef(handler);
  React.useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  React.useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;
    const listener = (e: MouseEvent | TouchEvent) => {
      const el = ref.current;
      if (!el || el.contains(e.target as Node)) return;
      handlerRef.current(e);
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, enabled]);
}
