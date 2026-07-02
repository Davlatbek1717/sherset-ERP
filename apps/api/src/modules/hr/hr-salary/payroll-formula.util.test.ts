import { describe, expect, it } from 'vitest';
import {
  computeFinalSalaryMinor,
  extractBaseSalaryMinor,
  monthBounds,
} from './payroll-formula.util.js';

describe('computeFinalSalaryMinor', () => {
  it('fix + kpi + bonus − fine + commission', () => {
    expect(
      computeFinalSalaryMinor({
        fixComponentMinor: 5_000_000_00n,
        kpiEarnedMinor: 1_000_000_00n,
        bonusSumMinor: 300_000_00n,
        fineSumMinor: 100_000_00n,
        commissionMinor: 150_000_00n,
      }),
    ).toBe(6_350_000_00n);
  });

  it('fine subtracted — can go negative (underwater month surfaced)', () => {
    expect(
      computeFinalSalaryMinor({
        fixComponentMinor: 0n,
        kpiEarnedMinor: 0n,
        bonusSumMinor: 0n,
        fineSumMinor: 500_00n,
        commissionMinor: 0n,
      }),
    ).toBe(-500_00n);
  });

  it('all-zero components → 0', () => {
    expect(
      computeFinalSalaryMinor({
        fixComponentMinor: 0n,
        kpiEarnedMinor: 0n,
        bonusSumMinor: 0n,
        fineSumMinor: 0n,
        commissionMinor: 0n,
      }),
    ).toBe(0n);
  });

  it('BigInt-safe for >2^53 totals', () => {
    expect(
      computeFinalSalaryMinor({
        fixComponentMinor: 99_999_999_999_999_99n,
        kpiEarnedMinor: 0n,
        bonusSumMinor: 0n,
        fineSumMinor: 0n,
        commissionMinor: 1n,
      }),
    ).toBe(99_999_999_999_999_99n + 1n);
  });
});

describe('extractBaseSalaryMinor', () => {
  it('reads baseSalaryMinor string', () => {
    expect(extractBaseSalaryMinor({ baseSalaryMinor: '500000000' })).toBe(500_000_000n);
  });

  it('reads baseSalaryMinor number', () => {
    expect(extractBaseSalaryMinor({ baseSalaryMinor: 12345 })).toBe(12_345n);
  });

  it('null / undefined / non-object → 0n', () => {
    expect(extractBaseSalaryMinor(null)).toBe(0n);
    expect(extractBaseSalaryMinor(undefined)).toBe(0n);
    expect(extractBaseSalaryMinor('nope')).toBe(0n);
    expect(extractBaseSalaryMinor(42)).toBe(0n);
  });

  it('missing key → 0n', () => {
    expect(extractBaseSalaryMinor({ other: 1 })).toBe(0n);
  });

  it('negative base clamped to 0n', () => {
    expect(extractBaseSalaryMinor({ baseSalaryMinor: '-5000' })).toBe(0n);
  });

  it('garbage value → 0n (no throw)', () => {
    expect(extractBaseSalaryMinor({ baseSalaryMinor: 'abc' })).toBe(0n);
  });
});

describe('monthBounds', () => {
  it('returns [first-of-month, first-of-next-month) UTC', () => {
    const { start, endExclusive } = monthBounds('2026-05');
    expect(start.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('December rolls over to next year', () => {
    const { start, endExclusive } = monthBounds('2026-12');
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('February leap year (2028)', () => {
    const { endExclusive } = monthBounds('2028-02');
    expect(endExclusive.toISOString()).toBe('2028-03-01T00:00:00.000Z');
  });

  it('rejects malformed input', () => {
    expect(() => monthBounds('2026-5')).toThrow(/format/);
    expect(() => monthBounds('not-a-month')).toThrow();
    expect(() => monthBounds('2026-13')).toThrow(/oy/);
  });
});
