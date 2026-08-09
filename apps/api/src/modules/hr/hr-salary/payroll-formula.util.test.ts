import { describe, expect, it } from 'vitest';
import {
  computeFinalSalaryMinor,
  extractBaseSalaryMinor,
  monthBounds,
  monthInstantBounds,
  resolveFixComponentMinor,
} from './payroll-formula.util.js';

describe('computeFinalSalaryMinor', () => {
  it('fix + kpi + bonus − fine + commission', () => {
    expect(
      computeFinalSalaryMinor({
        fixComponentMinor: 5_000_000_00n,
        kpiEarnedMinor: 1_000_000_00n,
        bonusSumMinor: 300_000_00n,
        fineSumMinor: 100_000_00n,
        commissionMinor: 150_000_00n,
      }),
    ).toBe(6_350_000_00n);
  });

  it('fine subtracted — can go negative (underwater month surfaced)', () => {
    expect(
      computeFinalSalaryMinor({
        fixComponentMinor: 0n,
        kpiEarnedMinor: 0n,
        bonusSumMinor: 0n,
        fineSumMinor: 500_00n,
        commissionMinor: 0n,
      }),
    ).toBe(-500_00n);
  });

  it('all-zero components → 0', () => {
    expect(
      computeFinalSalaryMinor({
        fixComponentMinor: 0n,
        kpiEarnedMinor: 0n,
        bonusSumMinor: 0n,
        fineSumMinor: 0n,
        commissionMinor: 0n,
      }),
    ).toBe(0n);
  });

  it('BigInt-safe for >2^53 totals', () => {
    expect(
      computeFinalSalaryMinor({
        fixComponentMinor: 99_999_999_999_999_99n,
        kpiEarnedMinor: 0n,
        bonusSumMinor: 0n,
        fineSumMinor: 0n,
        commissionMinor: 1n,
      }),
    ).toBe(99_999_999_999_999_99n + 1n);
  });
});

describe('extractBaseSalaryMinor', () => {
  it('reads baseSalaryMinor string', () => {
    expect(extractBaseSalaryMinor({ baseSalaryMinor: '500000000' })).toBe(500_000_000n);
  });

  it('reads baseSalaryMinor number', () => {
    expect(extractBaseSalaryMinor({ baseSalaryMinor: 12345 })).toBe(12_345n);
  });

  it('null / undefined / non-object → 0n', () => {
    expect(extractBaseSalaryMinor(null)).toBe(0n);
    expect(extractBaseSalaryMinor(undefined)).toBe(0n);
    expect(extractBaseSalaryMinor('nope')).toBe(0n);
    expect(extractBaseSalaryMinor(42)).toBe(0n);
  });

  it('missing key → 0n', () => {
    expect(extractBaseSalaryMinor({ other: 1 })).toBe(0n);
  });

  it('negative base clamped to 0n', () => {
    expect(extractBaseSalaryMinor({ baseSalaryMinor: '-5000' })).toBe(0n);
  });

  it('garbage value → 0n (no throw)', () => {
    expect(extractBaseSalaryMinor({ baseSalaryMinor: 'abc' })).toBe(0n);
  });
});

