import { describe, expect, it } from 'vitest';
import {
  applyDiscountMinor,
  cartCount,
  cartTotalMinor,
  revenueBaseMinor,
  toMinorOrNull,
} from './cart-math';

describe('cartCount', () => {
  it('dona sonini qo`shadi', () => {
    expect(cartCount([{ quantity: 2 }, { quantity: 3 }])).toBe(5);
  });

  it('bo`sh savat 0', () => {
    expect(cartCount([])).toBe(0);
  });
});

describe('cartTotalMinor', () => {
  it('narx × miqdor yig`indisi', () => {
    expect(
      cartTotalMinor([
        { quantity: 2, priceMinor: 150_000n },
        { quantity: 1, priceMinor: 99_900n },
      ]),
    ).toBe(399_900n);
  });

  it('bo`sh savat 0n', () => {
    expect(cartTotalMinor([])).toBe(0n);
  });

  it('2^53 dan katta jamida aniq (number bo`lsa yaxlitlanardi)', () => {
    const big = 9_007_199_254_740_993n;
    expect(cartTotalMinor([{ quantity: 2, priceMinor: big }])).toBe(big * 2n);
  });
});

describe('applyDiscountMinor', () => {
  it('foizni jamidan ayiradi', () => {
    expect(applyDiscountMinor(100_000n, 10)).toBe(90_000n);
  });

  it('chegirmasiz jami o`zgarmaydi', () => {
    expect(applyDiscountMinor(100_000n, 0)).toBe(100_000n);
  });

  it('yaxlitlash PASTGA — chegirma bir tiyinga kam bo`lishi mumkin', () => {
    // 333 * 10 / 100 = 33.3 → 33. Chegirma 33, jami 300.
    // Yuqoriga yaxlitlansa mijozga har chekda bir tiyin ortiqcha ketardi
    // va smena yakunida kamomad ko'rinardi.
    expect(applyDiscountMinor(333n, 10)).toBe(300n);
  });

  it('manfiy foiz e`tiborsiz (ustama bo`lib qolmasin)', () => {
    expect(applyDiscountMinor(100_000n, -20)).toBe(100_000n);
  });

  it('100 dan katta foiz qisiladi (manfiy jami bo`lmasin)', () => {
    expect(applyDiscountMinor(100_000n, 150)).toBe(0n);
  });

  it('100% chegirma nol beradi', () => {
    expect(applyDiscountMinor(100_000n, 100)).toBe(0n);
  });

  it('kasrli foiz pastga qisqartiriladi', () => {
    expect(applyDiscountMinor(100_000n, 10.9)).toBe(90_000n);
  });

  it('NaN e`tiborsiz', () => {
    expect(applyDiscountMinor(100_000n, Number.NaN)).toBe(100_000n);
  });
});

describe('toMinorOrNull — NULL ≠ 0 shartnomasi', () => {
  it('tiyin-satrni bigint qiladi', () => {
    expect(toMinorOrNull('12345')).toBe(12_345n);
  });

  it('null va bo`sh satr → null (0 EMAS)', () => {
    // `?? 0n` bo'lsa nol tan narx «tekin tushgan» degani bo'lib,
    // savat 100% marja ko'rsatardi.
    expect(toMinorOrNull(null)).toBeNull();
    expect(toMinorOrNull(undefined)).toBeNull();
    expect(toMinorOrNull('')).toBeNull();
  });

  it('buzuq qiymat → null, otilmaydi', () => {
    expect(toMinorOrNull('12.5')).toBeNull();
    expect(toMinorOrNull('abc')).toBeNull();
  });

  it('haqiqiy nol → 0n (bu «berilmagan» EMAS)', () => {
    expect(toMinorOrNull('0')).toBe(0n);
  });
});

describe('revenueBaseMinor', () => {
  it('mavjud chek bo`lsa SERVER summasi olinadi', () => {
    // Server qator-ba-qator yaxlitlagan; biz jamiga foiz qo'llaymiz —
    // chekda ko'rinadigan raqam serverniki bo'lishi kerak.
    expect(revenueBaseMinor(499_999n, 500_000n)).toBe(499_999n);
  });

  it('yangi savatda chegirmali jami olinadi', () => {
    expect(revenueBaseMinor(null, 500_000n)).toBe(500_000n);
    expect(revenueBaseMinor(undefined, 500_000n)).toBe(500_000n);
  });

  it('server summasi 0n bo`lsa ham U olinadi (null emas)', () => {
    expect(revenueBaseMinor(0n, 500_000n)).toBe(0n);
  });
});
