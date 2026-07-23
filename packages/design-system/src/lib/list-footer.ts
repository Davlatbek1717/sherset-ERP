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
 * {@link subtractMinor} before being handed in). When totals are absent the
 * cells show «…».
 *
 * MIXED-currency sets: moysklad does NOT show a «—» dash — it sums every
 * document CONVERTED TO THE ACCOUNT BASE currency (UZS) via each doc's stored
 * exchange rate, and shows that single base number (LIVE-GROUND 2026-06-28
 * #invoicein: 1 150,80 USD + 327 000 сум → footer 14 481 840,00 = exact base
 * sum at rate 12 300). Pass `opts.baseValuesMinor` (already converted to base
 * minor units by the backend) to render that. WITHOUT it, the legacy «—» dash
 * is kept (backward-compatible for lists whose totals endpoint has not yet
 * been taught to return base sums).
 */
export function footerMoneyCells<K extends string>(
  totals: { currencies?: string[] | null } | null | undefined,
  valuesMinor: Record<K, string>,
  opts?: {
    /** Per-key totals already converted to the account base currency (minor
     *  units). When present, a mixed-currency set renders these instead of «—». */
    baseValuesMinor?: Record<K, string>;
    /** Account base currency for the converted total (default UZS). */
    baseCurrency?: string;
  },
): Record<K, string> {
  const keys = Object.keys(valuesMinor) as K[];
  const out = {} as Record<K, string>;
  if (!totals) {
    for (const k of keys) out[k] = '…';
    return out;
  }
  if ((totals.currencies?.length ?? 0) > 1) {
    // moysklad parity: a mixed set shows the BASE-currency-converted sum (not a
    // dash). Only when the backend supplied the converted values — else the
    // legacy guard (no meaningless cross-currency raw sum) still wins.
    const base = opts?.baseValuesMinor;
    if (base) {
      const baseCur = opts?.baseCurrency || 'UZS';
      for (const k of keys) out[k] = formatMoney(base[k] ?? '0', baseCur, { displayAs: 'none' });
      return out;
    }
    for (const k of keys) out[k] = '—';
    return out;
  }
  // Single-currency (the common case) — exact total in that currency. Empty
  // currencies (e.g. an empty result set) falls back to UZS, the account base.
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
