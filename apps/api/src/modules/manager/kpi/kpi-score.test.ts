import { describe, expect, it } from 'vitest';
import {
  SCORE_CAP_PERCENT,
  type ScoreMetricInput,
  achievementPercent,
  scoreDay,
} from './kpi-score.js';

/**
 * Kompozit ball — sof formula testi.
 *
 * Qulflanadigan shartnomalar (buzilsa oylik noto'g'ri to'lanadi):
 *   1. **NULL ≠ 0** — o'lchanmagan ko'rsatkich ballni PASAYTIRMAYDI;
 *   2. maqsadsiz/og'irliksiz ko'rsatkich ballga kirmaydi va buni ochiq aytadi;
 *   3. `lower_better` da kamroq = yaxshiroq (yo'nalish teskari o'girilmaydi);
 *   4. bitta ko'rsatkich chek orqali butun kunni yopib yubormaydi;
 *   5. menejer tuzatmasi g'olib, avtomat qiymat saqlanadi.
 */

const m = (over: Partial<ScoreMetricInput> & { metricKey: string }): ScoreMetricInput => ({
  autoValue: null,
  adjustValue: null,
  target: null,
  weight: 0,
  complete: true,
  ...over,
});

describe('achievementPercent', () => {
  it('higher_better: fakt ÷ maqsad', () => {
    expect(achievementPercent(750_000n, 1_000_000n, 'higher_better')).toBe(75);
    expect(achievementPercent(1_200_000n, 1_000_000n, 'higher_better')).toBe(120);
  });

  it('higher_better maqsad 0 bo`lsa hisoblanmaydi (nolga bo`lish yo`q)', () => {
    expect(achievementPercent(5n, 0n, 'higher_better')).toBeNull();
  });

  it('lower_better: maqsad = shift, kamroq = yaxshiroq', () => {
    // Kechikish maqsadi 10 daqiqa.
    expect(achievementPercent(0n, 10n, 'lower_better')).toBe(200); // umuman kechikmadi
    expect(achievementPercent(10n, 10n, 'lower_better')).toBe(100); // aynan shiftda
    expect(achievementPercent(15n, 10n, 'lower_better')).toBe(50);
    expect(achievementPercent(20n, 10n, 'lower_better')).toBe(0);
  });

  it('lower_better juda yomon natijada manfiy bo`lmaydi', () => {
    expect(achievementPercent(100n, 10n, 'lower_better')).toBe(0);
  });

  it('nol-tolerantlik (maqsad 0): faqat 0 fakt 100% beradi', () => {
    // Kassa farqi / zararga sotuv: maqsad = 0.
    expect(achievementPercent(0n, 0n, 'lower_better')).toBe(100);
    expect(achievementPercent(1n, 0n, 'lower_better')).toBe(0);
  });

  it('neutral yo`nalish ballanmaydi', () => {
    expect(achievementPercent(5n, 10n, 'neutral')).toBeNull();
  });
});

describe('scoreDay — og`irlikli o`rtacha', () => {
  it('ikki ko`rsatkich og`irligiga qarab birlashadi', () => {
    const day = scoreDay([
      m({ metricKey: 'cash_revenue', autoValue: 800_000n, target: 1_000_000n, weight: 70 }), // 80%
      m({ metricKey: 'late_minutes', autoValue: 0n, target: 10n, weight: 30 }), // 200% → cap 150
    ]);
    // (70×80 + 30×150) ÷ 100 = 101
    expect(day.score).toBe(101);
    expect(day.weightScored).toBe(100);
    expect(day.coverage).toBe(1);
  });

  it('bitta ko`rsatkich butun kunni yopib yubormaydi (chek)', () => {
    const day = scoreDay([
      m({ metricKey: 'cash_revenue', autoValue: 100_000_000n, target: 1_000_000n, weight: 50 }), // 10000%
      m({ metricKey: 'late_minutes', autoValue: 20n, target: 10n, weight: 50 }), // 0%
    ]);
    expect(day.metrics[0]?.achievementPercent).toBe(10_000); // haqiqiy natija ko'rinadi
    expect(day.metrics[0]?.contributionPercent).toBe(SCORE_CAP_PERCENT); // ballga cheklangan kiradi
    expect(day.score).toBe(75);
  });
});

