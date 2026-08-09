import { describe, expect, it } from 'vitest';
import { PLAN_STATUS, computePlanProgress, monthDayCount } from './sales-plan-progress.js';

/**
 * MK37 — reja ↔ fakt. Ikkita shartnoma bu yerda qulflanadi:
 *   1. **reja yo'q ≠ reja 0** (MK12 `budget-variance` bilan bir xil qoida);
 *   2. foiz `report/metrics/` qatlamidan — ikkinchi formula yozilmaydi.
 */
describe('MK37 — reja/fakt bajarilishi', () => {
  it('🔴 reja qo`yilmagan: status `no_plan`, foiz NULL (0% EMAS)', () => {
    const p = computePlanProgress({ targetValue: null, factValue: 500_00n });
    expect(p.status).toBe(PLAN_STATUS.noPlan);
    expect(p.achievedPercent).toBeNull();
    expect(p.remainingValue).toBeNull();
  });

  it('🔴 reja bor, fakt o`lchanmagan: status `no_fact`, foiz NULL', () => {
    const p = computePlanProgress({ targetValue: 1_000_00n, factValue: null });
    expect(p.status).toBe(PLAN_STATUS.noFact);
    expect(p.achievedPercent).toBeNull();
    // «Qancha qoldi» ham noma'lum: o'lchanmagan faktdan ayirib bo'lmaydi.
    expect(p.remainingValue).toBeNull();
  });

  it('foiz ikki xonali va `report/metrics` bilan bir xil yaxlitlaydi', () => {
    const p = computePlanProgress({ targetValue: 300n, factValue: 100n });
    expect(p.achievedPercent).toBe('33.33');
  });

  it('qolgan summa = reja − fakt; oshib ketsa 0 (manfiy «qarz» emas)', () => {
    expect(computePlanProgress({ targetValue: 1000n, factValue: 400n }).remainingValue).toBe(600n);
    expect(computePlanProgress({ targetValue: 1000n, factValue: 1200n }).remainingValue).toBe(0n);
  });

  it('reja bajarildi: 100% dan boshlab `done`', () => {
    expect(computePlanProgress({ targetValue: 1000n, factValue: 1000n }).status).toBe(
      PLAN_STATUS.done,
    );
    expect(computePlanProgress({ targetValue: 1000n, factValue: 1001n }).status).toBe(
      PLAN_STATUS.done,
    );
  });

  it('🔴 reja NOL: bo`lish yo`q — foiz NULL, status `done`', () => {
    const p = computePlanProgress({ targetValue: 0n, factValue: 5n });
    expect(p.achievedPercent).toBeNull();
    expect(p.status).toBe(PLAN_STATUS.done);
  });

  // ── Sur'at (TZ §4.8: «shu sur'atda oyni N% bilan yopasiz») ────────────────

  it('sur`at: yarim oyda yarim reja = `on_track`', () => {
    const p = computePlanProgress({
      targetValue: 1000n,
      factValue: 500n,
      elapsedDays: 15,
      totalDays: 30,
    });
    expect(p.expectedPercent).toBe('50.00');
    expect(p.status).toBe(PLAN_STATUS.onTrack);
    expect(p.projectedPercent).toBe('100.00');
  });

  it('sur`at: yarim oyda chorak reja = `behind`', () => {
    const p = computePlanProgress({
      targetValue: 1000n,
      factValue: 250n,
      elapsedDays: 15,
      totalDays: 30,
    });
    expect(p.status).toBe(PLAN_STATUS.behind);
    expect(p.projectedPercent).toBe('50.00');
  });

  it('oy hali boshlanmagan (0 kun): `behind` deb ayblanmaydi', () => {
    const p = computePlanProgress({
      targetValue: 1000n,
      factValue: 0n,
      elapsedDays: 0,
      totalDays: 30,
    });
    expect(p.status).toBe(PLAN_STATUS.onTrack);
    expect(p.projectedPercent).toBeNull();
    expect(p.expectedPercent).toBeNull();
  });

  it('kun berilmasa sur`at hisoblanmaydi, lekin status baribir chiqadi', () => {
    const p = computePlanProgress({ targetValue: 1000n, factValue: 100n });
    expect(p.expectedPercent).toBeNull();
    expect(p.projectedPercent).toBeNull();
    expect(p.status).toBe(PLAN_STATUS.onTrack);
  });

  it('sur`at prognozi BigInt aniqligida (katta summada ham)', () => {
    const p = computePlanProgress({
      targetValue: 9_007_199_254_740_993n,
      factValue: 9_007_199_254_740_993n / 2n,
      elapsedDays: 15,
      totalDays: 30,
    });
    expect(p.projectedPercent).toBe('100.00');
  });

  // ── Oydagi kunlar — YORLIQDAN, timezone arifmetikasisiz ───────────────────

  it('oydagi kunlar soni yorliqdan hisoblanadi (kabisa yili ham)', () => {
    expect(monthDayCount('2026-01')).toBe(31);
    expect(monthDayCount('2026-02')).toBe(28);
    expect(monthDayCount('2024-02')).toBe(29);
    expect(monthDayCount('2026-04')).toBe(30);
  });

  it('buzuq oy yorlig`i 0 beradi (jimgina 30 deb taxmin qilinmaydi)', () => {
    expect(monthDayCount('2026-13')).toBe(0);
    expect(monthDayCount('avgust')).toBe(0);
  });
});
