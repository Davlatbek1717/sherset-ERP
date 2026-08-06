import { describe, expect, it } from 'vitest';
import {
  CORRECTION_DIRECTION,
  correctionPeriod,
  planCorrection,
  summarizeCorrections,
} from './kpi-correction.js';

describe('planCorrection — tuzatuvchi qator kerakmi', () => {
  it('birinchi qabulda tuzatma YO`Q', () => {
    // `previousMinor === null` = kun ilgari qabul qilinmagan. Uni 0 deb
    // olish har birinchi qabulga soxta «+N tuzatma» qatorini yozardi.
    expect(planCorrection({ previousMinor: null, nextMinor: 500_000n })).toBeNull();
  });

  it('fakt o`zgarmasa tuzatma YO`Q', () => {
    // Kun eskirgan bo'lishi mumkin (hujjatning boshqa maydoni tahrirlangan),
    // lekin PUL o'zgarmagan bo'lsa oylikka yozadigan narsa yo'q.
    expect(planCorrection({ previousMinor: 500_000n, nextMinor: 500_000n })).toBeNull();
  });

  it('fakt oshsa — qo`shimcha to`lov', () => {
    const c = planCorrection({ previousMinor: 500_000n, nextMinor: 560_000n });
    expect(c?.diffMinor).toBe(60_000n);
    expect(c?.direction).toBe(CORRECTION_DIRECTION.increase);
  });

  it('fakt kamaysa — ushlanma (manfiy farq)', () => {
    const c = planCorrection({ previousMinor: 500_000n, nextMinor: 440_000n });
    expect(c?.diffMinor).toBe(-60_000n);
    expect(c?.direction).toBe(CORRECTION_DIRECTION.decrease);
  });

  it('eski va yangi qiymat SAQLANADI (dalil)', () => {
    // Faqat farqni saqlash «nimadan nimaga» savolini javobsiz qoldirardi.
    const c = planCorrection({ previousMinor: 500_000n, nextMinor: 440_000n });
    expect(c?.previousMinor).toBe(500_000n);
    expect(c?.nextMinor).toBe(440_000n);
  });

  it('nolga tushish ham tuzatma (chek butunlay bekor qilindi)', () => {
    const c = planCorrection({ previousMinor: 500_000n, nextMinor: 0n });
    expect(c?.diffMinor).toBe(-500_000n);
  });

  it('noldan o`sish ham tuzatma', () => {
    const c = planCorrection({ previousMinor: 0n, nextMinor: 1n });
    expect(c?.direction).toBe(CORRECTION_DIRECTION.increase);
  });

  it('2^53 dan katta summada aniq', () => {
    const big = 9_007_199_254_740_993n;
    const c = planCorrection({ previousMinor: big, nextMinor: big + 1n });
    expect(c?.diffMinor).toBe(1n);
  });
});

describe('summarizeCorrections — buxgalter o`qiydigan shakl', () => {
  const rows = [
    { diffMinor: 60_000n, direction: 'increase' },
    { diffMinor: -20_000n, direction: 'decrease' },
    { diffMinor: -30_000n, direction: 'decrease' },
  ];

  it('qo`shimcha to`lov va ushlanma ALOHIDA', () => {
    // «Sof −50 000» bitta raqami yetarli emas: hujjatda ikkalasi alohida
    // qator bo'lishi kerak.
    const s = summarizeCorrections(rows);
    expect(s.increaseMinor).toBe(60_000n);
    expect(s.decreaseMinor).toBe(50_000n);
  });

  it('ushlanma MUSBAT son (hujjatda «ushlandi: 50 000» deb yoziladi)', () => {
    expect(summarizeCorrections(rows).decreaseMinor).toBeGreaterThan(0n);
  });

  it('sof yig`indi = qo`shimcha − ushlanma', () => {
    const s = summarizeCorrections(rows);
    expect(s.netMinor).toBe(10_000n);
    expect(s.netMinor).toBe(s.increaseMinor - s.decreaseMinor);
  });

  it('soni sanaladi', () => {
    expect(summarizeCorrections(rows).count).toBe(3);
  });

  it('bo`sh ro`yxatda hammasi nol', () => {
    expect(summarizeCorrections([])).toEqual({
      netMinor: 0n,
      increaseMinor: 0n,
      decreaseMinor: 0n,
      count: 0,
    });
  });

  it('faqat ushlanmalar bo`lsa sof yig`indi MANFIY', () => {
    const s = summarizeCorrections([{ diffMinor: -5_000n, direction: 'decrease' }]);
    expect(s.netMinor).toBe(-5_000n);
    expect(s.increaseMinor).toBe(0n);
  });
});

describe('correctionPeriod — qaysi oyga tushadi', () => {
  it('TUZATMA sanasi bo`yicha, kun sanasi bo`yicha EMAS', () => {
    // Iyul kunining avgustda topilgan xatosi AVGUST oyligiga kiradi:
    // iyul allaqachon to'langan va yopilgan.
    expect(correctionPeriod(new Date(2026, 7, 6))).toBe('2026-08');
  });

  it('oy raqami ikki xonali', () => {
    expect(correctionPeriod(new Date(2026, 0, 31))).toBe('2026-01');
    expect(correctionPeriod(new Date(2026, 8, 1))).toBe('2026-09');
  });

  it('yil chegarasida to`g`ri', () => {
    expect(correctionPeriod(new Date(2026, 11, 31))).toBe('2026-12');
    expect(correctionPeriod(new Date(2027, 0, 1))).toBe('2027-01');
  });
});
