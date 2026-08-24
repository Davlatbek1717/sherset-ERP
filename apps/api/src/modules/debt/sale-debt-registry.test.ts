import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SALE_DEBT_TERM_DAYS,
  SALE_DEBT_SOURCE_DOC_TYPE,
  planSaleDebtDelta,
  planSaleDebtRow,
  receivablePortion,
  saleDebtDueAt,
  tashkentDayKey,
} from './sale-debt-registry.js';

/**
 * Q1 — POS chekidan tug'iladigan reyestr qatorining SOF qoidalari.
 * Reja: `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md` §2.2 / §Q1.
 *
 * Modul sof — «hozir» argument, shuning uchun har qoida muzlatilgan vaqt bilan
 * tekshiriladi (soat mintaqasidan qat'i nazar bir xil natija).
 */

describe('receivablePortion — §2.2 KESISHUV QOIDASI', () => {
  // §2.2 jadvalidagi BESH qatorning har biri ALOHIDA test (reja talabi).

  it('balans 0 · chek qarzi 300k → 300k (oddiy holat)', () => {
    expect(receivablePortion(0n, 300_000n)).toBe(300_000n);
  });

  it('balans +200k · chek qarzi 300k → 300k (qarz ustiga qarz)', () => {
    expect(receivablePortion(200_000n, 300_000n)).toBe(300_000n);
  });

  it('🔴 balans −1 000k (avans) · chek qarzi 300k → 0 (qator OCHILMAYDI)', () => {
    // Invariant 4: manfiy balansdan hech qachon Debt qatori tug'ilmaydi —
    // aks holda avansi bor mijoz undirish ro'yxatiga tushib, unga
    // «qarzingizni to'lang» eslatmasi ketardi.
    expect(receivablePortion(-1_000_000n, 300_000n)).toBe(0n);
  });

  it('balans −100k · chek qarzi 300k → 200k (avans qisman qopladi)', () => {
    expect(receivablePortion(-100_000n, 300_000n)).toBe(200_000n);
  });

  it("balans null (o'lchanmagan) · chek qarzi 300k → 300k (ehtiyotkor tanlov)", () => {
    // NULL ≠ 0, lekin bu yerda ikki xatoning arzonrog'i tanlangan: ortiqcha
    // ochilgan qatorni menejer ko'radi va yopadi; ochilmagani esa egasining
    // shikoyatini qaytarardi.
    expect(receivablePortion(null, 300_000n)).toBe(300_000n);
  });

  it('avans qarzga AYNAN teng → 0 (chegara qiymati)', () => {
    expect(receivablePortion(-300_000n, 300_000n)).toBe(0n);
  });

  it('avans qarzdan 1 tiyin kichik → 1 tiyin qator', () => {
    expect(receivablePortion(-299_999n, 300_000n)).toBe(1n);
  });

  it("chekda qarz yo'q (0 yoki manfiy) → 0, balansdan qat'i nazar", () => {
    expect(receivablePortion(500_000n, 0n)).toBe(0n);
    expect(receivablePortion(null, 0n)).toBe(0n);
    expect(receivablePortion(500_000n, -1n)).toBe(0n);
  });

  it('natija hech qachon chek qarzidan katta emas (yuqori chegara)', () => {
    for (const balance of [0n, 1n, 10n, 1_000_000_000n]) {
      expect(receivablePortion(balance, 300_000n)).toBeLessThanOrEqual(300_000n);
    }
  });
});

