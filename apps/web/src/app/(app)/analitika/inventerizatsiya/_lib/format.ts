/** Shared formatting helpers for the Inventerizatsiya sub-routes. */
import type { Status } from './types';

export function fmtMoney(minor: string): string {
  return `${(Number(minor) / 100).toLocaleString('ru-RU')} so'm`;
}

export const STATUS_DOT: Record<Status, string> = {
  green: 'bg-[var(--ms-success-500)]',
  yellow: 'bg-[var(--ms-warning-500)]',
  red: 'bg-[var(--ms-destructive-500)]',
};

/** Build + trigger a CSV download (BOM-prefixed so Excel reads UTF-8). */
export function downloadCsv(filename: string, rows: string[][]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
