import { describe, expect, it } from 'vitest';
import type { CurrencyRate } from '../../currency/currency-convert.js';
import { DATA_QUALITY } from '../../report/metrics/index.js';
import type { RateContext } from '../../report/report-rate-ctx.util.js';
import {
  MONEY_MAP_BLOCK_KEYS,
  MONEY_MAP_DIRECTION,
  type MoneyMapSourceReading,
  buildMoneyMapBlock,
  summarizeMoneyMap,
} from './money-map.js';

/** Kurs ×10^8 (DB-01) — 1 USD = 12 500 UZS. */
const USD_RATE: CurrencyRate = {
  rateValue: 12_500n * 100_000_000n,
  multiplicity: 1n,
  indirect: false,
};

function ctx(withUsd = true): RateContext {
  const rates = new Map<string, CurrencyRate>();
  if (withUsd) rates.set('USD', USD_RATE);
  return { baseCode: 'UZS', rates };
}

function reading(over: Partial<MoneyMapSourceReading> = {}): MoneyMapSourceReading {
  return {
    key: 'cash',
    source: 'CashDeskService.balancesByCurrency',
    amounts: [{ currency: 'UZS', amountMinor: 1_000_00n }],
    sourceComplete: true,
    ...over,
  };
}

describe('MONEY_MAP_DIRECTION', () => {
  it('har blok uchun yo‘nalish bor (aktiv/passiv) — yangi blok jimgina qo‘shilmaydi', () => {
    for (const key of MONEY_MAP_BLOCK_KEYS) {
      expect(MONEY_MAP_DIRECTION[key]).toMatch(/^(asset|liability)$/);
    }
  });

  it('ta’minotchi qarzi — YAGONA passiv blok', () => {
    const liabilities = MONEY_MAP_BLOCK_KEYS.filter((k) => MONEY_MAP_DIRECTION[k] === 'liability');
    expect(liabilities).toEqual(['supplier_debt']);
  });
});

describe('buildMoneyMapBlock — NULL ≠ 0 shartnomasi', () => {
  it('manba javob bermasa: amountMinor null, «hisoblanmadi»', () => {
    const b = buildMoneyMapBlock(reading({ amounts: null }), ctx());
    expect(b.amountMinor).toBeNull();
    expect(b.quality).toBe(DATA_QUALITY.uncollected);
  });

  it('manba o‘lchandi va haqiqatan bo‘sh: amountMinor «0», «to‘liq» — null EMAS', () => {
    const b = buildMoneyMapBlock(reading({ amounts: [] }), ctx());
    expect(b.amountMinor).toBe('0');
    expect(b.quality).toBe(DATA_QUALITY.complete);
  });

  it('manba chala (backfill yo‘q): o‘lchandi, lekin «qisman»', () => {
    const b = buildMoneyMapBlock(reading({ sourceComplete: false }), ctx());
    expect(b.amountMinor).toBe('100000');
    expect(b.quality).toBe(DATA_QUALITY.partial);
  });
});

describe('buildMoneyMapBlock — kurs shartnomasi (M-12)', () => {
  it('kursi bor valyuta bazaga konvertatsiya qilinadi va jamiga kiradi', () => {
    const b = buildMoneyMapBlock(
      reading({
        amounts: [
          { currency: 'UZS', amountMinor: 1_000_00n },
          { currency: 'USD', amountMinor: 100_00n },
        ],
      }),
      ctx(),
    );
    // 100.00 USD × 12 500 = 1 250 000.00 UZS = 125_000_000 tiyin
    expect(b.amountMinor).toBe(String(1_000_00n + 125_000_000n));
    expect(b.unconvertedByCurrency).toEqual([]);
    expect(b.mixedCurrency).toBe(true);
    expect(b.quality).toBe(DATA_QUALITY.complete);
  });

  it('kursi YO‘Q valyuta jamiga QO‘SHILMAYDI — alohida qatorda chiqadi', () => {
    const b = buildMoneyMapBlock(
      reading({
        amounts: [
          { currency: 'UZS', amountMinor: 1_000_00n },
          { currency: 'USD', amountMinor: 100_00n },
        ],
      }),
      ctx(false),
    );
    expect(b.amountMinor).toBe('100000'); // faqat UZS — face-value qo‘shilmadi
    expect(b.unconvertedByCurrency).toEqual([{ currency: 'USD', amountMinor: '10000' }]);
  });

  it('konvertatsiya qilinmagan qoldiq blokni «qisman» qiladi', () => {
    const b = buildMoneyMapBlock(
      reading({
        amounts: [
          { currency: 'UZS', amountMinor: 1_000_00n },
          { currency: 'USD', amountMinor: 100_00n },
        ],
      }),
      ctx(false),
    );
    expect(b.quality).toBe(DATA_QUALITY.partial);
  });

  it('bitta valyuta — mixedCurrency false', () => {
    const b = buildMoneyMapBlock(reading(), ctx());
    expect(b.mixedCurrency).toBe(false);
  });
});

