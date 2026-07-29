/**
 * Russian "amount in words" for the receipt print form («Товарный чек» 1:1,
 * owner 2026-07-27): «Четыре тысячи сто четырнадцать сумов 34 тийина».
 *
 * Input = minor units (tiyin), 1 so'm = 100 tiyin. The so'm part is spelled
 * out (thousands are feminine — «одна тысяча», «две тысячи»), the tiyin part
 * stays a two-digit number followed by the declined word.
 */

const UNITS_M = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const UNITS_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = [
  'десять',
  'одиннадцать',
  'двенадцать',
  'тринадцать',
  'четырнадцать',
  'пятнадцать',
  'шестнадцать',
  'семнадцать',
  'восемнадцать',
  'девятнадцать',
];
const TENS = [
  '',
  '',
  'двадцать',
  'тридцать',
  'сорок',
  'пятьдесят',
  'шестьдесят',
  'семьдесят',
  'восемьдесят',
  'девяносто',
];
const HUNDREDS = [
  '',
  'сто',
  'двести',
  'триста',
  'четыреста',
  'пятьсот',
  'шестьсот',
  'семьсот',
  'восемьсот',
  'девятьсот',
];
// [singular (1), few (2–4), many (5–0, 11–14)]
const SCALES: Array<[string, string, string] | null> = [
  null,
  ['тысяча', 'тысячи', 'тысяч'],
  ['миллион', 'миллиона', 'миллионов'],
  ['миллиард', 'миллиарда', 'миллиардов'],
  ['триллион', 'триллиона', 'триллионов'],
];

/** Pick the declined form for a count: 1→[0], 2–4→[1], else→[2] (11–14→[2]). */
export function plural(n: number, forms: [string, string, string]): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

function threeDigits(n: number, feminine: boolean): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rem = n % 100;
  if (h) parts.push(HUNDREDS[h] ?? '');
  if (rem >= 10 && rem <= 19) {
    parts.push(TEENS[rem - 10] ?? '');
  } else {
    const t = Math.floor(rem / 10);
    const o = rem % 10;
    if (t) parts.push(TENS[t] ?? '');
    if (o) parts.push((feminine ? UNITS_F : UNITS_M)[o] ?? '');
  }
  return parts.filter(Boolean).join(' ');
}

/** Spell a non-negative integer in Russian words («ноль» for 0). */
export function ruNumberWords(value: bigint | number): string {
  let n = BigInt(value);
  if (n < 0n) n = -n;
  if (n === 0n) return 'ноль';
  const groups: number[] = [];
  while (n > 0n) {
    groups.push(Number(n % 1000n));
    n /= 1000n;
  }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i] ?? 0;
    if (!g) continue;
    const scale = SCALES[i];
    parts.push(threeDigits(g, i === 1));
    if (scale) parts.push(plural(g, scale));
  }
  return parts.join(' ');
}

/** «Четыре тысячи сто четырнадцать сумов 34 тийина» from minor units. */
export function ruAmountWords(minor: bigint | number): string {
  let m = BigInt(minor);
  if (m < 0n) m = -m;
  const som = m / 100n;
  const tiyin = Number(m % 100n);
  const somWord = plural(Number(som % 100n), ['сум', 'сума', 'сумов']);
  const tiyinWord = plural(tiyin, ['тийин', 'тийина', 'тийинов']);
  const words = ruNumberWords(som);
  const sentence = `${words} ${somWord} ${String(tiyin).padStart(2, '0')} ${tiyinWord}`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
