import { describe, expect, it } from 'vitest';
import { somInWords } from './uzbek-number-words';

describe('somInWords', () => {
  it('matches the receipt sample (330 250 som)', () => {
    // 330 250 som = 33 025 000 tiyin
    expect(somInWords(33025000n)).toBe("Uch yuz o'ttiz ming ikki yuz ellik so'm 00 tiyin");
  });

  it('zero', () => {
    expect(somInWords(0n)).toBe("Nol so'm 00 tiyin");
  });

  it('tiyin part', () => {
    // 100 som 50 tiyin = 10 050 tiyin
    expect(somInWords(10050n)).toBe("Bir yuz so'm 50 tiyin");
  });

  it('exact thousand', () => {
    // 1 000 som
    expect(somInWords(100000n)).toBe("Bir ming so'm 00 tiyin");
  });

  it('millions', () => {
    // 15 000 000 som
    expect(somInWords(1500000000n)).toBe("O'n besh million so'm 00 tiyin");
  });

  it('accepts string input', () => {
    expect(somInWords('20000')).toBe("Ikki yuz so'm 00 tiyin");
  });

  it('spells every teens/tens boundary', () => {
    expect(somInWords(1900n)).toBe("O'n to'qqiz so'm 00 tiyin"); // 19 som
    expect(somInWords(4000n)).toBe("Qirq so'm 00 tiyin"); // 40 som
  });
});
