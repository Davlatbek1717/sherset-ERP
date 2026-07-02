import { describe, expect, it } from 'vitest';
import {
  addDecimals,
  compareDecimals,
  computeLineCost,
  computePerUnitCost,
  formatDecimalScaled,
  minDecimal,
  parseDecimalScaled,
  roundHalfUp,
  subtractDecimals,
} from './fifo-consumer.js';

describe('parseDecimalScaled', () => {
  it.each([
    ['3.5', 3_500_000n],
    ['0', 0n],
    ['1', 1_000_000n],
    ['0.123456', 123_456n],
    ['-1.25', -1_250_000n],
    ['100', 100_000_000n],
    // Truncates beyond 6 fractional digits (matches Postgres Decimal(20,6) storage).
    ['1.1234567', 1_123_456n],
  ])('parses %s as %s', (input, expected) => {
    expect(parseDecimalScaled(input)).toBe(expected);
  });
});

describe('formatDecimalScaled', () => {
  it.each([
    [3_500_000n, '3.5'],
    [0n, '0'],
    [1_000_000n, '1'],
    [123_456n, '0.123456'],
    [-1_250_000n, '-1.25'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatDecimalScaled(input)).toBe(expected);
  });

  it('round-trips parse → format', () => {
    expect(formatDecimalScaled(parseDecimalScaled('42.987654'))).toBe('42.987654');
  });
});

describe('roundHalfUp', () => {
  it('rounds positive halves up', () => {
    expect(roundHalfUp(5n, 10n)).toBe(1n); // 0.5 → 1
    expect(roundHalfUp(15n, 10n)).toBe(2n); // 1.5 → 2
  });

  it('rounds positive truncated values down', () => {
    expect(roundHalfUp(4n, 10n)).toBe(0n); // 0.4 → 0
  });

  it('rounds negative halves away from zero', () => {
    expect(roundHalfUp(-5n, 10n)).toBe(-1n);
    expect(roundHalfUp(-15n, 10n)).toBe(-2n);
  });
});

describe('computeLineCost', () => {
  it('computes simple integer multiplication', () => {
    expect(computeLineCost('3', 12000n)).toBe(36000n);
  });

  it('handles fractional quantities exactly', () => {
    // 3.5 × 12000 = 42000
    expect(computeLineCost('3.5', 12000n)).toBe(42000n);
  });

  it('rounds half-up to nearest tiyin', () => {
    // 1.5 × 1 = 1.5 → rounds to 2
    expect(computeLineCost('1.5', 1n)).toBe(2n);
    // 0.5 × 1 = 0.5 → rounds to 1
    expect(computeLineCost('0.5', 1n)).toBe(1n);
    // 0.4 × 1 = 0.4 → rounds to 0
    expect(computeLineCost('0.4', 1n)).toBe(0n);
  });

  it('handles zero unit cost', () => {
    expect(computeLineCost('100', 0n)).toBe(0n);
  });

  it('handles zero quantity', () => {
    expect(computeLineCost('0', 99999n)).toBe(0n);
  });
});

describe('subtractDecimals', () => {
  it.each([
    ['5', '1.5', '3.5'],
    ['10', '10', '0'],
    ['1', '0.999999', '0.000001'],
    ['0', '5', '-5'],
  ])('%s - %s = %s', (a, b, expected) => {
    expect(subtractDecimals(a, b)).toBe(expected);
  });
});

describe('addDecimals', () => {
  it.each([
    ['1', '2', '3'],
    ['0.5', '0.5', '1'],
    ['1.999999', '0.000001', '2'],
  ])('%s + %s = %s', (a, b, expected) => {
    expect(addDecimals(a, b)).toBe(expected);
  });
});

describe('compareDecimals', () => {
  it('returns -1 / 0 / 1', () => {
    expect(compareDecimals('1', '2')).toBe(-1);
    expect(compareDecimals('2', '2')).toBe(0);
    expect(compareDecimals('3', '2')).toBe(1);
  });

  it('handles fractional comparisons', () => {
    expect(compareDecimals('0.999999', '1')).toBe(-1);
    expect(compareDecimals('1.000001', '1')).toBe(1);
  });
});

describe('minDecimal', () => {
  it('returns smaller', () => {
    expect(minDecimal('5', '3')).toBe('3');
    expect(minDecimal('1.5', '1.5')).toBe('1.5');
    expect(minDecimal('0.1', '0.2')).toBe('0.1');
  });
});

describe('computePerUnitCost', () => {
  it('divides total by qty', () => {
    // 30000 tiyin / 3 units = 10000 tiyin/unit
    expect(computePerUnitCost(30000n, '3')).toBe(10000n);
  });

  it('handles fractional qty', () => {
    // 12000 tiyin / 1.5 units = 8000 tiyin/unit
    expect(computePerUnitCost(12000n, '1.5')).toBe(8000n);
  });

  it('returns 0 for zero qty (avoids divide-by-zero)', () => {
    expect(computePerUnitCost(99999n, '0')).toBe(0n);
  });

  it('rounds half-up', () => {
    // 100 / 3 = 33.333... → rounds to 33
    expect(computePerUnitCost(100n, '3')).toBe(33n);
    // 50 / 3 = 16.666... → rounds to 17
    expect(computePerUnitCost(50n, '3')).toBe(17n);
  });
});
