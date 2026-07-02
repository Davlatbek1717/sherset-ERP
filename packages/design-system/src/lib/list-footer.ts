import { formatMoney } from './format.ts';

/**
 * Resolve a list's pinned «Итого» footer money cells with moysklad's
 * currency-guard. Money columns store `sumMinor` in EACH document's OWN
 * currency (never normalised to a base), so a filtered set that mixes
 * currencies cannot be summed into one meaningful number. moysklad likewise
 * never sums unlike currencies. The three states, mirrored here:
 *
 *   - totals not yet loaded (`null`/`undefined`) → every cell shows «…»
 *   - filtered set mixes ≥2 currencies          → every cell shows «—»
 *   - the whole set shares ONE currency          → formatMoney(value, currency)
 *     with no trailing symbol (matching the grid cells above the footer)
 *
 * The caller passes the already-computed minor-unit value per column key
 * (derived columns like «Не оплачено» = Σsum − Σpayed are computed with
 * {@link subtractMinor} before being handed in). When totals are absent or
 * mixed, the passed values are ignored — the guard wins.
 */
export function footerMoneyCells<K extends string>(
  totals: { currencies?: string[] | null } | null | undefined,
  valuesMinor: Record<K, string>,
): Record<K, string> {
  const keys = Object.keys(valuesMinor) as K[];
  const out = {} as Record<K, string>;
  if (!totals) {
    for (const k of keys) out[k] = '…';
    return out;
  }
  if ((totals.currencies?.length ?? 0) > 1) {
    for (const k of keys) out[k] = '—';
    return out;
  }
  // Single-currency (the common case) — exact total. Empty currencies (e.g. an
  // empty result set) falls back to UZS, the account base, like the grid.
  const currency = totals.currencies?.[0] || 'UZS';
  for (const k of keys) out[k] = formatMoney(valuesMinor[k], currency, { displayAs: 'none' });
  return out;
}

/**
 * Subtract two minor-unit money amounts (tiyin/cents) given as decimal
 * strings, returning a decimal string. Uses BigInt so there is NO floating
 * point drift across large filtered sets — e.g. «Не оплачено» total =
 * Σ(sumMinor) − Σ(payedSumMinor).
 */
export function subtractMinor(a: string, b: string): string {
  return (BigInt(a) - BigInt(b)).toString();
}
