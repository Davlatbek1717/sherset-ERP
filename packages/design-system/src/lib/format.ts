/**
 * moysklad-style display name for a currency code. Uzbekistan-day-to-day
 * is `сум` (the local short form, used in moysklad.uz across both ru and
 * uz locales). Other ISO codes are passed through unchanged so foreign
 * currencies still read as `USD`, `EUR`, etc.
 *
 * Kept private — callers that need the ISO code should pass `displayAs`
 * explicitly (no current call site needs that).
 */
const CURRENCY_DISPLAY_NAME: Record<string, string> = {
  UZS: 'сум',
};

/**
 * Currency code → moysklad short display name («сум» for UZS; other ISO codes
 * pass through). Same map formatMoney's localized display uses — exposed so a
 * standalone «Валюта» column (e.g. the product «История» movement tables) shows
 * «сум», not the raw «UZS», exactly like moysklad.
 */
export function currencyDisplayName(code: string): string {
  return CURRENCY_DISPLAY_NAME[code] ?? code;
}

/** Format a bigint/number stored as minor units (tiyin) for display. */
export function formatMoney(
  minorUnits: bigint | string | number | null | undefined,
  currency = 'UZS',
  options?: { displayAs?: 'iso' | 'localized' | 'none' },
): string {
  if (minorUnits === null || minorUnits === undefined) return '—';
  const bi = typeof minorUnits === 'bigint' ? minorUnits : BigInt(String(minorUnits));
  const negative = bi < 0n;
  const abs = negative ? -bi : bi;
  const wholes = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  // moysklad parity: thousands separator is THIN SPACE (U+00A0) and the
  // decimal separator is COMMA — "64 000,00". The ru-RU locale produces
  // this pattern; the previous uz-UZ output was "64,000.00" which
  // doesn't match the moysklad UI.
  const formatted = wholes.toLocaleString('ru-RU');
  if (options?.displayAs === 'none') {
    // moysklad list-view money cells render WITHOUT the currency
    // suffix — the `Валюта` column shows it once per row. This mode
    // is opt-in so totals/details still display "64 000,00 сум".
    return `${negative ? '-' : ''}${formatted},${frac}`;
  }
  const display =
    options?.displayAs === 'iso' ? currency : (CURRENCY_DISPLAY_NAME[currency] ?? currency);
  return `${negative ? '-' : ''}${formatted},${frac} ${display}`;
}

/**
 * Money-INPUT helpers — UZS tiyin (minor) ⇄ som (major) for an editable field.
 *
 * The whole app stores money as minor units (tiyin) and `formatMoney` displays
 * them by dividing by 100. Editable money inputs, however, used to bind the raw
 * minor value, so a user typing "300000" booked 3 000,00 сум (100× too small).
 * `<MoneyInput>` uses these to show/accept the major amount while keeping the
 * caller's minor-based state. Scale is /100 (matches `formatMoney`); full
 * non-UZS support is a separate, grounding-gated effort. Exported for tests.
 *
 *   minorToMajorInput("30000000") => "300000"     (whole → no trailing decimals)
 *   minorToMajorInput("30000050") => "300000.5"
 *   minorToMajorInput("50")       => "0.5"
 *   minorToMajorInput("") / null  => ""            (empty stays empty)
 */
export function minorToMajorInput(minor: string | number | null | undefined): string {
  if (minor === null || minor === undefined || minor === '') return '';
  const s = String(minor).trim();
  const neg = s.startsWith('-');
  const digits = s.replace(/[^\d]/g, '');
  if (digits === '') return '';
  const padded = digits.padStart(3, '0');
  const whole = padded.slice(0, -2).replace(/^0+(?=\d)/, '');
  const frac = padded.slice(-2).replace(/0+$/, ''); // "50"→"5", "00"→"", "05"→"05"
  const major = frac ? `${whole}.${frac}` : whole;
  return neg && major !== '0' ? `-${major}` : major;
}

