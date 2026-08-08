/**
 * POS refund stock-VALUE reversal (Faza 18a, QAROR-A weighted-average).
 *
 * post() books the outflow at the store weighted-average of the moment of the
 * sale. The refund inflow must return EXACTLY that booked value — reading the
 * CURRENT average instead would leak value whenever the store was restocked at
 * a different price between sale and refund. The only durable record of what
 * was booked is the original sale's own StockOperation rows, so the basis is
 * aggregated from them, minus what earlier partial refunds already returned
 * (their own inflow rows) — a cumulative remainder that makes the refund
 * series exactly zero-sum against the original outflow.
 *
 * Legacy contract: sales posted before this fix carry costDeltaMinor NULL on
 * their outflow rows (no value was removed) — their refunds must book NULL
 * too, mirroring what actually happened, never a fabricated cost.
 */

import { formatDecimalScaled, parseDecimalScaled, roundHalfUp } from '../demand/fifo-consumer.js';

interface StockOpRow {
  assortmentId: string;
  qtyDelta: string;
  costDeltaMinor: bigint | null;
}

export interface RefundCostBasis {
  /** false ⇒ the original outflow was booked without value (legacy NULL). */
  hasCost: boolean;
  /** Booked outflow value not yet returned by earlier refunds (≥ 0). */
  remainingCostMinor: bigint;
  /** Sold qty not yet returned by earlier refunds (Decimal string). */
  remainingQty: string;
}

/**
 * Aggregate the original sale's outflow rows (reason 'post', negative qty /
 * negative cost) net of earlier refunds' inflow rows (positive qty / positive
 * cost) into a per-product remainder.
 */
export function buildRefundCostBasis(
  originalPostOps: ReadonlyArray<StockOpRow>,
  priorRefundOps: ReadonlyArray<StockOpRow>,
): Map<string, RefundCostBasis> {
  const acc = new Map<string, { hasCost: boolean; cost: bigint; qtyScaled: bigint }>();
  const add = (row: StockOpRow) => {
    const entry = acc.get(row.assortmentId) ?? { hasCost: false, cost: 0n, qtyScaled: 0n };
    // remaining = consumed − returned = −Σ qtyDelta: the outflow rows are
    // negative and the refund inflow rows positive, so one negated sum nets
    // both sides. Same algebra for the value.
    entry.qtyScaled -= parseDecimalScaled(row.qtyDelta);
    if (row.costDeltaMinor !== null) {
      entry.hasCost = true;
      entry.cost -= row.costDeltaMinor;
    }
    acc.set(row.assortmentId, entry);
  };
  for (const row of originalPostOps) add(row);
  for (const row of priorRefundOps) add(row);

  const basis = new Map<string, RefundCostBasis>();
  for (const [assortmentId, entry] of acc) {
    basis.set(assortmentId, {
      hasCost: entry.hasCost,
      remainingCostMinor: entry.cost > 0n ? entry.cost : 0n,
      remainingQty: formatDecimalScaled(entry.qtyScaled > 0n ? entry.qtyScaled : 0n),
    });
  }
  return basis;
}

/**
 * Value to book on a refund inflow of `refundQty` units.
 *
 *   - no basis / legacy NULL original → null (mirror);
 *   - refund of the whole remainder → exactly the remaining value (no residue);
 *   - partial → proportional share, rounded half-up. Because every later
 *     refund recomputes against the updated remainder, the series drains to
 *     exactly zero.
 */
export function allocateRefundCost(
  basis: RefundCostBasis | undefined,
  refundQty: string,
): bigint | null {
  if (!basis || !basis.hasCost) return null;
  const takeScaled = parseDecimalScaled(refundQty);
  const remainingScaled = parseDecimalScaled(basis.remainingQty);
  if (takeScaled <= 0n || remainingScaled <= 0n) return 0n;
  if (takeScaled >= remainingScaled) return basis.remainingCostMinor;
  return roundHalfUp(basis.remainingCostMinor * takeScaled, remainingScaled);
}

/**
 * Allocate AND consume: like allocateRefundCost, but also decrements the
 * basis remainder in the map — so a refund that lists the SAME product on
 * several lines allocates each line from what the previous lines left,
 * instead of each taking a full proportional share of the original remainder.
 */
export function consumeRefundCost(
  basisMap: Map<string, RefundCostBasis>,
  assortmentId: string,
  refundQty: string,
): bigint | null {
  const basis = basisMap.get(assortmentId);
  const cost = allocateRefundCost(basis, refundQty);
  if (basis && cost !== null) {
    basis.remainingCostMinor =
      basis.remainingCostMinor > cost ? basis.remainingCostMinor - cost : 0n;
    const left = parseDecimalScaled(basis.remainingQty) - parseDecimalScaled(refundQty);
    basis.remainingQty = formatDecimalScaled(left > 0n ? left : 0n);
  }
  return cost;
}
