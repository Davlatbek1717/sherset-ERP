import { scaleMinorByQty } from '@moysklad/money';
import { describe, expect, it } from 'vitest';
import { type OverheadLineInput, distributeOverhead } from './overhead-distribution.js';

/** Helper — build a line with sensible defaults. */
function line(
  index: number,
  quantity: string,
  baseLineMinor: bigint,
  weightG: number | null = null,
  volumeML: number | null = null,
): OverheadLineInput {
  return { index, quantity, baseLineMinor, weightG, volumeML };
}

const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

describe('distributeOverhead — exact conservation (money invariant #1)', () => {
  const methods = ['WEIGHT', 'PRICE', 'VOLUME', 'QUANTITY'] as const;

  it('Σ overheadMinor === total for every method, incl. non-dividing ratios', () => {
    const lines = [
      line(0, '3', 1_000_00n, 150, 500),
      line(1, '7', 2_500_00n, 40, 1200),
      line(2, '1.5', 999_99n, 333, 7),
      line(3, '11', 12_345_67n, 1, 1),
    ];
    for (const m of methods) {
      for (const total of [1n, 2n, 7n, 100n, 99_999_99n, 1_000_000_01n]) {
        const r = distributeOverhead(lines, total, m);
        expect(sum(r.map((x) => x.overheadMinor)), `${m}/${total}`).toBe(total);
        // No negative allocation.
        for (const x of r) expect(x.overheadMinor >= 0n).toBe(true);
      }
    }
  });

  it('single line absorbs the entire overhead', () => {
    const r = distributeOverhead([line(0, '4', 500_00n, 100, 100)], 7_77n, 'WEIGHT');
    expect(r).toHaveLength(1);
    expect(r[0].overheadMinor).toBe(7_77n);
  });

  it('empty input → empty output', () => {
    expect(distributeOverhead([], 1000n, 'PRICE')).toEqual([]);
  });

  it('zero overhead → all-zero allocation, base-only per-unit cost', () => {
    const r = distributeOverhead([line(0, '5', 50_000_00n)], 0n, 'PRICE');
    expect(r[0].overheadMinor).toBe(0n);
    // 50_000_00 tiyin over 5 units = 10_000_00 per unit.
    expect(r[0].costPerUnitMinor).toBe(10_000_00n);
  });
});

describe('distributeOverhead — method proportionality', () => {
  it('PRICE: proportional to baseLineMinor', () => {
    // bases 100 : 300 → overhead 400 splits 100 : 300.
    const r = distributeOverhead([line(0, '1', 100n), line(1, '1', 300n)], 400n, 'PRICE');
    expect(r[0].overheadMinor).toBe(100n);
    expect(r[1].overheadMinor).toBe(300n);
  });

  it('QUANTITY: proportional to quantity, ignores price/weight', () => {
    const r = distributeOverhead(
      [line(0, '2', 999n, 9999, 9999), line(1, '8', 1n, 1, 1)],
      100n,
      'QUANTITY',
    );
    // qty 2 : 8 → 20 : 80
    expect(r[0].overheadMinor).toBe(20n);
    expect(r[1].overheadMinor).toBe(80n);
  });

  it('WEIGHT: proportional to weightG × qty', () => {
    // (100g×1) : (50g×4) = 100 : 200 → overhead 300 → 100 : 200
    const r = distributeOverhead([line(0, '1', 5n, 100), line(1, '4', 5n, 50)], 300n, 'WEIGHT');
    expect(r[0].overheadMinor).toBe(100n);
    expect(r[1].overheadMinor).toBe(200n);
  });

  it('VOLUME: proportional to volumeML × qty', () => {
    // (200ml×2) : (100ml×2) = 400 : 200 → 600 → 400 : 200
    const r = distributeOverhead(
      [line(0, '2', 5n, null, 200), line(1, '2', 5n, null, 100)],
      600n,
      'VOLUME',
    );
    expect(r[0].overheadMinor).toBe(400n);
    expect(r[1].overheadMinor).toBe(200n);
  });
});

