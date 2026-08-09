/**
 * POS dialoglari uchun YAGONA pul-parse (FE-08 / FE-09).
 *
 * NEGA BOR: to'lov/qarz/rasmiylashtirish/chiqim oynalarida to'rt mustaqil
 * nusxa yashagan edi —
 *   `BigInt(parseInt(s, 10) * 100)`  → kiritilgan tiyinni JIM kesardi va
 *      15+ raqamda `parseInt * 100` 2^53 dan oshib kasrli float bo'lardi,
 *      `BigInt()` esa RangeError bilan dialogni yiqitardi;
 *   `BigInt(Math.round(n * 100))`    → IEEE-754 float orqali yaxlitlardi.
 * Ikkalasida ham scale QATTIQ `100` edi: 0 kasrli kassada (JPY uslubi)
 * summa 100 barobar shishardi. `retail/page.tsx` bu bug-klassni drawer va
 * smena-ochish/yopish uchun allaqachon `Money.fromMajor` bilan yopgan —
 * shu fayl o'sha yechimni to'lov oynalariga ham olib keladi.
 *
 * Shartnoma (qasddan qat'iy — bu klaviatura maydoni, hujjat importi emas):
 *   - kirish: `123`, `123.45`, `123,45`, probel bilan ajratilgan `1 000,50`;
 *   - guruh-ajratgichli aralash format (`15,000.50`) QABUL QILINMAYDI;
 *   - bo'sh / buzuq / manfiy → `0n` (istisno OTILMAYDI: qiymat render
 *     paytida hisoblanadi, istisno butun oynani yiqitardi);
 *   - valyuta scale'idan ortiq kasr **half-up** yaxlitlanadi.
 */

import { Money, getCurrency } from '@moysklad/money';
import type { CurrencyCode } from '@moysklad/money/currencies';

/** Probelsiz `123`, `123.45` yoki `123,45`. */
const ACCEPTED = /^\d+(?:[.,]\d+)?$/;

export function parseAmountToMinor(raw: string, currency: CurrencyCode = 'UZS'): bigint {
  const compact = raw.replace(/\s/g, '');
  if (!ACCEPTED.test(compact)) return 0n;
  try {
    return Money.fromMajor(compact, currency, 'half-up').toMinor();
  } catch {
    return 0n;
  }
}

/**
 * Teskari yo'nalish: tiyin → maydonga qo'yiladigan matn.
 *
 * `Number(minor) / 100` EMAS — u 2^53 dan katta summani yaxlitlaydi
 * («Hammasi» tugmasi qarz qoldig'ini bir tiyinga xato qo'yardi va server
 * ortiqchani rad etardi) va 0 kasrli valyutada summani 100× kichraytiradi.
 */
export function formatAmountInput(minor: bigint, currency: CurrencyCode = 'UZS'): string {
  if (minor <= 0n) return '0';
  const { multiplier, minorUnit } = getCurrency(currency);
  const int = (minor / multiplier).toString();
  if (minorUnit === 0) return int;
  const frac = (minor % multiplier).toString().padStart(minorUnit, '0').replace(/0+$/, '');
  return frac === '' ? int : `${int}.${frac}`;
}

/**
 * Summani butun major-birlikkacha YUQORIGA yaxlitlab maydon matni qiladi —
 * «Aniq» tugmasi uchun: naqd kassada tiyin yo'q, kassir yuqori butun
 * summani beradi (to'langan ≥ chek summasi sharti buzilmasin).
 */
export function ceilAmountInput(minor: bigint, currency: CurrencyCode = 'UZS'): string {
  if (minor <= 0n) return '0';
  const { multiplier } = getCurrency(currency);
  return ((minor + multiplier - 1n) / multiplier).toString();
}
