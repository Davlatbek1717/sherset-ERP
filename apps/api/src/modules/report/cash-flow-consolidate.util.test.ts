import { describe, expect, it } from 'vitest';
import type { CurrencyRate } from '../currency/currency-convert.js';
import {
  type CurrencyAwareRow,
  type RateContext,
  foldCurrencyRows,
} from './cash-flow-consolidate.util.js';
import { CurrencyTally } from './report-rate-ctx.util.js';

const E8 = 100_000_000n;

// USD quoted direct at 1 USD = 12 000 UZS (both 2-decimal). rateValue = 12000×1e8.
const USD_RATE: CurrencyRate = {
  rateValue: 12_000n * E8,
  multiplicity: 1n,
  indirect: false,
};

function ctx(): RateContext {
  return {
    baseCode: 'UZS',
    rates: new Map<string, CurrencyRate>([
      ['UZS', { rateValue: E8, multiplicity: 1n, indirect: false }],
      ['USD', USD_RATE],
    ]),
  };
}

function row(
  over: Partial<CurrencyAwareRow> & { key: string; currency: string },
): CurrencyAwareRow {
  return {
    inflowCount: 0,
    inflowSumMinor: 0n,
    outflowCount: 0,
    outflowSumMinor: 0n,
    ...over,
  };
}

describe('foldCurrencyRows', () => {
  it('base-currency rows pass through unchanged (identity)', () => {
    const seen = new CurrencyTally();
    const out = foldCurrencyRows(
      [row({ key: 'd1', currency: 'UZS', inflowCount: 2, inflowSumMinor: 500_00n })],
      ctx(),
      seen,
    );
    expect(out.get('d1')).toEqual({
      inflowCount: 2,
      inflowSumMinor: 500_00n,
      outflowCount: 0,
      outflowSumMinor: 0n,
    });
    expect(seen.size).toBe(1);
    expect(seen.has('UZS')).toBe(true);
  });

  it('foreign-currency rows are converted to base (USD×12000)', () => {
    const seen = new CurrencyTally();
    // 100 USD = 10_000 cents → 100 × 12000 = 1_200_000 UZS = 120_000_000 tiyin
    const out = foldCurrencyRows(
      [row({ key: 'd1', currency: 'USD', inflowCount: 1, inflowSumMinor: 10_000n })],
      ctx(),
      seen,
    );
    expect(out.get('d1')?.inflowSumMinor).toBe(120_000_000n);
    expect(out.get('d1')?.inflowCount).toBe(1);
  });

  it('mixes base + foreign within one key: sums consolidated, counts added', () => {
    const seen = new CurrencyTally();
    const out = foldCurrencyRows(
      [
        row({ key: 'd1', currency: 'UZS', inflowCount: 1, inflowSumMinor: 1_000_000n }),
        row({ key: 'd1', currency: 'USD', inflowCount: 1, inflowSumMinor: 10_000n }),
      ],
      ctx(),
      seen,
    );
    // 1_000_000 (UZS) + 120_000_000 (USD→UZS) = 121_000_000
    expect(out.get('d1')?.inflowSumMinor).toBe(121_000_000n);
    expect(out.get('d1')?.inflowCount).toBe(2);
    expect(seen.size).toBe(2);
  });

  // M-12 (Faza 17): kursi yo'q valyuta ENDI face-value qo'shilmaydi — jamidan
  // chiqariladi va o'z valyutasida alohida hisobga tushadi.
  it('unknown currency is EXCLUDED from the sum and tallied separately (M-12)', () => {
    const seen = new CurrencyTally();
    const out = foldCurrencyRows(
      [row({ key: 'd1', currency: 'EUR', inflowCount: 1, inflowSumMinor: 999n })],
      ctx(),
      seen,
    );
    expect(out.get('d1')?.inflowSumMinor).toBe(0n);
    expect(out.get('d1')?.inflowCount).toBe(1); // hujjat soni yo'qolmaydi
    expect(seen.has('EUR')).toBe(true);
    expect(seen.unconvertedRows()).toEqual([{ currency: 'EUR', amountMinor: '999' }]);
  });

  // M-11: qator o'z rate_value'sini olib kelsa, o'sha kurs ustun turadi.
  it('row rateValue wins over the current context rate (M-11)', () => {
    const seen = new CurrencyTally();
    const out = foldCurrencyRows(
      [
        row({
          key: 'd1',
          currency: 'USD',
          rateValue: 11_000n * E8,
          inflowCount: 1,
          inflowSumMinor: 10_000n,
        }),
      ],
      ctx(),
      seen,
    );
    expect(out.get('d1')?.inflowSumMinor).toBe(110_000_000n);
  });

  it('separate keys fold independently', () => {
    const seen = new CurrencyTally();
    const out = foldCurrencyRows(
      [
        row({ key: 'd1', currency: 'UZS', inflowSumMinor: 100n, inflowCount: 1 }),
        row({ key: 'd2', currency: 'UZS', outflowSumMinor: 50n, outflowCount: 1 }),
      ],
      ctx(),
      seen,
    );
    expect(out.get('d1')?.inflowSumMinor).toBe(100n);
    expect(out.get('d2')?.outflowSumMinor).toBe(50n);
    expect(out.size).toBe(2);
  });

  it('preserves first-seen key insertion order (chronological buckets)', () => {
    const seen = new CurrencyTally();
    const out = foldCurrencyRows(
      [
        row({ key: '2026-01', currency: 'UZS', inflowSumMinor: 1n }),
        row({ key: '2026-02', currency: 'USD', inflowSumMinor: 1n }),
        row({ key: '2026-01', currency: 'USD', inflowSumMinor: 1n }), // late add to existing
      ],
      ctx(),
      seen,
    );
    expect([...out.keys()]).toEqual(['2026-01', '2026-02']);
  });

  it('outflow conversion works symmetrically', () => {
    const seen = new CurrencyTally();
    const out = foldCurrencyRows(
      [row({ key: 'd1', currency: 'USD', outflowCount: 1, outflowSumMinor: 10_000n })],
      ctx(),
      seen,
    );
    expect(out.get('d1')?.outflowSumMinor).toBe(120_000_000n);
    expect(out.get('d1')?.outflowCount).toBe(1);
  });

  it('empty currency string → treated as base', () => {
    const seen = new CurrencyTally();
    const out = foldCurrencyRows(
      [row({ key: 'd1', currency: '', inflowSumMinor: 42n, inflowCount: 1 })],
      ctx(),
      seen,
    );
    expect(out.get('d1')?.inflowSumMinor).toBe(42n);
    expect(seen.has('UZS')).toBe(true);
  });

  it('zero amounts stay zero (no spurious conversion)', () => {
    const seen = new CurrencyTally();
    const out = foldCurrencyRows(
      [row({ key: 'd1', currency: 'USD', inflowCount: 0, inflowSumMinor: 0n })],
      ctx(),
      seen,
    );
    expect(out.get('d1')?.inflowSumMinor).toBe(0n);
  });
});
