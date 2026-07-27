/**
 * Pure parser for the «Импорт ▾» flow on document position grids (Приёмка etc.).
 *
 * Input: raw text of a CSV/TSV file the user picked (Excel «Save As CSV», or a
 * plain list). Each line = one product line, TWO columns:
 *
 *     <identifier><delim><quantity>
 *
 *   · identifier — product code / article / barcode / name (matched later against
 *     the catalog via the same search the inline-add box uses).
 *   · quantity   — positive number; decimal comma OR dot both accepted.
 *   · delimiter  — auto-detected per line: TAB, then «;», then «,» (so a paste
 *     from Excel — tab-separated — and a comma CSV both work).
 *
 * Robustness (this feeds a "no new bugs" feature): the parser NEVER throws.
 * A first line whose quantity is non-numeric is treated as a HEADER and skipped
 * silently; any later malformed line is counted in `skipped` (surfaced to the
 * user as «N qator o'tkazib yuborildi») rather than aborting the whole import.
 */

export interface ParsedImportRow {
  /** Product code / article / barcode / name — resolved against the catalog. */
  identifier: string;
  /** Positive quantity (base units). */
  quantity: number;
}

export interface ParsePositionImportResult {
  rows: ParsedImportRow[];
  /** Malformed data lines that were dropped (excludes a skipped header line). */
  skipped: number;
}

/** Split one line on the first delimiter present: TAB → «;» → «,». */
function splitLine(line: string): string[] {
  const delim = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
  return line.split(delim).map((c) => c.trim());
}

/** Parse a quantity cell: strips spaces, accepts decimal comma. NaN when invalid. */
function parseQty(raw: string): number {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  if (cleaned === '') return Number.NaN;
  return Number(cleaned);
}

export function parsePositionImport(text: string): ParsePositionImportResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const rows: ParsedImportRow[] = [];
  let skipped = 0;

  lines.forEach((line, index) => {
    const cols = splitLine(line);
    const identifier = (cols[0] ?? '').trim();
    const qty = parseQty(cols[1] ?? '');

    if (!identifier || !Number.isFinite(qty) || qty <= 0) {
      // A malformed FIRST line is almost always the column header ("Kod;Miqdor")
      // — drop it silently. Any later bad line is a real skip we report.
      if (index > 0) skipped += 1;
      return;
    }
    rows.push({ identifier, quantity: qty });
  });

  return { rows, skipped };
}
