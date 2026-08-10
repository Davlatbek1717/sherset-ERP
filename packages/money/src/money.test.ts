import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ExchangeRate, RATE_SCALE, convertByRateE8 } from './exchange-rate.js';
import { Money } from './money.js';

describe('Money — construction', () => {
  it('fromMinor: bigint', () => {
    const m = Money.fromMinor(150_050n, 'UZS');
    expect(m.toMinor()).toBe(150_050n);
    expect(m.currency.code).toBe('UZS');
  });

  it('fromMajor: "15 000,50" (UZ format)', () => {
    const m = Money.fromMajor('15 000,50', 'UZS');
    expect(m.toMinor()).toBe(1_500_050n);
  });

  it('fromMajor: "15,000.50" (US format)', () => {
    const m = Money.fromMajor('15,000.50', 'USD');
    expect(m.toMinor()).toBe(1_500_050n);
  });

  it('fromMajor: "15000" (no decimal)', () => {
    const m = Money.fromMajor('15000', 'UZS');
    expect(m.toMinor()).toBe(1_500_000n);
  });

  it('fromMajor: rounds half-even by default', () => {
    expect(Money.fromMajor('0.125', 'USD').toMinor()).toBe(12n); // 0.125 → 0.12 (banker's)
    expect(Money.fromMajor('0.135', 'USD').toMinor()).toBe(14n); // 0.135 → 0.14 (banker's)
  });

  it('fromMajor: negative', () => {
    expect(Money.fromMajor('-1000', 'UZS').toMinor()).toBe(-100_000n);
  });

  it("fromMajor: JPY has 0 minor units (banker's rounding default)", () => {
    expect(Money.fromMajor('1000', 'JPY').toMinor()).toBe(1000n);
    // Default is half-even (banker's): 1000.5 → 1000 (even), 1001.5 → 1002 (even)
    expect(Money.fromMajor('1000.5', 'JPY').toMinor()).toBe(1000n);
    expect(Money.fromMajor('1001.5', 'JPY').toMinor()).toBe(1002n);
    expect(Money.fromMajor('1000.6', 'JPY').toMinor()).toBe(1001n);
    // Explicit half-up rounds all .5 up
    expect(Money.fromMajor('1000.5', 'JPY', 'half-up').toMinor()).toBe(1001n);
  });

  it('zero', () => {
    expect(Money.zero('UZS').toMinor()).toBe(0n);
    expect(Money.zero('UZS').isZero()).toBe(true);
  });
});

describe('Money — arithmetic', () => {
  it('plus: 0.1 + 0.2 === 0.3 (the classic)', () => {
    const a = Money.fromMajor('0.1', 'USD');
    const b = Money.fromMajor('0.2', 'USD');
    const sum = a.plus(b);
    expect(sum.toMinor()).toBe(30n);
    expect(sum.toMajor()).toBe('0.30');
  });

  it('plus: currency mismatch throws', () => {
    const uzs = Money.fromMinor(100n, 'UZS');
    const usd = Money.fromMinor(100n, 'USD');
    expect(() => uzs.plus(usd)).toThrow(/Currency mismatch/);
  });

  it('minus', () => {
    const a = Money.fromMinor(1000n, 'UZS');
    const b = Money.fromMinor(300n, 'UZS');
    expect(a.minus(b).toMinor()).toBe(700n);
  });

  it('times: integer quantity', () => {
    const price = Money.fromMajor('150.00', 'UZS');
    expect(price.times(3).toMajor()).toBe('450.00');
  });

  it('times: throws on non-integer', () => {
    const price = Money.fromMajor('150', 'UZS');
    // @ts-expect-error — should throw
    expect(() => price.times(1.5)).toThrow(/must be integer/);
  });

  it('percent: VAT 12%', () => {
    const subtotal = Money.fromMajor('1000.00', 'UZS');
    const vat = subtotal.percent(0.12);
    expect(vat.toMajor()).toBe('120.00');
  });

  it('percent: cascade discount + VAT', () => {
    const price = Money.fromMajor('1000.00', 'UZS');
    const afterDiscount = price.minus(price.percent(0.1)); // 10% off → 900
    const withVat = afterDiscount.plus(afterDiscount.percent(0.12)); // +12% VAT
    expect(afterDiscount.toMajor()).toBe('900.00');
    expect(withVat.toMajor()).toBe('1008.00');
  });

  it('split: 100 into 3 distributes remainder', () => {
    const total = Money.fromMinor(100n, 'UZS');
    const parts = total.split(3);
    expect(parts.map((p) => p.toMinor())).toEqual([34n, 33n, 33n]);
    expect(parts.reduce((acc, p) => acc.plus(p), Money.zero('UZS')).toMinor()).toBe(100n);
  });

  it('negate / abs', () => {
    const m = Money.fromMinor(-500n, 'UZS');
    expect(m.negate().toMinor()).toBe(500n);
    expect(m.abs().toMinor()).toBe(500n);
  });
});

