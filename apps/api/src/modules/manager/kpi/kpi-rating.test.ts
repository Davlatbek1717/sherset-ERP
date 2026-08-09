import { describe, expect, it } from 'vitest';
import { DAILY_KPI_STATE } from './daily-kpi-fsm.js';
import { type RatingDay, rankEmployees } from './kpi-rating.js';

/**
 * MK13 / 4M TZ §11 (M10) — davr reytingi.
 *
 * QAROR-B6 (2026-08-09, egasining tasdig'i): reytingga **faqat qabul qilingan**
 * kunlar kiradi va manba — kunning MUZLATILGAN balli.
 *
 * ⚠️ Shartnomalar: (1) NULL ≠ 0 — ballanmagan xodim oxirgi o'ringa QO'YILMAYDI;
 * (2) qamrov yashirilmaydi; (3) tartib DETERMINIST.
 */

function day(over: Partial<RatingDay> & { employeeId: string }): RatingDay {
  return {
    employeeName: null,
    date: '2026-08-03',
    state: DAILY_KPI_STATE.accepted,
    scorePercent: 100,
    ...over,
  };
}

describe('rankEmployees — faqat qabul qilingan kunlar (QAROR-B6)', () => {
  it('`accepted` va `force_accepted` kiradi, qolgani chiqadi', () => {
    const days: RatingDay[] = [
      day({
        employeeId: 'a',
        date: '2026-08-03',
        state: DAILY_KPI_STATE.accepted,
        scorePercent: 100,
      }),
      day({
        employeeId: 'a',
        date: '2026-08-04',
        state: DAILY_KPI_STATE.forceAccepted,
        scorePercent: 60,
      }),
      // Quyidagilar hisobga KIRMAYDI:
      day({
        employeeId: 'a',
        date: '2026-08-05',
        state: DAILY_KPI_STATE.pending,
        scorePercent: 10,
      }),
      day({
        employeeId: 'a',
        date: '2026-08-06',
        state: DAILY_KPI_STATE.rejected,
        scorePercent: 10,
      }),
      day({
        employeeId: 'a',
        date: '2026-08-07',
        state: DAILY_KPI_STATE.computed,
        scorePercent: 10,
      }),
      day({ employeeId: 'a', date: '2026-08-08', state: DAILY_KPI_STATE.stale, scorePercent: 10 }),
      day({
        employeeId: 'a',
        date: '2026-08-09',
        state: DAILY_KPI_STATE.escalated,
        scorePercent: 10,
      }),
    ];

    const { entries } = rankEmployees(days);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.averageScore).toBe(80); // (100 + 60) / 2
    expect(entries[0]?.daysCounted).toBe(2);
    // Qamrov YASHIRILMAYDI — 7 kundan 2 tasi ballandi.
    expect(entries[0]?.daysInPeriod).toBe(7);
  });

  it('qabul qilingan kuni YO`Q xodim 0 ball bilan oxirgi o`ringa qo`yilmaydi', () => {
    const days: RatingDay[] = [
      day({ employeeId: 'yaxshi', scorePercent: 90 }),
      day({ employeeId: 'kutmoqda', state: DAILY_KPI_STATE.pending, scorePercent: 200 }),
    ];

    const { entries, ratedCount, unratedCount } = rankEmployees(days);
    const unrated = entries.find((e) => e.employeeId === 'kutmoqda');

    expect(unrated?.rated).toBe(false);
    expect(unrated?.rank).toBeNull();
    expect(unrated?.averageScore).toBeNull(); // 🔴 0 EMAS
    expect(unrated?.skipReason).toBe('no_accepted_days');
    expect(ratedCount).toBe(1);
    expect(unratedCount).toBe(1);
  });

  it('qabul qilingan, lekin balli NULL kun hisobga kirmaydi (NULL ≠ 0)', () => {
    const days: RatingDay[] = [
      day({ employeeId: 'a', date: '2026-08-03', scorePercent: null }),
      day({ employeeId: 'a', date: '2026-08-04', scorePercent: 80 }),
    ];
    const { entries } = rankEmployees(days);
    expect(entries[0]?.averageScore).toBe(80); // 40 EMAS
    expect(entries[0]?.daysCounted).toBe(1);
    expect(entries[0]?.daysWithoutScore).toBe(1);
  });

  it('hamma qabul qilingan kunlari ballsiz bo`lsa — `no_score` sababi', () => {
    const { entries } = rankEmployees([day({ employeeId: 'a', scorePercent: null })]);
    expect(entries[0]?.rated).toBe(false);
    expect(entries[0]?.skipReason).toBe('no_score');
  });
});