describe('buildMoneyMapBlock — manba O‘ZI konsolidatsiya qilgan holat', () => {
  // Kontragent qarzi hisoboti summalarni O'ZI bazaga o'tkazadi va o'zining
  // «konvertatsiya qilinmagan» qatorini qaytaradi. Panel uni qayta hisoblamaydi
  // — faqat olib o'tadi, aks holda ikkinchi konvertatsiya paydo bo'lardi.
  it('manbaning konvertatsiya qilinmagan qoldig‘i blokka O‘TADI', () => {
    const b = buildMoneyMapBlock(
      reading({
        key: 'customer_debt',
        amounts: [{ currency: 'UZS', amountMinor: 500n }],
        unconverted: [{ currency: 'USD', amountMinor: '700' }],
      }),
      ctx(),
    );
    expect(b.amountMinor).toBe('500');
    expect(b.unconvertedByCurrency).toEqual([{ currency: 'USD', amountMinor: '700' }]);
  });

  it('manbaning konvertatsiya qilinmagan qoldig‘i blokni «qisman» qiladi', () => {
    const b = buildMoneyMapBlock(
      reading({ unconverted: [{ currency: 'USD', amountMinor: '700' }] }),
      ctx(),
    );
    expect(b.quality).toBe(DATA_QUALITY.partial);
  });

  it('manbaning konvertatsiya qilinmagan valyutasi mixedCurrency ni yoqadi', () => {
    const b = buildMoneyMapBlock(
      reading({ unconverted: [{ currency: 'USD', amountMinor: '700' }] }),
      ctx(),
    );
    expect(b.mixedCurrency).toBe(true);
  });

  it('manba javob bermagan bo‘lsa unconverted ham qaytmaydi', () => {
    const b = buildMoneyMapBlock(
      reading({ amounts: null, unconverted: [{ currency: 'USD', amountMinor: '700' }] }),
      ctx(),
    );
    expect(b.amountMinor).toBeNull();
    expect(b.unconvertedByCurrency).toEqual([]);
  });
});

describe('summarizeMoneyMap — sof qoldiq', () => {
  const full = (): MoneyMapSourceReading[] =>
    MONEY_MAP_BLOCK_KEYS.map((key) => ({
      key,
      source: `stub:${key}`,
      amounts: [{ currency: 'UZS', amountMinor: 1_000n }],
      sourceComplete: true,
    }));

  it('passiv blok ayiriladi, aktivlar qo‘shiladi', () => {
    const blocks = full().map((r) => buildMoneyMapBlock(r, ctx()));
    // 5 aktiv × 1000 − 1 passiv × 1000 = 4000
    expect(summarizeMoneyMap(blocks, 'UZS').netMinor).toBe('4000');
  });

  it('bitta blok o‘lchanmagan bo‘lsa — sof qoldiq NULL (yarim yig‘indi berilmaydi)', () => {
    const readings = full();
    readings[0] = { ...readings[0], amounts: null };
    const blocks = readings.map((r) => buildMoneyMapBlock(r, ctx()));
    const s = summarizeMoneyMap(blocks, 'UZS');
    expect(s.netMinor).toBeNull();
    expect(s.quality).toBe(DATA_QUALITY.partial);
  });

  it('hamma blok o‘lchanmagan — «yig‘ilmagan»', () => {
    const blocks = full().map((r) => buildMoneyMapBlock({ ...r, amounts: null }, ctx()));
    const s = summarizeMoneyMap(blocks, 'UZS');
    expect(s.netMinor).toBeNull();
    expect(s.quality).toBe(DATA_QUALITY.uncollected);
  });

  it('konvertatsiya qilinmagan qoldiq bloklardan yig‘iladi (valyuta bo‘yicha)', () => {
    const readings = full().map((r) => ({
      ...r,
      amounts: [{ currency: 'USD', amountMinor: 5_00n }],
    }));
    const blocks = readings.map((r) => buildMoneyMapBlock(r, ctx(false)));
    const s = summarizeMoneyMap(blocks, 'UZS');
    expect(s.unconvertedByCurrency).toEqual([{ currency: 'USD', amountMinor: '3000' }]);
    // Hech biri bazaga tushmadi ⇒ sof qoldiq 0, lekin «qisman» bayrog‘i bilan
    expect(s.netMinor).toBe('0');
    expect(s.quality).toBe(DATA_QUALITY.partial);
  });

  it('valyuta — bazaning kodi', () => {
    const blocks = full().map((r) => buildMoneyMapBlock(r, ctx()));
    expect(summarizeMoneyMap(blocks, 'UZS').currency).toBe('UZS');
  });
});
