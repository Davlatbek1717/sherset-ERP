'use client';

import type * as React from 'react';
import type { DataTableColumn } from '../data-display/DataTable.tsx';
import { Icons } from '../icons/action-icons.ts';
import { type CsvColumn, buildCsv, csvTimestamp, downloadCsv } from '../lib/csv.ts';
import { Button } from '../primitives/Button.tsx';

export interface ExportButtonProps<T> {
  /** Prefix for the downloaded filename; a timestamp suffix is appended. */
  filenamePrefix: string;
  /** All table columns — only those with `cellText` will be exported. */
  columns: DataTableColumn<T>[];
  /** The rows currently visible in the list (after filters + pagination). */
  rows: T[];
  /** Optional — restrict export to the user-visible column subset. */
  visibleKeys?: Set<string>;
  /** Button label (defaults to an icon-only trigger). */
  label?: React.ReactNode;
  /** Disables the button while rows are loading / empty. */
  disabled?: boolean;
}

/**
 * Downloads the currently visible rows as a UTF-8 CSV (Excel-compatible).
 * A column is included only when it declares `cellText` — columns that
 * render JSX widgets without a plain-text accessor are skipped rather than
 * producing `[object Object]` garbage.
 */
export function ExportButton<T>({
  filenamePrefix,
  columns,
  rows,
  visibleKeys,
  label,
  disabled,
}: ExportButtonProps<T>) {
  const handle = () => {
    const active = columns
      .filter((c) => (visibleKeys ? visibleKeys.has(c.key) : true))
      .filter((c) => typeof c.cellText === 'function');
    if (active.length === 0 || rows.length === 0) return;

    const csvCols: CsvColumn<T>[] = active.map((c) => ({
      header: c.headerText ?? (typeof c.header === 'string' ? c.header : c.key),
      cellText: c.cellText!,
    }));
    const csv = buildCsv(csvCols, rows);
    downloadCsv(`${filenamePrefix}_${csvTimestamp()}.csv`, csv);
  };

  return (
    <Button
      variant="tertiary"
      size="sm"
      onClick={handle}
      disabled={disabled || rows.length === 0}
      data-test-id="export-csv-button"
      aria-label="Export CSV"
    >
      <Icons.download className="w-4 h-4" />
      {label}
    </Button>
  );
}
