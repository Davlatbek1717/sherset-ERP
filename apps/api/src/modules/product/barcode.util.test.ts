import { describe, expect, it } from 'vitest';
import { ean13CheckDigit, isValidEan13, makeEan13 } from './barcode.util.js';

describe('EAN-13 shtrix-kod generatori', () => {
  it('nazorat raqamini standart bo`yicha hisoblaydi', () => {
    // Ma'lum EAN-13 misollar (oxirgi raqam — nazorat).
    expect(ean13CheckDigit('400638133393')).toBe('1'); // 4006381333931
    expect(ean13CheckDigit('978014300723')).toBe('4'); // 9780143007234
    expect(ean13CheckDigit('590123412345')).toBe('7'); // 5901234123457
  });

  it('makeEan13 — «21» prefiksli, 13 xonali, o`zini nazorat raqami bilan', () => {
    const code = makeEan13(1);
    expect(code).toHaveLength(13);
    expect(code.startsWith('21')).toBe(true);
    expect(isValidEan13(code)).toBe(true);
  });

  it('har xil seq → har xil kod, barchasi valid', () => {
    const a = makeEan13(1);
    const b = makeEan13(2);
    const c = makeEan13(123456);
    expect(new Set([a, b, c]).size).toBe(3);
    for (const code of [a, b, c]) expect(isValidEan13(code)).toBe(true);
  });

  it('seed test barcode`lari («20…») bilan to`qnashmaydi (prefiks «21»)', () => {
    expect(makeEan13(2).startsWith('20')).toBe(false);
  });

  it('isValidEan13 — noto`g`ri nazorat raqamini rad etadi', () => {
    expect(isValidEan13('2100000000010')).toBe(false); // qasddan buzilgan
    expect(isValidEan13('123')).toBe(false);
    expect(isValidEan13('abcdefghijklm')).toBe(false);
  });

  it('makeEan13 — chegaradan tashqari seq rad etiladi', () => {
    expect(() => makeEan13(-1)).toThrow();
    expect(() => makeEan13(10_000_000_000)).toThrow();
  });
});
