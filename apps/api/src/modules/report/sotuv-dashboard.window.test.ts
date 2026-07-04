import { describe, expect, it } from 'vitest';
import {
  SotuvDashboardFilterSchema,
  resolveSotuvWindow,
  tashkentDayUtcMidnight,
} from './sotuv-dashboard.service.js';

// Fixed "now": 2026-07-04 10:00 Tashkent (= 05:00 UTC).
const NOW = new Date('2026-07-04T05:00:00.000Z');
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('tashkentDayUtcMidnight', () => {
  it('UTC kechqurun instant Tashkent boyicha KEYINGI kunga tushadi', () => {
    // 2026-07-03 20:30 UTC = 2026-07-04 01:30 Tashkent (+5)
    expect(iso(tashkentDayUtcMidnight(new Date('2026-07-03T20:30:00.000Z')))).toBe('2026-07-04');
  });

  it('Tashkent kun ichidagi instant oz kunida qoladi', () => {
    expect(iso(tashkentDayUtcMidnight(new Date('2026-07-04T05:00:00.000Z')))).toBe('2026-07-04');
  });
});

describe('resolveSotuvWindow', () => {
  it("bo'sh filter → bugungi bitta kun", () => {
    const { fromDay, toDay } = resolveSotuvWindow({}, NOW);
    expect(iso(fromDay)).toBe('2026-07-04');
    expect(iso(toDay)).toBe('2026-07-04');
  });

  it('legacy date → o‘sha bitta kun', () => {
    const f = SotuvDashboardFilterSchema.parse({ date: '2026-07-01' });
    const { fromDay, toDay } = resolveSotuvWindow(f, NOW);
    expect(iso(fromDay)).toBe('2026-07-01');
    expect(iso(toDay)).toBe('2026-07-01');
  });

  it('dateFrom + dateTo → inklyuziv diapazon', () => {
    const f = SotuvDashboardFilterSchema.parse({ dateFrom: '2026-06-28', dateTo: '2026-07-04' });
    const { fromDay, toDay } = resolveSotuvWindow(f, NOW);
    expect(iso(fromDay)).toBe('2026-06-28');
    expect(iso(toDay)).toBe('2026-07-04');
  });

  it("faqat dateFrom → bugungacha cho'ziladi", () => {
    const f = SotuvDashboardFilterSchema.parse({ dateFrom: '2026-06-28' });
    const { fromDay, toDay } = resolveSotuvWindow(f, NOW);
    expect(iso(fromDay)).toBe('2026-06-28');
    expect(iso(toDay)).toBe('2026-07-04');
  });

  it('dateFrom `date`dan ustun', () => {
    const f = SotuvDashboardFilterSchema.parse({ date: '2026-07-01', dateFrom: '2026-06-01' });
    const { fromDay, toDay } = resolveSotuvWindow(f, NOW);
    expect(iso(fromDay)).toBe('2026-06-01');
    expect(iso(toDay)).toBe('2026-07-04');
  });

  it('teskari diapazon (to < from) → from-kunga qisqaradi', () => {
    const f = SotuvDashboardFilterSchema.parse({ dateFrom: '2026-07-04', dateTo: '2026-07-01' });
    const { fromDay, toDay } = resolveSotuvWindow(f, NOW);
    expect(iso(fromDay)).toBe('2026-07-04');
    expect(iso(toDay)).toBe('2026-07-04');
  });
});