describe('distributeOverhead — deterministic fallback chain (invariant #3)', () => {
  it('WEIGHT with all weights missing → falls back to PRICE', () => {
    const r = distributeOverhead(
      [line(0, '1', 100n, null), line(1, '1', 300n, null)],
      400n,
      'WEIGHT',
    );
    expect(r[0].overheadMinor).toBe(100n); // PRICE basis
    expect(r[1].overheadMinor).toBe(300n);
  });

  it('VOLUME missing AND all bases zero → PRICE zero → QUANTITY', () => {
    const r = distributeOverhead(
      [line(0, '1', 0n, null, null), line(1, '3', 0n, null, null)],
      40n,
      'VOLUME',
    );
    // QUANTITY 1 : 3 → 10 : 30
    expect(r[0].overheadMinor).toBe(10n);
    expect(r[1].overheadMinor).toBe(30n);
  });

  it('all bases AND all qty zero → equal split, still exact', () => {
    const r = distributeOverhead(
      [line(0, '0', 0n), line(1, '0', 0n), line(2, '0', 0n)],
      10n,
      'QUANTITY',
    );
    expect(sum(r.map((x) => x.overheadMinor))).toBe(10n);
    // 10 over 3 equal → 4,3,3 (leftover to lowest index first).
    expect(r.map((x) => x.overheadMinor)).toEqual([4n, 3n, 3n]);
  });
});

describe('distributeOverhead — largest-remainder rounding & determinism', () => {
  it('leftover tiyin goes to largest fractional remainders, ties by index', () => {
    // 3 equal lines, total 10 → each 3 r 1; leftover 1 → lowest index.
    const r = distributeOverhead(
      [line(0, '1', 1n), line(1, '1', 1n), line(2, '1', 1n)],
      10n,
      'PRICE',
    );
    expect(r.map((x) => x.overheadMinor)).toEqual([4n, 3n, 3n]);
    expect(sum(r.map((x) => x.overheadMinor))).toBe(10n);
  });

  it('is deterministic — identical output across repeated calls', () => {
    const mk = () => [
      line(0, '2.5', 333n, 17, 4),
      line(1, '9', 1_234n, 3, 91),
      line(2, '0.75', 88n, 1000, 1),
    ];
    const a = distributeOverhead(mk(), 7_77n, 'WEIGHT');
    const b = distributeOverhead(mk(), 7_77n, 'WEIGHT');
    expect(a).toEqual(b);
  });
});

describe('distributeOverhead — per-unit cost & post/unpost symmetry (invariant #4)', () => {
  it('per-unit cost is base+overhead over qty, round-half-up', () => {
    // base 100_00 over 3 units = 33_33.33; +overhead 1 → target 100_01
    // 10001 / 3 = 3333.67 → round-half-up → 3334
    const r = distributeOverhead([line(0, '3', 100_00n)], 1n, 'PRICE');
    expect(r[0].overheadMinor).toBe(1n);
    expect(r[0].costPerUnitMinor).toBe(3334n);
  });

  it('lineCostMinor === costPerUnitMinor × qty via the shared scaleMinorByQty primitive', () => {
    // This is the exact identity the post & unpost stock writers rely on:
    // both compute scaleMinorByQty(costMinor, qty) (6-dp, round-half-up), so a
    // post→unpost cycle nets to zero regardless of per-unit rounding.
    const lines = [
      line(0, '3', 100_00n, 50, 10),
      line(1, '7.5', 250_00n, 80, 40),
      line(2, '0.333', 9_99n, 1, 1),
    ];
    const r = distributeOverhead(lines, 12_34n, 'WEIGHT');
    for (let i = 0; i < lines.length; i++) {
      const expected = scaleMinorByQty(r[i].costPerUnitMinor, lines[i].quantity);
      expect(r[i].lineCostMinor).toBe(expected);
    }
  });

  it('fractional (weighed) quantity handled in micro-units', () => {
    // 1.5 kg, base 30_00, overhead 0 → per-unit 30_00/1.5 = 20_00
    const r = distributeOverhead([line(0, '1.5', 30_00n)], 0n, 'QUANTITY');
    expect(r[0].costPerUnitMinor).toBe(20_00n);
  });
});
