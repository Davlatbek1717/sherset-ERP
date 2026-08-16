import { describe, expect, it } from 'vitest';
import {
  CASHIER_EVENT,
  planCancelAuditEvent,
  planOutOfScheduleAuditEvent,
  planRefundAuditEvent,
  planSaleAuditEvents,
} from './cashier-audit.js';

/**
 * Kassa TZ §9 — the control half of «trust the cashier».
 *
 * What these tests protect, worst-first:
 *   1. a freedom that WAS used always leaves a trace (no silent below-cost sale);
 *   2. an unknown price raises NOTHING — a log full of false alarms gets
 *      ignored, which is the same as having no log;
 *   3. the loss amount is right, including fractional quantities.
 */

const SALE = 'sale-1';

function lineOf(over: Partial<Parameters<typeof planSaleAuditEvents>[1][number]> = {}) {
  return {
    productId: 'p1',
    productName: 'Tovar',
    quantity: '1',
    priceMinor: 3_600_000n,
    costMinor: 2_480_000n,
    basePriceMinor: 3_600_000n,
    wholesaleMinor: 2_800_000n,
    ...over,
  };
}

describe('planSaleAuditEvents — narx erkinligi izi', () => {
  it('kartochka narxida sotilsa HECH NARSA yozmaydi', () => {
    // Har sotuvni hodisa qilish — jurnalni shovqinga aylantiradi.
    expect(planSaleAuditEvents(SALE, [lineOf()])).toEqual([]);
  });

  it('narx tushirilsa PRICE_CHANGED + farq + foiz yozadi', () => {
    const [e] = planSaleAuditEvents(SALE, [lineOf({ priceMinor: 3_240_000n })]);
    expect(e?.type).toBe(CASHIER_EVENT.priceChanged);
    expect(e?.docId).toBe(SALE);
    expect(e?.payload).toMatchObject({
      productId: 'p1',
      priceMinor: '3240000',
      basePriceMinor: '3600000',
      diffMinor: '-360000',
      discountPercent: 10,
    });
  });

  it('narx OSHIRILSA ham yozadi — bu ham narx ro`yxatini bekor qilish', () => {
    const [e] = planSaleAuditEvents(SALE, [lineOf({ priceMinor: 4_000_000n })]);
    expect(e?.type).toBe(CASHIER_EVENT.priceChanged);
    expect(e?.payload).toMatchObject({ diffMinor: '400000', discountPercent: -11.1 });
  });

  /**
   * 🔴 PRODDA UZILISH (2026-08-16): kassirlar chek yopganda 500 —
   * «Division by zero». Sabab shu yerda edi: qo'riqchi `basePriceMinor` ni
   * faqat `null` ga tekshirardi, `0n` ga EMAS. Kartada chakana narxi
   * QO'YILMAGAN tovar (prodda o'lchangan: 488 ta) 0n bilan keladi va
   * `diff / 0n` BigInt bo'linishi `RangeError: Division by zero` otadi —
   * chek POST bo'lmaydi, kassa to'xtaydi.
   *
   * Nolga nisbatan «necha foiz past» degan savolning javobi YO'Q, shuning
   * uchun foiz maydoni TUSHIRIB QOLDIRILADI (0 yozish «chegirma yo'q» degan
   * yolg'on bo'lardi). Hodisaning o'zi yoziladi: `diffMinor` — menejer
   * hisoboti aynan shuni o'qiydi (`daily-kpi-drilldown.service.ts`).
   */
  it('🔴 kartada narx 0 — chek YIQILMAYDI, foiz esa yozilmaydi', () => {
    const events = planSaleAuditEvents(SALE, [lineOf({ basePriceMinor: 0n, priceMinor: 50_000n })]);
    const e = events.find((x) => x.type === CASHIER_EVENT.priceChanged);
    expect(e?.payload).toMatchObject({ basePriceMinor: '0', diffMinor: '50000' });
    expect(e?.payload).not.toHaveProperty('discountPercent');
  });

  it('kartada narx 0 va kassir ham 0 qo`ysa — hodisa umuman yo`q', () => {
    const events = planSaleAuditEvents(SALE, [
      lineOf({ basePriceMinor: 0n, priceMinor: 0n, costMinor: null, wholesaleMinor: null }),
    ]);
    expect(events).toEqual([]);
  });

  it('optomdan past sotilsa SOLD_BELOW_WHOLESALE va qancha pastligini yozadi', () => {
    const events = planSaleAuditEvents(SALE, [lineOf({ priceMinor: 2_700_000n })]);
    const e = events.find((x) => x.type === CASHIER_EVENT.soldBelowWholesale);
    expect(e?.payload).toMatchObject({ wholesaleMinor: '2800000', belowByMinor: '100000' });
  });

  it('tan narxdan past sotilsa ZARAR summasi bilan yozadi (Q16 — bloklanmaydi)', () => {
    const events = planSaleAuditEvents(SALE, [lineOf({ priceMinor: 2_400_000n, quantity: '3' })]);
    const e = events.find((x) => x.type === CASHIER_EVENT.soldBelowCost);
    // (2 480 000 − 2 400 000) × 3 = 240 000 — butun qator bo'yicha, dona emas.
    expect(e?.payload).toMatchObject({ costMinor: '2480000', lossMinor: '240000' });
  });

  it('kasr miqdorda zarar to`g`ri hisoblanadi (og`irlik/uzunlik bilan sotuv)', () => {
    const events = planSaleAuditEvents(SALE, [lineOf({ priceMinor: 2_400_000n, quantity: '2.5' })]);
    const e = events.find((x) => x.type === CASHIER_EVENT.soldBelowCost);
    expect(e?.payload).toMatchObject({ lossMinor: '200000' }); // 80 000 × 2.5
  });

  it('ikkala chegaradan past bo`lsa IKKALA hodisa ham yoziladi', () => {
    // Menejer tur bo'yicha filtrlaydi: «chegarani buzdi» va «pul yo'qotdik» —
    // ikki xil savol, biri ikkinchisini yutib yubormasligi kerak.
    const types = planSaleAuditEvents(SALE, [lineOf({ priceMinor: 2_000_000n })]).map(
      (e) => e.type,
    );
    expect(types).toContain(CASHIER_EVENT.soldBelowWholesale);
    expect(types).toContain(CASHIER_EVENT.soldBelowCost);
    expect(types).toContain(CASHIER_EVENT.priceChanged);
  });

  it('tan narx NOMA`LUM bo`lsa zarar hodisasi YOZILMAYDI', () => {
    // NULL ni 0 deb olish — kartochkasiz har tovarni «zararga sotildi» deb
    // belgilardi; yolg'on signal jurnalni o'ldiradi.
    const types = planSaleAuditEvents(SALE, [lineOf({ costMinor: null, priceMinor: 1n })]).map(
      (e) => e.type,
    );
    expect(types).not.toContain(CASHIER_EVENT.soldBelowCost);
  });

  it('optom narx yo`q bo`lsa chegara hodisasi YOZILMAYDI', () => {
    const types = planSaleAuditEvents(SALE, [lineOf({ wholesaleMinor: null, priceMinor: 1n })]).map(
      (e) => e.type,
    );
    expect(types).not.toContain(CASHIER_EVENT.soldBelowWholesale);
  });

  it('asos narx yo`q bo`lsa PRICE_CHANGED yozilmaydi (nimadan chetlanganini bilmaymiz)', () => {
    const types = planSaleAuditEvents(SALE, [lineOf({ basePriceMinor: null })]).map((e) => e.type);
    expect(types).not.toContain(CASHIER_EVENT.priceChanged);
  });

  it('tan narx HAQIQATAN nol bo`lsa chegara ishlaydi (0 ≠ NULL)', () => {
    // Tekin kelgan tovarni manfiy narxda sotish — haqiqiy zarar.
    const types = planSaleAuditEvents(SALE, [
      lineOf({ costMinor: 0n, priceMinor: 0n, wholesaleMinor: null, basePriceMinor: null }),
    ]).map((e) => e.type);
    expect(types).toEqual([]); // 0 < 0 emas — chegara buzilmagan
    const loss = planSaleAuditEvents(SALE, [
      lineOf({ costMinor: 5n, priceMinor: 0n, wholesaleMinor: null, basePriceMinor: null }),
    ]);
    expect(loss[0]?.type).toBe(CASHIER_EVENT.soldBelowCost);
  });

  it('bir necha qator — har biri o`z hodisasini beradi', () => {
    const events = planSaleAuditEvents(SALE, [
      lineOf({ productId: 'a', priceMinor: 2_000_000n }),
      lineOf({ productId: 'b' }),
    ]);
    expect(new Set(events.map((e) => e.payload.productId))).toEqual(new Set(['a']));
  });
});

