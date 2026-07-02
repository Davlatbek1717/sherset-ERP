/**
 * Demand «Накладные расходы» — OUTBOUND profit/cost math (pure, exact).
 *
 * Live-confirmed (PARITY-AUDIT §42 [STREAM A]): the Отгрузка form has
 * «Накладные расходы … Распределить по цене» + «Прибыль». OUTBOUND
 * semantics — UNLIKE Приёмка/Оприходование (§12/§34):
 *
 *   - overhead is a SALE-SIDE expense, not inventory landed cost;
 *   - it lowers the shipment «Прибыль»;
 *   - it is folded ONLY into the document себестоимость aggregate
 *     (Demand.costSumMinor) — the FIFO basis, SupplyPosition lots and
 *     Stock.costBalanceMinor are deliberately UNTOUCHED ("FIFO-basis
 *     EMAS"), so the post/unpost stock zero-sum is preserved.
 *
 * There is no per-position apportionment here (DemandPosition has no
 * overhead column; schema.prisma is frozen) — so, unlike §12's
 * largest-remainder helper, this is an EXACT single BigInt fold with no
 * rounding to conserve. All values are tiyin (BigInt); no floating point.
 *
 * Invariants (proven in demand-overhead.test.ts):
 *  1. Conservation: costSumMinor(fifo, ovh) − fifo === ovh, exactly.
 *  2. overhead = 0n ⇒ costSumMinor === fifo (byte-identical no-op).
 *  3. Idempotent: post computes costSumMinor(freshFifo, ovh); unpost
 *     resets it to 0n; re-post recomputes the same — a pure function of
 *     (fifo, ovh), so post→unpost→post is stable.
 *  4. profit === sumMinor − fifo − ovh; overhead lowers profit by
 *     exactly `ovh` (may go negative — a loss-making shipment).
 */

/**
 * Document себестоимость aggregate for «Прибыль» = FIFO COGS + the
 * sale-side overhead. This is exactly what Demand.post() persists into
 * Demand.costSumMinor.
 */
export function demandOverheadCostSumMinor(
  fifoCostMinor: bigint,
  overheadSumMinor: bigint,
): bigint {
  return fifoCostMinor + overheadSumMinor;
}

/**
 * Shipment «Прибыль» = revenue − (FIFO COGS + overhead). May be
 * negative when overhead/COGS exceed revenue (a loss-making shipment),
 * which is legitimate and must NOT be clamped.
 */
export function demandProfitMinor(
  sumMinor: bigint,
  fifoCostMinor: bigint,
  overheadSumMinor: bigint,
): bigint {
  return sumMinor - demandOverheadCostSumMinor(fifoCostMinor, overheadSumMinor);
}
