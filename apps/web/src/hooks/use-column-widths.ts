'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Per-user column-width preferences persisted to localStorage — drives
 * the moysklad-parity column resize handles in DataTable. Widths are
 * stored as pixels keyed by `DataTableColumn.key`.
 *
 * Usage:
 *   const widths = useColumnWidths('purchase-orders');
 *   <ListView
 *     columnWidths={widths.values}
 *     onColumnResize={widths.set}
 *   />
 *
 * The hook is intentionally minimal — it does NOT seed default widths.
 * Columns without an entry render with their `DataTableColumn.width` (or
 * the natural table width). Only resized columns are persisted.
 */
const STORAGE_PREFIX = 'ms:column-widths:';

export function useColumnWidths(entity: string) {
  const [values, setValuesState] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + entity);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (
          parsed &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          Object.values(parsed).every((v) => typeof v === 'number' && v > 0)
        ) {
          setValuesState(parsed as Record<string, number>);
        }
      }
    } catch {
      // Corrupt storage — fall through to empty defaults.
    }
  }, [entity]);

  const set = useCallback(
    (key: string, width: number) => {
      setValuesState((prev) => {
        const next = { ...prev, [key]: Math.max(40, Math.round(width)) };
        try {
          localStorage.setItem(STORAGE_PREFIX + entity, JSON.stringify(next));
        } catch {
          // Private mode / quota — ignore; state still holds.
        }
        return next;
      });
    },
    [entity],
  );

  const reset = useCallback(() => {
    setValuesState({});
    try {
      localStorage.removeItem(STORAGE_PREFIX + entity);
    } catch {
      // ignore
    }
  }, [entity]);

  return { values, set, reset };
}
