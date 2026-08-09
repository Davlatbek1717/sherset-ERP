import { describe, expect, it } from 'vitest';
import {
  applyDiscountMinor,
  cartCount,
  cartTotalMinor,
  clampReturnQty,
  discountedCartTotalMinor,
  discountedLineTotalMinor,
  normalizeQtyDecimal,
  refundPayoutMinor,
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

/**
 * FE-01 (CRITICAL) — qaytariladigan naqd asl chekning CHEGIRMALI qator
 * summasidan hisoblanadi.
 *
 * Eski kod `priceMinor × qty` qilardi: 10% chegirma bilan sotilgan chekda
 * mijoz 900 000 to'lagan, kassa esa 1 000 000 qaytarardi — har chegirmali
 * qaytarishda kassa chegirma foizicha pul yo'qotardi. SALES-01 tuzatilgach
 * server bunday so'rovni umuman rad etadi (400), ya'ni bu formula
 * tuzatilmasa chegirmali chekni qaytarib BO'LMAY qoladi.
 *
 * Yaxlitlash pastga — server (`priceRefundFromOriginal`) bilan bir xil,
 * shunda FE ko'rsatgan summa server qabul qiladigan summadan oshmaydi.
 */
describe('refundPayoutMinor', () => {
  it('to`liq qaytarishda CHEGIRMALI summa (ro`yxat narxi EMAS)', () => {
    // 1 dona × 1 000 000, −10% → mijoz 900 000 to'lagan.
    expect(refundPayoutMinor([{ quantity: '1', sumMinor: '900000', returnQty: 1 }])).toBe(900_000n);
  });

  it('qisman qaytarishda proporsional', () => {
    expect(refundPayoutMinor([{ quantity: '10', sumMinor: '900000', returnQty: 3 }])).toBe(
      270_000n,
    );
  });

  it('qaytarilmayotgan qator 0 beradi', () => {
    expect(refundPayoutMinor([{ quantity: '10', sumMinor: '900000', returnQty: 0 }])).toBe(0n);
  });

  it('bir nechta qatorni qo`shadi', () => {
    expect(
      refundPayoutMinor([
        { quantity: '2', sumMinor: '200', returnQty: 1 },
        { quantity: '1', sumMinor: '500', returnQty: 1 },
      ]),
    ).toBe(600n);
  });

  it('yaxlitlash PASTGA — asl summadan oshmaydi', () => {
    // 3 dona = 100 tiyin; har dona 33.33 → 33 (34 emas).
    expect(refundPayoutMinor([{ quantity: '3', sumMinor: '100', returnQty: 1 }])).toBe(33n);
    expect(refundPayoutMinor([{ quantity: '3', sumMinor: '100', returnQty: 3 }])).toBe(100n);
  });

  it('kasr (og`irlik) miqdorda otilmaydi va to`g`ri hisoblaydi', () => {
    // BigInt(1.5) TypeError berardi (FE-02 klassi) — mikro-birlik shuni yopadi.
    expect(refundPayoutMinor([{ quantity: '1.5', sumMinor: '150', returnQty: 0.5 }])).toBe(50n);
  });

  it('nol miqdorli asl qator 0 beradi (bo`lish xatosi yo`q)', () => {
    expect(refundPayoutMinor([{ quantity: '0', sumMinor: '100', returnQty: 1 }])).toBe(0n);
  });

  it('satr ko`rinishidagi qaytarish miqdorini ham qabul qiladi', () => {
    // FE-02: maydon endi decimal SATR saqlaydi (number emas) — shartnoma
    // kengaydi, aks holda `String(number)` orqali «1e-7» kabi qiymat
    // serverga ketardi.
    expect(refundPayoutMinor([{ quantity: '1.5', sumMinor: '150', returnQty: '0.5' }])).toBe(50n);
  });
});

/**
 * FE-01 (web-arch) — retail savat jami SERVER formulasi bilan bir xil.
 *
 * Eski `BigInt(Math.round(qty * Number(priceMinor) * (1 - discount / 100)))`
 * IEEE-754 float edi; server esa `computePositionTotal` (BigInt, half-up)
 * bilan qayta hisoblab `expectedSumMinor` bilan QAT'IY tenglikni tekshiradi
 * va farq bo'lsa chekni RAD ETADI (`retail-sale.service.ts` — 400).
 */
describe('discountedLineTotalMinor', () => {
  it('chegirmali qatorda server bilan bir xil tiyin beradi', () => {
    // 115 tiyin × 1 dona, −10%:
    //   float:  Math.round(115 * 0.9) = Math.round(103.49999999999999) = 103
    //   server: roundHalfUp(103_500_000, 1e6) = 104
    // Ya'ni eski formula bilan bu chek serverda rad etilardi.
    expect(discountedLineTotalMinor({ quantity: 1, priceMinor: 115n, discount: 10 })).toBe(104n);
  });

  it('chegirmasiz qator narx × miqdor', () => {
    expect(discountedLineTotalMinor({ quantity: 3, priceMinor: 150_000n, discount: 0 })).toBe(
      450_000n,
    );
  });

  it('kasr miqdor (og`irlik) 6 xonagacha aniq', () => {
    expect(
      discountedLineTotalMinor({ quantity: '0.0004', priceMinor: 250_000n, discount: 0 }),
    ).toBe(100n);
  });

  it('2^53 dan katta narxda aniq (float yaxlitlardi)', () => {
    const big = 9_007_199_254_740_993n;
    expect(discountedLineTotalMinor({ quantity: 2, priceMinor: big, discount: 0 })).toBe(big * 2n);
  });

  it('kasrli chegirma foizi (4 xonagacha) qo`llanadi', () => {
    expect(discountedLineTotalMinor({ quantity: 1, priceMinor: 1000n, discount: 33.33 })).toBe(
      667n,
    );
  });

  it('100% chegirma nol beradi', () => {
    expect(discountedLineTotalMinor({ quantity: 2, priceMinor: 1000n, discount: 100 })).toBe(0n);
  });
});

describe('discountedCartTotalMinor', () => {
  it('qator jamilarining yig`indisi (server ham qator-ba-qator yaxlitlaydi)', () => {
    expect(
      discountedCartTotalMinor([
        { quantity: 1, priceMinor: 115n, discount: 10 },
        { quantity: 1, priceMinor: 115n, discount: 10 },
      ]),
    ).toBe(208n);
  });

  it('bo`sh savat 0n', () => {
    expect(discountedCartTotalMinor([])).toBe(0n);
  });
});

/**
 * FE-02 — qaytariladigan miqdor maydoni.
 *
 * `Record<string, number>` bo'lganda kassir kasr miqdor kirita OLMASDI:
 * «1.» yozilishi bilan `Number('1.')` = 1 bo'lib nuqta o'chib ketardi
 * (og'irlik bilan sotilgan tovarni qisman qaytarib bo'lmaydi), va
 * `String(number)` chegaraviy qiymatlarda eksponent («1e-7») berardi —
 * server sxemasi (`^\d+(\.\d{1,6})?$`) uni rad etadi.
 */
describe('clampReturnQty', () => {
  it('yozilayotgan nuqtani saqlaydi', () => {
    expect(clampReturnQty('1.', '3')).toBe('1.');
  });

  it('kasr miqdorni saqlaydi', () => {
    expect(clampReturnQty('1.5', '3')).toBe('1.5');
  });

  it('sotilgan miqdordan oshsa qisiladi', () => {
    expect(clampReturnQty('5', '3')).toBe('3');
  });

  it('kasrli chegara ham hurmat qilinadi', () => {
    expect(clampReturnQty('3.6', '3.5')).toBe('3.5');
    expect(clampReturnQty('3.5', '3.5')).toBe('3.5');
  });

  it('manfiy qiymat 0 ga qisiladi', () => {
    expect(clampReturnQty('-1', '3')).toBe('0');
  });

  it('bo`sh maydon bo`sh qoladi (0 ga majburlamaydi)', () => {
    expect(clampReturnQty('', '3')).toBe('');
  });

  it('raqam bo`lmagan kiritma qabul qilinmaydi', () => {
    expect(clampReturnQty('abc', '3')).toBe('');
    expect(clampReturnQty('1e5', '3')).toBe('');
  });
});

describe('normalizeQtyDecimal', () => {
  it('yakuniy nuqtani olib tashlaydi', () => {
    expect(normalizeQtyDecimal('1.')).toBe('1');
  });

  it('nuqtadan boshlangan kiritmani to`ldiradi', () => {
    expect(normalizeQtyDecimal('.5')).toBe('0.5');
  });

  it('boshidagi nollarni tozalaydi', () => {
    expect(normalizeQtyDecimal('0002')).toBe('2');
  });

  it('oxiridagi nollarni tozalaydi', () => {
    expect(normalizeQtyDecimal('1.5000')).toBe('1.5');
    expect(normalizeQtyDecimal('2.000')).toBe('2');
  });

  it('server chegarasi — 6 kasr xona', () => {
    // Sxema: `^\d+(\.\d{1,6})?$` — 7-xona bilan so'rov 400 bilan qaytardi.
    expect(normalizeQtyDecimal('1.1234567')).toBe('1.123456');
  });

  it('bo`sh/buzuq → «0» (eksponent serverga ketmaydi)', () => {
    expect(normalizeQtyDecimal('')).toBe('0');
    expect(normalizeQtyDecimal('abc')).toBe('0');
    expect(normalizeQtyDecimal('1e-7')).toBe('0');
  });
});
