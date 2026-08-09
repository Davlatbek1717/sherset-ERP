/**
 * MK12 / 4M TZ §8 — reja ↔ fakt og'ishi.
 *
 * 🔴 **Plan yo'q ≠ plan 0.** Byudjet qo'yilmagan moddada «0% ishlatildi» ham,
 * «100% oshib ketdi» ham yolg'on. Shuning uchun `usedPercent` va
 * `varianceMinor` NULL bo'ladi, status esa alohida `no_plan` qiymatini oladi —
 * ekran «reja qo'yilmagan» deb aytadi, raqam ko'rsatmaydi.
 * Bu loyihadagi [[data-quality-flag-layer]] va NULL≠0 naqshining davomi.
 *
 * Hisob BigInt (tiyin) — float yaxlitlanishi yo'q; faqat foizni matnga
 * o'girishda 2 xona aniqlik bilan tayyorlanadi.
 */

import { MANAGER_THRESHOLD, MANAGER_THRESHOLDS } from '../manager/thresholds/manager-thresholds.js';

export const BUDGET_STATUS = {
  /** Reja qo'yilmagan — og'ish HISOBLANMAYDI. */
  noPlan: 'no_plan',
  within: 'within',
  warning: 'warning',
  over: 'over',
} as const;

export type BudgetStatus = (typeof BUDGET_STATUS)[keyof typeof BUDGET_STATUS];

/**
 * Ogohlantirish chegarasi (rejaning %). TZ'da yo'q — agent tanlagan default.
 *
 * **MK13 (2026-08-09):** endi bu raqam `manager_rule_configs` registrida
 * (`BUDGET_WARN_PERCENT`) — MK12 DEFER-3 aynan shuni talab qilgan edi:
 * «sozlamaga chiqarish MK13 dagi `SCORE_CAP_PERCENT` bilan **birga** qilinsin
 * (bir xil naqsh, ikki marta emas)». Shu konstanta o'sha registrning SUKUT
 * qiymati — raqam ikki joyda turmaydi. Chaqiruvchi hisobga sozlangan qiymatni
 * `warnPercent` argumenti orqali uzatadi.
 */
export const DEFAULT_WARN_PERCENT =
  MANAGER_THRESHOLDS[MANAGER_THRESHOLD.budgetWarnPercent].defaultValue;

export interface BudgetVariance {
  plannedMinor: bigint | null;
  actualMinor: bigint;
  /** `actual − planned`; reja yo'q bo'lsa NULL. */
  varianceMinor: bigint | null;
  /** "40.00" ko'rinishida; reja yo'q YOKI reja 0 bo'lsa NULL. */
  usedPercent: string | null;
  status: BudgetStatus;
}

/** Foizni 2 xona aniqlikda, BigInt arifmetikasi bilan (float yo'q). */
function percentText(actual: bigint, planned: bigint): string {
  const scaled = (actual * 10_000n) / planned; // 100.00% → 10000
  const whole = scaled / 100n;
  const frac = scaled % 100n;
  const sign = scaled < 0n ? '-' : '';
  const absWhole = whole < 0n ? -whole : whole;
  const absFrac = frac < 0n ? -frac : frac;
  return `${sign}${absWhole}.${String(absFrac).padStart(2, '0')}`;
}

export function computeVariance(
  plannedMinor: bigint | null,
  actualMinor: bigint,
  warnPercent: number = DEFAULT_WARN_PERCENT,
): BudgetVariance {
  if (plannedMinor === null) {
    return {
      plannedMinor: null,
      actualMinor,
      varianceMinor: null,
      usedPercent: null,
      status: BUDGET_STATUS.noPlan,
    };
  }

  const variance = actualMinor - plannedMinor;

  if (plannedMinor === 0n) {
    // 0 ga bo'lish yo'q: «Infinity%» raqam emas, shuning uchun foiz NULL.
    return {
      plannedMinor,
      actualMinor,
      varianceMinor: variance,
      usedPercent: null,
      status: actualMinor > 0n ? BUDGET_STATUS.over : BUDGET_STATUS.within,
    };
  }

  const usedPercent = percentText(actualMinor, plannedMinor);

  // Chegara BigInt bilan solishtiriladi: `actual * 100 >= planned * warn`.
  // Foiz matnini qayta parse qilish (float) bu yerda aniqlikni yo'qotardi.
  const warnScaled = BigInt(Math.round(warnPercent * 100));
  const reachedWarn = actualMinor * 10_000n >= plannedMinor * warnScaled;

  let status: BudgetStatus = BUDGET_STATUS.within;
  if (variance > 0n) status = BUDGET_STATUS.over;
  else if (reachedWarn) status = BUDGET_STATUS.warning;

  return { plannedMinor, actualMinor, varianceMinor: variance, usedPercent, status };
}