describe('planCancelAuditEvent', () => {
  it('bekor qilingan bosqichni yozadi — `ready` tovar allaqachon yig`ilgan degani', () => {
    const e = planCancelAuditEvent(SALE, {
      stage: 'ready',
      name: 'ТРН-2026-00007',
      sumMinor: 2_610_000n,
      lines: [{ productId: 'p1', quantity: '2' }],
    });
    expect(e.type).toBe(CASHIER_EVENT.saleCancelled);
    expect(e.payload).toMatchObject({
      stage: 'ready',
      name: 'ТРН-2026-00007',
      sumMinor: '2610000',
      lineCount: 1,
    });
  });
});

describe('planRefundAuditEvent', () => {
  it('docId = OYNA chek, asl chek payload ichida', () => {
    const e = planRefundAuditEvent('mirror-1', {
      originalId: 'orig-1',
      originalName: 'ТРН-2026-00001',
      sumMinor: 500_000n,
      cashMinor: 500_000n,
      cardMinor: 0n,
      lines: [{ productId: 'p1', quantity: '1', priceMinor: 500_000n }],
    });
    expect(e.docId).toBe('mirror-1');
    expect(e.payload).toMatchObject({ originalId: 'orig-1', sumMinor: '500000' });
  });
});

describe('planOutOfScheduleAuditEvent', () => {
  it('sababni yozadi — izohsiz vaqtdan tashqari smena bo`lishi mumkin emas', () => {
    const e = planOutOfScheduleAuditEvent('sess-1', {
      smenaId: 's1',
      smenaName: 'Kechki',
      reason: 'Mijoz kutmoqda',
    });
    expect(e.type).toBe(CASHIER_EVENT.shiftOutOfSchedule);
    expect(e.payload).toMatchObject({ reason: 'Mijoz kutmoqda', smenaName: 'Kechki' });
  });
});
