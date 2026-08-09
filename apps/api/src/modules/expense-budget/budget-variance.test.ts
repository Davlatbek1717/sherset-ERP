import { describe, expect, it } from 'vitest';
import { BUDGET_STATUS, DEFAULT_WARN_PERCENT, computeVariance } from './budget-variance.js';

/**
 * MK12 / 4M TZ §8 — og'ish ko'rsatkichi.
 *
 * 🔴 Yadro qoidasi: **plan yo'q ≠ plan 0**. Plan qo'yilmagan oyda «0%
 * bajarildi» ham, «100% oshib ketdi» ham YOLG'ON — ikkalasi ham menejerni
 * mavjud bo'lmagan muammoga (yoki mavjud muammoning yo'qligiga) ishontiradi.
 * Shu sababdan `usedPercent`/`varianceMinor` NULL bo'ladi va status alohida
 * `no_plan` qiymatini oladi. Bu — [[data-quality-flag-layer]] naqshi.
 */

describe('computeVariance — plan yo`q holati', () => {
  it('plan yo`q: og`ish ham, foiz ham NULL (0 ham, 100 ham emas)', () => {
    const r = computeVariance(null, 500_00n);
    expect(r.status).toBe(BUDGET_STATUS.noPlan);
    expect(r.varianceMinor).toBeNull();
    expect(r.usedPercent).toBeNull();
    expect(r.actualMinor).toBe(500_00n);
  });

  it('plan yo`q va fakt ham 0: baribir `no_plan` (yashil emas)', () => {
    const r = computeVariance(null, 0n);
    expect(r.status).toBe(BUDGET_STATUS.noPlan);
    expect(r.usedPercent).toBeNull();
  });
});

describe('computeVariance — chegara qiymatlari', () => {
  it('plan ichida: og`ish manfiy, status `within`', () => {
    const r = computeVariance(1_000_00n, 400_00n);
    expect(r.varianceMinor).toBe(-600_00n);
    expect(r.usedPercent).toBe('40.00');
    expect(r.status).toBe(BUDGET_STATUS.within);
  });

  it(`ogohlantirish chegarasi (${DEFAULT_WARN_PERCENT}%) — AYNAN chegarada yoqiladi`, () => {
    const r = computeVariance(1_000_00n, 900_00n);
    expect(r.usedPercent).toBe('90.00');
    expect(r.status).toBe(BUDGET_STATUS.warning);
  });

  it('chegaradan bir tiyin past — hali `within`', () => {
    const r = computeVariance(1_000_00n, 899_99n);
    expect(r.status).toBe(BUDGET_STATUS.within);
  });

  it('planga AYNAN teng — hali `warning`, `over` EMAS', () => {
    const r = computeVariance(1_000_00n, 1_000_00n);
    expect(r.varianceMinor).toBe(0n);
    expect(r.usedPercent).toBe('100.00');
    expect(r.status).toBe(BUDGET_STATUS.warning);
  });

  it('bir tiyin oshsa — `over`', () => {
    const r = computeVariance(1_000_00n, 1_000_01n);
    expect(r.varianceMinor).toBe(1n);
    expect(r.status).toBe(BUDGET_STATUS.over);
  });

  it('ogohlantirish chegarasi sozlanadi', () => {
    expect(computeVariance(1_000_00n, 700_00n, 70).status).toBe(BUDGET_STATUS.warning);
    expect(computeVariance(1_000_00n, 700_00n, 95).status).toBe(BUDGET_STATUS.within);
  });
});

describe('computeVariance — nol plan', () => {
  it('plan = 0 va fakt bor: `over` (0 ga bo`linish yo`q, foiz NULL)', () => {
    const r = computeVariance(0n, 10_00n);
    expect(r.status).toBe(BUDGET_STATUS.over);
    expect(r.varianceMinor).toBe(10_00n);
    // 0 ga bo'lish o'rniga NULL — «Infinity%» raqam emas.
    expect(r.usedPercent).toBeNull();
  });

  it('plan = 0 va fakt 0: `within`', () => {
    const r = computeVariance(0n, 0n);
    expect(r.status).toBe(BUDGET_STATUS.within);
    expect(r.varianceMinor).toBe(0n);
  });
});

describe('computeVariance — BigInt aniqligi', () => {
  it('katta summalarda float yaxlitlanishi yo`q', () => {
    const plan = 9_007_199_254_740_993n; // > Number.MAX_SAFE_INTEGER
    const r = computeVariance(plan, plan + 1n);
    expect(r.varianceMinor).toBe(1n);
    expect(r.status).toBe(BUDGET_STATUS.over);
  });
});
