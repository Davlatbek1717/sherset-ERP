import { describe, expect, it } from 'vitest';
import { CellRangeError, expandWarehouseNumbering } from './cell-range.util.js';

/**
 * F3 (reja 2026-08-23) — ombor retsepti → `NN-SS-QQ-OO` yacheykalar,
 * zona = stelaj (`NN-SS`). Yoyish mavjud `expandCellRange` ustida, shuning
 * uchun bu testlar nomlash shakli va chegaralarni qulflaydi.
 */
describe('expandWarehouseNumbering', () => {
  it('kichik retsept: nomlar, zonalar va tartib', () => {
    const r = expandWarehouseNumbering({
      warehouseNo: '03',
      stelajlar: [
        { qavatlar: 2, orinlar: 3 },
        { qavatlar: 1, orinlar: 2 },
      ],
    });
    expect(r.map((c) => c.name)).toEqual([
      '03-01-01-01',
      '03-01-01-02',
      '03-01-01-03',
      '03-01-02-01',
      '03-01-02-02',
      '03-01-02-03',
      '03-02-01-01',
      '03-02-01-02',
    ]);
    // Zona = stelaj, nomi NN-SS (yalang'och SS emas — umumiy Store'dagi eski
    // chalkash zonalarga yopishib qolmasin).
    expect(r.slice(0, 6).every((c) => c.zoneName === '03-01')).toBe(true);
    expect(r.slice(6).every((c) => c.zoneName === '03-02')).toBe(true);
  });

  it("bir xonali ombor raqami nol bilan to'ldiriladi («3» → «03-…»)", () => {
    const r = expandWarehouseNumbering({
      warehouseNo: '3',
      stelajlar: [{ qavatlar: 1, orinlar: 1 }],
    });
    expect(r).toEqual([{ name: '03-01-01-01', zoneName: '03-01' }]);
  });

  it('har stelaj o‘z o‘lchamida yoyiladi (turlicha qavat/o‘rin)', () => {
    const r = expandWarehouseNumbering({
      warehouseNo: '07',
      stelajlar: [
        { qavatlar: 1, orinlar: 1 },
        { qavatlar: 2, orinlar: 1 },
      ],
    });
    expect(r.map((c) => c.name)).toEqual(['07-01-01-01', '07-02-01-01', '07-02-02-01']);
  });

  it('raqam bo‘lmagan yoki 2 xonadan uzun ombor raqami — aniq xato', () => {
    for (const bad of ['', 'AB', '123', '0x']) {
      expect(() =>
        expandWarehouseNumbering({ warehouseNo: bad, stelajlar: [{ qavatlar: 1, orinlar: 1 }] }),
      ).toThrow(CellRangeError);
    }
  });

  it('ombor raqami 00 rad etiladi (raqamlash 01 dan)', () => {
    expect(() =>
      expandWarehouseNumbering({ warehouseNo: '00', stelajlar: [{ qavatlar: 1, orinlar: 1 }] }),
    ).toThrow(/01 dan/);
  });

  it('bo‘sh stelajlar ro‘yxati rad etiladi', () => {
    expect(() => expandWarehouseNumbering({ warehouseNo: '03', stelajlar: [] })).toThrow(
      CellRangeError,
    );
  });

  it('qavat/o‘rin chegaralari: 0, kasr va 99 dan katta — stelaj raqami bilan xato', () => {
    expect(() =>
      expandWarehouseNumbering({ warehouseNo: '03', stelajlar: [{ qavatlar: 0, orinlar: 1 }] }),
    ).toThrow(/1-stelaj/);
    expect(() =>
      expandWarehouseNumbering({
        warehouseNo: '03',
        stelajlar: [
          { qavatlar: 1, orinlar: 1 },
          { qavatlar: 2, orinlar: 100 },
        ],
      }),
    ).toThrow(/2-stelaj/);
    expect(() =>
      expandWarehouseNumbering({ warehouseNo: '03', stelajlar: [{ qavatlar: 1.5, orinlar: 1 }] }),
    ).toThrow(CellRangeError);
  });

  it('jami 5000 dan oshsa massiv qurilmasdan rad etiladi', () => {
    // 51 stelaj × 99 o'rin = 5049 — chegaradan bir stelaj oshadi.
    const stelajlar = Array.from({ length: 51 }, () => ({ qavatlar: 1, orinlar: 99 }));
    expect(() => expandWarehouseNumbering({ warehouseNo: '03', stelajlar })).toThrow(
      /chegara 5000/,
    );
  });

  it('chegara ichidagi katta retsept ishlaydi (jami = 5000 emas, 4950)', () => {
    const stelajlar = Array.from({ length: 50 }, () => ({ qavatlar: 1, orinlar: 99 }));
    const r = expandWarehouseNumbering({ warehouseNo: '05', stelajlar });
    expect(r).toHaveLength(4950);
    expect(r[0]?.name).toBe('05-01-01-01');
    expect(r[r.length - 1]?.name).toBe('05-50-01-99');
  });
});
