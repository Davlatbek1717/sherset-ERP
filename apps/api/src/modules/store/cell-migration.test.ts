import { describe, expect, it } from 'vitest';
import {
  diffStockVsCells,
  parseCellCode,
  planCellGeneration,
  planRollback,
  planStockBackfill,
} from './cell-migration.js';

/**
 * F019 — ombor migratsiyasi 1–2-qadam, SOF planlovchilar (DB yo'q).
 *
 * Bu yerdagi har test rejaning «Testlar (TDD)» bandidan kelib chiqadi:
 *   (2) noto'g'ri formatdagi kod JIMGINA tashlanmaydi — ro'yxatga tushadi;
 *   (3) backfilldan keyin `Σ StockByCell == Stock`;
 *   (4) rollback holatni tiklaydi (va drift bo'lsa TO'XTAYDI, ko'r-ko'rona emas).
 * (1) «DRY hech nima yozmaydi» — `cell-migration.runner.test.ts` da (orkestratsiya).
 */

describe('parseCellCode', () => {
  it("4 bo'lakli kanonik kodni bo'laklaydi; zona = 1-segment", () => {
    const r = parseCellCode('01-02-03-05');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.zoneName).toBe('01');
    expect(r.value.segments).toEqual(['01', '02', '03', '05']);
    expect(r.value.normalized).toBe('01-02-03-05');
  });

  it("tashqi bo'shliqni kesadi, ichkisini RAD etadi", () => {
    expect(parseCellCode('  01-02-03-05  ').ok).toBe(true);
    const bad = parseCellCode('01-02 -03-05');
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.reason).toBe('whitespace');
  });

  it("2 va 3 bo'lakli qisqa kodlar QABUL qilinadi (zona baribir 1-segment)", () => {
    expect(parseCellCode('01-02').ok).toBe(true);
    const three = parseCellCode('07-11-02');
    expect(three.ok).toBe(true);
    if (!three.ok) return;
    expect(three.value.zoneName).toBe('07');
  });

  it('1 va 5 segment — segment-count xatosi', () => {
    for (const code of ['01', '01-02-03-04-05']) {
      const r = parseCellCode(code);
      expect(r.ok, code).toBe(false);
      if (r.ok) continue;
      expect(r.reason).toBe('segment-count');
    }
  });

  it("zona segmenti RAQAM bo'lishi shart — `skladNo` marshrutlash shundan o'qiydi", () => {
    const r = parseCellCode('A-02-03-04');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('zone-not-numeric');
  });

  it("bo'sh segment va begona belgi — alohida sabablar bilan rad etiladi", () => {
    const empty = parseCellCode('01--03-04');
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toBe('empty-segment');

    const chars = parseCellCode('01-02-0/3-04');
    expect(chars.ok).toBe(false);
    if (!chars.ok) expect(chars.reason).toBe('bad-segment-chars');
  });

  it("bo'sh satr va 255 belgidan uzun kod", () => {
    const e = parseCellCode('   ');
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.reason).toBe('empty');

    const long = parseCellCode(`01-${'9'.repeat(260)}`);
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.reason).toBe('too-long');
  });
});

