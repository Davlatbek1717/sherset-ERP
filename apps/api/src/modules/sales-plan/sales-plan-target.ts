/**
 * MK37 — «xodimning shu oydagi rejasi qancha» degan savolning YAGONA javobi.
 * Sof modul.
 *
 * ## Nega ustuvorlik moduli kerak
 * Repoda reja da'vo qiladigan uchta joy bor:
 *   1. `sales_plans` (bu faza) — oy × tur kesimida, aniq;
 *   2. `KpiTarget` (MK13) — KUNLIK/HAFTALIK, ko'rsatkich kesimida; boshqa
 *      davr, shuning uchun bu yerda QATNASHMAYDI (oylikni kunga bo'lish
 *      «shu oyda necha ish kuni» degan jim taxmin bo'lardi — MK22 ishi);
 *   3. `hr_salary_config.monthly_sales_target` — oylik, lekin OY KESIMI YO'Q
 *      (doimiy qiymat) va u **HISOB bo'yicha yagona qator** (`account_id`
 *      UNIQUE), ya'ni har xodimga BIR XIL sukut. HR oyligi hozir aynan
 *      shundan hisoblaydi (`hr-payroll.service.ts` · `hr-kpi.service.ts`
 *      uni oydagi kunlarga bo'lib kunlik maqsad yasaydi).
 * Uchtasi ham qolganda, «qaysi reja?» savoliga javobni HAR chaqiruvchi o'zi
 * o'ylab topardi. Shu funksiya — yagona javob.
 *
 * ## 🔴 Valyuta: KONVERTATSIYA YO'Q
 * Fakt kunlik KPI omboridan keladi, u yerda valyuta ustuni YO'Q — qiymatlar
 * hisobning baza valyutasi taxminida turadi. Boshqa valyutadagi rejani kurs
 * bilan keltirish taxmin ustiga taxmin qo'yardi va natija «bajarildi /
 * bajarilmadi» degan YOLG'ON javob bo'lardi. Shuning uchun mos kelmagan
 * valyutada `comparable: false` qaytadi — qiymat ko'rinadi, foiz chizilmaydi
 * (`ExpenseBudget.planUnconvertible` bilan bir xil intizom).
 */

import { SALES_PLAN_TYPE, type SalesPlanType, isMoneyPlanType } from './sales-plan-types.js';

export const TARGET_SOURCE = {
  /** Shu oyga qo'yilgan reja qatori. */
  salesPlan: 'sales_plan',
  /** Eski oylik sotuv maqsadi (`hr_salary_config`) — sukut sifatida. */
  salaryConfig: 'salary_config',
  /** Reja umuman qo'yilmagan. **0 EMAS.** */
  none: 'none',
} as const;

export type PlanTargetSource = (typeof TARGET_SOURCE)[keyof typeof TARGET_SOURCE];

export interface SalesPlanRowLite {
  id: string;
  targetValue: bigint;
  /** Pul turida MAJBURIY, sanoq turida NULL (bazadagi CHECK bilan qulflangan). */
  currency: string | null;
}

export interface ResolvePlanTargetInput {
  planType: SalesPlanType;
  /** Shu oyga qo'yilgan reja qatori (bo'lmasa `null`). */
  plan: SalesPlanRowLite | null;
  /**
   * `hr_salary_config.monthly_sales_target` (hisob bo'yicha yagona qiymat,
   * har xodimga bir xil). 0 = kiritilmagan.
   */
  salaryConfigTargetMinor: bigint | null;
  /** Hisobning baza valyutasi (валюта учёта). */
  baseCurrency: string;
}

export interface ResolvedPlanTarget {
  planType: SalesPlanType;
  /** NULL = reja qo'yilmagan (0 EMAS). */
  value: bigint | null;
  currency: string | null;
  source: PlanTargetSource;
  /** G'olib `sales_plans` qatori — ekranda «tahrirlash» shunga boradi. */
  planId: string | null;
  /**
   * Reja fakt bilan solishtirilishi mumkinmi. `false` = boshqa valyuta:
   * foiz ham, og'ish ham HISOBLANMAYDI.
   */
  comparable: boolean;
}

export function resolvePlanTarget(input: ResolvePlanTargetInput): ResolvedPlanTarget {
  const { planType, plan, salaryConfigTargetMinor, baseCurrency } = input;

  if (plan) {
    const currency = isMoneyPlanType(planType) ? (plan.currency ?? baseCurrency) : null;
    return {
      planType,
      value: plan.targetValue,
      currency,
      source: TARGET_SOURCE.salesPlan,
      planId: plan.id,
      comparable: currency == null || currency === baseCurrency,
    };
  }

  // Eski maqsad FAQAT tushum rejasiga tegishli: ustun nomi ham, HR oyligidagi
  // ma'nosi ham SOTUV. Uni foydaga yoki mijoz soniga qo'llash birlik
  // lug'atlarini aralashtirish bo'lardi ([[manager-kpi-unit-vocabularies]]).
  const fallbackApplies =
    planType === SALES_PLAN_TYPE.revenue &&
    salaryConfigTargetMinor != null &&
    // 0 = «maqsad kiritilmagan» (ustun NOT NULL, sukuti 0). Uni reja deb
    // olsak har qanday sotuv «cheksiz bajarildi» bo'lib ko'rinardi.
    salaryConfigTargetMinor > 0n;

  if (fallbackApplies) {
    return {
      planType,
      value: salaryConfigTargetMinor,
      currency: baseCurrency,
      source: TARGET_SOURCE.salaryConfig,
      planId: null,
      comparable: true,
    };
  }

  return {
    planType,
    value: null,
    currency: isMoneyPlanType(planType) ? baseCurrency : null,
    source: TARGET_SOURCE.none,
    planId: null,
    comparable: true,
  };
}
