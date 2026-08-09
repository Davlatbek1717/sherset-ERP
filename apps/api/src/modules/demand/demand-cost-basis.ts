/**
 * Demand outflow cost basis — pure, Nest-free (Faza Q4 / `STK-08`).
 *
 * Faza 18a moved Demand COGS onto the per-store weighted average, but priced
 * every line as `round(costBalanceMinor ÷ onHand) × qty`. That product is not
 * the whole balance when the shipment EMPTIES the store, so each full shipment
 * left the rounding residue as value on a qty = 0 Stock row — which then
 * poisons the next inbound average (cost ÷ qty) and drifts the stock-value
 * report. Faza 34 already solved the identical problem for Move; this module
 * reuses that arithmetic (`computeTransferCost`) rather than re-deriving it,
 * and adds Demand's own buyPrice fallback on top.
 */
import { scaleMinorByQty } from '@moysklad/money';
import { computeTransferCost } from '../move/move-cost-basis.js';
import { compareDecimals } from './fifo-consumer.js';

/**
 * Price one shipped line against the LOCKED per-store balance.
 *
 *   perUnitMinor  — the weighted average, frozen on DemandPosition.costMinor
 *                   for display and for reversing pre-Q4 documents.
 *   lineCostMinor — what the store ACTUALLY loses; the whole
 *                   `costBalanceMinor` when the shipment empties it.
 *
 * `fallbackPerUnitMinor` is the product's buyPrice (the Loss precedent): a
 * valueless, empty or negative-balance store still ships value out, never 0.
 * A negative balance is deliberately NOT a basis — dividing it would hand the
 * line an invented negative cost.
 */
export function computeOutflowCost(input: {
  costBalanceMinor: bigint;
  onHandQty: string;
  shipQty: string;
  fallbackPerUnitMinor: bigint;
}): { perUnitMinor: bigint; lineCostMinor: bigint } {
  const hasBasis = input.costBalanceMinor > 0n && compareDecimals(input.onHandQty, '0') > 0;
  if (!hasBasis) {
    return {
      perUnitMinor: input.fallbackPerUnitMinor,
      lineCostMinor: scaleMinorByQty(input.fallbackPerUnitMinor, input.shipQty),
    };
  }
  const { perUnitMinor, baseLineMinor } = computeTransferCost({
    sourceCostBalanceMinor: input.costBalanceMinor,
    sourceQty: input.onHandQty,
    moveQty: input.shipQty,
  });
  return { perUnitMinor, lineCostMinor: baseLineMinor };
}

/**
 * The value unpost/cancel must hand back — EXACTLY what post took.
 *
 * `baseCostMinor` is the stored post-time line. Rows posted before Faza Q4 have
 * none and fall back to the old `per-unit × qty`, i.e. the arithmetic those
 * documents were posted with ⇒ historical reversals stay bit-for-bit.
 * `?? ` (not `||`) so a genuinely 0n line is honoured, not treated as missing.
 */
export function reversalLineCost(position: {
  baseCostMinor: bigint | null;
  costMinor: bigint | null;
  quantity: string;
}): bigint {
  return position.baseCostMinor ?? scaleMinorByQty(position.costMinor ?? 0n, position.quantity);
}
