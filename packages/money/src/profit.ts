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
 * `numer ÷ denom × 100`, to `decimals` places — the ONE division every percent
 * in this system goes through.
 *
 * Why it exists: the reports each grew their own version. SEVEN were in the
 * tree at once (profitability, pnl, unit-economics ×2, purchase-management,
 * abc-analysis ×2, returns-ratio ×2, dashboard) with three different
 * behaviours, so the same ratio could print as 30.65%, 30.6% or 31% depending
 * on which screen you opened — the exact «two reports, two answers» failure the
 * metrics layer is meant to end (analitika TZ §4, X4).
 *
 * Two properties the hand-rolled versions did not have:
 *  • **Exact.** `Number(a) / Number(b)` on BigInts silently loses precision once
 *    a sum passes 2^53 tiyin (~900 billion so'm). Yearly aggregates reach that.
 *  • **One rounding rule** — half away from zero, so −4.98 → −5.0 and not
 *    −4.9. Truncation is wrong in one direction every time: it flatters losses
 *    and shaves profits, and the owner sets prices off these numbers.
 *
 * Returns null when the denominator is zero — «no denominator» is not 0%.
 */
export function percentScaled(
  numerMinor: bigint,
  denomMinor: bigint,
  decimals: number,
): number | null {
  if (denomMinor === 0n) return null;
  const factor = 10n ** BigInt(decimals);
  // ×100 for the percent, ×factor for the decimals — all in BigInt, so nothing
  // reaches Float until the final, already-small quotient. `+ half` before
  // dividing turns BigInt truncation into proper rounding.
  const scaled = numerMinor * 100n * factor;
  const denom = denomMinor < 0n ? -denomMinor : denomMinor;
  const num = denomMinor < 0n ? -scaled : scaled;
  const half = denom / 2n;
  const rounded = num >= 0n ? (num + half) / denom : (num - half) / denom;
  return Number(rounded) / Number(factor);
}

/**
 * Margin as a percent of revenue, to one decimal place — the POS cart surface.
 * Display-only; never feed the result back into money math. NULL when profit is
 * unknown or revenue is zero (no denominator).
 */
export function marginPercent(profitMinor: bigint | null, revenueMinor: bigint): number | null {
  if (profitMinor == null) return null;
  return percentScaled(profitMinor, revenueMinor, 1);
}

/**
 * Format a percent for display next to money on the same line.
 *
 * `Number.toLocaleString` is deliberately NOT used: for uz-UZ it yields a DOT
 * decimal separator while the money formatter yields a COMMA, so a cart row read
 * «-800,00 сум (-3.3%)» — two separators in one sentence (browser QA 2026-08-02).
 * The money formatting is the one users read all day, so the percent follows it.
 */
export function formatPercent(value: number): string {
  return `${value.toFixed(1).replace(/\.0$/, '').replace('.', ',')}%`;
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