describe('planCellGeneration', () => {
  const S = 'store-1';

  it('kodlardan zona + yacheyka rejalashtiradi, mavjudini QAYTA yaratmaydi', () => {
    const plan = planCellGeneration({
      needs: [
        { storeId: S, code: '01-02-03-05', productId: 'p1' },
        { storeId: S, code: '01-02-03-06', productId: 'p2' },
        { storeId: S, code: '02-01-01-01', productId: 'p3' },
      ],
      existingZones: [{ storeId: S, name: '01', sortOrder: 0 }],
      existingCells: [{ storeId: S, name: '01-02-03-05', sortOrder: 4 }],
    });

    expect(plan.zonesToCreate).toEqual([{ storeId: S, name: '02', sortOrder: 1 }]);
    expect(plan.cellsToCreate.map((c) => c.name)).toEqual(['01-02-03-06', '02-01-01-01']);
    expect(plan.cellsToCreate[0]).toMatchObject({ zoneName: '01', sortOrder: 5 });
    expect(plan.zonesExisting).toBe(1);
    expect(plan.cellsExisting).toBe(1);
  });

  it('bir xil kod ikki tovarda — bitta yacheyka rejalashtiriladi', () => {
    const plan = planCellGeneration({
      needs: [
        { storeId: S, code: '01-01-01-01', productId: 'p1' },
        { storeId: S, code: '01-01-01-01', productId: 'p2' },
      ],
      existingZones: [],
      existingCells: [],
    });
    expect(plan.cellsToCreate).toHaveLength(1);
    expect(plan.zonesToCreate).toHaveLength(1);
  });

  it("noto'g'ri kod JIMGINA tashlanmaydi — sabab + tovar id bilan ro'yxatga tushadi", () => {
    const plan = planCellGeneration({
      needs: [
        { storeId: S, code: 'yoʻq', productId: 'p1' },
        { storeId: S, code: 'yoʻq', productId: 'p2' },
        { storeId: S, code: '01-01-01-01', productId: 'p3' },
      ],
      existingZones: [],
      existingCells: [],
    });
    expect(plan.cellsToCreate).toHaveLength(1);
    expect(plan.invalid).toHaveLength(1);
    expect(plan.invalid[0]?.productIds).toEqual(['p1', 'p2']);
    expect(plan.invalid[0]?.reason).toBe('segment-count');
    expect(plan.invalid[0]?.message).toContain('yoʻq');
  });

  it('qisqa (2–3 segmentli) kodlar yaratiladi, LEKIN ogohlantirishga tushadi', () => {
    const plan = planCellGeneration({
      needs: [{ storeId: S, code: '01-02', productId: 'p1' }],
      existingZones: [],
      existingCells: [],
    });
    expect(plan.cellsToCreate).toHaveLength(1);
    expect(plan.shortCodes).toEqual([{ code: '01-02', segments: 2, productIds: ['p1'] }]);
  });

  it("nol-to'ldirish to'qnashuvi («01» va «1») ogohlantiriladi, nom O'ZGARTIRILMAYDI", () => {
    const plan = planCellGeneration({
      needs: [
        { storeId: S, code: '01-02-03-04', productId: 'p1' },
        { storeId: S, code: '1-05-06-07', productId: 'p2' },
      ],
      existingZones: [],
      existingCells: [],
    });
    expect(plan.zonesToCreate.map((z) => z.name).sort()).toEqual(['01', '1']);
    expect(plan.zonePaddingCollisions).toEqual([{ storeId: S, numeric: 1, names: ['01', '1'] }]);
  });

  it("ombor bo'yicha ajratilgan: bir xil kod ikki omborda ikkita yacheyka", () => {
    const plan = planCellGeneration({
      needs: [
        { storeId: S, code: '01-01-01-01', productId: 'p1' },
        { storeId: 'store-2', code: '01-01-01-01', productId: 'p1' },
      ],
      existingZones: [],
      existingCells: [],
    });
    expect(plan.cellsToCreate).toHaveLength(2);
    expect(plan.zonesToCreate).toHaveLength(2);
  });
});

