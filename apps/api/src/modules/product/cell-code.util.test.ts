import { describe, expect, it } from 'vitest';
import { formatCellCode, parseCellCode, segmentWhere } from './cell-code.util.js';

describe('parseCellCode', () => {
  it('tireli padded kodni parse qiladi', () => {
    expect(parseCellCode('02-17-02-15')).toEqual({ sklad: 2, polka: 17, qavat: 2, yacheyka: 15 });
  });

  it('tireli unpadded kodni parse qiladi (2-17-2-15)', () => {
    expect(parseCellCode('2-17-2-15')).toEqual({ sklad: 2, polka: 17, qavat: 2, yacheyka: 15 });
  });

  it('skaner yuboradigan 8 raqamni parse qiladi (CODE128C, tiresiz)', () => {
    expect(parseCellCode('02170215')).toEqual({ sklad: 2, polka: 17, qavat: 2, yacheyka: 15 });
  });

  it('atrofidagi bo‘shliqlarni kechiradi', () => {
    expect(parseCellCode('  02170215  ')).not.toBeNull();
  });

  it("noto'g'ri shakllar → null", () => {
    for (const bad of ['', 'abc', '123', '1-2-3', '1-2-3-4-5', '021702150', 'aa-bb-cc-dd']) {
      expect(parseCellCode(bad), bad).toBeNull();
    }
  });
});

describe('formatCellCode', () => {
  it('kanonik padded ko‘rinish qaytaradi', () => {
    expect(formatCellCode({ sklad: 2, polka: 17, qavat: 2, yacheyka: 15 })).toBe('02-17-02-15');
  });
});

describe('segmentWhere', () => {
  it('0 → NULL yoki 0 (formatBinLocation 00 semantikasi)', () => {
    expect(segmentWhere('locPolka', 0)).toEqual({ OR: [{ locPolka: null }, { locPolka: 0 }] });
  });

  it('musbat qiymat → aniq tenglik', () => {
    expect(segmentWhere('locPolka', 17)).toEqual({ locPolka: 17 });
  });
});