/**
 * Live-format a partially-typed major (som) amount for an editable money field:
 * thin-space thousands grouping on the integer part, comma decimal kept as typed
 * (max 2 places), so the value reads «9 990,00» WHILE editing instead of jumping
 * to plain «9990» on focus. Precision-safe (string grouping, no Number()).
 *
 *   groupMajorDraft("9990")     => "9 990"
 *   groupMajorDraft("9 990,5")  => "9 990,5"
 *   groupMajorDraft("9990,")    => "9 990,"
 *   groupMajorDraft("1234567,8")=> "1 234 567,8"
 *   groupMajorDraft("")         => ""
 */
/**
 * Pul kiritishning YAGONA tozalash manbai — ekran ham, saqlanadigan tiyin ham
 * shundan chiqadi.
 *
 * 🔴 2026-08-21 gacha bunday umumiy manba YO'Q edi: `MoneyInput` ekranga
 * `groupMajorDraft(raw)` ni, qiymatga esa `majorToMinorInput(raw)` ni berardi
 * va ular boshqacha tozalardi. Natijada ekran bir raqamni, hujjat boshqasini
 * ko'rsatardi (o'lchangan: «1 000,005» → ekran «1 000,00», qiymat 100001;
 * «1 000,00,» → ekran «1 000,00», qiymat 0 — pul jimgina yo'qolardi).
 * Ikkalasi endi shu funksiyadan o'tadi, ya'ni ajralib keta olmaydi.
 *
 * Faqat raqam va BIRINCHI ajratgich saqlanadi (nuqta ham vergulga keltiriladi),
 * kasr 2 xonaga kesiladi — moysklad tiyin aniqligi.
 */
export function splitMajorDraft(raw: string | number | null | undefined): {
  intRaw: string;
  hasComma: boolean;
  dec: string;
} {
  const m = String(raw ?? '')
    .replace(/[^\d.,]/g, '')
    .replace(/\./g, ',')
    .match(/^(\d*)(,?)(\d*)/);
  return {
    intRaw: m?.[1] ?? '',
    hasComma: m?.[2] === ',',
    dec: (m?.[3] ?? '').slice(0, 2),
  };
}

export function groupMajorDraft(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  const { intRaw, hasComma, dec } = splitMajorDraft(raw);
  // Trim leading zeros (keep a single one), then thin-space group every 3.
  const intTrimmed = intRaw.replace(/^0+(?=\d)/, '');
  const grouped = intTrimmed.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  if (hasComma) return `${grouped || '0'},${dec}`;
  return grouped;
}

/**
 * Parse a user-typed major (som) amount → minor (tiyin) string. Accepts
 * space/thin-space grouping and comma OR dot decimal ("300 000,50",
 * "300000.5", "300000"). Invalid / empty / negative → "0" (the save-time
 * `sum > 0` check rejects it with a localised message). Rounds to whole tiyin.
 */
export function majorToMinorInput(major: string | number | null | undefined): string {
  if (major === null || major === undefined) return '0';
  const t = String(major).trim();
  // Manfiylikni TOZALASHDAN OLDIN ushlaymiz: tozalagich '-' ni olib tashlaydi,
  // ya'ni keyin tekshirilsa «-5» → 500 bo'lib ketardi (mavjud shartnoma: '0').
  if (t === '' || t.startsWith('-')) return '0';
  const { intRaw, dec } = splitMajorDraft(t);
  if (intRaw === '' && dec === '') return '0';
  // Satr arifmetikasi: `Math.round(n * 100)` katta summada suzuvchi nuqta
  // xatosini beradi va «1 000,005» kabi kiritishda ekrandan FARQ qiladigan
  // qiymat chiqarardi (100001). Bu yerda ekrandagi kesilgan kasr ishlatiladi.
  const minor = BigInt(intRaw || '0') * 100n + BigInt(dec.padEnd(2, '0') || '0');
  return minor.toString();
}

/** Format ISO or Date — short (DD.MM.YYYY HH:MM).
 *
 * moysklad parity: the date/time separator is a SPACE, not the comma
 * that ru-RU locale's `toLocaleString` emits by default ("04.06.2025
 * 09:39", not "04.06.2025, 09:39"). We replace the locale's auto-comma
 * here so every detail-page header, list-page row, and audit timeline
 * entry displays the moysklad format without per-call-site post
 * processing.
 */
export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return d
    .toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(', ', ' ');
}

/** Format date only (DD.MM.YYYY) */
export function formatDateOnly(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