describe('monthBounds', () => {
  it('returns [first-of-month, first-of-next-month) UTC', () => {
    const { start, endExclusive } = monthBounds('2026-05');
    expect(start.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('December rolls over to next year', () => {
    const { start, endExclusive } = monthBounds('2026-12');
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('February leap year (2028)', () => {
    const { endExclusive } = monthBounds('2028-02');
    expect(endExclusive.toISOString()).toBe('2028-03-01T00:00:00.000Z');
  });

  it('rejects malformed input', () => {
    expect(() => monthBounds('2026-5')).toThrow(/format/);
    expect(() => monthBounds('not-a-month')).toThrow();
    expect(() => monthBounds('2026-13')).toThrow(/oy/);
  });
});

/**
 * HR-1 — «asosiy oylik prod'da doim 0» (Faza 29a).
 *
 * Xodim kartochkasi `Employee.salaryMinor` ustuniga yozadi (hr-employee.service
 * `create`/`update`), oylik dvigateli esa `Employee.salaryConfig` JSON'idan
 * o'qirdi — uni HECH BIR yozuv yo'li to'ldirmaydi (yagona chaqiruvchi:
 * `apps/api/scripts/verify-payroll-kpi-smoke.ts`). Ya'ni `fixComponentMinor`
 * prod'da HAR DOIM 0n edi.
 */
describe('resolveFixComponentMinor (HR-1)', () => {
  it("salaryConfig bo'sh bo'lsa Employee.salaryMinor ustunini oladi", () => {
    expect(resolveFixComponentMinor({ salaryConfig: null, salaryMinor: 5_000_000_00n })).toBe(
      5_000_000_00n,
    );
  });

  it('salaryConfig.baseSalaryMinor ustun turadi (aniq override)', () => {
    expect(
      resolveFixComponentMinor({
        salaryConfig: { baseSalaryMinor: '300000000' },
        salaryMinor: 5_000_000_00n,
      }),
    ).toBe(300_000_000n);
  });

  it('override ATAYLAB 0 bo\'lsa fallback ISHLAMAYDI ("fiks yo\'q" — 0 saqlanadi)', () => {
    expect(
      resolveFixComponentMinor({ salaryConfig: { baseSalaryMinor: 0 }, salaryMinor: 9_999n }),
    ).toBe(0n);
  });

  it('buzuq/manfiy override = «sozlanmagan» → ustun qiymatiga qaytadi', () => {
    expect(
      resolveFixComponentMinor({ salaryConfig: { baseSalaryMinor: 'abc' }, salaryMinor: 7_000n }),
    ).toBe(7_000n);
    expect(
      resolveFixComponentMinor({ salaryConfig: { baseSalaryMinor: '-5' }, salaryMinor: 7_000n }),
    ).toBe(7_000n);
  });

  it('ikkalasi ham yo`q → 0n', () => {
    expect(resolveFixComponentMinor({ salaryConfig: null, salaryMinor: null })).toBe(0n);
  });

  it('manfiy ustun qiymati 0n ga qisiladi', () => {
    expect(resolveFixComponentMinor({ salaryConfig: null, salaryMinor: -1n })).toBe(0n);
  });
});

/**
 * HR-7/8 — oy chegarasi tz off-by-one (Faza 29a).
 *
 * `monthBounds` UTC-yarim-tun beradi va bu `EmployeeDailyKpi.date` uchun
 * TO'G'RI (u `localDateOnly` YORLIG'I — UTC-yarim-tun). Ammo bonus/jarima
 * `createdAt` — HAQIQIY instant, shuning uchun unga Toshkent chegarasi kerak:
 * 1-avgust 02:00 mahalliy = 31-iyul 21:00 UTC ⇒ UTC oynasi uni IYULGA qo'shadi.
 */
describe('monthInstantBounds (HR-7/8)', () => {
  it('Toshkent mahalliy yarim tunda boshlanadi/tugaydi (+05:00)', () => {
    const { start, endExclusive } = monthInstantBounds('2026-08');
    expect(start.toISOString()).toBe('2026-07-31T19:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2026-08-31T19:00:00.000Z');
  });

  it('1-avgust 02:00 mahalliy jarimasi AVGUST oynasiga tushadi (UTC oynasi tushirmasdi)', () => {
    const fineAt = new Date('2026-07-31T21:00:00.000Z'); // = 2026-08-01 02:00 Toshkent
    const aug = monthInstantBounds('2026-08');
    expect(fineAt >= aug.start && fineAt < aug.endExclusive).toBe(true);

    const jul = monthInstantBounds('2026-07');
    expect(fineAt >= jul.start && fineAt < jul.endExclusive).toBe(false);
    // Eski (UTC) chegara aynan teskarisini qilardi — regressiya qulfi:
    expect(fineAt < monthBounds('2026-08').start).toBe(true);
  });

  it('dekabr yil oshadi', () => {
    const { start, endExclusive } = monthInstantBounds('2026-12');
    expect(start.toISOString()).toBe('2026-11-30T19:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2026-12-31T19:00:00.000Z');
  });

  it('kabisa fevral (2028)', () => {
    expect(monthInstantBounds('2028-02').endExclusive.toISOString()).toBe(
      '2028-02-29T19:00:00.000Z',
    );
  });

  it('buzuq kiritmani rad etadi', () => {
    expect(() => monthInstantBounds('2026-5')).toThrow(/format/);
    expect(() => monthInstantBounds('2026-13')).toThrow(/oy/);
  });
});
