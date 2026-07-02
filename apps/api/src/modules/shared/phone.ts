/**
 * UZ phone-number normalisation.
 *
 * Accepts every shape we've seen in real Counterparty data:
 *   `+998901234567`, `998901234567`, `8901234567`, `90 123 45 67`,
 *   `+998 (90) 123-45-67`, `90-123-45-67`, etc.
 *
 * Returns the E.164 form `+998901234567` so we can:
 *   1. Index by phone reliably (one canonical string per real number).
 *   2. Hand off to Eskiz / Telegram / Payme without per-callsite stripping.
 *   3. Compare by string equality across channels.
 *
 * Throws when the input doesn't look like an Uzbek phone (operator code
 * outside 88-99 range or wrong digit count). Callers that accept the
 * lax case use `tryNormalizePhone` (returns null instead of throwing).
 */

// UZ mobile operator codes:
//   33  — Humans
//   88  — UMS legacy
//   90, 91  — Beeline
//   93, 94  — Ucell
//   95, 97  — Mobiuz
//   98  — Perfectum
//   99  — UMS
const E164_UZ = /^\+998(?:33|88|9[01345789])\d{7}$/;

/** Strict version — throws on invalid input. */
export function normalizeUzPhone(raw: string): string {
  const result = tryNormalizeUzPhone(raw);
  if (!result) {
    throw new Error(`Telefon formati noto'g'ri: ${raw.slice(0, 30)}`);
  }
  return result;
}

/** Lax version — returns null on invalid input. */
export function tryNormalizeUzPhone(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  // Strip every non-digit. We keep the leading `+` only as a hint;
  // it's regenerated from the canonical form anyway.
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length === 0) return null;

  // Cases:
  //   "998901234567"   → 12 digits, country code present → use as-is
  //   "8901234567"     → 10 digits, leading 8 (legacy) → drop 8 + prepend 998
  //   "901234567"      → 9 digits, just the local part → prepend 998
  //   "0901234567"     → 10 digits, leading 0 → drop 0 + prepend 998
  let local: string;
  if (digits.length === 12 && digits.startsWith('998')) {
    local = digits.slice(3);
  } else if (digits.length === 10 && (digits.startsWith('8') || digits.startsWith('0'))) {
    local = digits.slice(1);
  } else if (digits.length === 9) {
    local = digits;
  } else {
    return null;
  }

  // Operator code is the first 2 digits of the 9-digit local part.
  // Validation kept in the E164_UZ regex below — checking it twice would
  // duplicate the truth.

  const e164 = `+998${local}`;
  if (!E164_UZ.test(e164)) {
    return null;
  }
  return e164;
}

/**
 * Display version — `+998 90 123 45 67`. Use it for table cells / detail
 * pages where the user expects spacing. Storage stays canonical.
 */
export function formatUzPhone(canonical: string | null | undefined): string {
  if (!canonical) return '';
  if (!E164_UZ.test(canonical)) return canonical;
  return `${canonical.slice(0, 4)} ${canonical.slice(4, 6)} ${canonical.slice(6, 9)} ${canonical.slice(9, 11)} ${canonical.slice(11, 13)}`;
}
