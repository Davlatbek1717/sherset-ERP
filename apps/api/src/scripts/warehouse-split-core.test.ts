import { describe, expect, it } from 'vitest';
import {
  type CellRow,
  type StockByCellRow,
  type StockRow,
  type StoreRow,
  UNALLOCATED_STORE_NAME,
  buildSplitPlan,
  parseCellCode,
  storeNameFor,
} from '../../../../packages/db/scripts/warehouse-split-core.js';

/**
 * F4 — ombor-split rejasining sof yadrosi (packages/db/scripts/
 * warehouse-split-core.ts) uchun qulf-testlar. Reja-invariantlar:
 * prefiks→ombor, zona=stelaj, cost o'rtacha-tortilgan va YO'QOLMAYDI,
 * ikkinchi yugurish no-op.
 */

const SRC = 'src-store';

function stores(extra: StoreRow[] = []): StoreRow[] {
  return [{ id: SRC, name: 'Ombor 2', archived: false }, ...extra];
}

function cell(id: string, name: string, storeId = SRC): CellRow {
  return { id, storeId, name, zoneId: null };
}

function sbc(cellId: string, qty: string, assortmentId = 'p1', storeId = SRC): StockByCellRow {
  return { storeId, cellId, assortmentKind: 'product', assortmentId, qty };
}

function stock(qty: string, cost: bigint, assortmentId = 'p1', storeId = SRC): StockRow {
  return { storeId, assortmentKind: 'product', assortmentId, qty, costBalanceMinor: cost };
}

describe('parseCellCode', () => {
  it('to‘liq kod: ombor + stelaj', () => {
    expect(parseCellCode('01-02-03-04')).toEqual({ warehouseNo: '01', stelaj: '02' });
  });
  it('1 xonali segmentlar 2 xonaga normallashadi', () => {
    expect(parseCellCode(' 1-2 ')).toEqual({ warehouseNo: '01', stelaj: '02' });
  });
  it('stelaj segmenti yo‘q bo‘lsa null', () => {
    expect(parseCellCode('03-')).toEqual({ warehouseNo: '03', stelaj: null });
  });
  it('nostandart nomlar ombor emas', () => {
    expect(parseCellCode('polka-7')).toBeNull();
    expect(parseCellCode('A1')).toBeNull();
    expect(parseCellCode('01')).toBeNull(); // defis yo'q
    expect(parseCellCode('00-01')).toBeNull(); // «00» ombor emas
    expect(parseCellCode('123-01')).toBeNull(); // 3 xonali prefiks ombor emas
  });
});

describe('buildSplitPlan — asosiy split', () => {
  const input = {
    stores: stores(),
    cells: [cell('c1', '01-01-01-01'), cell('c2', '01-02-01-01'), cell('c3', '02-01-01-01')],
    stockByCell: [sbc('c1', '4'), sbc('c2', '6'), sbc('c3', '5', 'p2')],
    stocks: [stock('10', 1000n), stock('7', 700n, 'p2')],
  };

  it('mavjud bo‘lmagan omborlar yaratish ro‘yxatiga tushadi', () => {
    const plan = buildSplitPlan(input);
    expect(plan.warehousesNeeded).toEqual(['01', '02']);
  });

  it('yacheykalar prefiksiga ko‘ra, zona = stelaj (2-segment)', () => {
    const plan = buildSplitPlan(input);
    expect(plan.cellMoves).toHaveLength(3);
    const byId = new Map(plan.cellMoves.map((m) => [m.cellId, m]));
    expect(byId.get('c1')).toMatchObject({ warehouseNo: '01', zoneName: '01', fromStoreId: SRC });
    expect(byId.get('c2')).toMatchObject({ warehouseNo: '01', zoneName: '02' });
    expect(byId.get('c3')).toMatchObject({ warehouseNo: '02', zoneName: '01' });
  });

  it('miqdorlar yacheykasi bilan ketadi, xulosa to‘g‘ri jamlanadi', () => {
    const plan = buildSplitPlan(input);
    expect(plan.qtyMoves).toHaveLength(3);
    const w1 = plan.summary.find((s) => s.warehouseNo === '01')!;
    expect(w1).toMatchObject({ cells: 2, zones: 2, sbcRows: 2, qty: '10' });
    const w2 = plan.summary.find((s) => s.warehouseNo === '02')!;
    expect(w2).toMatchObject({ cells: 1, zones: 1, sbcRows: 1, qty: '5' });
    expect(plan.sourceStoreIds).toEqual([SRC]);
    expect(plan.anomalies).toEqual([]);
  });

  it('manba to‘liq bo‘shaganda cost TO‘LIQ ketadi (tiyin qolmaydi)', () => {
    const plan = buildSplitPlan(input);
    const p1cost = plan.qtyMoves
      .filter((q) => q.assortmentId === 'p1')
      .reduce((a, q) => a + q.costMinor, 0n);
    expect(p1cost).toBe(1000n); // 4/10 → 400, qolgan 6 manbani bo'shatadi → 600
  });
});

