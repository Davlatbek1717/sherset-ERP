/**
 * Code 128 (Code Set B) encoder — real, scannable barcodes for the label
 * print flow (replaces the v1 hash-pattern placeholder bars).
 *
 * Output is the raw module-width sequence (bar, space, bar, … starting with
 * a bar) ready to be drawn as SVG rects; the caller adds the ≥10-module
 * quiet zones. Code Set B covers ASCII 32–126, which includes the shop's
 * cell-style codes («01-02-03-04») and typical alphanumeric SKUs.
 *
 * The symbol table is the standard ISO/IEC 15417 width table; its
 * integrity (107 entries, 6 elements × 11 modules each, stop = 7 × 13,
 * all unique) is locked by src/lib/barcode128.test.ts so a typo here
 * cannot silently produce unscannable bars.
 */

// Values 0–102 = data/checksum symbols, 103–105 = Start A/B/C, 106 = Stop.
export const CODE128_PATTERNS: readonly string[] = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
];

const START_B = 104;
const STOP = 106;

/**
 * Encode `text` as Code 128 B. Returns the alternating module widths
 * (first entry is a BAR). Throws on characters outside ASCII 32–126.
 */
export function encodeCode128B(text: string): number[] {
  const data = [...text].map((ch) => {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) {
      throw new Error(`Code128B: unsupported character «${ch}»`);
    }
    return c - 32;
  });
  let checksum = START_B;
  data.forEach((v, i) => {
    checksum += v * (i + 1);
  });
  const values = [START_B, ...data, checksum % 103, STOP];
  return values.flatMap((v) => {
    const pattern = CODE128_PATTERNS[v];
    if (!pattern) throw new Error(`Code128B: invalid symbol value ${v}`);
    return [...pattern].map(Number);
  });
}

/** Sum of all module widths (bar area width in modules, without quiet zones). */
export function code128Modules(widths: readonly number[]): number {
  return widths.reduce((a, b) => a + b, 0);
}