describe('Money — comparison', () => {
  it('equals', () => {
    expect(Money.fromMinor(100n, 'UZS').equals(Money.fromMinor(100n, 'UZS'))).toBe(true);
    expect(Money.fromMinor(100n, 'UZS').equals(Money.fromMinor(100n, 'USD'))).toBe(false);
    expect(Money.fromMinor(100n, 'UZS').equals(Money.fromMinor(101n, 'UZS'))).toBe(false);
  });

  it('greaterThan / lessThan', () => {
    const a = Money.fromMinor(100n, 'UZS');
    const b = Money.fromMinor(200n, 'UZS');
    expect(a.lessThan(b)).toBe(true);
    expect(b.greaterThan(a)).toBe(true);
  });
});

describe('Money — formatting', () => {
  it('format UZ: "15 000,50 so\'m"', () => {
    const m = Money.fromMajor('15000.50', 'UZS');
    expect(m.format('uz')).toBe("15 000,50 so'm");
  });

  it('format EN for USD: "$15,000.50"', () => {
    const m = Money.fromMajor('15000.50', 'USD');
    expect(m.format('en')).toBe('$15,000.50');
  });

  it('format JPY (0 minor units)', () => {
    const m = Money.fromMajor('1500', 'JPY');
    expect(m.format('en')).toBe('¥1,500');
  });
});

describe('Money — serialization', () => {
  it('JSON roundtrip', () => {
    const m = Money.fromMajor('15 000,50', 'UZS');
    const json = m.toJSON();
    expect(json).toEqual({ minor: '1500050', currency: 'UZS' });
    const restored = Money.fromJSON(json);
    expect(restored.equals(m)).toBe(true);
  });

  it('toMajor / toMinor', () => {
    const m = Money.fromMajor('1234567.89', 'USD');
    expect(m.toMajor()).toBe('1234567.89');
    expect(m.toMinor()).toBe(123_456_789n);
  });
});

describe('Money — property tests (invariants)', () => {
  it('plus is commutative', () => {
    fc.assert(
      fc.property(
        fc.bigInt(-1_000_000_000n, 1_000_000_000n),
        fc.bigInt(-1_000_000_000n, 1_000_000_000n),
        (a, b) => {
          const ma = Money.fromMinor(a, 'UZS');
          const mb = Money.fromMinor(b, 'UZS');
          return ma.plus(mb).equals(mb.plus(ma));
        },
      ),
    );
  });

  it('plus is associative', () => {
    fc.assert(
      fc.property(
        fc.bigInt(-1_000_000_000n, 1_000_000_000n),
        fc.bigInt(-1_000_000_000n, 1_000_000_000n),
        fc.bigInt(-1_000_000_000n, 1_000_000_000n),
        (a, b, c) => {
          const ma = Money.fromMinor(a, 'UZS');
          const mb = Money.fromMinor(b, 'UZS');
          const mc = Money.fromMinor(c, 'UZS');
          return ma
            .plus(mb)
            .plus(mc)
            .equals(ma.plus(mb.plus(mc)));
        },
      ),
    );
  });

  it('zero is identity for plus', () => {
    fc.assert(
      fc.property(fc.bigInt(-1_000_000_000n, 1_000_000_000n), (x) => {
        const m = Money.fromMinor(x, 'UZS');
        const zero = Money.zero('UZS');
        return m.plus(zero).equals(m) && zero.plus(m).equals(m);
      }),
    );
  });

  it('minus cancels plus', () => {
    fc.assert(
      fc.property(
        fc.bigInt(-1_000_000n, 1_000_000n),
        fc.bigInt(-1_000_000n, 1_000_000n),
        (a, b) => {
          const ma = Money.fromMinor(a, 'UZS');
          const mb = Money.fromMinor(b, 'UZS');
          return ma.plus(mb).minus(mb).equals(ma);
        },
      ),
    );
  });

  it('split sums back to original', () => {
    fc.assert(
      fc.property(fc.bigInt(0n, 1_000_000n), fc.integer({ min: 1, max: 100 }), (amount, parts) => {
        const m = Money.fromMinor(amount, 'UZS');
        const split = m.split(parts);
        const sum = split.reduce((acc, p) => acc.plus(p), Money.zero('UZS'));
        return sum.equals(m);
      }),
    );
  });

  it('toMajor/fromMajor roundtrip preserves value', () => {
    fc.assert(
      fc.property(fc.bigInt(0n, 1_000_000_000n), (x) => {
        const m = Money.fromMinor(x, 'UZS');
        const restored = Money.fromMajor(m.toMajor(), 'UZS');
        return restored.equals(m);
      }),
    );
  });

  it('JSON roundtrip is idempotent', () => {
    fc.assert(
      fc.property(
        fc.bigInt(-1_000_000_000n, 1_000_000_000n),
        fc.constantFrom('UZS', 'USD', 'RUB', 'JPY'),
        (x, c) => {
          const m = Money.fromMinor(x, c);
          const r = Money.fromJSON(m.toJSON());
          return r.equals(m);
        },
      ),
    );
  });
});

