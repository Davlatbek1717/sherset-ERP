/**
 * Profit / discount figures derived from a sold line — kassa TZ §5.3.
 *
 * Lives in the shared money package because BOTH ends need the exact same
 * arithmetic: the POS cart shows the cashier a live profit while they edit the
 * price, and the reports later recompute it from the frozen snapshot. Two
 * copies of this formula would eventually answer the same question two ways —
 * the failure mode the unified metrics layer exists to prevent.
 *
 * The NULL contract runs through everything here: a missing cost is `null`, not
 * `0`. A zero cost claims "this item was free to us" and yields 100% margin —
 * which is exactly the false number the POS profitability report has been
 * printing. `null` propagates instead, so callers are forced to render «—».
 */

export interface LineProfitInput {
  /** Sold price per unit, minor units. */
  priceMinor: bigint;
  /** Cost per unit — frozen at post, or live from the product card in the cart. NULL = unknown. */
  costMinor: bigint | null;
  /** Units sold. POS sells whole units, so this is an integer count. */
  quantity: bigint;
}

/**
 * Line profit = (price − cost) × qty, in minor units.
 * NULL when the cost is unknown. Negative is a real, allowed outcome — selling
 * below cost is permitted (kassa TZ Q16), it just has to be visible.
 */
export function lineProfitMinor({
  priceMinor,
  costMinor,
  quantity,
}: LineProfitInput): bigint | null {
  if (costMinor == null) return null;
  return (priceMinor - costMinor) * quantity;
}

/**
 * Total cost of goods across lines: `Σ cost × qty`.
 *
 * Returns `{ costMinor, complete }`. `complete` is false when ANY line had an
 * unknown cost, and those lines contribute nothing to the sum. Callers must not
 * present an incomplete total as the profit — an under-counted cost inflates
 * profit, which is the same lie as a zero cost, just quieter.
 *
 * Document-level profit is deliberately computed as `revenue − cost` at the
 * call site rather than by summing per-line profits: the revenue a receipt
 * actually charges already carries its discounts and its own rounding, so
 * subtracting cost from it is exact, while re-deriving revenue from unit prices
 * would drift by a tiyin per discounted line.
 */
export function sumCostMinor(
  lines: ReadonlyArray<Pick<LineProfitInput, 'costMinor' | 'quantity'>>,
): { costMinor: bigint; complete: boolean } {
  let costMinor = 0n;
  let complete = true;
  for (const line of lines) {
    if (line.costMinor == null) {
      complete = false;
      continue;
    }
    costMinor += line.costMinor * line.quantity;
  }
  return { costMinor, complete };
}

/**
 * Margin as a percent of revenue, to one decimal place. Display-only — never
 * feed the result back into money math. NULL when profit is unknown or revenue
 * is zero (no denominator).
 */
export function marginPercent(profitMinor: bigint | null, revenueMinor: bigint): number | null {
  if (profitMinor == null || revenueMinor === 0n) return null;
  // Scale by 1000 in BigInt first, so the division keeps one decimal place and
  // nothing passes through Float until the final, already-small quotient.
  return Number((profitMinor * 1000n) / revenueMinor) / 10;
}

/**
 * «Kassir qancha tushirib berdi» — how far below the card's base (retail) price
 * the line was actually sold, in minor units. NULL when the base price is
 * unknown. Negative means the cashier sold ABOVE the base price.
 */
export function markdownMinor(args: {
  basePriceMinor: bigint | null;
  priceMinor: bigint;
  quantity: bigint;
}): bigint | null {
  if (args.basePriceMinor == null) return null;
  return (args.basePriceMinor - args.priceMinor) * args.quantity;
}

/** Price bands the cart colours a line by — kassa TZ §5.2. */
export type PriceBand = 'loss' | 'below-wholesale' | 'ok';

/**
 * Classify a sold price against the two floors.
 *   price < cost      → 'loss'             (red, «ZARAR») — allowed, audited
 *   price < wholesale → 'below-wholesale'  (yellow) — the negotiated floor
 *   otherwise         → 'ok'
 * Cost is checked FIRST: when a price is under both floors, the loss is the
 * fact the cashier needs to see. Unknown floors never raise a warning — an
 * absent number is not evidence of a problem.
 */
export function classifyPrice(args: {
  priceMinor: bigint;
  costMinor: bigint | null;
  wholesaleMinor: bigint | null;
}): PriceBand {
  if (args.costMinor != null && args.priceMinor < args.costMinor) return 'loss';
  if (args.wholesaleMinor != null && args.priceMinor < args.wholesaleMinor)
    return 'below-wholesale';
  return 'ok';
}
