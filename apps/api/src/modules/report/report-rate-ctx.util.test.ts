import { describe, expect, it, vi } from 'vitest';
import { type CurrencyReader, consolidateToBase, loadRateContext } from './report-rate-ctx.util.js';

const E8 = 100_000_000n;

function reader(
  rows: Array<{
    code: string;
    isoCode?: string | null;
    default: boolean;
    rateValue: bigint;
    multiplicity: number;
    indirect: boolean;
  }>,
): CurrencyReader {
  return {
    currency: {
      findMany: vi.fn().mockResolvedValue(rows.map((r) => ({ isoCode: null, ...r }))),
    },
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

// M-03 (Faza 16): moysklad konventsiyasida `code` — ISO NUMERIC ('860'),
// `isoCode` — ALPHA ('UZS'); hujjatlar esa `currency`da ALPHA saqlaydi.
// Rate-xarita ALPHA kalit ostida turishi SHART, aks holda har bir hisobot
// konvertatsiyasi rates-miss → face-value fallback'ga tushadi (~12 000× xato).
describe('loadRateContext — numeric-code konventsiyasi (M-03)', () => {
  const numericRows = [
    {
      code: '860',
      isoCode: 'UZS',
      default: true,
      rateValue: E8,
      multiplicity: 1,
      indirect: false,
    },
    {
      code: '840',
      isoCode: 'USD',
      default: false,
      rateValue: 12_000n * E8,
      multiplicity: 1,
      indirect: false,
    },
  ];

  it('baseCode — default qatorning ALPHA isoCode’i (860 emas, UZS)', async () => {
    const ctx = await loadRateContext(reader(numericRows), 'acc1');
    expect(ctx.baseCode).toBe('UZS');
  });

  it('rates xaritasi ALPHA kalit ostida (hujjat currency=USD topadi)', async () => {
    const ctx = await loadRateContext(reader(numericRows), 'acc1');
    expect(ctx.rates.get('USD')?.rateValue).toBe(12_000n * E8);
  });

  it('USD hujjat summasi bazaga KONVERTATSIYA qilinadi (face-value fallback YO‘Q)', async () => {
    const ctx = await loadRateContext(reader(numericRows), 'acc1');
    const seen = new Set<string>();
    // $100.00 (10 000 sent) × 12 000 so'm = 1 200 000 so'm = 120 000 000 tiyin
    expect(consolidateToBase(10_000n, 'USD', ctx, seen)).toBe(120_000_000n);
  });

  it('legacy almashgan qator (code=USD alpha, isoCode raqam/bo‘sh) ham ALPHA kalit oladi', async () => {
    const ctx = await loadRateContext(
      reader([
        {
          code: '860',
          isoCode: 'UZS',
          default: true,
          rateValue: E8,
          multiplicity: 1,
          indirect: false,
        },
        {
          code: 'USD',
          isoCode: '840',
          default: false,
          rateValue: 12_500n * E8,
          multiplicity: 1,
          indirect: false,
        },
      ]),
      'acc1',
    );
    expect(ctx.rates.get('USD')?.rateValue).toBe(12_500n * E8);
  });
});
