import { describe, expect, it } from 'vitest';
import { demandOverheadCostSumMinor, demandProfitMinor } from './demand-overhead.js';

/**
 * Adversarial QA for the Demand OUTBOUND «Накладные расходы» fold
 * (§12/§34 rigor — exact BigInt, conservation, no-op, idempotency,
 * profit correctness, edge cases). FIFO basis is NEVER touched here,
 * so these are pure money invariants.
 */

describe('demandOverheadCostSumMinor — conservation (invariant #1)', () => {
  it('costSum − fifo === overhead, exactly, for any values', () => {
    const cases: Array<[bigint, bigint]> = [
      [0n, 0n],
      [1n, 1n],
      [100_00n, 7n],
      [12_345_67n, 99_999_99n],
      [999_999_999_999n, 1n],
      [1n, 999_999_999_999n],
      [73_501_22n, 2_640_00n],
    ];
    for (const [fifo, ovh] of cases) {
      expect(demandOverheadCostSumMinor(fifo, ovh) - fifo).toBe(ovh);
    }
  });

  it('is order-independent vs the equivalent add (no rounding/precision loss)', () => {
    const fifo = 8_675_309_00n;
    const ovh = 4_200_069n;
    expect(demandOverheadCostSumMinor(fifo, ovh)).toBe(fifo + ovh);
    // BigInt — exact even past Number.MAX_SAFE_INTEGER.
    const big = 9_007_199_254_740_993n; // 2^53 + 1
    expect(demandOverheadCostSumMinor(big, big)).toBe(big * 2n);
  });
});

describe('demandOverheadCostSumMinor — overhead=0 byte-identical no-op (invariant #2)', () => {
  it('returns the FIFO cost unchanged when overhead is 0n', () => {
    for (const fifo of [0n, 1n, 50_000_00n, 123_456_789_012n]) {
      expect(demandOverheadCostSumMinor(fifo, 0n)).toBe(fifo);
    }
  });
});

describe('demandOverheadCostSumMinor — idempotent post→unpost→post (invariant #3)', () => {
  it('pure function of (fifo, ovh): re-post after unpost(→0n) yields the same', () => {
    const fifo = 4_000_00n;
    const ovh = 333_33n;
    const post1 = demandOverheadCostSumMinor(fifo, ovh);
    const afterUnpost = 0n; // unpost resets Demand.costSumMinor to 0n
    expect(afterUnpost).toBe(0n);
    // Re-post recomputes from the SAME fresh FIFO + stable header overhead.
    const post2 = demandOverheadCostSumMinor(fifo, ovh);
    expect(post2).toBe(post1);
    // Stability across many cycles.
    for (let i = 0; i < 5; i++) {
      expect(demandOverheadCostSumMinor(fifo, ovh)).toBe(post1);
    }
  });
});

describe('demandProfitMinor — «Прибыль» correctness (invariant #4)', () => {
  it('profit === revenue − fifo − overhead', () => {
    expect(demandProfitMinor(1_000_00n, 600_00n, 50_00n)).toBe(350_00n);
  });

  it('overhead lowers profit by exactly the overhead amount', () => {
    const sum = 5_000_00n;
    const fifo = 3_000_00n;
    const noOvh = demandProfitMinor(sum, fifo, 0n);
    const withOvh = demandProfitMinor(sum, fifo, 120_00n);
    expect(noOvh - withOvh).toBe(120_00n);
  });

  it('allows a negative profit (loss-making shipment — must NOT clamp)', () => {
    // overhead alone exceeds the gross margin.
    expect(demandProfitMinor(1_000_00n, 900_00n, 250_00n)).toBe(-150_00n);
    // even revenue < FIFO (sold below cost).
    expect(demandProfitMinor(100n, 500n, 10n)).toBe(-410n);
  });

  it('fifo = 0 (FIFO-uncovered shipment): profit = revenue − overhead', () => {
    expect(demandProfitMinor(900_00n, 0n, 40_00n)).toBe(860_00n);
  });

  it('zero everything → zero profit', () => {
    expect(demandProfitMinor(0n, 0n, 0n)).toBe(0n);
  });
});
