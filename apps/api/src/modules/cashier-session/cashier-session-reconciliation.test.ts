import { describe, expect, it } from 'vitest';
import {
  type ShiftCashInputs,
  type ShiftUsdCashInputs,
  expectedCashMinor,
  expectedUsdCashMinor,
  shiftDiscrepancyMinor,
  shiftUsdDiscrepancyMinor,
} from './cashier-session-reconciliation.js';

const base: ShiftCashInputs = {
  openingCashMinor: 0n,
  salesCashMinor: 0n,
  drawerInMinor: 0n,
  drawerOutMinor: 0n,
  returnsCashMinor: 0n,
};

describe('expectedCashMinor — formula correctness', () => {
  it('opening + salesCash + drawerIn − drawerOut − returnsCash', () => {
    expect(
      expectedCashMinor({
        openingCashMinor: 500_00n,
        salesCashMinor: 1_200_00n,
        drawerInMinor: 300_00n,
        drawerOutMinor: 150_00n,
        returnsCashMinor: 80_00n,
      }),
    ).toBe(500_00n + 1_200_00n + 300_00n - 150_00n - 80_00n);
  });

  it('all zero → 0', () => {
    expect(expectedCashMinor(base)).toBe(0n);
  });
});

describe('§100 bug-fix invariant #1 — drawer in/out exactness', () => {
  it('drawerIn raises expected by EXACTLY drawerIn', () => {
    const without = expectedCashMinor({ ...base, openingCashMinor: 100_00n });
    const withIn = expectedCashMinor({
      ...base,
      openingCashMinor: 100_00n,
      drawerInMinor: 47_53n,
    });
    expect(withIn - without).toBe(47_53n);
  });

  it('drawerOut lowers expected by EXACTLY drawerOut', () => {
    const without = expectedCashMinor({ ...base, openingCashMinor: 100_00n });
    const withOut = expectedCashMinor({
      ...base,
      openingCashMinor: 100_00n,
      drawerOutMinor: 63_21n,
    });
    expect(without - withOut).toBe(63_21n);
  });
});

describe('invariant #2 — drawer=0 byte-identical to the OLD formula (zero regression)', () => {
  it('reduces to opening + sales − returns when no drawer ops', () => {
    const cases: Array<[bigint, bigint, bigint]> = [
      [0n, 0n, 0n],
      [500_00n, 1_000_00n, 75_00n],
      [10n, 999_999_99n, 1n],
    ];
    for (const [opening, sales, returns] of cases) {
      expect(
        expectedCashMinor({
          ...base,
          openingCashMinor: opening,
          salesCashMinor: sales,
          returnsCashMinor: returns,
        }),
      ).toBe(opening + sales - returns); // the pre-§100 formula
    }
  });
});

describe('shiftDiscrepancyMinor — invariant #3 (sign + exactness)', () => {
  it('closing − expected; positive = surplus', () => {
    const i: ShiftCashInputs = { ...base, openingCashMinor: 100_00n, salesCashMinor: 50_00n };
    expect(shiftDiscrepancyMinor(160_00n, i)).toBe(10_00n); // surplus
    expect(shiftDiscrepancyMinor(150_00n, i)).toBe(0n); // exact
    expect(shiftDiscrepancyMinor(140_00n, i)).toBe(-10_00n); // shortage
  });

  it('drawer ops feed through to discrepancy exactly', () => {
    // expected = 100 + 0 + 30 − 20 − 0 = 110; closing 105 ⇒ −5 shortage
    expect(
      shiftDiscrepancyMinor(105_00n, {
        ...base,
        openingCashMinor: 100_00n,
        drawerInMinor: 30_00n,
        drawerOutMinor: 20_00n,
      }),
    ).toBe(-5_00n);
  });
});

describe('invariant #4 — BigInt exactness + no clamping', () => {
  it('exact past Number.MAX_SAFE_INTEGER', () => {
    const big = 9_007_199_254_740_993n; // 2^53 + 1
    expect(expectedCashMinor({ ...base, openingCashMinor: big, salesCashMinor: big })).toBe(
      big * 2n,
    );
  });

  it('over-withdrawal yields a NEGATIVE expected (must NOT clamp to 0)', () => {
    expect(expectedCashMinor({ ...base, openingCashMinor: 50_00n, drawerOutMinor: 200_00n })).toBe(
      -150_00n,
    );
  });

  it('returns exceeding takings → negative expected, exact', () => {
    expect(expectedCashMinor({ ...base, salesCashMinor: 100n, returnsCashMinor: 500n })).toBe(
      -400n,
    );
  });
});