describe('planStockBackfill', () => {
  const S = 'store-1';
  const stock = (assortmentId: string, qty: string, storeId = S) => ({
    storeId,
    assortmentKind: 'product',
    assortmentId,
    qty,
  });

  it('yacheykasi bor tovarning butun qoldigʻi asosiy yacheykaga rejalashtiriladi', () => {
    const plan = planStockBackfill({
      stocks: [stock('p1', '12.5')],
      homeCodeByProduct: new Map([['p1', '01-02-03-05']]),
      cellIdByStoreCode: new Map([[`${S}|01-02-03-05`, 'cell-1']]),
      byCell: [],
    });
    expect(plan.writes).toEqual([
      {
        storeId: S,
        cellId: 'cell-1',
        assortmentKind: 'product',
        assortmentId: 'p1',
        deltaQty: '12.5',
        existing: false,
      },
    ]);
    expect(plan.unaddressed).toHaveLength(0);
  });

  it('IDEMPOTENT: allaqachon yacheykada turgan qismi qayta yozilmaydi (faqat farq)', () => {
    const plan = planStockBackfill({
      stocks: [stock('p1', '10')],
      homeCodeByProduct: new Map([['p1', '01-02-03-05']]),
      cellIdByStoreCode: new Map([[`${S}|01-02-03-05`, 'cell-1']]),
      byCell: [
        { storeId: S, cellId: 'cell-9', assortmentKind: 'product', assortmentId: 'p1', qty: '4' },
      ],
    });
    expect(plan.writes[0]).toMatchObject({ cellId: 'cell-1', deltaQty: '6' });
  });

  it('toʻliq mos qoldiq — hech narsa yozilmaydi', () => {
    const plan = planStockBackfill({
      stocks: [stock('p1', '10')],
      homeCodeByProduct: new Map([['p1', '01-02-03-05']]),
      cellIdByStoreCode: new Map([[`${S}|01-02-03-05`, 'cell-1']]),
      byCell: [
        { storeId: S, cellId: 'cell-1', assortmentKind: 'product', assortmentId: 'p1', qty: '10' },
      ],
    });
    expect(plan.writes).toHaveLength(0);
    expect(plan.alreadyBalanced).toBe(1);
  });

  it("yacheykalar ombor jamidan OSHIB ketgan bo'lsa — tuzatilmaydi, hisobotga tushadi", () => {
    const plan = planStockBackfill({
      stocks: [stock('p1', '3')],
      homeCodeByProduct: new Map([['p1', '01-02-03-05']]),
      cellIdByStoreCode: new Map([[`${S}|01-02-03-05`, 'cell-1']]),
      byCell: [
        { storeId: S, cellId: 'cell-1', assortmentKind: 'product', assortmentId: 'p1', qty: '8' },
      ],
    });
    expect(plan.writes).toHaveLength(0);
    expect(plan.unaddressed).toEqual([
      {
        storeId: S,
        assortmentKind: 'product',
        assortmentId: 'p1',
        qty: '-5',
        reason: 'over-allocated',
      },
    ]);
  });

  it("biriktirilmagan qoldiq TURT sabab bo'yicha ajratiladi (jim yashirilmaydi)", () => {
    const plan = planStockBackfill({
      stocks: [
        stock('p1', '1'), // uy-kodi yo'q
        stock('p2', '2'), // kod noto'g'ri
        stock('p3', '3'), // kod bor, yacheyka yaratilmagan (boshqa ombor)
        { storeId: S, assortmentKind: 'variant', assortmentId: 'v1', qty: '4' },
      ],
      homeCodeByProduct: new Map([
        ['p2', 'chalkash'],
        ['p3', '09-09-09-09'],
      ]),
      cellIdByStoreCode: new Map(),
      byCell: [],
    });
    expect(plan.writes).toHaveLength(0);
    expect(plan.unaddressed.map((u) => u.reason)).toEqual([
      'no-home-code',
      'invalid-code',
      'cell-missing',
      'not-a-product',
    ]);
  });

  it('nol qoldiq umuman rejaga kirmaydi', () => {
    const plan = planStockBackfill({
      stocks: [stock('p1', '0')],
      homeCodeByProduct: new Map([['p1', '01-02-03-05']]),
      cellIdByStoreCode: new Map([[`${S}|01-02-03-05`, 'cell-1']]),
      byCell: [],
    });
    expect(plan.writes).toHaveLength(0);
    expect(plan.unaddressed).toHaveLength(0);
    expect(plan.alreadyBalanced).toBe(1);
  });
});

describe('diffStockVsCells', () => {
  const S = 'store-1';

  it('mos kelganda 0 farq', () => {
    const d = diffStockVsCells(
      [{ storeId: S, assortmentKind: 'product', assortmentId: 'p1', qty: '7' }],
      [{ storeId: S, cellId: 'c1', assortmentKind: 'product', assortmentId: 'p1', qty: '7' }],
    );
    expect(d.mismatches).toBe(0);
    expect(d.totalAbsDiff).toBe('0');
  });

  it("Stock'da yo'q, yacheykada bor — YETIM qator ham farqqa tushadi", () => {
    const d = diffStockVsCells(
      [],
      [{ storeId: S, cellId: 'c1', assortmentKind: 'product', assortmentId: 'p9', qty: '5' }],
    );
    expect(d.mismatches).toBe(1);
    expect(d.rows[0]).toMatchObject({
      assortmentId: 'p9',
      stockQty: '0',
      cellQty: '5',
      diff: '-5',
    });
  });

  it('qisman biriktirilgan qoldiq musbat farq beradi', () => {
    const d = diffStockVsCells(
      [{ storeId: S, assortmentKind: 'product', assortmentId: 'p1', qty: '10' }],
      [{ storeId: S, cellId: 'c1', assortmentKind: 'product', assortmentId: 'p1', qty: '4' }],
    );
    expect(d.rows[0]).toMatchObject({ diff: '6' });
    expect(d.totalAbsDiff).toBe('6');
  });
});

