import { describe, expect, it } from 'vitest';
import { amountInWords } from './amount-in-words.ts';

/**
 * «Сумма прописью» — majburiy element of a UZ/CIS printed document.
 * Written FIRST (TDD): the cases below are the ones that actually break
 * naive implementations — gender, the 11–14 exception, and zero groups.
 */

describe('amountInWords — ru', () => {
  const ru = (minor: bigint | string) => amountInWords(minor, 'UZS', 'ru');

  it('renders whole sums with the tiyin remainder', () => {
    expect(ru(100_00n)).toBe('Сто сумов 00 тийин');
    expect(ru(100_45n)).toBe('Сто сумов 45 тийин');
  });

  it('declines the currency by the LAST significant digit', () => {
    expect(ru(1_00n)).toBe('Один сум 00 тийин');
    expect(ru(2_00n)).toBe('Два сума 00 тийин');
    expect(ru(5_00n)).toBe('Пять сумов 00 тийин');
    expect(ru(21_00n)).toBe('Двадцать один сум 00 тийин');
    expect(ru(22_00n)).toBe('Двадцать два сума 00 тийин');
  });

  it('handles the 11–14 exception (NOT «один»/«два» endings)', () => {
    // The classic bug: 11 ends in 1 but takes the plural form.
    expect(ru(11_00n)).toBe('Одиннадцать сумов 00 тийин');
    expect(ru(12_00n)).toBe('Двенадцать сумов 00 тийин');
    expect(ru(14_00n)).toBe('Четырнадцать сумов 00 тийин');
    expect(ru(111_00n)).toBe('Сто одиннадцать сумов 00 тийин');
  });

  it('uses FEMININE forms for тысяча (одна/две, not один/два)', () => {
    expect(ru(1_000_00n)).toBe('Одна тысяча сумов 00 тийин');
    expect(ru(2_000_00n)).toBe('Две тысячи сумов 00 тийин');
    expect(ru(5_000_00n)).toBe('Пять тысяч сумов 00 тийин');
    expect(ru(21_000_00n)).toBe('Двадцать одна тысяча сумов 00 тийин');
  });

  it('uses MASCULINE forms for миллион (один/два)', () => {
    expect(ru(1_000_000_00n)).toBe('Один миллион сумов 00 тийин');
    expect(ru(2_000_000_00n)).toBe('Два миллиона сумов 00 тийин');
    expect(ru(5_000_000_00n)).toBe('Пять миллионов сумов 00 тийин');
  });

  it('skips empty groups instead of emitting them', () => {
    expect(ru(1_000_000_00n)).not.toContain('тысяч');
    expect(ru(1_000_001_00n)).toBe('Один миллион один сум 00 тийин');
  });

  it('renders zero explicitly (a blank line would look like a missing field)', () => {
    expect(ru(0n)).toBe('Ноль сумов 00 тийин');
  });

  it('pads the tiyin remainder to two digits', () => {
    expect(ru(1_05n)).toBe('Один сум 05 тийин');
  });

  it('accepts a decimal string as well as bigint', () => {
    expect(ru('4507902000')).toBe(ru(4_507_902_000n));
  });

  it('carries a real invoice total end-to-end', () => {
    // 45 079 020,00 — the live prod supply total.
    expect(ru(4_507_902_000n)).toBe(
      'Сорок пять миллионов семьдесят девять тысяч двадцать сумов 00 тийин',
    );
  });
});

describe('amountInWords — uz', () => {
  const uz = (minor: bigint | string) => amountInWords(minor, 'UZS', 'uz');

  it('renders sums in Uzbek without Russian declension', () => {
    expect(uz(100_00n)).toBe("Bir yuz so'm 00 tiyin");
    expect(uz(1_00n)).toBe("Bir so'm 00 tiyin");
    expect(uz(2_00n)).toBe("Ikki so'm 00 tiyin");
  });

  it('builds compound numbers left to right', () => {
    expect(uz(21_00n)).toBe("Yigirma bir so'm 00 tiyin");
    expect(uz(11_00n)).toBe("O'n bir so'm 00 tiyin");
    expect(uz(999_00n)).toBe("To'qqiz yuz to'qson to'qqiz so'm 00 tiyin");
  });

  it('handles thousands and millions', () => {
    expect(uz(1_000_00n)).toBe("Bir ming so'm 00 tiyin");
    expect(uz(2_000_000_00n)).toBe("Ikki million so'm 00 tiyin");
  });

  it('renders zero explicitly', () => {
    expect(uz(0n)).toBe("Nol so'm 00 tiyin");
  });
});

describe('amountInWords — other currencies', () => {
  it('falls back to the ISO code when the currency has no declension table', () => {
    expect(amountInWords(1_00n, 'USD', 'ru')).toBe('Один USD 00');
    expect(amountInWords(2_50n, 'EUR', 'ru')).toBe('Два EUR 50');
  });
});
