import { describe, expect, it } from 'vitest';
import { formatAmountInWords, integerToUzbekWords } from './amount-to-words.util.js';

describe('integerToUzbekWords', () => {
  it('spells units, tens, hundreds', () => {
    expect(integerToUzbekWords(0n)).toBe('nol');
    expect(integerToUzbekWords(5n)).toBe('besh');
    expect(integerToUzbekWords(15n)).toBe("o'n besh");
    expect(integerToUzbekWords(46n)).toBe('qirq olti');
    expect(integerToUzbekWords(100n)).toBe('yuz');
    expect(integerToUzbekWords(101n)).toBe('yuz bir');
    expect(integerToUzbekWords(256n)).toBe('ikki yuz ellik olti');
  });

  it('handles thousands ("ming" without leading bir for exactly 1000)', () => {
    expect(integerToUzbekWords(1000n)).toBe('ming');
    expect(integerToUzbekWords(1500n)).toBe('ming besh yuz');
    expect(integerToUzbekWords(2000n)).toBe('ikki ming');
    expect(integerToUzbekWords(46659n)).toBe("qirq olti ming olti yuz ellik to'qqiz");
  });

  it('handles millions/milliards (keeps leading bir)', () => {
    expect(integerToUzbekWords(1_000_000n)).toBe('bir million');
    expect(integerToUzbekWords(1_555_326n)).toBe(
      'bir million besh yuz ellik besh ming uch yuz yigirma olti',
    );
    expect(integerToUzbekWords(2_000_000_000n)).toBe('ikki milliard');
  });

  it('handles very large values without precision loss (BigInt)', () => {
    expect(integerToUzbekWords(1_000_000_000_000n)).toBe('bir trillion');
  });
});

describe('formatAmountInWords', () => {
  it('matches the moysklad "zero" form shape', () => {
    expect(formatAmountInWords(0n)).toBe("Nol so'm 00 tiyin");
  });

  it('splits minor units into som (words) + tiyin (digits)', () => {
    // 466 597 800 tiyin = 4 665 978 so'm 00 tiyin
    expect(formatAmountInWords(466_597_800n)).toBe(
      "To'rt million olti yuz oltmish besh ming to'qqiz yuz yetmish sakkiz so'm 00 tiyin",
    );
    // 155 532 678 tiyin = 1 555 326 so'm 78 tiyin
    expect(formatAmountInWords(155_532_678n)).toBe(
      'Bir million besh yuz ellik besh ming uch yuz yigirma olti' + " so'm 78 tiyin",
    );
  });

  it('accepts string/number and tolerates garbage/negatives', () => {
    expect(formatAmountInWords('100')).toBe("Bir so'm 00 tiyin");
    expect(formatAmountInWords(-500n)).toBe("Besh so'm 00 tiyin");
    expect(formatAmountInWords('not-a-number')).toBe("Nol so'm 00 tiyin");
  });
});
