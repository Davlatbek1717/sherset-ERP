/**
 * FIFO cost consumer — pure decimal/bigint helpers for FIFO walk and cost
 * computation.
 *
 * Background: SupplyPosition tracks `remainingQty` (Decimal 20,6) and
 * per-unit `costMinor` (BigInt tiyin). When a Demand is posted, we walk the
 * matching supply lots in FIFO order (oldest supply first), decrement each
 * `remainingQty`, and accumulate the consumed cost into the demand position.
 *
 * All math here is exact (BigInt) — no floating point. Quantities are
 * parsed from Decimal strings into a 1e6-scaled bigint so that
 *   line_cost = round(qtyScaled × unitCostMinor / 1e6)
 * gives a tiyin-exact result.
 */

const SCALE = 1_000_000n;

/**
 * Parse a Decimal(20,6) string (e.g. "3.500000") into a scaled bigint.
 *   "3.5"        →  3_500_000n
 *   "0.123456"   →    123_456n
 *   "-1.25"      → -1_250_000n
 */
export function parseDecimalScaled(value: string): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed;
  const [intPart = '0', fracPart = ''] = body.split('.');
  const fracPadded = (fracPart + '000000').slice(0, 6);
  const scaled = BigInt(intPart) * SCALE + BigInt(fracPadded || '0');
  return negative ? -scaled : scaled;
}

/** Format a 1e6-scaled bigint back into a Decimal(20,6) string. */
export function formatDecimalScaled(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const intPart = abs / SCALE;
  const fracPart = abs % SCALE;
  const fracStr = fracPart.toString().padStart(6, '0').replace(/0+$/, '');
  return (negative ? '-' : '') + intPart.toString() + (fracStr ? `.${fracStr}` : '');
}

/** Banker-style round-half-up. Works for negative values too. */
export function roundHalfUp(scaled: bigint, divisor: bigint): bigint {
  if (divisor === 0n) return scaled;
  const half = divisor / 2n;
  if (scaled >= 0n) return (scaled + half) / divisor;
  return -((-scaled + half) / divisor);
}

/**
 * Compute line cost = qty × unitCostMinor, rounded half-up to nearest tiyin.
 *
 *   computeLineCost("3.5", 12000n) === 42000n   (3.5 units × 120 sum/unit = 420 sum)
 */
export function computeLineCost(qty: string, unitCostMinor: bigint): bigint {
  const qtyScaled = parseDecimalScaled(qty);
  return roundHalfUp(qtyScaled * unitCostMinor, SCALE);
}

/**
 * Subtract two Decimal(20,6) strings, returning a string. Exact.
 *   subtractDecimals("5", "1.5") === "3.5"
 */
export function subtractDecimals(a: string, b: string): string {
  return formatDecimalScaled(parseDecimalScaled(a) - parseDecimalScaled(b));
}

/** Add two Decimal(20,6) strings, returning a string. Exact. */
export function addDecimals(a: string, b: string): string {
  return formatDecimalScaled(parseDecimalScaled(a) + parseDecimalScaled(b));
}

/** Compare Decimals: returns -1 if a<b, 0 if =, 1 if a>b. */
export function compareDecimals(a: string, b: string): number {
  const aScaled = parseDecimalScaled(a);
  const bScaled = parseDecimalScaled(b);
  if (aScaled < bScaled) return -1;
  if (aScaled > bScaled) return 1;
  return 0;
}

/** Min of two Decimal(20,6) strings. */
export function minDecimal(a: string, b: string): string {
  return compareDecimals(a, b) <= 0 ? a : b;
}

/**
 * Compute per-unit cost from total cost + qty.
 *   perUnit = round(totalCostMinor × 1e6 / qtyScaled) (tiyin)
 *
 * Used to populate DemandPosition.costMinor (per-unit average) for display
 * and downstream return cost calculations.
 */
export function computePerUnitCost(totalCostMinor: bigint, qty: string): bigint {
  const qtyScaled = parseDecimalScaled(qty);
  if (qtyScaled <= 0n) return 0n;
  return roundHalfUp(totalCostMinor * SCALE, qtyScaled);
}
