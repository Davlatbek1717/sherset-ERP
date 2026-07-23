/**
 * Code 128 barcode encoder — zero-dep, hand-vendored (2026-07-04) because
 * `pnpm add` is unavailable on this box (same reason qrcode-generator.js is
 * vendored next door).
 *
 * SYMBOL TABLE PROVENANCE (do not hand-edit): transcribed from the Code 128
 * table on en.wikipedia.org/wiki/Code_128 via two independent fetches, then
 * machine-verified against the symbology's structural invariants — every
 * symbol is 6 widths summing to 11 modules (stop: 7 widths, 13 modules), an
 * EVEN number of bar modules, widths 1..4, all 107 patterns unique. The
 * checksum implementation reproduces the article's published worked example
 * (Code B "Wikipedia" → check symbol 88). Locked by src/lib/vendor/code128.test.ts.
 *
 * Encoding strategy: pure Code C for even-length all-digit values (compact —
 * our generated cell barcodes are numeric), else pure Code B (printable ASCII
 * 32..126, covers cell codes like «01-02-03-04»).
 */

// value → bar/space widths ("212222" = bar2 space1 bar2 space2 bar2 space2).
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];

const START_B = 104;
const START_C = 105;
const STOP = 106;

/** Symbol VALUES for `text` (start + data + checksum + stop) — or null when unencodable. */
export function code128Values(text: string): number[] | null {
  if (text.length === 0) return null;
  const digitsOnly = /^\d+$/.test(text) && text.length % 2 === 0;
  const values: number[] = [];
  if (digitsOnly) {
    values.push(START_C);
    for (let i = 0; i < text.length; i += 2) values.push(Number(text.slice(i, i + 2)));
  } else {
    values.push(START_B);
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      if (code < 32 || code > 126) return null; // Code B printable range only
      values.push(code - 32);
    }
  }
  let sum = values[0] as number;
  for (let i = 1; i < values.length; i++) sum += i * (values[i] as number);
  values.push(sum % 103);
  values.push(STOP);
  return values;
}

/**
 * Module widths for `text`, alternating bar/space starting with a BAR (the
 * stop symbol's 7th width is its termination bar). Null when unencodable.
 */
export function code128Widths(text: string): number[] | null {
  const values = code128Values(text);
  if (!values) return null;
  const widths: number[] = [];
  for (const v of values) {
    const p = PATTERNS[v];
    if (!p) return null;
    for (const d of p) widths.push(Number(d));
  }
  return widths;
}

/** Exposed for the vendoring guard test only. */
export const CODE128_PATTERNS = PATTERNS;
