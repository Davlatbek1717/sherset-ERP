import { Prisma } from '@moysklad/db';
import { describe, expect, it } from 'vitest';
import { distributeOutputCost } from './output-cost-distribution.js';

const d = (s: string) => new Prisma.Decimal(s);
const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

/**
 * §89 — money correctness of the by-product cost split. The hard
 * invariant: Σ result === totalCostMinor EXACTLY, always.
 */
describe('distributeOutputCost', () => {
  it('N=1 ⇒ [total] (byte-identical to pre-§89 single output)', () => {
    expect(distributeOutputCost([d('10')], 123_456n)).toEqual([123_456n]);
    expect(distributeOutputCost([d('0.0001')], 999n)).toEqual([999n]);
  });

  it('empty ⇒ []', () => {
    expect(distributeOutputCost([], 100n)).toEqual([]);
  });

  it('splits proportionally by qty, Σ exact (no remainder)', () => {
    const r = distributeOutputCost([d('3'), d('1')], 100n);
    expect(r).toEqual([75n, 25n]);
    expect(sum(r)).toBe(100n);
  });

  it('largest-remainder: equal weights, indivisible total — deterministic idx tie-break', () => {
    const r = distributeOutputCost([d('1'), d('1'), d('1')], 100n);
    expect(r).toEqual([34n, 33n, 33n]);
    expect(sum(r)).toBe(100n);
  });

  it('largest-remainder: unequal weights, leftover to the largest remainder', () => {
    const r = distributeOutputCost([d('2'), d('1')], 10n);
    expect(r).toEqual([7n, 3n]);
    expect(sum(r)).toBe(10n);
  });

  it('all-zero quantities ⇒ equal split, still Σ-exact', () => {
    const r = distributeOutputCost([d('0'), d('0')], 10n);
    expect(r).toEqual([5n, 5n]);
    expect(sum(r)).toBe(10n);
  });

  it('Σ === total for a fuzzed range of weights/totals (exact conservation)', () => {
    const weightSets = [
      [d('1'), d('2'), d('3')],
      [d('0.333333'), d('0.666667')],
      [d('7'), d('7'), d('7'), d('7')],
      [d('1000000'), d('1')],
      [d('0.000001'), d('0.000002'), d('0.000003')],
    ];
    for (const w of weightSets) {
      for (const total of [0n, 1n, 7n, 100n, 999_999n, 1_000_000_007n]) {
        const r = distributeOutputCost(w, total);
        expect(r).toHaveLength(w.length);
        expect(sum(r)).toBe(total); // EXACT — no tiyin lost or conjured
        expect(r.every((x) => x >= 0n)).toBe(true);
      }
    }
  });
});
