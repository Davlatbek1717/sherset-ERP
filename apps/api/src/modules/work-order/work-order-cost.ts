/**
 * WorkOrder (ТЗ) stock-VALUE arithmetic — Faza Q2 / `PP-05`.
 *
 * Before this, all four WorkOrder delta points passed `costDeltaMinor: null`:
 * completion pulled component QUANTITY out of stock but left the component
 * VALUE sitting there, and emitted the produced good at no basis at all. Every
 * downstream consumer of the per-store weighted average (Demand, POS, Loss,
 * reports) was therefore reading an inflated component average and a zero-cost
 * finished good — the same `STK-02` bug-class Faza 18a closed for POS/Demand.
 *
 * Two rules, mirroring the 18a pattern:
 *
 *   1. CONSUME at the per-store weighted average — `Stock.costBalanceMinor ÷
 *      qty` on the very balances the sufficiency check locked. Valueless or
 *      negative stock falls back to the product's own cost (`buyPrice`) — the
 *      Loss precedent: a write-off/consumption still removes value, never 0.
 *      When neither basis exists the cost is UNKNOWN — `null`, never a
 *      fabricated `0n` (`retail-cost-freeze-null-contract`): `0` would claim
 *      the material was free, which is a 100%-margin lie downstream.
 *
 *   2. REVERSE from the FROZEN ledger, never from a recomputation. The cancel
 *      cascade used to rebuild quantities from the CURRENT BOM at the CURRENT
 *      average, so any BOM edit (or any restock at a different price) between
 *      completion and cancellation broke the zero-sum on both axes. The only
 *      durable record of what completion actually booked is the WorkOrder's own
 *      `StockOperation` rows, so the reversal is their exact negation — the
 *      `buildRefundCostBasis` precedent from POS refunds (Faza 18a). A legacy
 *      completion whose rows carry `costDeltaMinor = NULL` reverses as NULL:
 *      nothing was removed, so nothing is returned.
 */

import { scaleMinorByQty } from '@moysklad/money';
import {
  compareDecimals,
  computePerUnitCost,
  formatDecimalScaled,
  parseDecimalScaled,
} from '../demand/fifo-consumer.js';

/** One BOM component scaled to its TOTAL consumption (componentQty × runs). */
export interface WoComponentInput {
  /** BomComponent id — becomes the ledger row's docPositionId. */
  componentId: string;
  productId: string;
  /** Total consumed quantity, Decimal(20,6) string, positive. */
  quantity: string;
}

/** The subset of StockBalance the cost basis needs. */
export interface WoBalanceBasis {
  qty: string;
  costBalanceMinor?: string;
}

export interface WoComponentCost extends WoComponentInput {
  /** Per-unit basis in tiyin; `null` = UNKNOWN (never collapse to 0n). */
  perUnitMinor: bigint | null;
  /** perUnit × quantity, tiyin-exact; `null` when perUnit is unknown. */
  lineCostMinor: bigint | null;
}

export interface WoConsumptionCost {
  lines: WoComponentCost[];
  /** Σ of the KNOWN lines. Meaningless unless `hasCost`. */
  totalCostMinor: bigint;
  /** false ⇒ not one component had a cost basis; the output must book NULL. */
  hasCost: boolean;
}

/**
 * Per-store weighted-average cost of a completion's component consumption.
 *
 * `balances` is the map `StockService.lockBalances` returned for the WO's store
 * (keyed by assortmentId) — the SAME rows `assertAvailable` just checked, so
 * the value booked and the quantity checked can never disagree.
 * `buyPriceByProduct` holds only products whose `buyPrice` is non-NULL; an
 * absent key means the fallback is unknown, not zero.
 */
export function computeConsumptionCost(
  components: ReadonlyArray<WoComponentInput>,
  balances: ReadonlyMap<string, WoBalanceBasis>,
  buyPriceByProduct: ReadonlyMap<string, bigint>,
): WoConsumptionCost {
  let totalCostMinor = 0n;
  let hasCost = false;

  const lines = components.map((c) => {
    const bal = balances.get(c.productId);
    const onHand = bal?.qty ?? '0';
    const costBal = bal?.costBalanceMinor ? BigInt(bal.costBalanceMinor) : 0n;
    // Weighted average only when the store actually carries value AND units;
    // otherwise the product's own cost, and only then "unknown".
    const perUnitMinor =
      costBal > 0n && compareDecimals(onHand, '0') > 0
        ? computePerUnitCost(costBal, onHand)
        : (buyPriceByProduct.get(c.productId) ?? null);

    const lineCostMinor = perUnitMinor === null ? null : scaleMinorByQty(perUnitMinor, c.quantity);
    if (lineCostMinor !== null) {
      totalCostMinor += lineCostMinor;
      hasCost = true;
    }
    return { ...c, perUnitMinor, lineCostMinor };
  });

  return { lines, totalCostMinor, hasCost };
}

/** Exact sign flip of a Decimal(20,6) string — no float, no `-0`. */
export function negateDecimalString(value: string): string {
  return formatDecimalScaled(-parseDecimalScaled(value));
}

/** A completion `StockOperation` row, as read back for the reversal. */
export interface WoPostedOp {
  storeId: string;
  assortmentKind: string;
  assortmentId: string;
  /** Signed Decimal(20,6) string as recorded. */
  qtyDelta: string;
  costDeltaMinor: bigint | null;
  docPositionId: string | null;
  cellId: string | null;
}

export type WoReversalDelta = WoPostedOp;

/**
 * Exact negation of a completion's ledger rows — the cancel cascade's only
 * source of truth. Rows are reversed INDIVIDUALLY (never aggregated), so a BOM
 * that listed the same product on two lines still returns two matching rows and
 * a BOM edited after completion cannot leak into the result.
 */
export function buildReversalDeltas(postOps: ReadonlyArray<WoPostedOp>): WoReversalDelta[] {
  return postOps.map((op) => ({
    storeId: op.storeId,
    assortmentKind: op.assortmentKind,
    assortmentId: op.assortmentId,
    qtyDelta: negateDecimalString(op.qtyDelta),
    costDeltaMinor: op.costDeltaMinor === null ? null : -op.costDeltaMinor,
    docPositionId: op.docPositionId,
    cellId: op.cellId,
  }));
}
