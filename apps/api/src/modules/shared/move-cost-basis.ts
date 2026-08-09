/**
 * Move cost basis — pure, dependency-free (Faza 34 / STK-08).
 *
 * Lives outside move.service.ts so the per-cell mover (`product-cell-move`)
 * can share the SAME arithmetic without importing a Nest service module.
 * Faza Q17 moved it from `move/` into `shared/`: three modules across two
 * domains (move, product, demand) already depended on it, so keeping it under
 * one document's folder made a leaf look like a cross-module reach-in.
 */
import {
  compareDecimals,
  computeLineCost,
  computePerUnitCost,
  parseDecimalScaled,
} from './decimal.js';

/**
 * The value that physically travels with `moveQty` units out of the source
 * store — exact, no float, no rounding residue.
 *
 *   perUnitMinor  — the source's weighted average (costBalanceMinor ÷ qty),
 *                   snapshotted on MovePosition.costMinor for display and for
 *                   reversing documents posted before Faza 34.
 *   baseLineMinor — what the source ACTUALLY loses. When the transfer empties
 *                   the source (moveQty === on-hand) this is the whole
 *                   costBalanceMinor: round(perUnit) × qty would leave a few
 *                   stray tiyin on a qty = 0 row, which then corrupt the next
 *                   inbound weighted average (cost ÷ qty) and drift the
 *                   stock-value report a little on every full transfer.
 *
 * The old code also scaled the source qty through float
 * (`BigInt(Math.round(Number(bal.qty) × 1_000_000))`), losing exactness past
 * ~9e9 micro-units, and truncated (rather than rounded) the per-unit in the
 * per-cell mover.
 */
export function computeTransferCost(input: {
  sourceCostBalanceMinor: bigint;
  sourceQty: string;
  moveQty: string;
}): { perUnitMinor: bigint; baseLineMinor: bigint } {
  const sourceQtyMicro = parseDecimalScaled(input.sourceQty);
  if (sourceQtyMicro <= 0n || input.sourceCostBalanceMinor === 0n) {
    return { perUnitMinor: 0n, baseLineMinor: 0n };
  }
  const perUnitMinor = computePerUnitCost(input.sourceCostBalanceMinor, input.sourceQty);
  const emptiesSource = compareDecimals(input.moveQty, input.sourceQty) === 0;
  return {
    perUnitMinor,
    baseLineMinor: emptiesSource
      ? input.sourceCostBalanceMinor
      : computeLineCost(input.moveQty, perUnitMinor),
  };
}