describe('NULL ≠ 0 shartnomasi', () => {
  it('o`lchanmagan ko`rsatkich ballni PASAYTIRMAYDI', () => {
    const withUnmeasured = scoreDay([
      m({ metricKey: 'cash_revenue', autoValue: 1_000_000n, target: 1_000_000n, weight: 50 }),
      m({ metricKey: 'picked_lines', autoValue: null, target: 100n, weight: 50 }),
    ]);
    expect(withUnmeasured.score).toBe(100); // 0 deb hisoblanganda 50 bo'lardi
    expect(withUnmeasured.metrics[1]?.skipReason).toBe('unmeasured');
  });

  it('lekin qamrov ochiq ko`rsatiladi — yashirin to`liqsizlik yo`q', () => {
    const day = scoreDay([
      m({ metricKey: 'cash_revenue', autoValue: 1_000_000n, target: 1_000_000n, weight: 50 }),
      m({ metricKey: 'picked_lines', autoValue: null, target: 100n, weight: 50 }),
    ]);
    expect(day.weightScored).toBe(50);
    expect(day.weightTotal).toBe(100);
    expect(day.coverage).toBe(0.5);
  });

  it('o`lchangan NOL esa ballanadi (0 ≠ NULL)', () => {
    const day = scoreDay([
      m({ metricKey: 'cash_revenue', autoValue: 0n, target: 1_000_000n, weight: 100 }),
    ]);
    expect(day.score).toBe(0);
    expect(day.metrics[0]?.scored).toBe(true);
  });
});

describe('ballga kirmaslik sabablari ochiq', () => {
  it('maqsadsiz ko`rsatkich — no_target', () => {
    const day = scoreDay([m({ metricKey: 'cash_revenue', autoValue: 5n, weight: 100 })]);
    expect(day.metrics[0]?.skipReason).toBe('no_target');
    expect(day.score).toBeNull();
  });

  it('og`irliksiz ko`rsatkich — no_weight (faqat ko`rsatiladi)', () => {
    const day = scoreDay([m({ metricKey: 'cash_revenue', autoValue: 5n, target: 10n, weight: 0 })]);
    expect(day.metrics[0]?.skipReason).toBe('no_weight');
    expect(day.score).toBeNull();
  });

  it('katalogda yo`q kalit — unknown_metric (jimgina 0 emas)', () => {
    const day = scoreDay([
      m({ metricKey: 'yolgon_kalit', autoValue: 5n, target: 10n, weight: 100 }),
    ]);
    expect(day.metrics[0]?.skipReason).toBe('unknown_metric');
    expect(day.score).toBeNull();
  });

  it('hech narsa ballanmasa score NULL (0 EMAS)', () => {
    const day = scoreDay([m({ metricKey: 'cash_revenue', autoValue: null, weight: 0 })]);
    expect(day.score).toBeNull();
  });
});

describe('menejer tuzatmasi', () => {
  it('tuzatma g`olib, avtomat qiymat saqlanadi', () => {
    const day = scoreDay([
      m({
        metricKey: 'cash_revenue',
        autoValue: 500_000n,
        adjustValue: 1_000_000n,
        target: 1_000_000n,
        weight: 100,
      }),
    ]);
    expect(day.score).toBe(100);
    expect(day.metrics[0]?.autoValue).toBe(500_000n);
    expect(day.metrics[0]?.adjusted).toBe(true);
  });

  it('tuzatma NOLga tushirishi mumkin (0 ≠ tuzatilmagan)', () => {
    const day = scoreDay([
      m({
        metricKey: 'cash_revenue',
        autoValue: 1_000_000n,
        adjustValue: 0n,
        target: 1_000_000n,
        weight: 100,
      }),
    ]);
    expect(day.score).toBe(0);
    expect(day.metrics[0]?.adjusted).toBe(true);
  });
});

describe('ma`lumot sifati bayrog`i', () => {
  it('chala manbadan hisoblangan BALLANGAN ko`rsatkich kunni chala qiladi', () => {
    const day = scoreDay([
      m({
        metricKey: 'gross_profit',
        autoValue: 100n,
        target: 200n,
        weight: 100,
        complete: false,
      }),
    ]);
    expect(day.dataComplete).toBe(false);
  });

  it('ballanmagan ko`rsatkichning chalaligi ballga ta`sir qilmaydi', () => {
    const day = scoreDay([
      m({ metricKey: 'cash_revenue', autoValue: 10n, target: 10n, weight: 100 }),
      m({ metricKey: 'gross_profit', autoValue: null, weight: 0, complete: false }),
    ]);
    expect(day.dataComplete).toBe(true);
  });
});