describe('rankEmployees — o`rtacha va tartib', () => {
  it('o`rtacha = qabul qilingan kunlar ballining o`rtachasi, 1 xonagacha', () => {
    const { entries } = rankEmployees([
      day({ employeeId: 'a', date: '2026-08-03', scorePercent: 100 }),
      day({ employeeId: 'a', date: '2026-08-04', scorePercent: 95 }),
      day({ employeeId: 'a', date: '2026-08-05', scorePercent: 90 }),
    ]);
    expect(entries[0]?.averageScore).toBe(95);
  });

  it('yuqori ball birinchi', () => {
    const { entries } = rankEmployees([
      day({ employeeId: 'past', scorePercent: 70 }),
      day({ employeeId: 'yuqori', scorePercent: 130 }),
      day({ employeeId: 'orta', scorePercent: 100 }),
    ]);
    expect(entries.map((e) => e.employeeId)).toEqual(['yuqori', 'orta', 'past']);
    expect(entries.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('ball teng bo`lsa KO`PROQ kun to`plagan yuqori turadi', () => {
    const { entries } = rankEmployees([
      day({ employeeId: 'bir-kun', date: '2026-08-03', scorePercent: 100 }),
      day({ employeeId: 'uch-kun', date: '2026-08-03', scorePercent: 100 }),
      day({ employeeId: 'uch-kun', date: '2026-08-04', scorePercent: 100 }),
      day({ employeeId: 'uch-kun', date: '2026-08-05', scorePercent: 100 }),
    ]);
    expect(entries.map((e) => e.employeeId)).toEqual(['uch-kun', 'bir-kun']);
    expect(entries.map((e) => e.rank)).toEqual([1, 2]);
  });

  it('to`liq teng bo`lsa BIR XIL o`rin beriladi, keyingi o`rin sakraydi', () => {
    const { entries } = rankEmployees([
      day({ employeeId: 'b', scorePercent: 100 }),
      day({ employeeId: 'a', scorePercent: 100 }),
      day({ employeeId: 'c', scorePercent: 50 }),
    ]);
    expect(entries.map((e) => [e.employeeId, e.rank])).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 3], // 2 EMAS — sport tartibi
    ]);
  });

  it('DETERMINIZM: kirish tartibi natijani o`zgartirmaydi', () => {
    const days: RatingDay[] = [
      day({ employeeId: 'c', scorePercent: 100 }),
      day({ employeeId: 'a', scorePercent: 100 }),
      day({ employeeId: 'b', scorePercent: 100 }),
    ];
    const forward = rankEmployees(days).entries.map((e) => e.employeeId);
    const backward = rankEmployees([...days].reverse()).entries.map((e) => e.employeeId);
    expect(forward).toEqual(['a', 'b', 'c']);
    expect(backward).toEqual(forward);
  });

  it('ballanmaganlar har doim oxirida va `id` bo`yicha barqaror', () => {
    const { entries } = rankEmployees([
      day({ employeeId: 'z-yoq', state: DAILY_KPI_STATE.pending }),
      day({ employeeId: 'a-yoq', state: DAILY_KPI_STATE.pending }),
      day({ employeeId: 'm-bor', scorePercent: 10 }),
    ]);
    expect(entries.map((e) => e.employeeId)).toEqual(['m-bor', 'a-yoq', 'z-yoq']);
  });
});

describe('rankEmployees — chekka holatlar', () => {
  it('bo`sh kirish bo`sh reyting beradi', () => {
    expect(rankEmployees([])).toEqual({ entries: [], ratedCount: 0, unratedCount: 0 });
  });

  it('xodim nomi saqlanadi, lekin TARTIB nomga bog`liq emas', () => {
    // Nom bo'yicha saralash lokalga bog'liq (`ʼ`, kirill/lotin) — barqaror emas.
    const { entries } = rankEmployees([
      day({ employeeId: 'b', employeeName: 'Anvar', scorePercent: 100 }),
      day({ employeeId: 'a', employeeName: 'Zafar', scorePercent: 100 }),
    ]);
    expect(entries.map((e) => e.employeeId)).toEqual(['a', 'b']);
    expect(entries[0]?.employeeName).toBe('Zafar');
  });

  it('manfiy va cap`dan yuqori ball ham o`rtachaga o`zgarishsiz kiradi', () => {
    // Cap `kpi-score.ts` da qo'llangan — reyting qatlami qayta chegaralamaydi.
    const { entries } = rankEmployees([
      day({ employeeId: 'a', date: '2026-08-03', scorePercent: 150 }),
      day({ employeeId: 'a', date: '2026-08-04', scorePercent: 0 }),
    ]);
    expect(entries[0]?.averageScore).toBe(75);
  });
});