describe('buildSplitPlan — cost arifmetikasi', () => {
  it('teng bo‘linmaydigan cost yaxlitlanadi, JAMI saqlanadi', () => {
    // 3 dona / 100 tiyin, 3 ta 1 donalik yacheyka: 33+33+34 = 100.
    const plan = buildSplitPlan({
      stores: stores(),
      cells: [cell('c1', '01-01-01-01'), cell('c2', '01-01-01-02'), cell('c3', '01-01-01-03')],
      stockByCell: [sbc('c1', '1'), sbc('c2', '1'), sbc('c3', '1')],
      stocks: [stock('3', 100n)],
    });
    const costs = plan.qtyMoves.map((q) => q.costMinor);
    expect(costs.reduce((a, b) => a + b, 0n)).toBe(100n);
    expect(costs.every((c) => c === 33n || c === 34n)).toBe(true);
  });

  it('qisman ko‘chishda qoldiq cost manbada qoladi', () => {
    // 10 dona / 1001 tiyin, yacheykada faqat 5 → per-unit 100, ketadi 500.
    const plan = buildSplitPlan({
      stores: stores(),
      cells: [cell('c1', '01-01-01-01')],
      stockByCell: [sbc('c1', '5')],
      stocks: [stock('10', 1001n)],
    });
    expect(plan.qtyMoves[0]!.costMinor).toBe(500n);
  });

  it('Stock qatori yo‘q assortimentda cost 0, miqdor baribir ko‘chadi', () => {
    const plan = buildSplitPlan({
      stores: stores(),
      cells: [cell('c1', '01-01-01-01')],
      stockByCell: [sbc('c1', '5')],
      stocks: [],
    });
    expect(plan.qtyMoves[0]!).toMatchObject({ qty: '5', costMinor: 0n });
    expect(plan.anomalies.map((a) => a.kind)).toContain('cell-exceeds-stock');
  });
});

