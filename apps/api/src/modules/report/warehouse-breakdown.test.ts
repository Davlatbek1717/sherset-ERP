import { describe, expect, it } from 'vitest';
import {
  buildProductCellBreakdown,
  buildWarehouseSummary,
  comparePrefix,
  warehousePrefixOf,
} from './warehouse-breakdown.js';

/**
 * Ombor-kesim hisob-mantig'ining qulfi (F1 prefiks davri → F7 Store davri).
 * F7'dan boshlab qator = HAQIQIY Store: jami / yacheykalarda / biriktirilmagan;
 * invariant Σqatorlar.qty == JAMI. Prefiks-yordamchilar tovar kartasi uchun qoladi.
 */

describe('warehousePrefixOf — yacheyka kodidan ombor prefiksi', () => {
  it('standart kod: birinchi segment', () => {
    expect(warehousePrefixOf('01-02-03-04')).toBe('01');
    expect(warehousePrefixOf('02-11-1-9')).toBe('02');
    expect(warehousePrefixOf('7-1-1-1')).toBe('7');
  });

  it('nostandart nom → null (prefikssiz guruh, yo`qolmaydi)', () => {
    expect(warehousePrefixOf('A-1-2')).toBeNull();
    expect(warehousePrefixOf('polka3')).toBeNull();
    expect(warehousePrefixOf('')).toBeNull();
    expect(warehousePrefixOf('01')).toBeNull(); // defis yo'q — segmentlanmagan
  });

  it('atrofidagi bo`shliqlar kesiladi', () => {
    expect(warehousePrefixOf(' 03-01-01-01 ')).toBe('03');
  });
});

describe('comparePrefix — tartib: raqam bo`yicha, null oxirida', () => {
  it('sorts numerically with null last', () => {
    const arr: Array<string | null> = ['10', null, '02', '1'];
    expect(arr.sort(comparePrefix)).toEqual(['1', '02', '10', null]);
  });
});

describe('buildWarehouseSummary — F7: haqiqiy Store qatorlari + JAMI', () => {
  it('invariant: Σqatorlar.qty == JAMI; unassigned = qty − assigned', () => {
    const s = buildWarehouseSummary(
      [
        {
          storeId: 'S2',
          storeName: 'Taqsimlanmagan',
          skuCount: 390,
          qty: '49500000',
          assignedQty: '0',
        },
        {
          storeId: 'S1',
          storeName: 'Ombor 02',
          skuCount: 273,
          qty: '3000000',
          assignedQty: '3000000',
        },
      ],
      { totalQty: '52500000', totalSku: 400, unassignedQty: '49500000' },
    );
    // nom bo'yicha sortlangan
    expect(s.rows.map((r) => r.storeName)).toEqual(['Ombor 02', 'Taqsimlanmagan']);
    const sum = s.rows.reduce((acc, r) => acc + Number(r.qty), 0);
    expect(sum).toBe(Number(s.totalQty));
    expect(s.rows[0]?.unassignedQty).toBe('0');
    expect(s.rows[1]?.unassignedQty).toBe('49500000');
    expect(s.totalAssignedQty).toBe('3000000');
    expect(s.totalUnassignedQty).toBe('49500000');
    expect(s.totalSku).toBe(400);
  });

  it('hideEmpty: qty=0 va assigned=0 ombor qatori tushib qoladi', () => {
    const s = buildWarehouseSummary(
      [
        { storeId: 'S1', storeName: 'A', skuCount: 0, qty: '0', assignedQty: '0' },
        { storeId: 'S2', storeName: 'B', skuCount: 1, qty: '4', assignedQty: '4' },
        // qty 0, lekin yacheykada bor (nomuvofiqlik) — YASHIRILMAYDI
        { storeId: 'S3', storeName: 'C', skuCount: 0, qty: '0', assignedQty: '2' },
      ],
      { totalQty: '4', totalSku: 1, unassignedQty: '-2' },
      { hideEmpty: true },
    );
    expect(s.rows.map((r) => r.storeName)).toEqual(['B', 'C']);
  });

  it('kasrli qoldiqlar Decimal bilan hisoblanadi (float drift yo`q)', () => {
    const s = buildWarehouseSummary(
      [{ storeId: 'S1', storeName: 'A', skuCount: 1, qty: '0.3', assignedQty: '0.1' }],
      { totalQty: '0.3', totalSku: 1, unassignedQty: '0.2' },
    );
    expect(s.rows[0]?.unassignedQty).toBe('0.2');
    expect(s.totalAssignedQty).toBe('0.1');
  });
});

describe('buildProductCellBreakdown — tovar kartasi yacheykalar kesimi', () => {
  const stocks = [{ storeId: 'S1', storeName: 'Ombor 2', qty: '100' }];
  const cells = [
    { storeId: 'S1', cellId: 'c1', cellName: '01-02-03-04', qty: '10' },
    { storeId: 'S1', cellId: 'c2', cellName: '01-01-01-01', qty: '5' },
    { storeId: 'S1', cellId: 'c3', cellName: '02-05-02-03', qty: '25' },
  ];

  it('prefiks guruhlari + biriktirilmagan qoldiq (jami − Σyacheyka)', () => {
    const out = buildProductCellBreakdown(stocks, cells);
    expect(out).toHaveLength(1);
    const s = out[0];
    expect(s?.totalQty).toBe('100');
    expect(s?.assignedQty).toBe('40');
    expect(s?.unassignedQty).toBe('60');
    expect(s?.groups.map((g) => g.prefix)).toEqual(['01', '02']);
    expect(s?.groups[0]?.qty).toBe('15');
    // yacheykalar nom bo'yicha sortlangan
    expect(s?.groups[0]?.cells.map((c) => c.name)).toEqual(['01-01-01-01', '01-02-03-04']);
  });

  it('yacheyka jami ombordan oshsa unassigned MANFIY — halol ko`rsatiladi', () => {
    const out = buildProductCellBreakdown(
      [{ storeId: 'S1', storeName: 'X', qty: '3' }],
      [{ storeId: 'S1', cellId: 'c1', cellName: '01-01-01-01', qty: '10' }],
    );
    expect(out[0]?.unassignedQty).toBe('-7');
  });

  it('stock qatori yo`q, lekin yacheykada qoldiq bor ombor ham chiqadi', () => {
    const out = buildProductCellBreakdown(
      [],
      [{ storeId: 'S9', cellId: 'c1', cellName: '03-01-01-01', qty: '4' }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.totalQty).toBe('0');
    expect(out[0]?.unassignedQty).toBe('-4');
  });

  it('yacheykasiz tovar: faqat biriktirilmagan qator', () => {
    const out = buildProductCellBreakdown(stocks, []);
    expect(out[0]?.groups).toEqual([]);
    expect(out[0]?.unassignedQty).toBe('100');
  });
});
