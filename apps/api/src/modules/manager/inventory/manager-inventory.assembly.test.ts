import { describe, expect, it } from 'vitest';
import {
  INFLOW_DOC_TYPES,
  SALES_DOC_TYPES,
  assembleSignalInputs,
  resolveUnitCostMinor,
} from './manager-inventory.service.js';

/**
 * DB shakli → sof modul kirishi. Prisma'siz sinaladi: bu yerdagi qoidalar
 * («tan narx qayerdan», «qoldiqsiz-u sotuvli tovar qayerdan») I/O emas,
 * ular xato bo'lsa butun signal yolg'on bo'ladi.
 */

const EMPTY = {
  lastSaleAt: new Map<string, Date>(),
  firstInflowAt: new Map<string, Date>(),
  buyPrices: new Map<string, bigint | null>(),
  names: new Map<string, string>(),
  storeNames: new Map<string, string>(),
  windowDays: 30,
};

describe('resolveUnitCostMinor — NULL ≠ 0', () => {
  it("o'rtacha-tortilgan tan narx birinchi manba", () => {
    // 50 000 tiyin / 10 dona = 5 000 tiyin/dona
    expect(resolveUnitCostMinor(50_000n, '10', 999n)).toBe(5_000n);
  });

  it('costBalance 0 ⇒ «yozilmagan», Product.buyPrice ga tushadi', () => {
    // Stock.costBalanceMinor DEFAULT 0 — uni narx deb qabul qilish
    // 100% marja yolg'onining aynan o'zi bo'lardi.
    expect(resolveUnitCostMinor(0n, '10', 700n)).toBe(700n);
  });

  it("ikkala manba ham yo'q ⇒ NULL (0 EMAS)", () => {
    expect(resolveUnitCostMinor(0n, '10', null)).toBeNull();
    expect(resolveUnitCostMinor(0n, '10', 0n)).toBeNull();
  });

  it("qoldiq 0 bo'lsa bo'lish qilinmaydi — buyPrice ishlatiladi", () => {
    expect(resolveUnitCostMinor(50_000n, '0', 700n)).toBe(700n);
    expect(resolveUnitCostMinor(50_000n, '0', null)).toBeNull();
  });

  it("manfiy qoldiqda ham bo'lish qilinmaydi", () => {
    expect(resolveUnitCostMinor(50_000n, '-3', 700n)).toBe(700n);
  });
});

describe('assembleSignalInputs', () => {
  const stockKey = { storeId: 's1', assortmentKind: 'product', assortmentId: 'p1' };

  it('sotuv chiqimi (manfiy delta) musbat sotuv miqdoriga aylanadi', () => {
    const [input] = assembleSignalInputs({
      ...EMPTY,
      stocks: [{ ...stockKey, qty: '20', costBalanceMinor: 0n }],
      sales: [{ ...stockKey, netDelta: '-30' }],
    });
    expect(input?.soldQty).toBe('30');
  });

  it("qaytarim sotuvdan ko'p bo'lsa sur'at manfiy emas, NOL", () => {
    // «−5 dona/kun» degan sur'at bema'ni; sof modul 0 ni «tarix yo'q» deb o'qiydi.
    const [input] = assembleSignalInputs({
      ...EMPTY,
      stocks: [{ ...stockKey, qty: '20', costBalanceMinor: 0n }],
      sales: [{ ...stockKey, netDelta: '4' }],
    });
    expect(input?.soldQty).toBe('0');
  });

  it("kasrli miqdor aniq ko'chiriladi", () => {
    const [input] = assembleSignalInputs({
      ...EMPTY,
      stocks: [{ ...stockKey, qty: '20', costBalanceMinor: 0n }],
      sales: [{ ...stockKey, netDelta: '-2.5' }],
    });
    expect(input?.soldQty).toBe('2.5');
  });

  it("qoldiq qatori YO'Q, sotuv BOR ⇒ qoldiq 0 bilan kiritiladi", () => {
    // Eng o'tkir «tugash xavfi» aynan shu holat — tashlab ketilmaydi.
    const inputs = assembleSignalInputs({
      ...EMPTY,
      stocks: [],
      sales: [{ storeId: 's1', assortmentKind: 'product', assortmentId: 'yo-q', netDelta: '-60' }],
    });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({ qty: '0', soldQty: '60', assortmentId: 'yo-q' });
  });

  it('bir kalit ikki marta kirmaydi (qoldiq + sotuv ustma-ust)', () => {
    const inputs = assembleSignalInputs({
      ...EMPTY,
      stocks: [{ ...stockKey, qty: '20', costBalanceMinor: 0n }],
      sales: [{ ...stockKey, netDelta: '-30' }],
    });
    expect(inputs).toHaveLength(1);
  });

  it("kalit ombor bo'yicha ajratiladi — boshqa ombor sotuvi aralashmaydi", () => {
    const inputs = assembleSignalInputs({
      ...EMPTY,
      stocks: [
        { ...stockKey, qty: '20', costBalanceMinor: 0n },
        { ...stockKey, storeId: 's2', qty: '20', costBalanceMinor: 0n },
      ],
      sales: [{ ...stockKey, netDelta: '-30' }],
    });
    expect(inputs.find((i) => i.storeId === 's1')?.soldQty).toBe('30');
    expect(inputs.find((i) => i.storeId === 's2')?.soldQty).toBe('0');
  });

  it("nom, ombor nomi, sana va tan narx to'g'ri kalitdan olinadi", () => {
    const sale = new Date('2026-08-01T00:00:00.000Z');
    const inflow = new Date('2026-01-01T00:00:00.000Z');
    const [input] = assembleSignalInputs({
      stocks: [{ ...stockKey, qty: '20', costBalanceMinor: 0n }],
      sales: [],
      lastSaleAt: new Map([['s1|product|p1', sale]]),
      firstInflowAt: new Map([['s1|product|p1', inflow]]),
      buyPrices: new Map([['p1', 1_234n]]),
      names: new Map([['p1', 'Kabel']]),
      storeNames: new Map([['s1', 'Asosiy ombor']]),
      windowDays: 30,
    });
    expect(input).toMatchObject({
      name: 'Kabel',
      storeName: 'Asosiy ombor',
      unitCostMinor: 1_234n,
      lastSaleAt: sale,
      stockedSinceAt: inflow,
    });
  });
});

describe("hujjat turlari to'plami", () => {
  it('ombor ICHIDAGI harakat sotuv deb sanalmaydi', () => {
    for (const internal of ['move_in', 'move_out', 'cell_move', 'cell_place', 'adjustment']) {
      expect(SALES_DOC_TYPES as readonly string[]).not.toContain(internal);
    }
  });

  it("sotuv bekori/qaytarimi to'plamda bor — sof sotuv shundan chiqadi", () => {
    for (const t of ['demand', 'retailsale', 'demand_unpost', 'salesreturn']) {
      expect(SALES_DOC_TYPES as readonly string[]).toContain(t);
    }
  });

  it("kirim to'plamida chiqim hujjatlari yo'q", () => {
    for (const t of INFLOW_DOC_TYPES) {
      expect(t.endsWith('_out')).toBe(false);
      expect(SALES_DOC_TYPES as readonly string[]).not.toContain(t);
    }
  });
});