describe('naqd qarz to`lovlari (kassa TZ §8.4)', () => {
  const base = {
    openingCashMinor: 100_000n,
    salesCashMinor: 500_000n,
    drawerInMinor: 0n,
    drawerOutMinor: 0n,
    returnsCashMinor: 0n,
  };

  it('qarz to`lovi kutilgan naqdni AYNAN shuncha oshiradi', () => {
    // Busiz kassir qabul qilgan qarz puli yashiqda turadi-yu, kutilganda
    // ko'rinmaydi → smena har safar shu summaga ORTIQCHA chiqardi.
    const without = expectedCashMinor(base);
    const with_ = expectedCashMinor({ ...base, debtCashMinor: 250_000n });
    expect(with_ - without).toBe(250_000n);
  });

  it('maydon berilmasa eski formula BAYT-BA-BAYT saqlanadi (regressiya yo`q)', () => {
    expect(expectedCashMinor(base)).toBe(expectedCashMinor({ ...base, debtCashMinor: 0n }));
    expect(expectedCashMinor(base)).toBe(600_000n);
  });

  it('farq hisobiga ham to`g`ri kiradi', () => {
    // Kassir 850 000 sanadi: 100k ochilish + 500k sotuv + 250k qarz = 850k.
    const inputs = { ...base, debtCashMinor: 250_000n };
    expect(shiftDiscrepancyMinor(850_000n, inputs)).toBe(0n);
    // Qarz to'lovi hisobga olinmasa 250 000 «ortiqcha» ko'rinardi.
    expect(shiftDiscrepancyMinor(850_000n, base)).toBe(250_000n);
  });

  it('2^53 dan katta summada ham aniq', () => {
    const big = 9_007_199_254_740_993n;
    expect(expectedCashMinor({ ...base, debtCashMinor: big })).toBe(600_000n + big);
  });
});

/**
 * MK31 — dollar naqd (kassa TZ §8.4: «USD farqi alohida yuritiladi,
 * UZS'ga o'girilmaydi»).
 *
 * Dollar hisobi ATAYLAB alohida funksiya: so'm formulasiga `usd*` maydonlar
 * qo'shilsa, bitta noto'g'ri chaqiruv dollarni so'm jamiga qo'shib yuborardi
 * — va typecheck buni ko'rmasdi (ikkalasi ham `bigint`).
 */
describe('expectedUsdCashMinor — dollar naqd (§8.4)', () => {
  const usdBase: ShiftUsdCashInputs = {
    openingUsdMinor: 0n,
    salesUsdMinor: 0n,
    returnsUsdMinor: 0n,
  };

  it('ochilish + dollar sotuvlar − dollar qaytarishlar', () => {
    expect(
      expectedUsdCashMinor({
        openingUsdMinor: 50_00n,
        salesUsdMinor: 120_00n,
        returnsUsdMinor: 20_00n,
      }),
    ).toBe(150_00n);
  });

  it('dollar oqimi yo`q smenada 0 (mavjud smenalar uchun o`zgarish yo`q)', () => {
    expect(expectedUsdCashMinor(usdBase)).toBe(0n);
  });

  it('farq = sanalgan − kutilgan, ishora saqlanadi', () => {
    const i = { ...usdBase, openingUsdMinor: 100_00n, salesUsdMinor: 50_00n };
    expect(shiftUsdDiscrepancyMinor(150_00n, i)).toBe(0n);
    expect(shiftUsdDiscrepancyMinor(140_00n, i)).toBe(-10_00n); // kamomad
    expect(shiftUsdDiscrepancyMinor(160_00n, i)).toBe(10_00n); // ortiqcha
  });

  it('dollar SENTDA qoladi — so`m formulasi bilan aralashmaydi', () => {
    // Bir xil raqamlar ikki formulaga berilsa, natijalar bir-biriga
    // BOG'LIQ EMAS: dollar so'm kutilganiga hech qachon qo'shilmaydi.
    const som = expectedCashMinor({ ...base, salesCashMinor: 1_000n });
    const usd = expectedUsdCashMinor({ ...usdBase, salesUsdMinor: 1_000n });
    expect(som).toBe(1_000n);
    expect(usd).toBe(1_000n);
    // ...va so'm formulasida dollarni ifodalovchi maydon YO'Q.
    expect(Object.keys(base)).not.toContain('salesUsdMinor');
  });

  it('2^53 dan katta summada ham aniq', () => {
    const big = 9_007_199_254_740_993n;
    expect(expectedUsdCashMinor({ ...usdBase, salesUsdMinor: big })).toBe(big);
  });
});
