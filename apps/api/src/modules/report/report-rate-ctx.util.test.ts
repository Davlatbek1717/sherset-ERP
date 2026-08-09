import { describe, expect, it, vi } from 'vitest';
import {
  type CurrencyReader,
  CurrencyTally,
  consolidateToBase,
  loadRateContext,
} from './report-rate-ctx.util.js';

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
    const seen = new CurrencyTally();
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

// ---------------------------------------------------------------------------
// Faza 17 — M-11: tarixiy kurs. Hisobot davri yopilgach ham o'zgarmasligi
// uchun konsolidatsiya hujjatning O'Z `rate_value`'si bilan bo'lishi kerak,
// Currency jadvalidagi BUGUNGI kurs bilan emas.
// ---------------------------------------------------------------------------
describe('consolidateToBase — tarixiy hujjat kursi (M-11)', () => {
  const rows = [
    { code: 'UZS', isoCode: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false },
    {
      code: 'USD',
      isoCode: 'USD',
      default: false,
      rateValue: 12_000n * E8,
      multiplicity: 1,
      indirect: false,
    },
  ];

  it('hujjat kursi berilsa JORIY kurs emas, o‘sha kurs ishlatiladi', async () => {
    const ctx = await loadRateContext(reader(rows), 'acc1');
    const tally = new CurrencyTally();
    // Hujjat yanvarda 11 000 kursda yozilgan; bugungi kurs 12 000.
    // $100.00 (10 000 sent) × 11 000 = 110 000 000 tiyin (120 000 000 EMAS).
    expect(consolidateToBase(10_000n, 'USD', ctx, tally, 11_000n * E8)).toBe(110_000_000n);
  });

  it('joriy kurs o‘zgarsa ham tarixiy natija O‘ZGARMAYDI (davr barqarorligi)', async () => {
    const before = await loadRateContext(reader(rows), 'acc1');
    const after = await loadRateContext(
      reader([
        rows[0]!,
        { ...rows[1]!, rateValue: 15_000n * E8 }, // kurs keskin o'zgardi
      ]),
      'acc1',
    );
    const docRate = 11_000n * E8;
    expect(consolidateToBase(10_000n, 'USD', before, new CurrencyTally(), docRate)).toBe(
      consolidateToBase(10_000n, 'USD', after, new CurrencyTally(), docRate),
    );
  });

  it('IDENTITY (1e8) hujjat kursi baza bo‘lmagan valyutada ISHONCHSIZ → joriy kursga qaytadi', async () => {
    // `rateValue` sxemada `default(100000000)` — kurs KIRITILMAGAN USD hujjat
    // ham 1e8 bo'lib turadi. Uni ko'r-ko'rona ishlatish = face-value bug'ini
    // boshqa eshikdan qaytarish (M-12 klassi). Shu sabab identity = «kurs yo'q».
    const ctx = await loadRateContext(reader(rows), 'acc1');
    expect(consolidateToBase(10_000n, 'USD', ctx, new CurrencyTally(), E8)).toBe(120_000_000n);
  });

  it('baza valyutadagi qator hujjat kursidan qat’i nazar identity qoladi', async () => {
    const ctx = await loadRateContext(reader(rows), 'acc1');
    expect(consolidateToBase(500n, 'UZS', ctx, new CurrencyTally(), 11_000n * E8)).toBe(500n);
  });
});

// ---------------------------------------------------------------------------
// Faza 17 — M-12: Currency qatori YO'Q valyuta endi jamiga QO'SHILMAYDI
// (ilgari face-value qo'shilardi ⇒ USD 1 000.00 → 1 000 so'm, ~12 000× xato).
// Pul yo'qolmaydi: alohida «konvertatsiya qilinmagan» hisobiga tushadi.
// ---------------------------------------------------------------------------
describe('consolidateToBase — noma’lum valyuta ajratiladi (M-12)', () => {
  const rows = [
    { code: 'UZS', isoCode: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false },
  ];

  it('noma’lum valyuta bazaga QO‘SHILMAYDI (0 qaytadi)', async () => {
    const ctx = await loadRateContext(reader(rows), 'acc1');
    expect(consolidateToBase(100_000n, 'USD', ctx, new CurrencyTally())).toBe(0n);
  });

  it('summa yo‘qolmaydi — tally’da valyuta bo‘yicha to‘planadi', async () => {
    const ctx = await loadRateContext(reader(rows), 'acc1');
    const tally = new CurrencyTally();
    consolidateToBase(100_000n, 'USD', ctx, tally);
    consolidateToBase(20_000n, 'USD', ctx, tally);
    consolidateToBase(5_000n, 'EUR', ctx, tally);
    expect(tally.hasUnconverted).toBe(true);
    expect(tally.unconvertedRows()).toEqual([
      { currency: 'USD', amountMinor: '120000' },
      { currency: 'EUR', amountMinor: '5000' },
    ]);
  });

  it('hujjat kursi bo‘lsa noma’lum valyuta ham konvertatsiya qilinadi (M-11 bilan birga)', async () => {
    const ctx = await loadRateContext(reader(rows), 'acc1');
    const tally = new CurrencyTally();
    // Currency jadvalida USD yo'q, lekin hujjatda kurs muzlatilgan.
    expect(consolidateToBase(10_000n, 'USD', ctx, tally, 12_000n * E8)).toBe(120_000_000n);
    expect(tally.hasUnconverted).toBe(false);
  });

  it('tally mixed/size Set bilan bir xil shartnomani saqlaydi', async () => {
    const ctx = await loadRateContext(reader(rows), 'acc1');
    const tally = new CurrencyTally();
    consolidateToBase(1_000n, 'UZS', ctx, tally);
    expect(tally.mixed).toBe(false);
    consolidateToBase(1_000n, 'USD', ctx, tally);
    expect(tally.size).toBe(2);
    expect(tally.mixed).toBe(true);
  });
});
