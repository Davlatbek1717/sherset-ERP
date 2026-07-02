'use client';

import * as React from 'react';

/**
 * Persist a state value in localStorage. Tab-aware: changes in one tab
 * propagate to other tabs via the `storage` event.
 *
 * @example
 *   const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('theme', 'light');
 *
 * Falls back to in-memory state during SSR and when storage is blocked
 * (private browsing). Caller-provided default is returned on first read
 * if the key is missing.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const read = React.useCallback((): T => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initialValue : (JSON.parse(raw) as T);
    } catch {
      return initialValue;
    }
  }, [key, initialValue]);

  const [value, setValue] = React.useState<T>(read);

  // Pick up the real value on first client render — initialValue may
  // have been used during SSR.
  React.useEffect(() => {
    setValue(read());
  }, [read]);

  const update = React.useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(key, JSON.stringify(resolved));
          }
        } catch {
          // Storage might be blocked (Safari private mode). Continue with in-memory state.
        }
        return resolved;
      });
    },
    [key],
  );

  // Cross-tab sync.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: StorageEvent) => {
      if (e.key !== key) return;
      try {
        setValue(e.newValue === null ? initialValue : (JSON.parse(e.newValue) as T));
      } catch {
        // Ignore non-JSON write from another writer
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [key, initialValue]);

  return [value, update];
}