describe('planRollback', () => {
  const S = 'store-1';
  const manifest = {
    version: 1 as const,
    appliedAt: '2026-08-09T00:00:00.000Z',
    accountId: 'acc-1',
    zones: [{ id: 'z1', storeId: S, name: '01' }],
    cells: [{ id: 'c1', storeId: S, name: '01-02-03-05' }],
    stock: [
      {
        storeId: S,
        cellId: 'c1',
        assortmentKind: 'product',
        assortmentId: 'p1',
        deltaQty: '10',
        created: true,
      },
    ],
  };

  it("o'zgarmagan holatni to'liq qaytaradi: qator + yacheyka + zona", () => {
    const plan = planRollback({
      manifest,
      currentByCell: [
        { storeId: S, cellId: 'c1', assortmentKind: 'product', assortmentId: 'p1', qty: '10' },
      ],
      cellsInUse: new Set<string>(),
    });
    expect(plan.stockDeletes).toHaveLength(1);
    expect(plan.stockDecrements).toHaveLength(0);
    expect(plan.cellDeletes).toEqual(['c1']);
    expect(plan.zoneDeletes).toEqual(['z1']);
    expect(plan.blocked).toHaveLength(0);
  });

  it("migratsiyadan keyin qoldiq O'ZGARGAN bo'lsa — o'chirmaydi, BLOKLAYDI", () => {
    const plan = planRollback({
      manifest,
      currentByCell: [
        { storeId: S, cellId: 'c1', assortmentKind: 'product', assortmentId: 'p1', qty: '13' },
      ],
      cellsInUse: new Set<string>(),
    });
    expect(plan.stockDeletes).toHaveLength(0);
    expect(plan.blocked.map((b) => b.reason)).toContain('stock-drifted');
    // Qator qolgani uchun yacheyka ham, zona ham o'chirilmaydi.
    expect(plan.cellDeletes).toHaveLength(0);
    expect(plan.zoneDeletes).toHaveLength(0);
  });

  it('mavjud qatorga qoʻshilgan boʻlsa — oʻchirmay, faqat kamaytiradi', () => {
    const plan = planRollback({
      manifest: {
        ...manifest,
        stock: [{ ...manifest.stock[0]!, deltaQty: '4', created: false }],
      },
      currentByCell: [
        { storeId: S, cellId: 'c1', assortmentKind: 'product', assortmentId: 'p1', qty: '9' },
      ],
      cellsInUse: new Set<string>(),
    });
    expect(plan.stockDecrements).toEqual([
      { storeId: S, cellId: 'c1', assortmentKind: 'product', assortmentId: 'p1', qty: '4' },
    ]);
    expect(plan.stockDeletes).toHaveLength(0);
    // 5 qoladi ⇒ yacheykani o'chirib bo'lmaydi.
    expect(plan.cellDeletes).toHaveLength(0);
  });

  it("hujjatda ishlatilgan yacheyka o'chirilmaydi (zona ham qoladi)", () => {
    const plan = planRollback({
      manifest,
      currentByCell: [
        { storeId: S, cellId: 'c1', assortmentKind: 'product', assortmentId: 'p1', qty: '10' },
      ],
      cellsInUse: new Set(['c1']),
    });
    expect(plan.stockDeletes).toHaveLength(1);
    expect(plan.cellDeletes).toHaveLength(0);
    expect(plan.blocked.map((b) => b.reason)).toContain('cell-in-use');
    expect(plan.zoneDeletes).toHaveLength(0);
  });

  it("migratsiyadan keyin ZONAGA yangi yacheyka qo'shilgan bo'lsa — zona qoladi", () => {
    const plan = planRollback({
      manifest,
      currentByCell: [],
      cellsInUse: new Set<string>(),
      zoneCellCounts: new Map([['z1', 3]]),
    });
    expect(plan.cellDeletes).toEqual(['c1']);
    expect(plan.zoneDeletes).toHaveLength(0);
    expect(plan.blocked.map((b) => b.reason)).toContain('zone-not-empty');
  });
});
