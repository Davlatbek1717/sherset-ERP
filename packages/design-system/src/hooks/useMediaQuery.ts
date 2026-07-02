'use client';

import * as React from 'react';

/**
 * Subscribe to a CSS media-query and re-render when it flips.
 *
 * @example
 *   const isMobile = useMediaQuery('(max-width: 768px)');
 *   const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
 *
 * Returns `false` during SSR so the first client render does not flash
 * with the wrong layout — pair with a useEffect-set initial state if you
 * need stricter hydration.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (cb: () => void) => {
      if (typeof window === 'undefined') return () => {};
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    [query],
  );
  const getSnapshot = React.useCallback(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  }, [query]);
  const getServerSnapshot = React.useCallback(() => false, []);
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
