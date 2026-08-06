import { describe, expect, it } from 'vitest';
import {
  type ManagerActivity,
  buildWeeklySummary,
  formatWeeklySummary,
  weekBounds,
} from './owner-weekly-summary.js';

const A = (over: Partial<ManagerActivity> & { managerId: string }): ManagerActivity => ({
  managerName: over.managerId,
  acceptedCount: 0,
  rejectedCount: 0,
  adjustCount: 0,
  adjustedAbsMinor: 0n,
  noBaselineCount: 0,
  forceAcceptedCount: 0,
  ...over,
});

const WEEK = {
  weekStart: new Date(2026, 7, 3),
  weekEndExclusive: new Date(2026, 7, 10),
  pendingDays: 0,
  staleDays: 0,
};

describe('buildWeeklySummary', () => {
  it('menejerlar bo`yicha yig`indi', () => {
    const s = buildWeeklySummary({
      ...WEEK,
      activity: [
        A({ managerId: 'm1', acceptedCount: 10, adjustCount: 3, adjustedAbsMinor: 300_000n }),
        A({ managerId: 'm2', acceptedCount: 5, adjustCount: 1, adjustedAbsMinor: 50_000n }),
      ],
    });
    expect(s.totalAccepted).toBe(15);
    expect(s.totalAdjust).toBe(4);
    expect(s.totalAdjustedAbsMinor).toBe(350_000n);
  });

  it('eng ko`p tuzatgan — SON bo`yicha, summa bo`yicha EMAS', () => {
    // Bitta katta to'g'ri tuzatma normal ish; o'nlab mayda tuzatma — NAQSH,
    // egasi aynan naqshni ko'rishi kerak.
    const s = buildWeeklySummary({
      ...WEEK,
      activity: [
        A({ managerId: 'kop-summa', adjustCount: 1, adjustedAbsMinor: 10_000_000n }),
        A({ managerId: 'kop-marta', adjustCount: 9, adjustedAbsMinor: 90_000n }),
      ],
    });
    expect(s.topAdjuster?.managerId).toBe('kop-marta');
  });

  it('tuzatma bo`lmasa topAdjuster NULL', () => {
    const s = buildWeeklySummary({
      ...WEEK,
      activity: [A({ managerId: 'm1', acceptedCount: 5 })],
    });
    expect(s.topAdjuster).toBeNull();
  });

  it('majburiy yopish alohida sanaladi', () => {
    const s = buildWeeklySummary({
      ...WEEK,
      activity: [A({ managerId: 'm1', forceAcceptedCount: 2 })],
    });
    expect(s.totalForceAccepted).toBe(2);
  });

  it('bo`sh haftada hammasi nol', () => {
    const s = buildWeeklySummary({ ...WEEK, activity: [] });
    expect(s.totalAccepted).toBe(0);
    expect(s.totalAdjustedAbsMinor).toBe(0n);
    expect(s.topAdjuster).toBeNull();
  });

  it('2^53 dan katta summada aniq', () => {
    const big = 9_007_199_254_740_993n;
    const s = buildWeeklySummary({
      ...WEEK,
      activity: [
        A({ managerId: 'a', adjustCount: 1, adjustedAbsMinor: big }),
        A({ managerId: 'b', adjustCount: 1, adjustedAbsMinor: 1n }),
      ],
    });
    expect(s.totalAdjustedAbsMinor).toBe(big + 1n);
  });
});

describe('formatWeeklySummary — egasi telefonda o`qiydi', () => {
  it('tuzatmasiz haftada ham xabar aniq javob beradi', () => {
    // Sukunatni «hammasi joyida» deb o'qish xato bo'lardi: xabar kelmasa
    // egasi tizim ishlayaptimi yoki tuzatma yo'qmi ajrata olmasdi.
    const msg = formatWeeklySummary(
      buildWeeklySummary({ ...WEEK, activity: [A({ managerId: 'm1', acceptedCount: 12 })] }),
    );
    expect(msg).toContain("Qo'lda tuzatma: YO'Q");
    expect(msg).toContain('Qabul qilingan kunlar: 12');
  });

  it('tuzatma bo`lsa soni, summasi va kim ko`p tuzatgani ko`rinadi', () => {
    const msg = formatWeeklySummary(
      buildWeeklySummary({
        ...WEEK,
        activity: [
          A({
            managerId: 'm1',
            managerName: 'Aliyev A.',
            adjustCount: 3,
            adjustedAbsMinor: 250_000n,
          }),
        ],
      }),
    );
    expect(msg).toMatch(/Qo'lda tuzatma: 3 ta/);
    expect(msg).toContain('2 500,00');
    expect(msg).toContain('Aliyev A.');
  });

  it('majburiy yopish bo`lsa ALOHIDA qatorda', () => {
    const msg = formatWeeklySummary(
      buildWeeklySummary({ ...WEEK, activity: [A({ managerId: 'm1', forceAcceptedCount: 2 })] }),
    );
    expect(msg).toMatch(/Majburiy yopilgan: 2 ta/);
  });

  it('majburiy yopish bo`lmasa qator YO`Q (shovqin qilmasin)', () => {
    const msg = formatWeeklySummary(buildWeeklySummary({ ...WEEK, activity: [] }));
    expect(msg).not.toContain('Majburiy');
  });

  it('kutayotgan va eskirgan kunlar ko`rinadi', () => {
    const msg = formatWeeklySummary(
      buildWeeklySummary({ ...WEEK, activity: [], pendingDays: 7, staleDays: 2 }),
    );
    expect(msg).toContain('Qabul kutmoqda: 7');
    expect(msg).toMatch(/Eskirgan.*: 2/);
  });

  it('eskirgan kun bo`lmasa qator YO`Q', () => {
    const msg = formatWeeklySummary(buildWeeklySummary({ ...WEEK, activity: [] }));
    expect(msg).not.toContain('Eskirgan');
  });

  it('hafta oralig`i sarlavhada', () => {
    const msg = formatWeeklySummary(buildWeeklySummary({ ...WEEK, activity: [] }));
    // 03.08–09.08 (oxirgi kun — chegaradan bir kun oldin).
    expect(msg).toContain('03.08');
    expect(msg).toContain('09.08');
  });
});

describe('weekBounds — dushanbadan', () => {
  it('chorshanba → o`sha haftaning dushanbasi', () => {
    const { start, endExclusive } = weekBounds(new Date(2026, 7, 5)); // chorshanba
    expect(start.getDate()).toBe(3);
    expect(endExclusive.getDate()).toBe(10);
  });

  it('dushanbaning o`zi → o`zgarmaydi', () => {
    expect(weekBounds(new Date(2026, 7, 3)).start.getDate()).toBe(3);
  });

  it('YAKSHANBA oldingi haftaga tegishli', () => {
    // `getDay()` yakshanbani 0 beradi; O'zbekistonda ish haftasi dushanbadan.
    const { start } = weekBounds(new Date(2026, 7, 9));
    expect(start.getDate()).toBe(3);
  });

  it('oy chegarasida to`g`ri', () => {
    // 2026-09-01 — seshanba; haftaning dushanbasi 31-avgust.
    const { start } = weekBounds(new Date(2026, 8, 1));
    expect(start.getMonth()).toBe(7);
    expect(start.getDate()).toBe(31);
  });

  it('oraliq aynan 7 kun', () => {
    const { start, endExclusive } = weekBounds(new Date(2026, 7, 6));
    expect((endExclusive.getTime() - start.getTime()) / 86_400_000).toBe(7);
  });
});
