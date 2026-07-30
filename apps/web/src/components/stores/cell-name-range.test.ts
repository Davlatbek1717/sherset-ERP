import { describe, expect, it } from 'vitest';
import { cellNameInRange, filterCellsByRange, parseCellName } from './cell-name-range.js';

const r = (from: number, to: number) => ({ from, to });
/** Ombor cheklanmagan + polka/qator/yacheyka diapazoni. */
const four = (
  polka: { from: number; to: number } | null,
  qator: { from: number; to: number } | null,
  yach: { from: number; to: number } | null,
) => [null, polka, qator, yach];

describe('parseCellName', () => {
  it("to'g'ri 4 segmentli nom → raqamlar", () => {
    expect(parseCellName('01-02-03-04', 4)).toEqual([1, 2, 3, 4]);
  });

  it("nol bilan to'ldirilmagan nom ham o'qiladi", () => {
    expect(parseCellName('1-2-3-4', 4)).toEqual([1, 2, 3, 4]);
  });

  it('segment soni mos kelmasa → null', () => {
    expect(parseCellName('01-02-03', 4)).toBeNull();
    expect(parseCellName('01-02-03-04-05', 4)).toBeNull();
  });

  it("harfli yoki bo'sh segment → null (eski/erkin nomlar)", () => {
    expect(parseCellName('01-A-03-04', 4)).toBeNull();
    expect(parseCellName('01--03-04', 4)).toBeNull();
    expect(parseCellName('Sovuq xona', 4)).toBeNull();
  });

  it("atrofdagi bo'shliq tozalanadi", () => {
    expect(parseCellName('  01-02-03-04  ', 4)).toEqual([1, 2, 3, 4]);
  });
});

describe('cellNameInRange', () => {
  it('hamma segment diapazon ichida → true', () => {
    expect(cellNameInRange('01-02-03-04', four(r(1, 5), r(1, 4), r(1, 20)))).toBe(true);
  });

  it('bitta segment tashqarida → false', () => {
    expect(cellNameInRange('01-06-03-04', four(r(1, 5), r(1, 4), r(1, 20)))).toBe(false);
    expect(cellNameInRange('01-02-09-04', four(r(1, 5), r(1, 4), r(1, 20)))).toBe(false);
    expect(cellNameInRange('01-02-03-99', four(r(1, 5), r(1, 4), r(1, 20)))).toBe(false);
  });

  it("chegaralar YOPIQ (from va to ning o'zi kiradi)", () => {
    expect(cellNameInRange('01-01-01-01', four(r(1, 5), r(1, 4), r(1, 20)))).toBe(true);
    expect(cellNameInRange('01-05-04-20', four(r(1, 5), r(1, 4), r(1, 20)))).toBe(true);
  });

  it('null segment = cheklanmagan', () => {
    // Faqat polka cheklangan; qator/yacheyka istalgan.
    expect(cellNameInRange('01-03-77-99', four(r(1, 5), null, null))).toBe(true);
    expect(cellNameInRange('01-09-77-99', four(r(1, 5), null, null))).toBe(false);
  });

  it('ombor segmenti ham cheklanishi mumkin', () => {
    expect(cellNameInRange('02-01-01-01', [r(2, 2), null, null, null])).toBe(true);
    expect(cellNameInRange('01-01-01-01', [r(2, 2), null, null, null])).toBe(false);
  });

  it("shakli mos kelmagan nom hech qachon tushmaydi (hatto hammasi null bo'lsa ham)", () => {
    expect(cellNameInRange('Sovuq xona', [null, null, null, null])).toBe(false);
    expect(cellNameInRange('01-A-03-04', [null, null, null, null])).toBe(false);
  });
});

describe('filterCellsByRange', () => {
  const cells = [
    { id: 'a', name: '01-01-01-01' },
    { id: 'b', name: '01-01-01-02' },
    { id: 'c', name: '01-02-01-01' },
    { id: 'd', name: '01-09-01-01' },
    { id: 'e', name: 'Sovuq xona' }, // erkin nom — hech qachon tanlanmasin
  ];

  it('faqat mos kelganlarini qaytaradi', () => {
    const got = filterCellsByRange(cells, four(r(1, 2), r(1, 1), r(1, 2)));
    expect(got.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('erkin nomli yacheyka hech qachon kirmaydi', () => {
    const got = filterCellsByRange(cells, [null, null, null, null]);
    expect(got.map((c) => c.id)).not.toContain('e');
    expect(got).toHaveLength(4);
  });

  it("mos keladigani bo'lmasa — bo'sh massiv", () => {
    expect(filterCellsByRange(cells, four(r(50, 60), null, null))).toEqual([]);
  });
});
