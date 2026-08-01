/**
 * «Сумма прописью» / «Summa so'z bilan» — the amount spelled out.
 *
 * Majburiy on UZ/CIS printed documents (накладная, счёт, акт): the numeric
 * total is always repeated in words so it cannot be altered after signing.
 * Our print forms had no such line at all.
 *
 * Pure + BigInt-safe: takes the minor-unit amount (tiyin) the rest of the
 * money layer already uses, never a float.
 */

export type WordsLocale = 'ru' | 'uz';

// ── Russian ─────────────────────────────────────────────────────────────────
// Gender matters: тысяча is FEMININE («одна тысяча»), миллион is masculine
// («один миллион»), and the currency itself sets the gender of the last group.
const RU_ONES_M = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const RU_ONES_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const RU_TEENS = [
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
const RU_TENS = [
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
const RU_HUNDREDS = [
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

/** [1, 2-4, 5-0] — Russian plural buckets. */
type Plural3 = readonly [string, string, string];

/**
 * Russian plural selector. The 11–14 exception is the classic bug: 11 ends in
 * `1` but takes the MANY form («одиннадцать сумов», not «сум»).
 */
function ruPlural(n: number, forms: Plural3): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  const mod10 = n % 10;
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

/** 0–999 → Russian words, in the requested gender. */
function ruGroup(n: number, feminine: boolean): string[] {
  const out: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) out.push(RU_HUNDREDS[h] as string);
  if (rest >= 10 && rest <= 19) {
    out.push(RU_TEENS[rest - 10] as string);
  } else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    if (t) out.push(RU_TENS[t] as string);
    if (o) out.push(((feminine ? RU_ONES_F : RU_ONES_M)[o] as string) ?? '');
  }
  return out.filter(Boolean);
}

const RU_SCALES: { forms: Plural3; feminine: boolean }[] = [
  { forms: ['', '', ''], feminine: false }, // units — currency supplies the noun
  { forms: ['тысяча', 'тысячи', 'тысяч'], feminine: true },
  { forms: ['миллион', 'миллиона', 'миллионов'], feminine: false },
  { forms: ['миллиард', 'миллиарда', 'миллиардов'], feminine: false },
  { forms: ['триллион', 'триллиона', 'триллионов'], feminine: false },
];

function ruWholeToWords(n: bigint, unitFeminine: boolean): string {
  if (n === 0n) return 'ноль';
  const groups: number[] = [];
  let rest = n;
  while (rest > 0n) {
    groups.push(Number(rest % 1000n));
    rest /= 1000n;
  }
  const out: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i] as number;
    if (g === 0) continue; // skip empty groups — «один миллион», not «… ноль тысяч …»
    const scale = RU_SCALES[i];
    const feminine = i === 0 ? unitFeminine : (scale?.feminine ?? false);
    out.push(...ruGroup(g, feminine));
    if (i > 0 && scale) out.push(ruPlural(g, scale.forms));
  }
  return out.join(' ');
}

// ── Uzbek (latin) ───────────────────────────────────────────────────────────
// No gender, no plural declension — numerals simply concatenate.
const UZ_ONES = ['', 'bir', 'ikki', 'uch', "to'rt", 'besh', 'olti', 'yetti', 'sakkiz', "to'qqiz"];
const UZ_TENS = [
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
const UZ_SCALES = ['', 'ming', 'million', 'milliard', 'trillion'];

function uzGroup(n: number): string[] {
  const out: string[] = [];
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  if (h) out.push(UZ_ONES[h] as string, 'yuz');
  if (t) out.push(UZ_TENS[t] as string);
  if (o) out.push(UZ_ONES[o] as string);
  return out.filter(Boolean);
}

function uzWholeToWords(n: bigint): string {
  if (n === 0n) return 'nol';
  const groups: number[] = [];
  let rest = n;
  while (rest > 0n) {
    groups.push(Number(rest % 1000n));
    rest /= 1000n;
  }
  const out: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i] as number;
    if (g === 0) continue;
    out.push(...uzGroup(g));
    if (i > 0) out.push(UZ_SCALES[i] as string);
  }
  return out.join(' ');
}

// ── Currency nouns ──────────────────────────────────────────────────────────
/** Currencies we can decline. Anything else falls back to the ISO code. */
const CURRENCY_WORDS: Record<
  string,
  { ru: { major: Plural3; feminine: boolean; minor: string }; uz: { major: string; minor: string } }
> = {
  UZS: {
    ru: { major: ['сум', 'сума', 'сумов'], feminine: false, minor: 'тийин' },
    uz: { major: "so'm", minor: 'tiyin' },
  },
};

function capitalize(s: string): string {
  return s.length ? s[0]?.toUpperCase() + s.slice(1) : s;
}

/**
 * Spell out a money amount.
 *
 * @param minor  amount in minor units (tiyin) — bigint or a digit string
 * @param currency ISO code; unknown codes print the code itself, undeclined
 * @param locale 'ru' | 'uz'
 *
 * @example amountInWords(4_507_902_000n, 'UZS', 'ru')
 *   → 'Сорок пять миллионов семьдесят девять тысяч двадцать сумов 00 тийин'
 */
export function amountInWords(
  minor: bigint | string | number,
  currency: string,
  locale: WordsLocale,
): string {
  const raw = typeof minor === 'bigint' ? minor : BigInt(String(minor));
  const abs = raw < 0n ? -raw : raw;
  const whole = abs / 100n;
  const frac = Number(abs % 100n);
  const fracText = String(frac).padStart(2, '0');
  const sign = raw < 0n ? '-' : '';

  const words = CURRENCY_WORDS[currency];
  if (!words) {
    // Unknown currency: still spell the number, but keep the ISO code as-is.
    const n = locale === 'uz' ? uzWholeToWords(whole) : ruWholeToWords(whole, false);
    return `${sign}${capitalize(n)} ${currency} ${fracText}`;
  }

  if (locale === 'uz') {
    return `${sign}${capitalize(uzWholeToWords(whole))} ${words.uz.major} ${fracText} ${words.uz.minor}`;
  }
  const n = ruWholeToWords(whole, words.ru.feminine);
  const noun = ruPlural(Number(whole % 1000n), words.ru.major);
  return `${sign}${capitalize(n)} ${noun} ${fracText} ${words.ru.minor}`;
}
