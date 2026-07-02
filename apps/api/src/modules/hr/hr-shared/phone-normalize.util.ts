/**
 * Normalize a telegram/contact phone input to canonical `+998XXXXXXXXX`
 * when the input looks like an Uzbek number, otherwise return the digit-only
 * form prefixed with `+` (foreign numbers).
 *
 * Accepted inputs (whitespace, dashes, parens stripped first):
 *   +998 90 123 45 67   → +998901234567
 *   998901234567        → +998901234567
 *   8901234567          → +998901234567   (Uzbek mobile, missing +998)
 *   901234567           → +998901234567   (just the 9-digit subscriber)
 *   +12025550123        → +12025550123    (foreign — kept digit-only with +)
 *
 * Returns null for empty/falsy. Throws on input that can't be coerced to a
 * sensible phone shape (non-digit chars after cleanup, or fewer than 9
 * meaningful digits).
 */
export function normalizeTelegramPhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/[\s\-()]/g, '');
  if (cleaned.length === 0) return null;
  // Must be digits with optional leading +.
  if (!/^\+?\d+$/.test(cleaned)) {
    throw new Error('Telegram telefon raqami: faqat raqam (+ ixtiyoriy)');
  }
  const digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
  if (digits.length < 9 || digits.length > 15) {
    throw new Error("Telegram telefon raqami 9-15 raqam bo'lishi kerak");
  }
  // Uzbek shapes:
  if (digits.startsWith('998') && digits.length === 12) return `+${digits}`;
  if (digits.length === 9 && digits.startsWith('9')) return `+998${digits}`;
  if (digits.length === 10 && digits.startsWith('89')) {
    // legacy "8 90 …" landline-prefixed mobile
    return `+998${digits.slice(1)}`;
  }
  // Foreign / unrecognized — keep digit-only with leading +.
  return `+${digits}`;
}
