import { describe, expect, it, vi } from 'vitest';
import { type CurrencyReader, loadRateContext } from './report-rate-ctx.util.js';

const E8 = 100_000_000n;

function reader(
  rows: Array<{
    code: string;
    default: boolean;
    rateValue: bigint;
    multiplicity: number;
    indirect: boolean;
  }>,
): CurrencyReader {
  return {
    currency: { findMany: vi.fn().mockResolvedValue(rows) },
  };
}

describe('loadRateContext', () => {
  it('picks the default currency as baseCode', async () => {
    const ctx = await loadRateContext(
      reader([
        { code: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false },
        { code: 'USD', default: false, rateValue: 12_000n * E8, multiplicity: 1, indirect: false },
      ]),
      'acc1',
    );
    expect(ctx.baseCode).toBe('UZS');
    expect(ctx.rates.size).toBe(2);
    expect(ctx.rates.get('USD')?.rateValue).toBe(12_000n * E8);
    expect(ctx.rates.get('USD')?.multiplicity).toBe(1n); // Int → BigInt
  });

  it('non-UZS default is honored as base', async () => {
    const ctx = await loadRateContext(
      reader([
        { code: 'USD', default: true, rateValue: E8, multiplicity: 1, indirect: false },
        { code: 'UZS', default: false, rateValue: 8333n, multiplicity: 1, indirect: true },
      ]),
      'acc1',
    );
    expect(ctx.baseCode).toBe('USD');
  });

  it('empty account → defaults to UZS base + empty map (single-currency fast path)', async () => {
    const ctx = await loadRateContext(reader([]), 'acc1');
    expect(ctx.baseCode).toBe('UZS');
    expect(ctx.rates.size).toBe(0);
  });

  it('scopes the query to the account', async () => {
    const r = reader([]);
    await loadRateContext(r, 'acc-XYZ');
    expect(r.currency.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 'acc-XYZ' } }),
    );
  });

  it('coerces multiplicity Int → BigInt for the rate map', async () => {
    const ctx = await loadRateContext(
      reader([
        { code: 'EUR', default: false, rateValue: 13_500n * E8, multiplicity: 10, indirect: false },
      ]),
      'acc1',
    );
    expect(ctx.rates.get('EUR')?.multiplicity).toBe(10n);
  });
});