describe('saleDebtDueAt — muddat qoidasi (NULL EMAS, Toshkent kalendar kuni)', () => {
  it('default muddat 14 kun (egasi, 2026-08-25)', () => {
    expect(DEFAULT_SALE_DEBT_TERM_DAYS).toBe(14);
    const posted = new Date('2026-08-25T10:00:00.000Z'); // Toshkent 15:00, 25-avgust
    expect(saleDebtDueAt(posted).toISOString()).toBe('2026-09-08T04:00:00.000Z');
  });

  it("natija — Toshkent 09:00 (ya'ni 04:00 UTC)", () => {
    const due = saleDebtDueAt(new Date('2026-08-25T10:00:00.000Z'), 1);
    expect(tashkentDayKey(due)).toBe('2026-08-26');
    expect(due.toISOString().slice(11)).toBe('04:00:00.000Z');
  });

  it("🔴 KALENDAR kuni — kech tunda post qilingan chek ham o'sha kunniki", () => {
    // 23:50 Toshkent (18:50 UTC) — hali 25-avgust. `ms + N*86400000` bilan
    // hisoblansa muddat 8-sentabr 23:50 bo'lardi va `overdueDaysBetween`
    // (kalendar kunida sanaydi) bilan yarim kun farq qilardi.
    const posted = new Date('2026-08-25T18:50:00.000Z');
    expect(tashkentDayKey(posted)).toBe('2026-08-25');
    expect(saleDebtDueAt(posted, 14).toISOString()).toBe('2026-09-08T04:00:00.000Z');
  });

  it('🔴 UTC kuni bilan farq qiladigan chegara: 20:00 UTC = ertasi 01:00 Toshkent', () => {
    const posted = new Date('2026-08-25T20:00:00.000Z'); // Toshkent 26-avgust 01:00
    expect(tashkentDayKey(posted)).toBe('2026-08-26');
    expect(saleDebtDueAt(posted, 14).toISOString()).toBe('2026-09-09T04:00:00.000Z');
  });

  it("oy chegarasidan o'tadi", () => {
    expect(saleDebtDueAt(new Date('2026-08-25T05:00:00.000Z'), 14).toISOString()).toBe(
      '2026-09-08T04:00:00.000Z',
    );
    expect(saleDebtDueAt(new Date('2026-01-31T05:00:00.000Z'), 1).toISOString()).toBe(
      '2026-02-01T04:00:00.000Z',
    );
  });

  it("yil chegarasidan o'tadi", () => {
    expect(saleDebtDueAt(new Date('2026-12-25T05:00:00.000Z'), 14).toISOString()).toBe(
      '2027-01-08T04:00:00.000Z',
    );
  });

  it("kabisa yilining 29-fevralini to'g'ri bosib o'tadi", () => {
    expect(saleDebtDueAt(new Date('2028-02-28T05:00:00.000Z'), 1).toISOString()).toBe(
      '2028-02-29T04:00:00.000Z',
    );
    expect(saleDebtDueAt(new Date('2028-02-28T05:00:00.000Z'), 2).toISOString()).toBe(
      '2028-03-01T04:00:00.000Z',
    );
  });

  it("termDays = 0 → o'sha kunning 09:00 i (kelajakda ham, o'tmishda ham NULL emas)", () => {
    expect(saleDebtDueAt(new Date('2026-08-25T05:00:00.000Z'), 0).toISOString()).toBe(
      '2026-08-25T04:00:00.000Z',
    );
  });

  it('yaroqsiz termDays rad etiladi (jimgina NaN sana yasamaydi)', () => {
    const posted = new Date('2026-08-25T05:00:00.000Z');
    expect(() => saleDebtDueAt(posted, -1)).toThrow(RangeError);
    expect(() => saleDebtDueAt(posted, 1.5)).toThrow(RangeError);
    expect(() => saleDebtDueAt(posted, Number.NaN)).toThrow(RangeError);
    expect(() => saleDebtDueAt(posted, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('yaroqsiz sana rad etiladi', () => {
    expect(() => saleDebtDueAt(new Date('chuchuk'), 14)).toThrow(RangeError);
  });
});

describe("planSaleDebtRow — chekdan tug'iladigan qator", () => {
  const now = new Date('2026-08-25T10:00:00.000Z');

  it("oddiy qarzga sotuv → to'liq qator, balanceAdopted, muddat NULL EMAS", () => {
    const plan = planSaleDebtRow(
      { saleName: 'CHK-2026-00042', debtAmountMinor: 300_000n, balanceBeforeMinor: 0n },
      now,
    );
    expect(plan).not.toBeNull();
    expect(plan?.totalMinor).toBe(300_000n);
    expect(plan?.balanceAdopted).toBe(true);
    expect(plan?.nextContactAt.toISOString()).toBe('2026-09-08T04:00:00.000Z');
    expect(plan?.coveredByPrepayMinor).toBe(0n);
    expect(plan?.balanceUnmeasured).toBe(false);
    // Chek raqami izohda ham, jurnal yozuvida ham ko'rinadi (Q2 talabi).
    expect(plan?.comment).toContain('CHK-2026-00042');
    expect(plan?.noteText).toContain('CHK-2026-00042');
  });

  it('🔴 avansi qarzdan katta mijoz → null (qator UMUMAN ochilmaydi)', () => {
    const plan = planSaleDebtRow(
      {
        saleName: 'CHK-2026-00043',
        debtAmountMinor: 300_000n,
        balanceBeforeMinor: -1_000_000n,
      },
      now,
    );
    expect(plan).toBeNull();
  });

  it('avans qisman qoplagan → qator FAQAT qolgan qismga, izohda qoplama qayd etiladi', () => {
    const plan = planSaleDebtRow(
      { saleName: 'CHK-2026-00044', debtAmountMinor: 300_000n, balanceBeforeMinor: -100_000n },
      now,
    );
    expect(plan?.totalMinor).toBe(200_000n);
    expect(plan?.coveredByPrepayMinor).toBe(100_000n);
    expect(plan?.noteText).toContain('AVANSIDAN');
    expect(plan?.noteText).toContain('100000');
  });

  it("balans o'lchanmagan → to'liq qator + jurnalda OCHIQ qayd", () => {
    const plan = planSaleDebtRow(
      { saleName: 'CHK-2026-00045', debtAmountMinor: 300_000n, balanceBeforeMinor: null },
      now,
    );
    expect(plan?.totalMinor).toBe(300_000n);
    expect(plan?.balanceUnmeasured).toBe(true);
    expect(plan?.noteText).toMatch(/O`LCHANMAGAN/);
  });

  it("chekda qarz yo'q (to'liq naqd) → null", () => {
    expect(
      planSaleDebtRow(
        { saleName: 'CHK-2026-00046', debtAmountMinor: 0n, balanceBeforeMinor: 0n },
        now,
      ),
    ).toBeNull();
  });

  it("termDays argumenti muddatni siljitadi (Q4 sozlamasi uchun yo'l)", () => {
    const plan = planSaleDebtRow(
      {
        saleName: 'CHK-2026-00047',
        debtAmountMinor: 300_000n,
        balanceBeforeMinor: 0n,
        termDays: 30,
      },
      now,
    );
    expect(plan?.nextContactAt.toISOString()).toBe('2026-09-24T04:00:00.000Z');
  });

  it("manba turi o'zgarmas — Q2/Q3/Q4/Q5 bir xil qiymatdan yuradi", () => {
    expect(SALE_DEBT_SOURCE_DOC_TYPE).toBe('retailsale');
  });
});

describe('planSaleDebtDelta — invariant 2 (SIMMETRIYA), Q3 uchun qoida', () => {
  it("to'liq vozvrat → qator 0 ga tushadi va YOPILADI", () => {
    const plan = planSaleDebtDelta({
      totalMinor: 300_000n,
      paidMinor: 0n,
      oldRemainingMinor: 300_000n,
      newRemainingMinor: 0n,
    });
    expect(plan.nextTotalMinor).toBe(0n);
    expect(plan.deltaMinor).toBe(-300_000n);
    expect(plan.status).toBe('paid');
    expect(plan.closed).toBe(true);
    expect(plan.clampedByPaidMinor).toBe(0n);
  });

  it('qisman vozvrat → qator kamayadi, OCHIQ qoladi', () => {
    const plan = planSaleDebtDelta({
      totalMinor: 300_000n,
      paidMinor: 0n,
      oldRemainingMinor: 300_000n,
      newRemainingMinor: 120_000n,
    });
    expect(plan.nextTotalMinor).toBe(120_000n);
    expect(plan.deltaMinor).toBe(-180_000n);
    expect(plan.status).toBe('unpaid');
    expect(plan.closed).toBe(false);
  });

  it("qisman to'langan qator qisman vozvratda `partial` bo'lib qoladi", () => {
    const plan = planSaleDebtDelta({
      totalMinor: 300_000n,
      paidMinor: 50_000n,
      oldRemainingMinor: 300_000n,
      newRemainingMinor: 120_000n,
    });
    expect(plan.nextTotalMinor).toBe(120_000n);
    expect(plan.status).toBe('partial');
    expect(plan.closed).toBe(false);
    expect(plan.clampedByPaidMinor).toBe(0n);
  });

  it("🔴 to'langan summadan pastga TUSHMAYDI — nizo ochiq qayd etiladi", () => {
    // Mijoz 200k to'lagan, keyin 250k lik tovar qaytardi: qatorni 50k ga
    // tushirish mijoz bergan real pulni yo'q qilardi. 400 emas — tekislash
    // + `DebtNote` (Q3 qoidasi).
    const plan = planSaleDebtDelta({
      totalMinor: 300_000n,
      paidMinor: 200_000n,
      oldRemainingMinor: 300_000n,
      newRemainingMinor: 50_000n,
    });
    expect(plan.nextTotalMinor).toBe(200_000n);
    expect(plan.clampedByPaidMinor).toBe(150_000n);
    expect(plan.status).toBe('paid');
    expect(plan.closed).toBe(true);
  });

  it('tahrirda qarz OSHSA qator ham oshadi (delta ikki tomonlama)', () => {
    const plan = planSaleDebtDelta({
      totalMinor: 300_000n,
      paidMinor: 0n,
      oldRemainingMinor: 300_000n,
      newRemainingMinor: 500_000n,
    });
    expect(plan.nextTotalMinor).toBe(500_000n);
    expect(plan.deltaMinor).toBe(200_000n);
    expect(plan.status).toBe('unpaid');
  });

  it('🔴 avans qoplagan qator: chek qarzidan KICHIK qator noldan pastga tushmaydi', () => {
    // §2.2 bo'yicha qator 200k tug'ilgan (chek qarzi 300k, avans 100k qopladi).
    // Chek to'liq qaytarilsa «−300k» so'raladi — qator 0 da to'xtaydi va
    // AMALDA qo'llangan harakat `deltaMinor` da halol ko'rinadi (−200k).
    const plan = planSaleDebtDelta({
      totalMinor: 200_000n,
      paidMinor: 0n,
      oldRemainingMinor: 300_000n,
      newRemainingMinor: 0n,
    });
    expect(plan.nextTotalMinor).toBe(0n);
    expect(plan.deltaMinor).toBe(-200_000n);
    expect(plan.clampedByPaidMinor).toBe(0n);
    expect(plan.closed).toBe(true);
  });

  it("o'zgarish yo'q → delta 0, qator qimirlamaydi", () => {
    const plan = planSaleDebtDelta({
      totalMinor: 300_000n,
      paidMinor: 0n,
      oldRemainingMinor: 300_000n,
      newRemainingMinor: 300_000n,
    });
    expect(plan.deltaMinor).toBe(0n);
    expect(plan.nextTotalMinor).toBe(300_000n);
  });
});
