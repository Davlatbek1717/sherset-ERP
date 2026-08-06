import { describe, expect, it } from 'vitest';
import { __testing, hasBaseline } from './owner-weekly-summary.service.js';

const { adjustAbsMinor } = __testing;

/**
 * Tuzatma summasini o'qish (M-Q7 ning asosiy raqami).
 *
 * Jurnal payload'i: `{ metricKey, was, now, autoValue }`. Bu yerdagi
 * eng muhim holat — **birinchi tuzatma**: `was` o'sha paytda `null`
 * bo'ladi, chunki u OLDINGI QO'LDA tuzatma qiymati. Uni «noma'lum» deb
 * olsak, jami DOIM 0 chiqardi.
 */
describe('adjustAbsMinor — tuzatma summasi', () => {
  it('BIRINCHI tuzatmada asos = autoValue (`was` null)', () => {
    // Eng ko'p uchraydigan holat: menejer avtomatik raqamni birinchi marta
    // tuzatadi. Bu 0 bo'lsa M-Q7 ning «jami qancha summaga» raqami
    // ma'nosiz bo'lardi.
    expect(adjustAbsMinor({ was: null, now: '440000', autoValue: '500000' })).toBe(60_000n);
  });

  it('takroriy tuzatmada asos = oldingi qo`lda qiymat', () => {
    // `was` bor — auto qiymat endi ahamiyatsiz.
    expect(adjustAbsMinor({ was: '480000', now: '440000', autoValue: '500000' })).toBe(40_000n);
  });

  it('ABSOLYUT qiymat — yo`nalish ahamiyatsiz', () => {
    // «+100k va −100k» bir-birini yo'q qilsa, ikki aralashuv ko'rinmay
    // qolardi; egasining savoli «qancha aralashuv bo'ldi».
    expect(adjustAbsMinor({ was: '100000', now: '200000' })).toBe(100_000n);
    expect(adjustAbsMinor({ was: '200000', now: '100000' })).toBe(100_000n);
  });

  it('o`zgarishsiz tuzatma 0', () => {
    expect(adjustAbsMinor({ was: '100000', now: '100000' })).toBe(0n);
  });

  it('BAZA umuman yo`q — aralashuv miqdori raqamning O`ZI', () => {
    // Menejer raqamni tuzatmagan, YO'QDAN KIRITGAN. 0 ko'rsatish 500 mln
    // lik kiritmani ham ko'rinmas qilardi. Bunday qatorlar `hasBaseline`
    // orqali alohida ham sanaladi.
    expect(adjustAbsMinor({ was: null, now: '440000', autoValue: null })).toBe(440_000n);
    expect(adjustAbsMinor({ now: '440000' })).toBe(440_000n);
  });

  it('`hasBaseline` tuzatishni yo`qdan kiritishdan ajratadi', () => {
    expect(hasBaseline({ was: '1', now: '2' })).toBe(true);
    expect(hasBaseline({ was: null, autoValue: '5', now: '2' })).toBe(true);
    expect(hasBaseline({ was: null, autoValue: null, now: '2' })).toBe(false);
    expect(hasBaseline({ now: '2' })).toBe(false);
    expect(hasBaseline(null)).toBe(false);
  });

  it('`now` o`qib bo`lmasa 0 (qator baribir sanaladi)', () => {
    expect(adjustAbsMinor(null)).toBe(0n);
    expect(adjustAbsMinor('matn')).toBe(0n);
    expect(adjustAbsMinor({ was: '1', now: '12.5' })).toBe(0n);
    expect(adjustAbsMinor({ was: '1' })).toBe(0n);
  });

  it('buzuq `was` bo`lsa autoValue ga tushadi', () => {
    expect(adjustAbsMinor({ was: 'abc', now: '300', autoValue: '100' })).toBe(200n);
  });

  it('2^53 dan katta qiymatda aniq', () => {
    const big = 9_007_199_254_740_993n;
    expect(adjustAbsMinor({ was: big.toString(), now: (big + 7n).toString() })).toBe(7n);
  });
});