describe('buildSplitPlan — idempotentlik va chetki holatlar', () => {
  it('yacheyka allaqachon o‘z omborida — reja bo‘sh (no-op)', () => {
    const plan = buildSplitPlan({
      stores: stores([{ id: 'w1', name: 'Ombor 01', archived: false }]),
      cells: [cell('c1', '01-01-01-01', 'w1')],
      stockByCell: [sbc('c1', '5', 'p1', 'w1')],
      stocks: [stock('5', 100n, 'p1', 'w1')],
    });
    expect(plan.cellMoves).toEqual([]);
    expect(plan.qtyMoves).toEqual([]);
    expect(plan.warehousesNeeded).toEqual([]);
    expect(plan.sourceStoreIds).toEqual([]);
  });

  it('arxivlangan «Ombor NN» maqsad emas — yangi Store kerak bo‘ladi', () => {
    const plan = buildSplitPlan({
      stores: stores([{ id: 'w1', name: 'Ombor 01', archived: true }]),
      cells: [cell('c1', '01-01-01-01')],
      stockByCell: [],
      stocks: [],
    });
    expect(plan.warehousesNeeded).toEqual(['01']);
  });

  it('nostandart nomli yacheyka joyida qoladi (anomaliya bilan)', () => {
    const plan = buildSplitPlan({
      stores: stores(),
      cells: [cell('c1', 'polka-7')],
      stockByCell: [sbc('c1', '9')],
      stocks: [stock('9', 0n)],
    });
    expect(plan.cellMoves).toEqual([]);
    expect(plan.anomalies).toEqual([expect.objectContaining({ kind: 'unparsed-cell' })]);
  });

  it('maqsad ombordagi nom to‘qnashuvi — yacheyka joyida qoladi', () => {
    const plan = buildSplitPlan({
      stores: stores([{ id: 'w1', name: 'Ombor 01', archived: false }]),
      cells: [cell('x', '01-01-01-01', 'w1'), cell('c1', '01-01-01-01')],
      stockByCell: [],
      stocks: [],
    });
    expect(plan.cellMoves).toEqual([]);
    expect(plan.anomalies).toEqual([expect.objectContaining({ kind: 'target-name-clash' })]);
  });

  it('ikki manbadan bir maqsad omborga BIR XIL nom — ikkinchisi to‘qnashuv', () => {
    const plan = buildSplitPlan({
      stores: stores([{ id: 'src2', name: 'Boshqa', archived: false }]),
      cells: [cell('c1', '01-01-01-01', SRC), cell('c2', '01-01-01-01', 'src2')],
      stockByCell: [],
      stocks: [],
    });
    expect(plan.cellMoves).toHaveLength(1);
    expect(plan.anomalies).toEqual([expect.objectContaining({ kind: 'target-name-clash' })]);
  });

  it('manfiy yacheyka-qoldiq imzoli ko‘chadi va anomaliya beradi', () => {
    const plan = buildSplitPlan({
      stores: stores(),
      cells: [cell('c1', '01-01-01-01')],
      stockByCell: [sbc('c1', '-2')],
      stocks: [stock('3', 0n)],
    });
    expect(plan.qtyMoves[0]!).toMatchObject({ qty: '-2', costMinor: 0n });
    expect(plan.anomalies.map((a) => a.kind)).toContain('negative-cell-qty');
  });

  it('nol qoldiqli qator qtyMove bermaydi, yacheyka baribir ko‘chadi', () => {
    const plan = buildSplitPlan({
      stores: stores(),
      cells: [cell('c1', '01-01-01-01')],
      stockByCell: [sbc('c1', '0')],
      stocks: [],
    });
    expect(plan.cellMoves).toHaveLength(1);
    expect(plan.qtyMoves).toEqual([]);
  });

  it('Σyacheyka > Stock — anomaliya, cost jami Stock qiymatidan oshmaydi', () => {
    const plan = buildSplitPlan({
      stores: stores(),
      cells: [cell('c1', '01-01-01-01'), cell('c2', '01-01-01-02')],
      stockByCell: [sbc('c1', '8'), sbc('c2', '7')], // 15 > 10
      stocks: [stock('10', 1000n)],
    });
    const total = plan.qtyMoves.reduce((a, q) => a + q.costMinor, 0n);
    expect(total).toBe(1000n);
    expect(plan.anomalies.map((a) => a.kind)).toContain('cell-exceeds-stock');
  });
});

describe('nomlash', () => {
  it('Store nomi «Ombor NN», taqsimlanmagan nom barqaror', () => {
    expect(storeNameFor('03')).toBe('Ombor 03');
    expect(UNALLOCATED_STORE_NAME).toBe('Taqsimlanmagan');
  });
});
