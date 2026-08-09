import { describe, expect, it } from 'vitest';
import {
  type CardPrices,
  INFLOW_DOC_TYPES,
  SALES_DOC_TYPES,
  SOLD_RETAIL_STATES,
  type SoldLineRowShape,
  assembleSignalInputs,
  assembleSoldLines,
  cardKeyOf,
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

// ───────────────────────────────────────────────────────────────────────────
// MK18 — xato narx: DB shakli → sof modul kirishi
// ───────────────────────────────────────────────────────────────────────────

const AT = new Date('2026-08-09T09:00:00.000Z');

function soldRow(over: Partial<SoldLineRowShape> = {}): SoldLineRowShape {
  return {
    docType: 'retailsale',
    docId: 'sale-1',
    docName: 'RS-0001',
    lineId: 'line-1',
    assortmentKind: 'product',
    assortmentId: 'p1',
    assortmentName: 'Kabel 3×2.5',
    quantity: '1',
    priceMinor: 100_000n,
    discountPercent: 0,
    costMinor: 60_000n,
    frozenBaseMinor: null,
    soldById: 'emp-1',
    soldByName: 'Aziz Karimov',
    at: AT,
    ...over,
  };
}

const card = (over: Partial<CardPrices> = {}): CardPrices => ({
  baseMinor: 100_000n,
  wholesaleMinor: 80_000n,
  ...over,
});

describe("assembleSoldLines — o'rtacha narx", () => {
  it("qator O'Z o'rtachasiga kirmaydi (leave-one-out)", () => {
    // Aks holda 3 sotuvli tovarda bitta 10× xato o'rtachani o'zi ko'tarib,
    // keyin o'sha o'rtachaga nisbatan «normal» bo'lib chiqardi.
    const inputs = assembleSoldLines(
      [
        soldRow({ lineId: 'a', priceMinor: 100_000n }),
        soldRow({ lineId: 'b', priceMinor: 200_000n }),
        soldRow({ lineId: 'c', priceMinor: 300_000n }),
      ],
      new Map(),
    );

    expect(inputs[0]?.averageMinor).toBe(250_000n);
    expect(inputs[0]?.averageSampleCount).toBe(2);
    expect(inputs[1]?.averageMinor).toBe(200_000n);
  });

  it("nol/manfiy narx o'rtacha havzasini BUZMAYDI", () => {
    const inputs = assembleSoldLines(
      [
        soldRow({ lineId: 'a', priceMinor: 100_000n }),
        soldRow({ lineId: 'b', priceMinor: 200_000n }),
        soldRow({ lineId: 'c', priceMinor: 0n }),
      ],
      new Map(),
    );

    // 'a' uchun havzada faqat 'b' qoladi — 0 hisobga olinmaydi.
    expect(inputs[0]?.averageMinor).toBe(200_000n);
    expect(inputs[0]?.averageSampleCount).toBe(1);
    // 'c' o'zi havzada emas, shuning uchun ikkalasini ham ko'radi.
    expect(inputs[2]?.averageSampleCount).toBe(2);
    expect(inputs[2]?.averageMinor).toBe(150_000n);
  });

  it("yolg'iz sotuvda o'rtacha NULL — 0 emas", () => {
    const [input] = assembleSoldLines([soldRow()], new Map());

    expect(input?.averageMinor).toBeNull();
    expect(input?.averageSampleCount).toBe(0);
  });

  it("tovar va modifikatsiya ALOHIDA guruh (bir xil id bo'lsa ham)", () => {
    const inputs = assembleSoldLines(
      [
        soldRow({
          lineId: 'a',
          assortmentKind: 'product',
          assortmentId: 'x',
          priceMinor: 100_000n,
        }),
        soldRow({
          lineId: 'b',
          assortmentKind: 'product',
          assortmentId: 'x',
          priceMinor: 300_000n,
        }),
        soldRow({
          lineId: 'c',
          assortmentKind: 'variant',
          assortmentId: 'x',
          priceMinor: 900_000n,
        }),
      ],
      new Map(),
    );

    expect(inputs[0]?.averageMinor).toBe(300_000n);
    // Modifikatsiya o'z guruhida yolg'iz — tovarning o'rtachasini olmaydi.
    expect(inputs[2]?.averageMinor).toBeNull();
  });
});

describe("assembleSoldLines — mo'ljallar", () => {
  it('MUZLATILGAN karta narxi bugungi kartadan USTUN', () => {
    // Chek o'sha kuni ko'rsatilgan narx bilan solishtiriladi; karta keyin
    // o'zgargan bo'lsa, o'tgan chek qayta baholanmaydi.
    const [input] = assembleSoldLines(
      [soldRow({ frozenBaseMinor: 120_000n })],
      new Map([[cardKeyOf('product', 'p1'), card({ baseMinor: 999_000n })]]),
    );

    expect(input?.referenceMinor).toBe(120_000n);
  });

  it("yuk xatida muzlatilgan narx yo'q — kartaning bugungi narxi olinadi", () => {
    const [input] = assembleSoldLines(
      [soldRow({ docType: 'demand', frozenBaseMinor: null })],
      new Map([[cardKeyOf('product', 'p1'), card({ baseMinor: 150_000n })]]),
    );

    expect(input?.referenceMinor).toBe(150_000n);
    expect(input?.wholesaleMinor).toBe(80_000n);
  });

  it("karta topilmasa mo'ljal NULL — taxmin qilinmaydi", () => {
    const [input] = assembleSoldLines([soldRow()], new Map());

    expect(input?.referenceMinor).toBeNull();
    expect(input?.wholesaleMinor).toBeNull();
  });

  it("xizmat qatori (birliksiz) kartaga ham, guruhga ham qo'shilmaydi", () => {
    const inputs = assembleSoldLines(
      [
        soldRow({ lineId: 'a', assortmentId: null, priceMinor: 500_000n }),
        soldRow({ lineId: 'b', priceMinor: 100_000n }),
      ],
      new Map([[cardKeyOf('product', 'p1'), card()]]),
    );

    expect(inputs[0]?.referenceMinor).toBeNull();
    expect(inputs[0]?.averageMinor).toBeNull();
    // 'b' xizmat qatorining narxini o'z o'rtachasiga qo'shib olmaydi.
    expect(inputs[1]?.averageMinor).toBeNull();
  });

  it("muzlatilgan tan narx va chegirma o'zgarishsiz o'tadi", () => {
    const [input] = assembleSoldLines(
      [soldRow({ costMinor: 55_000n, discountPercent: 12.5, quantity: '2.5' })],
      new Map(),
    );

    expect(input?.costMinor).toBe(55_000n);
    expect(input?.discountPercent).toBe(12.5);
    expect(input?.quantity).toBe('2.5');
  });
});

describe('sotuv sanaladigan chek holatlari', () => {
  it("to'liq qaytarilgan chek ham hisobga olinadi", () => {
    // `refunded` — qaytarilgan ASL chek. Uni tashlab ketish o'sha kungi xato
    // narxni ro'yxatdan yo'qotardi; oyna cheklar `refundedFromId` bilan
    // chiqariladi (so'rov shartida), holat bilan emas.
    expect(SOLD_RETAIL_STATES as readonly string[]).toEqual(['posted', 'refunded']);
  });

  it('qoralama va bekor qilingan chek sotuv EMAS', () => {
    for (const s of ['draft', 'open', 'picking', 'ready', 'cancelled']) {
      expect(SOLD_RETAIL_STATES as readonly string[]).not.toContain(s);
    }
  });
});
