import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Tuzatuvchi qator ulanish qulfi (menejer KPI TZ §3.4).
 *
 * Bu invariantlarni typecheck ham, sof modul testlari ham tutmaydi — lekin
 * ularning har biri buzilsa **to'langan oylik jimgina o'zgaradi**:
 *
 * 1. Qabulda fakt MUZLATILMASA — oylik har safar joriy raqamni qayta
 *    yig'adi va iyul summasi avgustda boshqacha chiqadi.
 * 2. Tuzatma kun holati bilan BIR tranzaksiyada yozilmasa — kun yangi
 *    fakt bilan qabul qilingan-u, farq oylikda ko'rinmagan holat qoladi.
 * 3. Davr KUN sanasidan olinsa — tuzatma allaqachon yopilgan iyulga
 *    tushib, o'sha oyning summasini o'zgartiradi.
 * 4. Oylik tuzatmalarni o'qimasa — jadval to'ladi, pul esa tegmaydi.
 */
const DIR = import.meta.dirname;
const ACCEPT = readFileSync(join(DIR, 'daily-kpi-acceptance.service.ts'), 'utf8');
const PAYROLL = readFileSync(
  join(DIR, '..', '..', 'hr', 'hr-salary', 'hr-payroll.service.ts'),
  'utf8',
);
const FORMULA = readFileSync(
  join(DIR, '..', '..', 'hr', 'hr-salary', 'payroll-formula.util.ts'),
  'utf8',
);

describe('qabulda oylik-fakti MUZLATILADI', () => {
  it('accept/force_accept da `acceptedFactMinor` yoziladi', () => {
    expect(ACCEPT).toMatch(/extra\.acceptedFactMinor = await this\.currentFactMinor\(/);
  });

  it('fakt manbai oylik bilan BIR XIL (adjust > auto)', () => {
    // `sumAcceptedSales` ham shu tartibda o'qiydi; farq bo'lsa tuzatma
    // boshqa raqamdan hisoblanib, hech qachon nolga kelmasdi.
    const body = ACCEPT.slice(ACCEPT.indexOf('private async currentFactMinor'));
    expect(body.slice(0, 900)).toMatch(/adjustValue \?\? m\?\.autoValue \?\? 0n/);
    expect(body.slice(0, 900)).toContain('PAYROLL_SALES_METRIC_KEY');
  });
});

describe('tuzatma yozilishi', () => {
  it('qaror SOF moduldan (servisda takroriy shart yo`q)', () => {
    expect(ACCEPT).toMatch(/planCorrection\(\{/);
    // Servis o'zi «farq bormi» deb hisoblamasin.
    expect(ACCEPT).not.toMatch(/nextMinor - previousMinor/);
  });

  it('kun holati bilan BIR tranzaksiyada', () => {
    const tx = ACCEPT.slice(ACCEPT.indexOf('await this.prisma.client.$transaction'));
    const upd = tx.indexOf('tx.employeeDailyKpi.updateMany');
    const corr = tx.indexOf('tx.employeeKpiCorrection.create');
    expect(upd, 'holat yangilanishi topilmadi').toBeGreaterThan(-1);
    expect(corr, 'tuzatma tranzaksiyadan tashqarida').toBeGreaterThan(upd);
  });

  it('davr TUZATMA sanasidan olinadi, kun sanasidan EMAS', () => {
    // `correctionPeriod(day.date)` bo'lsa tuzatma yopilgan iyulga tushardi.
    expect(ACCEPT).toMatch(/period: correctionPeriod\(now\)/);
    expect(ACCEPT).not.toMatch(/correctionPeriod\(day\.date\)/);
  });

  it('kun sanasi ham saqlanadi («qaysi kun uchun»)', () => {
    expect(ACCEPT).toMatch(/kpiDate: day\.date/);
  });
});

describe('oylik tuzatmalarni HISOBGA OLADI', () => {
  it('davr bo`yicha o`qiydi', () => {
    expect(PAYROLL).toMatch(/employeeKpiCorrection\.findMany/);
    expect(PAYROLL).toMatch(/period: yearMonth/);
  });

  it('yakuniy summaga kiradi', () => {
    expect(PAYROLL).toMatch(/correctionNetMinor: corrections\.netMinor/);
    expect(FORMULA).toMatch(/c\.correctionNetMinor \?\? 0n/);
  });

  it('qo`shimcha to`lov va ushlanma ALOHIDA saqlanadi', () => {
    // Buxgalter hujjatda ikkalasini alohida qator qilib ko'rsatadi.
    expect(PAYROLL).toMatch(/correctionIncreaseMinor: corrections\.increaseMinor/);
    expect(PAYROLL).toMatch(/correctionDecreaseMinor: corrections\.decreaseMinor/);
  });
});
