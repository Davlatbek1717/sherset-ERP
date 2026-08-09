import { describe, expect, it } from 'vitest';
import { ceilAmountInput, formatAmountInput, parseAmountToMinor } from './parse-amount';

/**
 * FE-08 / FE-09 — POS dialoglaridagi pul-parse.
 *
 * Ilgari to'rt mustaqil variant bor edi:
 *   payment-dialog:        `BigInt(parseInt(s, 10) * 100)`   — tiyinni JIM kesardi
 *   debt-payment-dialog:   `BigInt(Math.round(n * 100))`     — float orqali
 *   rasmilashtirish-modal: `BigInt(Math.round(n * 100))`     — float orqali
 *   cash-out-dialog:       `BigInt(Math.round(n * 100))`     — float orqali
 * ...va hammasida scale QATTIQ `100` edi — 0 kasrli kassada (JPY uslubi)
 * summa 100× shishardi. Shu fayl yagona shartnomani qulflaydi.
 */
describe('parseAmountToMinor', () => {
  it('butun so`m → tiyin', () => {
    expect(parseAmountToMinor('1500', 'UZS')).toBe(150_000n);
  });

  it('kasrli kiritma tiyingacha saqlanadi (parseInt uni kesardi)', () => {
    // Eski `parseInt('1500.75', 10) * 100` = 150 000 — 75 tiyin yo'qolardi.
    expect(parseAmountToMinor('1500.75', 'UZS')).toBe(150_075n);
  });

  it('0 kasrli valyutada 100× shishmaydi', () => {
    // Qattiq `* 100` bu yerda 150 000 berardi — kassa summasi 100 barobar.
    expect(parseAmountToMinor('1500', 'JPY')).toBe(1500n);
  });

  it('valyuta scale`idan ortiq kasr YUQORIGA yaxlitlanadi (half-up)', () => {
    // `Math.round(1.005 * 100)` = 100 (IEEE-754: 100.49999999999999),
    // `parseInt` esa 1 berardi. To'g'ri javob — 101 tiyin.
    expect(parseAmountToMinor('1.005', 'UZS')).toBe(101n);
  });

  it('probel/vergul bilan yozilgan summa ham o`qiladi', () => {
    expect(parseAmountToMinor('1 000,50', 'UZS')).toBe(100_050n);
  });

  it('bo`sh/probel kiritma → 0n', () => {
    expect(parseAmountToMinor('', 'UZS')).toBe(0n);
    expect(parseAmountToMinor('   ', 'UZS')).toBe(0n);
  });

  it('buzuq kiritma → 0n (otilmaydi)', () => {
    // Dialog render paytida hisoblaydi — istisno butun oynani yiqitardi.
    expect(parseAmountToMinor('abc', 'UZS')).toBe(0n);
    expect(parseAmountToMinor('1.2.3', 'UZS')).toBe(0n);
    expect(parseAmountToMinor('1e5', 'UZS')).toBe(0n);
  });

  it('manfiy summa → 0n (kassa dialoglari manfiy qabul qilmaydi)', () => {
    expect(parseAmountToMinor('-500', 'UZS')).toBe(0n);
  });

  it('juda uzun kiritma aniq va otilmasdan o`qiladi (FE-12 klassi)', () => {
    // 17 raqam: `parseInt(s) * 100` > 2^53 → kasrli float → `BigInt()` RangeError
    // tashlab dialogni yiqitardi.
    expect(parseAmountToMinor('99999999999999999', 'UZS')).toBe(9_999_999_999_999_999_900n);
  });

  it('valyuta berilmasa UZS', () => {
    expect(parseAmountToMinor('1500')).toBe(150_000n);
  });
});

/**
 * Teskari yo'nalish — tiyin → maydon matni. `Number(minor) / 100` katta
 * summada yaxlitlardi va 0 kasrli valyutada 100× kichraytirardi, shuning
 * uchun konversiya butunlay satr/bigint ustida bajariladi.
 */
describe('formatAmountInput', () => {
  it('butun summa kasrsiz ko`rsatiladi', () => {
    expect(formatAmountInput(150_000n, 'UZS')).toBe('1500');
  });

  it('tiyin qismi saqlanadi', () => {
    expect(formatAmountInput(150_075n, 'UZS')).toBe('1500.75');
    expect(formatAmountInput(5n, 'UZS')).toBe('0.05');
  });

  it('0 kasrli valyutada bo`linmaydi', () => {
    expect(formatAmountInput(1500n, 'JPY')).toBe('1500');
  });

  it('2^53 dan katta summada aniq (Number yaxlitlardi)', () => {
    expect(formatAmountInput(9_007_199_254_740_993n, 'UZS')).toBe('90071992547409.93');
  });

  it('nol va manfiy → «0»', () => {
    expect(formatAmountInput(0n, 'UZS')).toBe('0');
    expect(formatAmountInput(-5n, 'UZS')).toBe('0');
  });
});

describe('ceilAmountInput', () => {
  it('«Aniq» tugmasi butun so`mgacha YUQORIGA yaxlitlaydi', () => {
    // Naqd kassada tiyin yo'q — kassir 1500.01 ni 1501 qilib beradi.
    expect(ceilAmountInput(150_001n, 'UZS')).toBe('1501');
  });

  it('aynan butun summa oshirilmaydi', () => {
    expect(ceilAmountInput(150_000n, 'UZS')).toBe('1500');
  });

  it('0 kasrli valyutada summaning o`zi', () => {
    expect(ceilAmountInput(1500n, 'JPY')).toBe('1500');
  });

  it('manfiy/nol → «0»', () => {
    expect(ceilAmountInput(0n, 'UZS')).toBe('0');
    expect(ceilAmountInput(-1n, 'UZS')).toBe('0');
  });
});
