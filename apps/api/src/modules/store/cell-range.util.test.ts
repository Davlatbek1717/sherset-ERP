import { describe, expect, it } from 'vitest';
import { CELL_RANGE_MAX, CellRangeError, expandCellRange } from './cell-range.util.js';

const num = (key: string, from: number, to: number, pad?: number) =>
  ({ key, kind: 'number', from, to, ...(pad === undefined ? {} : { pad }) }) as const;
const letter = (key: string, from: string, to: string) =>
  ({ key, kind: 'letter', from, to }) as const;

describe('expandCellRange', () => {
  it("bitta raqamli o'zgaruvchi", () => {
    const r = expandCellRange({ template: 'A-{n}', variables: [num('n', 1, 3)], zoneFrom: null });
    expect(r.map((c) => c.name)).toEqual(['A-1', 'A-2', 'A-3']);
    expect(r.every((c) => c.zoneName === null)).toBe(true);
  });

  it("pad nol bilan to'ldiradi", () => {
    const r = expandCellRange({ template: '{n}', variables: [num('n', 9, 10, 3)], zoneFrom: null });
    expect(r.map((c) => c.name)).toEqual(['009', '010']);
  });

  it('harf diapazoni', () => {
    const r = expandCellRange({
      template: '{s}',
      variables: [letter('s', 'A', 'D')],
      zoneFrom: null,
    });
    expect(r.map((c) => c.name)).toEqual(['A', 'B', 'C', 'D']);
  });

  it("BIRINCHI o'zgaruvchi eng SEKIN aylanadi", () => {
    const r = expandCellRange({
      template: '{a}-{b}',
      variables: [num('a', 1, 2), num('b', 1, 3)],
      zoneFrom: null,
    });
    expect(r.map((c) => c.name)).toEqual(['1-1', '1-2', '1-3', '2-1', '2-2', '2-3']);
  });

  it("uch o'zgaruvchi — to'liq dekart ko'paytmasi", () => {
    const r = expandCellRange({
      template: '{a}-{b}-{c}',
      variables: [num('a', 1, 2, 2), letter('b', 'A', 'B'), num('c', 1, 2)],
      zoneFrom: null,
    });
    expect(r.map((c) => c.name)).toEqual([
      '01-A-1',
      '01-A-2',
      '01-B-1',
      '01-B-2',
      '02-A-1',
      '02-A-2',
      '02-B-1',
      '02-B-2',
    ]);
  });

  it("zoneFrom → zona nomi o'sha o'zgaruvchi qiymati", () => {
    const r = expandCellRange({
      template: '{a}-{b}',
      variables: [num('a', 1, 2, 2), num('b', 1, 2)],
      zoneFrom: 'a',
    });
    expect(r.map((c) => c.zoneName)).toEqual(['01', '01', '02', '02']);
  });

  it("e'lon qilinmagan {x} → xato", () => {
    expect(() =>
      expandCellRange({ template: '{a}-{x}', variables: [num('a', 1, 2)], zoneFrom: null }),
    ).toThrow(CellRangeError);
  });

  it("ishlatilmagan o'zgaruvchi → xato", () => {
    expect(() =>
      expandCellRange({
        template: '{a}',
        variables: [num('a', 1, 2), num('b', 1, 2)],
        zoneFrom: null,
      }),
    ).toThrow(CellRangeError);
  });

  it('takroriy key → xato', () => {
    expect(() =>
      expandCellRange({
        template: '{a}',
        variables: [num('a', 1, 2), num('a', 3, 4)],
        zoneFrom: null,
      }),
    ).toThrow(CellRangeError);
  });

  it('from > to → xato', () => {
    expect(() =>
      expandCellRange({ template: '{a}', variables: [num('a', 5, 1)], zoneFrom: null }),
    ).toThrow(CellRangeError);
    expect(() =>
      expandCellRange({ template: '{a}', variables: [letter('a', 'E', 'B')], zoneFrom: null }),
    ).toThrow(CellRangeError);
  });

  it("kichik harf qabul qilinadi, ko'p belgili harf → xato", () => {
    expect(() =>
      expandCellRange({ template: '{a}', variables: [letter('a', 'a', 'z')], zoneFrom: null }),
    ).not.toThrow(); // kichik harf katta harfga keltiriladi
    expect(() =>
      expandCellRange({ template: '{a}', variables: [letter('a', 'AB', 'AC')], zoneFrom: null }),
    ).toThrow(CellRangeError);
  });

  it("bo'sh variables → xato", () => {
    expect(() => expandCellRange({ template: 'A', variables: [], zoneFrom: null })).toThrow(
      CellRangeError,
    );
  });

  it("zoneFrom mavjud bo'lmagan keyga ishora qilsa → xato", () => {
    expect(() =>
      expandCellRange({ template: '{a}', variables: [num('a', 1, 2)], zoneFrom: 'yoq' }),
    ).toThrow(CellRangeError);
  });

  it("5000 chegarasi: 5000 o'tadi, 5001 xato", () => {
    expect(
      expandCellRange({
        template: '{a}',
        variables: [num('a', 1, CELL_RANGE_MAX)],
        zoneFrom: null,
      }),
    ).toHaveLength(CELL_RANGE_MAX);
    expect(() =>
      expandCellRange({
        template: '{a}',
        variables: [num('a', 1, CELL_RANGE_MAX + 1)],
        zoneFrom: null,
      }),
    ).toThrow(/5000/);
  });

  it('255 belgidan uzun nom → xato', () => {
    expect(() =>
      expandCellRange({
        template: `${'x'.repeat(255)}{a}`,
        variables: [num('a', 1, 1)],
        zoneFrom: null,
      }),
    ).toThrow(CellRangeError);
  });

  it('pad chegaradan tashqari → xato', () => {
    expect(() =>
      expandCellRange({ template: '{a}', variables: [num('a', 1, 2, 7)], zoneFrom: null }),
    ).toThrow(CellRangeError);
  });
});
