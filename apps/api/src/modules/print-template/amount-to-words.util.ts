/**
 * Uzbek-Latin "amount in words" for printed documents.
 *
 * moysklad's sales print forms always end with «Итого к оплате: <сумма
 * прописью>» (e.g. "Ноль сумов 00 тийинов"). This renders the Uzbek
 * equivalent: the so'm integer part spelled out, followed by the tiyin as a
 * two-digit number — "qirq olti ming … so'm 78 tiyin".
 *
 * Input is minor units (tiyin); 1 so'm = 100 tiyin. Pure + BigInt-safe so
 * large document totals never lose precision.
 */

const UNITS = ['', 'bir', 'ikki', 'uch', "to'rt", 'besh', 'olti', 'yetti', 'sakkiz', "to'qqiz"];
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
// Scale words per group of three digits (index 0 = units group).
const SCALES = ['', 'ming', 'million', 'milliard', 'trillion'];

/** Spell a 0..999 group. 100 → "yuz" (no leading "bir"), 256 → "ikki yuz ellik olti". */
function threeDigitWords(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rem = n % 100;
  const tens = Math.floor(rem / 10);
  const ones = rem % 10;
  if (hundreds) parts.push(hundreds === 1 ? 'yuz' : `${UNITS[hundreds]} yuz`);
  if (tens) parts.push(TENS[tens] ?? '');
  if (ones) parts.push(UNITS[ones] ?? '');
  return parts.join(' ');
}

/** Spell a non-negative integer (BigInt) in Uzbek. 0 → "nol". */
export function integerToUzbekWords(value: bigint): string {
  if (value === 0n) return 'nol';
  // Split into base-1000 groups, least-significant first.
  const groups: number[] = [];
  let n = value < 0n ? -value : value;
  while (n > 0n) {
    groups.push(Number(n % 1000n));
    n /= 1000n;
  }
  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (!g) continue;
    let groupWords = threeDigitWords(g);
    const scale = SCALES[i] ?? '';
    if (i === 1 && g === 1) {
      // 1000 → "ming" (not "bir ming"), natural Uzbek.
      groupWords = '';
    }
    words.push(`${groupWords} ${scale}`.trim());
  }
  return words.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Format a minor-units amount (tiyin) as a capitalized Uzbek phrase:
 *   0n          → "Nol so'm 00 tiyin"
 *   466_597_800 → "To'rt million olti yuz oltmish besh ming to'qqiz yuz yetmish sakkiz so'm 00 tiyin"
 *   155_532_678 → "Bir million besh yuz ellik besh ming uch yuz yigirma olti so'm 78 tiyin"
 */
export function formatAmountInWords(minor: bigint | string | number | null | undefined): string {
  let big: bigint;
  try {
    big = minor == null ? 0n : typeof minor === 'bigint' ? minor : BigInt(minor);
  } catch {
    big = 0n;
  }
  if (big < 0n) big = -big;
  const som = big / 100n;
  const tiyin = big % 100n;
  const somWords = integerToUzbekWords(som);
  const capitalized = somWords.charAt(0).toUpperCase() + somWords.slice(1);
  const tiyinStr = tiyin.toString().padStart(2, '0');
  return `${capitalized} so'm ${tiyinStr} tiyin`;
}
