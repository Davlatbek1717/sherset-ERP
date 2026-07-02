import type { Prisma } from '@moysklad/db';

/**
 * Distribute a Техоперация's total consumed material cost across its
 * output products (§89 multi-output / by-products / co-products).
 *
 * Convention (documented principled choice — moysklad's exact basis is
 * NOT in the captured reference; qty-proportional by-product costing is
 * the standard accounting default; deterministic + correctable):
 *   each output's share ∝ its produced quantity.
 *
 * Hard invariants (money correctness — CLAUDE.md rule #2):
 *   1. Σ result === totalCostMinor EXACTLY (largest-remainder; no tiyin
 *      lost or conjured).
 *   2. N = 1 ⇒ [totalCostMinor] (byte-identical to the pre-§89 single
 *      BOM-output path — zero regression).
 *   3. Deterministic: equal remainders tie-break by ascending index.
 *   4. Degenerate all-zero quantities ⇒ equal split (never divide by
 *      zero; still exact via largest-remainder).
 *
 * All money arithmetic is BigInt over tiyin. Decimal is only used to
 * parse the human quantity into integer micro-units.
 */
export function distributeOutputCost(
  quantities: Prisma.Decimal[],
  totalCostMinor: bigint,
): bigint[] {
  const n = quantities.length;
  if (n === 0) return [];
  // Single output keeps the entire cost — exactly the pre-§89 behaviour.
  if (n === 1) return [totalCostMinor];

  // Weights = quantity in integer micro-units (6dp, matches Decimal(20,6)).
  let weights = quantities.map((q) => {
    const micro = BigInt(q.mul(1_000_000).round().toFixed(0));
    return micro > 0n ? micro : 0n;
  });
  let totalW = weights.reduce((a, b) => a + b, 0n);
  if (totalW <= 0n) {
    // All-zero quantities — fall back to an equal split.
    weights = weights.map(() => 1n);
    totalW = BigInt(n);
  }

  let assigned = 0n;
  const parts = weights.map((w, idx) => {
    const prod = totalCostMinor * w;
    const floor = prod / totalW;
    const remainder = prod % totalW;
    assigned += floor;
    return { idx, floor, remainder };
  });
  let leftover = totalCostMinor - assigned; // 0 ≤ leftover < n

  const bump = new Set<number>();
  for (const p of [...parts].sort((a, b) =>
    a.remainder !== b.remainder ? (a.remainder > b.remainder ? -1 : 1) : a.idx - b.idx,
  )) {
    if (leftover <= 0n) break;
    bump.add(p.idx);
    leftover -= 1n;
  }

  return parts.map((p) => p.floor + (bump.has(p.idx) ? 1n : 0n));
}
