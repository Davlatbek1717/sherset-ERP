/**
 * Minimal CSV builder + browser download helper used by list pages for
 * moysklad-parity "Export to CSV". Excel opens the file correctly thanks
 * to the UTF-8 BOM prefix; fields with commas/quotes/newlines are properly
 * double-quote-escaped per RFC 4180.
 */

export interface CsvColumn<T> {
  /** Header cell (plain text). */
  header: string;
  /** Stringifier for the row value. */
  cellText: (row: T) => string;
}

function escapeCell(s: string): string {
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const header = columns.map((c) => escapeCell(c.header)).join(',');
  const body = rows
    .map((r) => columns.map((c) => escapeCell(c.cellText(r))).join(','))
    .join('\r\n');
  return `${header}\r\n${body}`;
}

export function downloadCsv(filename: string, csv: string): void {
  // Guard for SSR / test environments without the DOM.
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Timestamp suffix for export filenames: `YYYY-MM-DD_HH-mm`. Avoids colons
 * so the browser-suggested filename is valid on Windows.
 */
export function csvTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    '_' +
    pad(d.getHours()) +
    '-' +
    pad(d.getMinutes())
  );
}

/**
 * Pick the delimiter by majority vote on the first non-empty line (counting
 * only delimiters OUTSIDE quotes). RU/UZ-locale Excel exports use `;`; some
 * tools use a tab. Defaults to `,`.
 */
export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const firstLine =
    text
      .replace(/^﻿/, '')
      .split(/\r?\n/)
      .find((l) => l.trim() !== '') ?? '';
  let inQ = false;
  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (let i = 0; i < firstLine.length; i++) {
    const c = firstLine[i];
    if (c === '"') inQ = !inQ;
    else if (!inQ && (c === ',' || c === ';' || c === '\t')) counts[c]++;
  }
  if (counts[';'] > counts[','] && counts[';'] >= counts['\t']) return ';';
  if (counts['\t'] > counts[','] && counts['\t'] > counts[';']) return '\t';
  return ',';
}

/**
 * Dependency-free CSV parser for the position-import flow. Handles the
 * real-world messiness of Excel/Sheets exports where naive `split(',')`
 * breaks: UTF-8 BOM, mixed CRLF/LF, quoted fields with embedded
 * delimiters/newlines/quotes (`""` escape), `,`/`;`/tab delimiter, and
 * trailing/blank lines. Returns a matrix of trimmed cells; fully-blank rows
 * are dropped.
 */
export function parseCsv(text: string, delimiter?: ',' | ';' | '\t'): string[][] {
  const delim = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let started = false;
  const startIdx = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endCell = () => {
    row.push(cell.trim());
    cell = '';
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
    started = false;
  };

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      started = true;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      started = true;
    } else if (ch === delim) {
      endCell();
      started = true;
    } else if (ch === '\n') {
      if (started || cell !== '' || row.length > 0) endRow();
    } else if (ch === '\r') {
      // ignored; the paired \n (or EOF) terminates the row
    } else {
      cell += ch;
      started = true;
    }
  }
  if (started || cell !== '' || row.length > 0) endRow();

  return rows.filter((r) => r.some((c) => c !== ''));
}

/** One product line extracted from a CSV import (still unresolved — `key`
 *  must be looked up against the catalog by the caller). */
export interface CsvImportRow {
  /** Product lookup key — a code / article / barcode / name. */
  key: string;
  /** Quantity as typed (validated > 0 by the caller). Defaults to '1'. */
  quantity: string;
  /** Optional unit price (human units, e.g. "12000"); undefined ⇒ use the
   *  product's own sale price. */
  price?: string;
}

const KEY_ALIASES = [
  'code',
  'код',
  'kod',
  'article',
  'артикул',
  'artikul',
  'barcode',
  'штрихкод',
  'shtrix',
  'sku',
  'name',
  'наименование',
  'nomi',
  'товар',
  'tovar',
];
const QTY_ALIASES = ['quantity', 'qty', 'кол-во', 'количество', 'miqdor', 'soni', 'son'];
const PRICE_ALIASES = ['price', 'цена', 'narx', 'narxi', 'summa'];

const norm = (s: string) => s.trim().toLowerCase();
const matchCol = (header: string[], aliases: string[]): number =>
  header.findIndex((h) => aliases.some((a) => norm(h) === a || norm(h).includes(a)));

/**
 * Turn parsed CSV rows into unresolved import lines.
 *
 * Column mapping is header-driven and locale-tolerant (ru/uz/en aliases for
 * code / quantity / price). If the first row has no recognisable header, it
 * falls back to positional columns: [key, quantity, price]. Rows with an
 * empty key are skipped; quantity defaults to "1". Returns a human error
 * string instead of throwing when the input can't yield any line.
 */
export function csvToImportRows(rows: string[][]): { items: CsvImportRow[]; error?: string } {
  if (rows.length === 0) return { items: [], error: 'Fayl bo‘sh' };

  const header = rows[0]!;
  let keyIdx = matchCol(header, KEY_ALIASES);
  let qtyIdx = matchCol(header, QTY_ALIASES);
  let priceIdx = matchCol(header, PRICE_ALIASES);
  const hasHeader = keyIdx !== -1;

  let dataRows: string[][];
  if (hasHeader) {
    dataRows = rows.slice(1);
  } else {
    // No recognisable header — assume positional [key, qty, price] and treat
    // every row as data.
    keyIdx = 0;
    qtyIdx = header.length > 1 ? 1 : -1;
    priceIdx = header.length > 2 ? 2 : -1;
    dataRows = rows;
  }

  const items: CsvImportRow[] = [];
  for (const r of dataRows) {
    const key = (r[keyIdx] ?? '').trim();
    if (!key) continue;
    const quantity = qtyIdx >= 0 ? (r[qtyIdx] ?? '').trim() || '1' : '1';
    const priceRaw = priceIdx >= 0 ? (r[priceIdx] ?? '').trim() : '';
    items.push({ key, quantity, price: priceRaw || undefined });
  }

  if (items.length === 0) return { items: [], error: 'Importga yaroqli qator topilmadi' };
  return { items };
}
