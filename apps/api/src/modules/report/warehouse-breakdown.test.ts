import { describe, expect, it } from 'vitest';
import {
  buildProductCellBreakdown,
  buildWarehouseSummary,
  comparePrefix,
  warehousePrefixOf,
} from './warehouse-breakdown.js';

/**
 * F1 (2026-08-23 reja) — yacheyka-prefiks hisob-mantig'ining qulfi.
 * Qabul mezoni: 01/02/Taqsimlanmagan/JAMI raqamlari DB'dagi haqiqiy sonlarga
 * teng — bu yerda SOF funksiya darajasida invariantlar qulflanadi
 * (Σprefiks + Taqsimlanmagan == JAMI; hech bir yacheyka qoldig'i yo'qolmaydi).
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

describe('buildWarehouseSummary — Ombor 01/02 + Taqsimlanmagan + JAMI', () => {
  it('invariant: Σprefiks + unassigned == JAMI (reja qabul mezoni)', () => {
    const s = buildWarehouseSummary(
      [
        { prefix: '02', skuCount: 5, qty: '2000.5' },
        { prefix: '01', skuCount: 3, qty: '950' },
      ],
      { totalQty: '52500000', totalSku: 400, unassignedQty: '52497049.5', unassignedSku: 390 },
    );
    expect(s.rows.map((r) => r.prefix)).toEqual(['01', '02']); // sortlangan
    const assigned = s.rows.reduce((acc, r) => acc + Number(r.qty), 0);
    expect(assigned + Number(s.unassigned.qty)).toBe(Number(s.totalQty));
    expect(s.totalSku).toBe(400);
    expect(s.unassigned.skuCount).toBe(390);
  });

  it('null-prefiks guruhlar birlashadi va oxirida turadi', () => {
    const s = buildWarehouseSummary(
      [
        { prefix: null, skuCount: 1, qty: '5' },
        { prefix: '01', skuCount: 2, qty: '10' },
        { prefix: null, skuCount: 1, qty: '7' },
      ],
      { totalQty: '30', totalSku: 4, unassignedQty: '8', unassignedSku: 2 },
    );
    expect(s.rows).toHaveLength(2);
    expect(s.rows[1]).toEqual({ prefix: null, skuCount: 2, qty: '12' });
  });

  it('hideEmpty: qty=0 prefiks qatori tushib qoladi', () => {
    const s = buildWarehouseSummary(
      [
        { prefix: '01', skuCount: 1, qty: '0' },
        { prefix: '02', skuCount: 1, qty: '4' },
      ],
      { totalQty: '4', totalSku: 1, unassignedQty: '0', unassignedSku: 0 },
      { hideEmpty: true },
    );
    expect(s.rows.map((r) => r.prefix)).toEqual(['02']);
  });

  it('kasrli qoldiqlar Decimal bilan yig`iladi (float drift yo`q)', () => {
    const s = buildWarehouseSummary(
      [
        { prefix: null, skuCount: 1, qty: '0.1' },
        { prefix: null, skuCount: 1, qty: '0.2' },
      ],
      { totalQty: '0.3', totalSku: 2, unassignedQty: '0', unassignedSku: 0 },
    );
    expect(s.rows[0]?.qty).toBe('0.3');
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