describe('ExchangeRate', () => {
  // DB-01 (Faza 16): kanonik rate-masshtab — ×10^8, Currency.rateValue va
  // DebtPayment.exchangeRate bilan BIR XIL. ×10^9 emas (eski divergensiya).
  it('kanonik masshtab ×10^8 — RATE_SCALE Currency.rateValue bilan mos', () => {
    expect(RATE_SCALE).toBe(100_000_000n);
    const rate = ExchangeRate.fromRatio('USD', 'UZS', 12_450.27);
    expect(rate.multiplier).toBe(1_245_027_000_000n); // 12 450.27 × 1e8
  });

  it('converts UZS to USD', () => {
    // 1 USD = 12 450 UZS → we want 1 UZS = 1/12450 USD
    const rate = ExchangeRate.fromRatio('USD', 'UZS', 12_450);
    const usd = Money.fromMajor('100', 'USD'); // 100.00 USD = 10_000 minor
    const uzs = rate.convert(usd);
    // 10_000 × (12 450 × 1e8) / 1e8 = 124_500_000 minor UZS
    expect(uzs.toMinor()).toBe(124_500_000n);
  });

  it('inverse', () => {
    const rate = ExchangeRate.fromRatio('USD', 'UZS', 12_000);
    const inv = rate.inverse();
    expect(inv.from).toBe('UZS');
    expect(inv.to).toBe('USD');
  });

  it('JSON roundtrip', () => {
    const rate = ExchangeRate.fromRatio('USD', 'UZS', 12_345.678, new Date('2026-04-17T10:00:00Z'));
    const json = rate.toJSON();
    const restored = ExchangeRate.fromJSON(json);
    expect(restored.from).toBe('USD');
    expect(restored.to).toBe('UZS');
    expect(restored.multiplier).toBe(rate.multiplier);
  });
});

/**
 * F5 (MK31) — kanonik kurs bo'yicha o'girish YAGONA formula sifatida.
 *
 * NEGA PAKETDA: bu formulani server (`retail-tenders.ts` → `usdBaseMinor`,
 * `debt.schema.ts` → `usdCentsToSomTiyin`) ham, kassa ekrani ham (dollar
 * to'lovining so'm ekvivalentini KO'RSATISH uchun) ishlatadi. Har biri o'z
 * nusxasini saqlaganda biri jimgina eskirib pulni boshqa masshtabda
 * hisoblardi — xotira: «nusxa-ko'chirish bitta shoxni yo'qotadi».
 */
describe('convertByRateE8', () => {
  it('sentni kanonik kurs bilan tiyinga o‘giradi', () => {
    // $12.50 × 12 450,27 = 155 628,375 so'm → 15 562 837 tiyin (pastga).
    expect(convertByRateE8(1250n, 1_245_027_000_000n)).toBe(15_562_837n);
  });

  it('yaxlitlash PASTGA — server bilan bir xil (bigint bo‘linishi)', () => {
    expect(convertByRateE8(1n, 150_000_000n)).toBe(1n); // 1.5 → 1
  });

  it('kurs 1 (identity) qiymatni o‘zgartirmaydi', () => {
    expect(convertByRateE8(99_999n, RATE_SCALE)).toBe(99_999n);
  });

  it('nol summa — nol', () => {
    expect(convertByRateE8(0n, 1_245_027_000_000n)).toBe(0n);
  });
});
