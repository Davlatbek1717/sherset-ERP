import { describe, expect, it } from 'vitest';
import {
  CutRequestSchema,
  distributeCutCost,
  lengthToMm,
  mmToLength,
  normalizeLengthM,
  prorateMinorByLength,
  remnantName,
  validateCutBudget,
} from './product-cut.schema.js';

describe('length math (exact mm, no floats)', () => {
  it('parses meters to integer millimeters', () => {
    expect(lengthToMm('4')).toBe(4000n);
    expect(lengthToMm('2.5')).toBe(2500n);
    expect(lengthToMm('0.075')).toBe(75n);
    expect(lengthToMm(2.5)).toBe(2500n);
  });

  it('formats millimeters back to trimmed meters', () => {
    expect(mmToLength(4000n)).toBe('4');
    expect(mmToLength(2500n)).toBe('2.5');
    expect(mmToLength(75n)).toBe('0.075');
  });

  it('normalizes to a canonical attribute key', () => {
    expect(normalizeLengthM('2.50')).toBe('2.5');
    expect(normalizeLengthM('2.000')).toBe('2');
    expect(normalizeLengthM(4)).toBe('4');
  });

  it('builds the remnant display name', () => {
    expect(remnantName('Труба ПНД 32', '2.5')).toBe('Труба ПНД 32 — отрез 2.5м');
  });
});

describe('validateCutBudget', () => {
  it("the user's scenario: 2 pipes of 4м, 2м cut off each → 2×2м kept + 2×2м budget used", () => {
    // Both halves are recorded; selling one is a separate sale document.
    const b = validateCutBudget('4', 2, [{ lengthM: '2', quantity: 4 }]);
    expect(b.budgetMm).toBe(8000n);
    expect(b.usedMm).toBe(8000n);
    expect(b.wasteMm).toBe(0n);
  });

  it('shortfall becomes waste (kerf/stub)', () => {
    const b = validateCutBudget('4', 1, [
      { lengthM: '2.5', quantity: 1 },
      { lengthM: '1.4', quantity: 1 },
    ]);
    expect(b.wasteMm).toBe(100n); // 0.1 м
  });

  it('rejects a piece not strictly shorter than the source', () => {
    expect(() => validateCutBudget('4', 1, [{ lengthM: '4', quantity: 1 }])).toThrow(/qisqa/);
    expect(() => validateCutBudget('4', 1, [{ lengthM: '5', quantity: 1 }])).toThrow(/qisqa/);
  });

  it('rejects pieces exceeding the total budget', () => {
    expect(() => validateCutBudget('4', 1, [{ lengthM: '2.5', quantity: 2 }])).toThrow(/dan ko'p/);
  });

  it('rejects a zero-length source', () => {
    expect(() => validateCutBudget('0', 1, [{ lengthM: '1', quantity: 1 }])).toThrow();
  });
});

describe('distributeCutCost', () => {
  it('no waste → the full cost re-enters, split by length', () => {
    const s = distributeCutCost(100_000n, 4000n, [{ lengthM: '2', quantity: 2 }]);
    expect(s.usedMinor).toBe(100_000n);
    expect(s.wasteMinor).toBe(0n);
    expect(s.lineShares).toEqual([100_000n]);
  });

  it('waste share stays out (expensed on the Loss)', () => {
    const s = distributeCutCost(100_000n, 4000n, [
      { lengthM: '2.5', quantity: 1 },
      { lengthM: '1.4', quantity: 1 },
    ]);
    // used 3.9/4 → 97 500, waste 2 500
    expect(s.usedMinor).toBe(97_500n);
    expect(s.wasteMinor).toBe(2_500n);
    expect(s.lineShares.reduce((a, b) => a + b, 0n)).toBe(97_500n);
    expect(s.lineShares[0]).toBe(62_500n); // 2.5/4 of 100k
  });

  it('rounding dust lands on the last row, Σ stays exact', () => {
    const s = distributeCutCost(100n, 3000n, [
      { lengthM: '1', quantity: 1 },
      { lengthM: '1', quantity: 1 },
      { lengthM: '1', quantity: 1 },
    ]);
    expect(s.lineShares).toEqual([33n, 33n, 34n]);
    expect(s.usedMinor).toBe(100n);
    expect(s.wasteMinor).toBe(0n);
  });

  it('multi-quantity rows weight by length × qty', () => {
    const s = distributeCutCost(90_000n, 9000n, [
      { lengthM: '2', quantity: 3 }, // 6000 mm
      { lengthM: '1', quantity: 2 }, // 2000 mm → waste 1000 mm
    ]);
    expect(s.lineShares).toEqual([60_000n, 20_000n]);
    expect(s.usedMinor).toBe(80_000n);
    expect(s.wasteMinor).toBe(10_000n);
  });
});

describe('prorateMinorByLength', () => {
  it('prorates prices by length, rounding half-up', () => {
    expect(prorateMinorByLength(100_000n, 2500n, 4000n)).toBe(62_500n);
    expect(prorateMinorByLength(100n, 1000n, 3000n)).toBe(33n); // 33.33 → 33
    expect(prorateMinorByLength(100n, 500n, 3000n)).toBe(17n); // 16.67 → 17
  });

  it('zero source length yields 0 (guarded upstream anyway)', () => {
    expect(prorateMinorByLength(100n, 100n, 0n)).toBe(0n);
  });
});

describe('CutRequestSchema', () => {
  const base = {
    organizationId: '7b9f8f9e-1111-4111-8111-111111111111',
    storeId: '7b9f8f9e-2222-4222-8222-222222222222',
    consumedQty: 1,
    sourceLengthM: '4',
    pieces: [{ lengthM: '2', quantity: 2 }],
  };

  it('accepts the minimal valid payload', () => {
    const parsed = CutRequestSchema.parse(base);
    expect(parsed.pieces).toHaveLength(1);
    expect(parsed.sourceLengthM).toBe('4');
  });

  it('accepts numeric lengths and normalizes them to strings', () => {
    const parsed = CutRequestSchema.parse({ ...base, sourceLengthM: 4 });
    expect(parsed.sourceLengthM).toBe('4');
  });

  it('rejects malformed lengths and non-positive quantities', () => {
    expect(() => CutRequestSchema.parse({ ...base, sourceLengthM: '4,5' })).toThrow();
    expect(() => CutRequestSchema.parse({ ...base, sourceLengthM: '1.2345' })).toThrow();
    expect(() =>
      CutRequestSchema.parse({ ...base, pieces: [{ lengthM: '2', quantity: 0 }] }),
    ).toThrow();
    expect(() => CutRequestSchema.parse({ ...base, pieces: [] })).toThrow();
  });
});
