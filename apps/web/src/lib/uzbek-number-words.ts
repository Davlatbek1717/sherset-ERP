/**
 * Uzbek (Latin) amount-in-words for printed receipts — «Raqam bilan» qatori.
 *
 * A tiyin (minor) amount → e.g. «Uch yuz o'ttiz ming ikki yuz ellik so'm 00 tiyin».
 * Handles up to trillions; the som part is spelled, the tiyin is shown as two digits.
 */

const ONES = ['', 'bir', 'ikki', 'uch', "to'rt", 'besh', 'olti', 'yetti', 'sakkiz', "to'qqiz"];
const TENS = [
  '',
  "o'n",
  'yigirma',
  "o'ttiz",
  'qirq',
  'ellik',
  'oltmish',
  'yetmish',
  'sakson',
  "to'qson",
];
// Index = group position from the right (0 = units group, 1 = thousands, …).
const SCALES = ['', 'ming', 'million', 'milliard', 'trillion', 'kvadrillion'];

/** 0..999 → words (e.g. 250 → «ikki yuz ellik», 100 → «bir yuz»). */
function group3ToWords(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  if (h) parts.push(ONES[h] ?? '', 'yuz');
  if (t) parts.push(TENS[t] ?? '');
  if (o) parts.push(ONES[o] ?? '');
  return parts.join(' ');
}

/** Spell the som integer part (no «so'm» suffix). */
function somIntegerToWords(som: bigint): string {
  if (som === 0n) return 'nol';
  const groups: number[] = [];
  let x = som < 0n ? -som : som;
  while (x > 0n) {
    groups.push(Number(x % 1000n));
    x /= 1000n;
  }
  const chunks: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i] ?? 0;
    if (g === 0) continue;
    const words = group3ToWords(g);
    const scale = SCALES[i] ?? '';
    chunks.push(scale ? `${words} ${scale}` : words);
  }
  return chunks.join(' ');
}

/**
 * Full «Raqam bilan» string for a tiyin amount, first letter capitalised:
 *   somInWords(33025000n) → "Uch yuz o'ttiz ming ikki yuz ellik so'm 00 tiyin"
 */
export function somInWords(minor: bigint | string): string {
  const v = typeof minor === 'string' ? BigInt(minor || '0') : minor;
  const abs = v < 0n ? -v : v;
  const som = abs / 100n;
  const tiyin = Number(abs % 100n);
  const words = somIntegerToWords(som);
  const capitalised = words.charAt(0).toUpperCase() + words.slice(1);
  const sign = v < 0n ? 'minus ' : '';
  return `${sign}${capitalised} so'm ${tiyin.toString().padStart(2, '0')} tiyin`;
}
