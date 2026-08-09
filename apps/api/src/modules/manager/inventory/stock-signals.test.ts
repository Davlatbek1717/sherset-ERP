import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STOCK_THRESHOLDS,
  STOCK_SIGNAL,
  type StockSignalInput,
  UNMEASURED,
  buildStockSignalBoard,
  stockSignalsFor,
} from './stock-signals.js';

/**
 * 4M.8 — uch xil zaxira signali. O'lchov **PUL**, dona EMAS.
 *
 * Uchta savol menejer tilida:
 *   1. «Qancha pulim qotib qolgan» — sotilmayotgan zaxira tannarxi.
 *   2. «Qancha pullik talab yopilmaydi» — qoldiq gorizontga yetmayapti.
 *   3. «Qancha pul ortiqcha yotibdi» — gorizontdan ortiqcha zaxira.
 *
 * NULL ≠ 0 — tan narx noma'lum bo'lsa signal «hisoblanmadi» deydi. «0 so'm»
 * degan javob menejerga «muammo yo'q» deb ko'rinadi va aynan shu yolg'on
 * `retail-cost-freeze-null-contract` hodisasida 100% marja bergan edi.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-09T10:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

function input(over: Partial<StockSignalInput> = {}): StockSignalInput {
  return {
    storeId: 'store-1',
    storeName: 'Asosiy ombor',
    assortmentKind: 'product',
    assortmentId: 'p-1',
    name: 'Kabel 3×2.5',
    qty: '100',
    unitCostMinor: 500_00n,
    lastSaleAt: daysAgo(1),
    soldQty: '30',
    windowDays: 30,
    stockedSinceAt: daysAgo(200),
    ...over,
  };
}

describe("stockSignalsFor — o'lchov PUL, dona emas", () => {
  it('qotib qolgan pul = qoldiq × tan narx (dona EMAS)', () => {
    // 90 kundan beri sotuv yo'q ⇒ 100 dona × 500 so'm = 50 000 so'm qotgan.
    const rows = stockSignalsFor(
      input({ lastSaleAt: daysAgo(120), soldQty: '0' }),
      DEFAULT_STOCK_THRESHOLDS,
      NOW,
    );
    const dead = rows.find((r) => r.kind === STOCK_SIGNAL.deadMoney);
    expect(dead).toBeDefined();
    expect(dead?.measured).toBe(true);
    // PUL: 100 × 500_00 tiyin. Dona (100) bilan hech qachon adashmasin.
    expect(dead?.amountMinor).toBe(5_000_000n);
    expect(dead?.qty).toBe('100');
    expect(dead?.daysIdle).toBe(120);
  });

  it("tugash xavfi — yopilmagan talab PULDA o'lchanadi", () => {
    // Kuniga 3 dona ketadi (30 kunda 90 dona), gorizont 14 kun ⇒ 42 dona kerak.
    // Qoldiq 12 dona ⇒ 30 dona yetishmaydi ⇒ 30 × 500 so'm = 15 000 so'm talab yopilmaydi.
    const rows = stockSignalsFor(
      input({ qty: '12', soldQty: '90', windowDays: 30 }),
      DEFAULT_STOCK_THRESHOLDS,
      NOW,
    );
    const risk = rows.find((r) => r.kind === STOCK_SIGNAL.stockoutRisk);
    expect(risk?.measured).toBe(true);
    expect(risk?.amountMinor).toBe(1_500_000n);
    expect(risk?.coverDays).toBe(4);
  });

  it("ortiqcha zaxira — gorizontdan ortig'i PULDA", () => {
    // Kuniga 1 dona (30/30), ortiqcha gorizonti 120 kun ⇒ 120 dona normal.
    // Qoldiq 200 ⇒ 80 dona ortiqcha ⇒ 80 × 500 = 40 000 so'm.
    const rows = stockSignalsFor(
      input({ qty: '200', soldQty: '30' }),
      DEFAULT_STOCK_THRESHOLDS,
      NOW,
    );
    const over = rows.find((r) => r.kind === STOCK_SIGNAL.overstock);
    expect(over?.measured).toBe(true);
    expect(over?.amountMinor).toBe(4_000_000n);
  });

  it('kasrli qoldiq tiyin-aniq hisoblanadi (float emas)', () => {
    const rows = stockSignalsFor(
      input({ qty: '0.333333', unitCostMinor: 300_00n, lastSaleAt: daysAgo(300), soldQty: '0' }),
      DEFAULT_STOCK_THRESHOLDS,
      NOW,
    );
    // round(333333 × 30000 / 1e6) = round(9999.99) = 10000 tiyin
    expect(rows.find((r) => r.kind === STOCK_SIGNAL.deadMoney)?.amountMinor).toBe(10_000n);
  });
});

describe("NULL ≠ 0 — tan narx yo'q bo'lsa «hisoblanmadi»", () => {
  it("tan narx NULL ⇒ signal ko'rinadi, lekin summa NULL (0 EMAS)", () => {
    const rows = stockSignalsFor(
      input({ unitCostMinor: null, lastSaleAt: daysAgo(200), soldQty: '0' }),
      DEFAULT_STOCK_THRESHOLDS,
      NOW,
    );
    const dead = rows.find((r) => r.kind === STOCK_SIGNAL.deadMoney);
    expect(dead).toBeDefined();
    expect(dead?.measured).toBe(false);
    expect(dead?.amountMinor).toBeNull();
    expect(dead?.amountMinor).not.toBe(0n);
    expect(dead?.unmeasuredReason).toBe(UNMEASURED.noCost);
  });

  it("o'lchanmagan qator umumiy PUL jamiga QO'SHILMAYDI, lekin sanaladi", () => {
    const measured = stockSignalsFor(
      input({ assortmentId: 'p-1', lastSaleAt: daysAgo(200), soldQty: '0' }),
      DEFAULT_STOCK_THRESHOLDS,
      NOW,
    );
    const unmeasured = stockSignalsFor(
      input({
        assortmentId: 'p-2',
        unitCostMinor: null,
        lastSaleAt: daysAgo(200),
        soldQty: '0',
      }),
      DEFAULT_STOCK_THRESHOLDS,
      NOW,
    );
    const board = buildStockSignalBoard([...measured, ...unmeasured]);
    const dead = board.signals[STOCK_SIGNAL.deadMoney];
    expect(dead.rows).toHaveLength(2);
    expect(dead.totalMinor).toBe(5_000_000n); // faqat o'lchangani
    expect(dead.measuredCount).toBe(1);
    expect(dead.unmeasuredCount).toBe(1);
  });

  it("tan narx 0 ⇒ NOMA'LUM deb qaraladi (0 so'm zaxira bo'lmaydi)", () => {
    const rows = stockSignalsFor(
      input({ unitCostMinor: 0n, lastSaleAt: daysAgo(200), soldQty: '0' }),
      DEFAULT_STOCK_THRESHOLDS,
      NOW,
    );
    const dead = rows.find((r) => r.kind === STOCK_SIGNAL.deadMoney);
    expect(dead?.measured).toBe(false);
    expect(dead?.unmeasuredReason).toBe(UNMEASURED.noCost);
  });

  it("sotuv tarixi yo'q ⇒ kunlik sur'at NULL, «0 dona/kun» EMAS", () => {
    const rows = stockSignalsFor(
      input({ qty: '5', soldQty: '0', lastSaleAt: null, stockedSinceAt: daysAgo(200) }),
      DEFAULT_STOCK_THRESHOLDS,
      NOW,
    );
    // Sotuv sur'ati yo'q ⇒ «necha kunga yetadi» savoli javobsiz.
    for (const r of rows) {
      expect(r.dailySaleQty).toBeNull();
      expect(r.coverDays).toBeNull();
    }
    // ...lekin pul QOTGANI ko'rinadi.
    expect(rows.map((r) => r.kind)).toContain(STOCK_SIGNAL.deadMoney);
    // Sur'atsiz «tugash xavfi» va «ortiqcha» hisoblab bo'lmaydi — taxmin qilinmaydi.
    expect(rows.map((r) => r.kind)).not.toContain(STOCK_SIGNAL.stockoutRisk);
    expect(rows.map((r) => r.kind)).not.toContain(STOCK_SIGNAL.overstock);
  });

  it("tarix umuman yo'q (kirim ham, sotuv ham) ⇒ «o'lik» deb ayblanmaydi", () => {
    const rows = stockSignalsFor(
      input({ soldQty: '0', lastSaleAt: null, stockedSinceAt: null }),
      DEFAULT_STOCK_THRESHOLDS,
      NOW,
    );
    const dead = rows.find((r) => r.kind === STOCK_SIGNAL.deadMoney);
    expect(dead?.measured).toBe(false);
    expect(dead?.unmeasuredReason).toBe(UNMEASURED.noHistory);
    expect(dead?.daysIdle).toBeNull();
  });
});

describe('signal chegaralari va kesishmasligi', () => {
  it("chegara sozlamasi natijani o'zgartiradi", () => {
    const args = input({ lastSaleAt: daysAgo(60), soldQty: '0' });
    expect(
      stockSignalsFor(args, { ...DEFAULT_STOCK_THRESHOLDS, deadDays: 90 }, NOW).map((r) => r.kind),
    ).not.toContain(STOCK_SIGNAL.deadMoney);
    expect(
      stockSignalsFor(args, { ...DEFAULT_STOCK_THRESHOLDS, deadDays: 30 }, NOW).map((r) => r.kind),
    ).toContain(STOCK_SIGNAL.deadMoney);
  });

  it("sotilayotgan tovar «o'lik» ham, «ortiqcha» ham bo'lmaydi", () => {
    const rows = stockSignalsFor(
      input({ qty: '40', soldQty: '30' }),
      DEFAULT_STOCK_THRESHOLDS,
      NOW,
    );
    expect(rows).toHaveLength(0);
  });

  it("o'lik zaxira ayni paytda «ortiqcha» deb ikki marta sanalmaydi", () => {
    const rows = stockSignalsFor(
      input({ qty: '500', soldQty: '0', lastSaleAt: daysAgo(400) }),
      DEFAULT_STOCK_THRESHOLDS,
      NOW,
    );
    expect(rows.map((r) => r.kind)).toEqual([STOCK_SIGNAL.deadMoney]);
  });

  it("qoldiq nol ⇒ qotgan pul ham, ortiqcha ham yo'q; ammo sotuv borsa xavf bor", () => {
    const rows = stockSignalsFor(
      input({ qty: '0', soldQty: '60', lastSaleAt: daysAgo(1) }),
      DEFAULT_STOCK_THRESHOLDS,
      NOW,
    );
    expect(rows.map((r) => r.kind)).toEqual([STOCK_SIGNAL.stockoutRisk]);
    // Kuniga 2 dona × 14 kun = 28 dona kerak, qoldiq 0 ⇒ 28 × 500 so'm.
    expect(rows[0]?.amountMinor).toBe(1_400_000n);
    expect(rows[0]?.coverDays).toBe(0);
  });

  it("manfiy qoldiq (ma'lumot nuqsoni) 0 kabi qaraladi, salbiy pul chiqmaydi", () => {
    const rows = stockSignalsFor(
      input({ qty: '-5', soldQty: '30', lastSaleAt: daysAgo(1) }),
      DEFAULT_STOCK_THRESHOLDS,
      NOW,
    );
    const risk = rows.find((r) => r.kind === STOCK_SIGNAL.stockoutRisk);
    expect(risk?.amountMinor).toBe(700_000n); // 14 dona × 500 so'm, manfiy qoldiq qo'shilmaydi
    expect(risk?.amountMinor).toBeGreaterThan(0n);
  });
});

describe('buildStockSignalBoard — tartib va jami', () => {
  it('har signal ichida PULI katta qator tepada', () => {
    const rows = [
      ...stockSignalsFor(
        input({ assortmentId: 'kichik', qty: '10', soldQty: '0', lastSaleAt: daysAgo(200) }),
        DEFAULT_STOCK_THRESHOLDS,
        NOW,
      ),
      ...stockSignalsFor(
        input({ assortmentId: 'katta', qty: '1000', soldQty: '0', lastSaleAt: daysAgo(200) }),
        DEFAULT_STOCK_THRESHOLDS,
        NOW,
      ),
    ];
    const board = buildStockSignalBoard(rows);
    expect(board.signals[STOCK_SIGNAL.deadMoney].rows.map((r) => r.assortmentId)).toEqual([
      'katta',
      'kichik',
    ]);
  });

  it("o'lchanmagan qatorlar oxirida turadi, yo'qolmaydi", () => {
    const rows = [
      ...stockSignalsFor(
        input({
          assortmentId: 'noma-lum',
          unitCostMinor: null,
          soldQty: '0',
          lastSaleAt: daysAgo(200),
        }),
        DEFAULT_STOCK_THRESHOLDS,
        NOW,
      ),
      ...stockSignalsFor(
        input({ assortmentId: 'o-lchangan', qty: '1', soldQty: '0', lastSaleAt: daysAgo(200) }),
        DEFAULT_STOCK_THRESHOLDS,
        NOW,
      ),
    ];
    const board = buildStockSignalBoard(rows);
    expect(board.signals[STOCK_SIGNAL.deadMoney].rows.map((r) => r.assortmentId)).toEqual([
      'o-lchangan',
      'noma-lum',
    ]);
  });

  it("bo'sh taxta uchta signalni ham nol bilan qaytaradi (kalit yo'qolmaydi)", () => {
    const board = buildStockSignalBoard([]);
    expect(Object.keys(board.signals).sort()).toEqual(
      [STOCK_SIGNAL.deadMoney, STOCK_SIGNAL.overstock, STOCK_SIGNAL.stockoutRisk].sort(),
    );
    expect(board.signals[STOCK_SIGNAL.overstock].totalMinor).toBe(0n);
  });
});
