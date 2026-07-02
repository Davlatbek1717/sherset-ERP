'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Per-user column-visibility preferences persisted to localStorage.
 *
 * Usage:
 *   const { visibleKeys, setVisibleKeys, reset } = useColumnVisibility(
 *     'sales-returns',          // storage key suffix
 *     ['name', 'moment', 'agent', 'state', 'sum'],  // default visible keys
 *   );
 *   ...
 *   <ListView visibleColumnKeys={visibleKeys} ... />
 *
 * Falls back gracefully to the default set during SSR (localStorage is not
 * available), so the initial client render matches and then hydrates to the
 * persisted set on mount.
 */
const STORAGE_PREFIX = 'ms:column-visibility:';

export function useColumnVisibility(entity: string, defaultVisible: string[]) {
  const defaultSet = new Set(defaultVisible);
  const [visibleKeys, setVisibleKeysState] = useState<Set<string>>(defaultSet);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + entity);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
          setVisibleKeysState(new Set(parsed));
          return;
        }
      }
    } catch {
      // Corrupt storage: fall through to defaults.
    }
  }, [entity]);

  const setVisibleKeys = useCallback(
    (next: Set<string>) => {
      setVisibleKeysState(next);
      try {
        localStorage.setItem(STORAGE_PREFIX + entity, JSON.stringify(Array.from(next)));
      } catch {
        // Private mode / quota — ignore; state still holds.
      }
    },
    [entity],
  );

  const reset = useCallback(() => {
    setVisibleKeysState(defaultSet);
    try {
      localStorage.removeItem(STORAGE_PREFIX + entity);
    } catch {
      // ignore
    }
  }, [entity, defaultSet]);

  return { visibleKeys, setVisibleKeys, reset };
}
