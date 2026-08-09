import { describe, expect, it } from 'vitest';
import { BUILT_IN_CATALOG } from '../manager/kpi/kpi-metrics.js';
import {
  SALES_PLAN_TYPE,
  SALES_PLAN_TYPES,
  isMoneyPlanType,
  isSalesPlanType,
  salesPlanTypeDef,
} from './sales-plan-types.js';

/**
 * MK37 — plan turlari lug'ati. Bu test lug'atni KPI katalogiga bog'lab
 * turadi: fakt manbai deb yozilgan har bir kalit haqiqatan mavjud bo'lishi
 * kerak, aks holda reja qo'yiladi-yu fakt hech qachon kelmaydi va ekranda
 * abadiy «o'lchanmagan» qator qoladi.
 */
describe('MK37 — sotuv rejasi turlari lug`ati', () => {
  it('to`rt tur: tushum · foyda · mijoz soni · undirilgan qarz', () => {
    expect(Object.keys(SALES_PLAN_TYPES).sort()).toEqual([
      'collected_debt',
      'customer_count',
      'profit',
      'revenue',
    ]);
  });

  it('har bir fakt kaliti KPI katalogida HAQIQATAN mavjud', () => {
    const unknown: string[] = [];
    for (const def of Object.values(SALES_PLAN_TYPES)) {
      for (const key of def.metricKeys) {
        if (!BUILT_IN_CATALOG.has(key)) unknown.push(`${def.planType}:${key}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('fakt kaliti YO`Q tur `source: none` deb OCHIQ belgilanadi', () => {
    // Yashirilmaydi: ekran «qo'lda kuzatiladi» deb aytadi (`kpi-metrics.ts`
    // dagi `manual` manba naqshi), aks holda menejer raqam o'zi paydo
    // bo'lishini kutib qolardi.
    expect(salesPlanTypeDef(SALES_PLAN_TYPE.customerCount).factSource).toBe('none');
    expect(salesPlanTypeDef(SALES_PLAN_TYPE.collectedDebt).factSource).toBe('none');
    expect(salesPlanTypeDef(SALES_PLAN_TYPE.revenue).factSource).toBe('metrics');
    expect(salesPlanTypeDef(SALES_PLAN_TYPE.profit).factSource).toBe('metrics');
  });

  it('`source: none` turida kalit ro`yxati BO`SH (yolg`on manba yozilmasin)', () => {
    for (const def of Object.values(SALES_PLAN_TYPES)) {
      if (def.factSource === 'none') expect(def.metricKeys).toEqual([]);
      else expect(def.metricKeys.length).toBeGreaterThan(0);
    }
  });

  it('tushum va foyda manbalari KESISHMAYDI (ikki karra sanoq yo`q)', () => {
    // `sales_*` = Demand (hujjat), `cash_*` = CashierSession (kassa). Chakana
    // sotuv Demand YARATMAYDI, shuning uchun ikkalasini qo'shish to'g'ri.
    const revenue = salesPlanTypeDef(SALES_PLAN_TYPE.revenue).metricKeys;
    const profit = salesPlanTypeDef(SALES_PLAN_TYPE.profit).metricKeys;
    expect(revenue.filter((k) => profit.includes(k))).toEqual([]);
    expect(new Set(revenue).size).toBe(revenue.length);
  });

  it('birlik: pul turlari `money`, mijoz soni `count`', () => {
    expect(isMoneyPlanType(SALES_PLAN_TYPE.revenue)).toBe(true);
    expect(isMoneyPlanType(SALES_PLAN_TYPE.profit)).toBe(true);
    expect(isMoneyPlanType(SALES_PLAN_TYPE.collectedDebt)).toBe(true);
    expect(isMoneyPlanType(SALES_PLAN_TYPE.customerCount)).toBe(false);
  });

  it('birlik lug`ati KPI katalogining birligi bilan MOS (100× xato klassi)', () => {
    // MK14 brauzer-QA da pul 100× noto'g'ri chizilgan edi, chunki ekran
    // `manager_rule_configs` birligini KPI birligi deb o'qigan. Shu bog'lanish
    // testda qulflanadi.
    for (const def of Object.values(SALES_PLAN_TYPES)) {
      for (const key of def.metricKeys) {
        expect(BUILT_IN_CATALOG.get(key)?.unit).toBe(def.unit);
      }
    }
  });

  it('notanish tur rad etiladi', () => {
    expect(isSalesPlanType('revenue')).toBe(true);
    expect(isSalesPlanType('margin')).toBe(false);
    expect(isSalesPlanType('')).toBe(false);
  });
});
