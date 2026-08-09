import { describe, expect, it } from 'vitest';
import { TARGET_SOURCE, resolvePlanTarget } from './sales-plan-target.js';
import { SALES_PLAN_TYPE } from './sales-plan-types.js';

/**
 * MK37 — «xodimning shu oydagi rejasi qancha» degan savolga BITTA javob.
 *
 * Repoda uchta joy reja da'vo qiladi: yangi `sales_plans`, MK13 `KpiTarget`
 * (kunlik/haftalik — boshqa davr, bu yerda qatnashmaydi) va eski
 * `hr_salary_config.monthly_sales_target_minor` (oy kesimi YO'Q, doimiy
 * qiymat). Ustuvorlik shu modulda hal qilinadi — chaqiruvchilar o'z tartibini
 * o'ylab topmasin.
 */
describe('MK37 — reja qiymatining ustuvorligi va valyuta shartnomasi', () => {
  const BASE = 'UZS';

  it('oyga qo`yilgan reja g`olib', () => {
    const t = resolvePlanTarget({
      planType: SALES_PLAN_TYPE.revenue,
      plan: { id: 'p1', targetValue: 900n, currency: 'UZS' },
      salaryConfigTargetMinor: 500n,
      baseCurrency: BASE,
    });
    expect(t.value).toBe(900n);
    expect(t.source).toBe(TARGET_SOURCE.salesPlan);
    expect(t.planId).toBe('p1');
  });

  it('oyga reja yo`q: eski oylik sotuv maqsadi SUKUT sifatida ishlatiladi', () => {
    const t = resolvePlanTarget({
      planType: SALES_PLAN_TYPE.revenue,
      plan: null,
      salaryConfigTargetMinor: 500n,
      baseCurrency: BASE,
    });
    expect(t.value).toBe(500n);
    expect(t.source).toBe(TARGET_SOURCE.salaryConfig);
    expect(t.planId).toBeNull();
  });

  it('🔴 eski maqsad FAQAT tushum rejasiga tegishli (foydaga sudralmaydi)', () => {
    // `monthly_sales_target_minor` — SOTUV maqsadi. Uni foyda yoki mijoz
    // soniga qo'llash birlik lug'atlarini aralashtirish bo'lardi.
    for (const planType of [
      SALES_PLAN_TYPE.profit,
      SALES_PLAN_TYPE.customerCount,
      SALES_PLAN_TYPE.collectedDebt,
    ] as const) {
      const t = resolvePlanTarget({
        planType,
        plan: null,
        salaryConfigTargetMinor: 500n,
        baseCurrency: BASE,
      });
      expect(t.value).toBeNull();
      expect(t.source).toBe(TARGET_SOURCE.none);
    }
  });

  it('🔴 hech qayerda reja yo`q: NULL va `none` — 0 EMAS', () => {
    const t = resolvePlanTarget({
      planType: SALES_PLAN_TYPE.revenue,
      plan: null,
      salaryConfigTargetMinor: null,
      baseCurrency: BASE,
    });
    expect(t.value).toBeNull();
    expect(t.source).toBe(TARGET_SOURCE.none);
  });

  it('eski maqsad 0 bo`lsa — u reja EMAS (qo`yilmagan deb o`qiladi)', () => {
    // `hr_salary_config` da 0 = «maqsad kiritilmagan» (ustun NOT NULL).
    // 0 ni reja deb olsak har sotuv «cheksiz bajarildi» bo'lardi.
    const t = resolvePlanTarget({
      planType: SALES_PLAN_TYPE.revenue,
      plan: null,
      salaryConfigTargetMinor: 0n,
      baseCurrency: BASE,
    });
    expect(t.value).toBeNull();
    expect(t.source).toBe(TARGET_SOURCE.none);
  });

  // ── Valyuta shartnomasi ───────────────────────────────────────────────────

  it('reja baza valyutasida: solishtirsa bo`ladi', () => {
    const t = resolvePlanTarget({
      planType: SALES_PLAN_TYPE.revenue,
      plan: { id: 'p1', targetValue: 900n, currency: 'UZS' },
      salaryConfigTargetMinor: null,
      baseCurrency: BASE,
    });
    expect(t.comparable).toBe(true);
    expect(t.currency).toBe('UZS');
  });

  it('🔴 reja boshqa valyutada: KONVERTATSIYA QILINMAYDI, solishtirilmaydi', () => {
    // Fakt kunlik KPI omborida baza valyutasi taxminida turadi (u yerda
    // valyuta ustuni yo'q). Rejani kurs bilan keltirish taxminni taxmin
    // ustiga qo'yardi — natija «bajarildi/bajarilmadi» degan YOLG'ON javob.
    const t = resolvePlanTarget({
      planType: SALES_PLAN_TYPE.revenue,
      plan: { id: 'p1', targetValue: 900n, currency: 'USD' },
      salaryConfigTargetMinor: null,
      baseCurrency: BASE,
    });
    expect(t.comparable).toBe(false);
    // Qiymat YASHIRILMAYDI — ekran uni ko'rsatadi, lekin foiz chizmaydi.
    expect(t.value).toBe(900n);
    expect(t.currency).toBe('USD');
  });

  it('sanoq rejasida valyuta YO`Q va u solishtirishga xalaqit bermaydi', () => {
    const t = resolvePlanTarget({
      planType: SALES_PLAN_TYPE.customerCount,
      plan: { id: 'p2', targetValue: 12n, currency: null },
      salaryConfigTargetMinor: null,
      baseCurrency: BASE,
    });
    expect(t.currency).toBeNull();
    expect(t.comparable).toBe(true);
    expect(t.value).toBe(12n);
  });

  it('eski maqsaddan kelgan reja doim BAZA valyutasida deb belgilanadi', () => {
    const t = resolvePlanTarget({
      planType: SALES_PLAN_TYPE.revenue,
      plan: null,
      salaryConfigTargetMinor: 700n,
      baseCurrency: 'USD',
    });
    expect(t.currency).toBe('USD');
    expect(t.comparable).toBe(true);
  });
});
