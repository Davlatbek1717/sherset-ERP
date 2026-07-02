import { scaleMinorByQty } from '@moysklad/money';
import type { SupplyOverheadDistribution } from './supply.schema.js';

/**
 * «Накладные расходы» distribution — pure, integer-exact money math.
 *
 * moysklad «Приёмка» lets you attach extra delivery/customs cost and
 * distribute it across the received positions, raising each position's
 * cost price (себестоимость) which becomes the FIFO cost basis consumed
 * by outbound Demands.
 *
 * Hard invariants (money correctness — CLAUDE.md rule #2):
 *   1. Σ overheadMinor === totalOverheadMinor EXACTLY (no tiyin lost or
 *      conjured), via the largest-remainder method.
 *   2. Deterministic: same input → same output (tie-break by line index).
 *   3. Never divides by zero — a defined fallback chain handles a zero
 *      basis (e.g. WEIGHT chosen but no product carries a weight).
 *   4. lineCostMinor uses the SAME `× round(qty×1000) / 1000n` formula the
 *      post/unpost stock writers use, so a post→unpost cycle is exactly
 *      zero-sum (the per-unit cost is the single persisted source of truth).
 *
 * All arithmetic is BigInt over tiyin / micro-units; no floating point
 * touches a monetary value (Number() is only ever used to parse the
 * decimal quantity string into integer micro-units).
 */

export interface OverheadLineInput {
  /** Stable position index — deterministic tie-break for remainder rounding. */
  index: number;
  /** Quantity as a decimal string ("5", "1.5", "0.250000"). */
  quantity: string;
  /** Base line cost in tiyin (priceAfterDiscount × qty) — exact integer. */
  baseLineMinor: bigint;
  /** Product weight in grams (null/0 when unknown). */
  weightG: number | null;
  /** Product volume in millilitres (null/0 when unknown). */
  volumeML: number | null;
}

export interface OverheadLineResult {
  index: number;
  /** Overhead tiyin allocated to this line. Σ === totalOverheadMinor. */
  overheadMinor: bigint;
  /** Overhead-inclusive per-unit cost in tiyin (round-half-up). */
  costPerUnitMinor: bigint;
  /**
   * Overhead-inclusive line cost = costPerUnitMinor × qty via the shared
   * `× round(qty×1000) / 1000n` formula (post/unpost symmetry).
   */
  lineCostMinor: bigint;
}

const MICRO = 1_000_000;

/** Decimal quantity string → integer micro-units (6dp, matches Decimal(20,6)). */
function qtyMicro(quantity: string): bigint {
  const n = Number(quantity);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  return BigInt(Math.round(n * MICRO));
}

/** Shared with the stock writers: per-unit cost × qty, rounded half-up at 6-dp. */
function lineCostFromPerUnit(costPerUnitMinor: bigint, quantity: string): bigint {
  const n = Number(quantity);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  return scaleMinorByQty(costPerUnitMinor, quantity);
}

/**
 * Per-line non-negative integer weight for a given method. Magnitude is
 * irrelevant (only the ratio matters), so we keep everything in BigInt.
 */
function basisWeight(line: OverheadLineInput, method: SupplyOverheadDistribution): bigint {
  const qm = qtyMicro(line.quantity);
  switch (method) {
    case 'QUANTITY':
      return qm;
    case 'PRICE':
      return line.baseLineMinor >= 0n ? line.baseLineMinor : 0n;
    case 'WEIGHT':
      return BigInt(Math.max(0, Math.trunc(line.weightG ?? 0))) * qm;
    case 'VOLUME':
      return BigInt(Math.max(0, Math.trunc(line.volumeML ?? 0))) * qm;
  }
}

/**
 * Resolve the effective weights: try the requested method, then fall back
 * deterministically so overhead is never dropped on the floor:
 *   WEIGHT/VOLUME → PRICE → QUANTITY → equal split.
 * QUANTITY/PRICE that come up all-zero (degenerate: every line free, or
 * every qty zero) fall straight through to the equal split.
 */
function resolveWeights(lines: OverheadLineInput[], method: SupplyOverheadDistribution): bigint[] {
  const chain: SupplyOverheadDistribution[] =
    method === 'WEIGHT' || method === 'VOLUME'
      ? [method, 'PRICE', 'QUANTITY']
      : method === 'PRICE'
        ? ['PRICE', 'QUANTITY']
        : ['QUANTITY', 'PRICE'];

  for (const m of chain) {
    const w = lines.map((l) => basisWeight(l, m));
    if (w.reduce((a, b) => a + b, 0n) > 0n) return w;
  }
  // Last resort — equal weights (still exact via largest-remainder).
  return lines.map(() => 1n);
}

/**
 * Distribute `totalOverheadMinor` across `lines`. Returns one result per
 * input line (same order). When totalOverheadMinor is 0n the caller is
 * expected to skip this entirely (the post path keeps its original
 * zero-overhead branch); calling it with 0n is still safe and yields all
 * zero overhead with base-only per-unit costs.
 */
export function distributeOverhead(
  lines: OverheadLineInput[],
  totalOverheadMinor: bigint,
  method: SupplyOverheadDistribution,
): OverheadLineResult[] {
  if (lines.length === 0) return [];

  const weights = resolveWeights(lines, method);
  const totalW = weights.reduce((a, b) => a + b, 0n);

  // Largest-remainder apportionment over BigInt — exact conservation.
  // Single pass into per-line records (no parallel-array indexing).
  let assigned = 0n;
  const parts = lines.map((l, i) => {
    const prod = totalOverheadMinor * (weights[i] ?? 0n);
    const floor = totalW > 0n ? prod / totalW : 0n;
    const remainder = totalW > 0n ? prod % totalW : 0n;
    assigned += floor;
    return { line: l, idx: i, floor, remainder };
  });
  let leftover = totalOverheadMinor - assigned; // 0 ≤ leftover < lines.length

  // Hand the leftover tiyin to the largest fractional remainders first;
  // ties broken by ascending line index for determinism.
  const bump = new Set<number>();
  for (const p of [...parts].sort((a, b) =>
    a.remainder !== b.remainder ? (a.remainder > b.remainder ? -1 : 1) : a.idx - b.idx,
  )) {
    if (leftover <= 0n) break;
    bump.add(p.idx);
    leftover -= 1n;
  }

  return parts.map(({ line: l, idx, floor }) => {
    const overheadMinor = floor + (bump.has(idx) ? 1n : 0n);
    const targetLine = l.baseLineMinor + overheadMinor;
    const qm = qtyMicro(l.quantity);
    // Round-half-up: (targetLine·MICRO + qm/2) / qm.
    const costPerUnitMinor = qm > 0n ? (targetLine * BigInt(MICRO) + qm / 2n) / qm : 0n;
    const lineCostMinor = lineCostFromPerUnit(costPerUnitMinor, l.quantity);
    return { index: l.index, overheadMinor, costPerUnitMinor, lineCostMinor };
  });
}
