/**
 * Compute per-position invoice totals.
 *
 * Inputs use the wire format the API returns:
 *   - quantity: decimal string ("5.500")
 *   - priceMinor: BigInt-as-string in tiyin
 *   - discount: decimal string 0..100 ("10")
 *   - vat: percent number 0..100 or null
 *
 * Math is done entirely in BigInt by scaling everything to micro-tiyin
 * (×1_000_000) before division, so up to 6 decimal places of qty +
 * 4 of percent stay exact, then we round half-up back to tiyin.
 *
 * Behavior matches the API's invoice posting logic so client-side
 * print previews show the same per-line totals the database stores.
 */
export interface PositionInput {
  quantity: string;
  priceMinor: string;
  discount: string;
  vat: number | null;
}

export interface PositionTotals {
  /** Final amount the buyer pays, in tiyin (BigInt). */
  totalMinor: bigint;
  /** VAT portion of totalMinor, in tiyin. */
  vatAmountMinor: bigint;
  /** Pre-VAT amount (after discount), in tiyin. */
  baseMinor: bigint;
}

const SCALE = 1_000_000n;
const ONE_HUNDRED_SCALED = 100n * 10000n;

export function computePositionTotal(
  p: PositionInput,
  vatEnabled: boolean,
  vatIncluded: boolean,
): PositionTotals {
  const qtyScaled = parseDecimalToScaled(p.quantity, 6);
  const priceMinor = BigInt(p.priceMinor);
  const grossScaled = qtyScaled * priceMinor;
  const discountScaled = parseDecimalToScaled(p.discount, 4);
  const afterDiscountScaled = grossScaled - (grossScaled * discountScaled) / ONE_HUNDRED_SCALED;
  const afterDiscountMinor = roundHalfUp(afterDiscountScaled, SCALE);

  if (!vatEnabled || p.vat == null) {
    return {
      totalMinor: afterDiscountMinor,
      vatAmountMinor: 0n,
      baseMinor: afterDiscountMinor,
    };
  }

  const vatPercentScaled = BigInt(Math.round(p.vat * 10000));
  if (vatIncluded) {
    const totalMinor = afterDiscountMinor;
    const baseExclScaled =
      (afterDiscountScaled * ONE_HUNDRED_SCALED) / (ONE_HUNDRED_SCALED + vatPercentScaled);
    const baseMinor = roundHalfUp(baseExclScaled, SCALE);
    return {
      totalMinor,
      vatAmountMinor: totalMinor - baseMinor,
      baseMinor,
    };
  }
  const vatAmountScaled = (afterDiscountScaled * vatPercentScaled) / ONE_HUNDRED_SCALED;
  const vatAmountMinor = roundHalfUp(vatAmountScaled, SCALE);
  return {
    totalMinor: afterDiscountMinor + vatAmountMinor,
    vatAmountMinor,
    baseMinor: afterDiscountMinor,
  };
}

/**
 * Multiply a per-unit minor-currency amount (tiyin) by a Decimal(20,6)
 * quantity string, returning tiyin rounded half-up to the nearest tiyin.
 *
 * This is the single source of truth for `price × qty` and `cost × qty`
 * line math across the whole app (billing line gross AND cost-of-goods
 * lines). It replaces the legacy pattern
 *
 *   (minorPerUnit * BigInt(Math.round(qty * 1000))) / 1000n
 *
 * which had two money-integrity defects:
 *   1. It rounded the quantity to **3** decimals before multiplying, while
 *      the schema, the stock ledger (`toMicro`) and FIFO (`parseDecimalScaled`)
 *      all keep **6** decimals — so the billed line total silently diverged
 *      from the physically shipped/costed quantity (e.g. qty `0.0004` billed
 *      0 but shipped & cost 0.0004 units).
 *   2. It coerced qty through a JS float (`Number(qty)`), drifting on
 *      fractions and losing precision near the Decimal(20,6) ceiling.
 *
 * Pass the original decimal STRING (never `String(Number(qty))`, which would
 * re-introduce the float drift).
 *
 *   scaleMinorByQty(100000n, '2')        === 200000n
 *   scaleMinorByQty(250000n, '0.0004')   === 100n    // legacy billed 0n
 *   scaleMinorByQty(100n,    '0.335')    === 34n     // legacy truncated to 33n
 */
export function scaleMinorByQty(minorPerUnit: bigint, qty: string): bigint {
  const qtyScaled = parseDecimalToScaled(qty, 6);
  return roundHalfUp(minorPerUnit * qtyScaled, SCALE);
}

function parseDecimalToScaled(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed;
  const [intPart = '0', fracPart = ''] = body.split('.');
  const fracPadded = (fracPart + '0'.repeat(decimals)).slice(0, decimals);
  const scaled = BigInt(intPart) * BigInt(10 ** decimals) + BigInt(fracPadded || '0');
  return negative ? -scaled : scaled;
}

function roundHalfUp(scaled: bigint, divisor: bigint): bigint {
  if (divisor === 0n) return scaled;
  const half = divisor / 2n;
  if (scaled >= 0n) return (scaled + half) / divisor;
  return -((-scaled + half) / divisor);
}
