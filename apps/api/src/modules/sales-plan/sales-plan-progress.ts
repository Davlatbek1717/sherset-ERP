/**
 * MK37 — REJA ↔ FAKT. Sof modul (DB yo'q, soat yo'q, `Date.now()` yo'q).
 *
 * ## Foiz shu yerda YOZILMAYDI
 * Hamma nisbat `report/metrics/` qatlamidan (`percent` / `percentText`).
 * Bu 2026-08-02 dagi X4 hodisasining qoidasi: bir ratio ikki ekranda ikki xil
 * ko'rinsa, hisobotga ishonch yo'qoladi. Shuning uchun bu faylda `* 100`,
 * `toFixed` yoki `Number(a)/Number(b)` YO'Q.
 *
 * ## Reja yo'q ≠ reja 0 ≠ fakt yo'q — uchta boshqa javob
 *   • reja YO'Q      → `no_plan`, foiz NULL (MK12 `budget-variance` bilan bir xil);
 *   • fakt O'LCHANMAGAN → `no_fact`, foiz NULL — «0% bajardi» degan ayblov emas;
 *   • reja NOL       → foiz NULL (0 ga bo'lish yo'q), lekin maqsad bajarilgan.
 *
 * ## Sur'at (TZ 2-bo'lim §4.8)
 * «Shu sur'atda oyni N% bilan yopasiz» — prognoz `fakt × oydagi kun ÷ o'tgan
 * kun` dan chiqadi va REJA bilan solishtiriladi. Oy hali boshlanmagan bo'lsa
 * (0 kun) prognoz ham, kutilgan foiz ham NULL: hech narsa kutilmagan xodimni
 * «orqada» deb belgilash yolg'on ayblov bo'lardi.
 */

import { REPORT_PERCENT_DECIMALS, percent, percentText } from '../report/metrics/index.js';

export const PLAN_STATUS = {
  /** Reja qo'yilmagan — bajarish HISOBLANMAYDI. */
  noPlan: 'no_plan',
  /** Reja bor, lekin fakt o'lchanmagan. */
  noFact: 'no_fact',
  behind: 'behind',
  onTrack: 'on_track',
  done: 'done',
} as const;

export type PlanStatus = (typeof PLAN_STATUS)[keyof typeof PLAN_STATUS];

export interface PlanProgressInput {
  /** NULL = reja qo'yilmagan. */
  targetValue: bigint | null;
  /** NULL = fakt o'lchanmagan. */
  factValue: bigint | null;
  /** Oyning o'tgan kunlari (yakunlangan oyda = oydagi kunlar soni). */
  elapsedDays?: number | null;
  /** Oydagi kunlar soni (`monthDayCount`). */
  totalDays?: number | null;
}

export interface PlanProgress {
  targetValue: bigint | null;
  factValue: bigint | null;
  /** "33.33" — yoki NULL (reja yo'q · fakt yo'q · reja nol). */
  achievedPercent: string | null;
  /** Reja − fakt; oshib ketilgan bo'lsa 0. NULL = hisoblab bo'lmaydi. */
  remainingValue: bigint | null;
  /** Oyning o'tgan ulushi — «shu kunga qancha kutilardi». */
  expectedPercent: string | null;
  /** Joriy sur'atda oy oxirida chiqadigan bajarish foizi. */
  projectedPercent: string | null;
  status: PlanStatus;
}

/** `percentText` ning '' (mahraj yo'q) shartnomasini NULL ga o'giradi. */
function pctOrNull(numer: bigint, denom: bigint): string | null {
  const text = percentText(numer, denom);
  return text === '' ? null : text;
}

export function computePlanProgress(input: PlanProgressInput): PlanProgress {
  const { targetValue, factValue } = input;
  const totalDays = input.totalDays ?? null;
  const elapsedDays = input.elapsedDays ?? null;

  if (targetValue == null) {
    return {
      targetValue: null,
      factValue,
      achievedPercent: null,
      remainingValue: null,
      expectedPercent: null,
      projectedPercent: null,
      status: PLAN_STATUS.noPlan,
    };
  }

  if (factValue == null) {
    return {
      targetValue,
      factValue: null,
      achievedPercent: null,
      // O'lchanmagan faktdan «qancha qoldi» ni ayirib bo'lmaydi: natija
      // rejaning o'zi bo'lib chiqardi va u «hech narsa qilinmadi» degan
      // YOLG'ON xulosa bo'lardi.
      remainingValue: null,
      expectedPercent: null,
      projectedPercent: null,
      status: PLAN_STATUS.noFact,
    };
  }

  const remaining = targetValue > factValue ? targetValue - factValue : 0n;
  const achievedPercent = pctOrNull(factValue, targetValue);
  const achieved = percent(factValue, targetValue);

  // Kutilgan sur'at: o'tgan kunlar ulushi. Oy tugagach 100% dan oshmaydi.
  const paceKnown = elapsedDays != null && totalDays != null && elapsedDays > 0 && totalDays > 0;
  const cappedElapsed = paceKnown ? BigInt(Math.min(elapsedDays, totalDays)) : 0n;
  const expectedPercent = paceKnown ? pctOrNull(cappedElapsed, BigInt(totalDays)) : null;
  const expected = paceKnown ? percent(cappedElapsed, BigInt(totalDays)) : null;

  // Prognoz: joriy sur'at oy oxirigacha davom etsa. BigInt bo'linishi kesadi —
  // bu prognoz uchun sezilarsiz, lekin `Number` ga o'tish katta summada
  // aniqlikni yo'qotardi.
  const projectedValue = paceKnown
    ? (factValue * BigInt(totalDays)) / BigInt(Math.min(elapsedDays, totalDays))
    : null;
  const projectedPercent = projectedValue == null ? null : pctOrNull(projectedValue, targetValue);

  let status: PlanStatus;
  if (targetValue === 0n) {
    // Nol reja — har qanday fakt uni qoplaydi. Foiz esa NULL (bo'lish yo'q).
    status = PLAN_STATUS.done;
  } else if (achieved != null && achieved >= 100) {
    status = PLAN_STATUS.done;
  } else if (expected == null || achieved == null) {
    // Sur'at noma'lum — «orqada» deb ayblash uchun asos yo'q.
    status = PLAN_STATUS.onTrack;
  } else {
    status = achieved >= expected ? PLAN_STATUS.onTrack : PLAN_STATUS.behind;
  }

  return {
    targetValue,
    factValue,
    achievedPercent,
    remainingValue: remaining,
    expectedPercent,
    projectedPercent,
    status,
  };
}

/**
 * Oydagi kunlar soni — FAQAT "YYYY-MM" yorlig'idan.
 *
 * `Date.UTC` yorliqni kunga aylantirish uchun; mahalliy vaqt ham, joriy soat
 * ham ishlatilmaydi, ya'ni natija timezone'dan mustaqil
 * ([[month-bounds-label-vs-instant]] — yorliqni instantga aylantirish kunni
 * bir kunga surib yuborgan hodisa).
 *
 * Buzuq yorliq **0** beradi: jimgina «30 kun» deb taxmin qilinsa, sur'at
 * ko'rsatkichi yolg'on chiqardi.
 */
export function monthDayCount(yearMonth: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) return 0;
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  // `day = 0` — oldingi oyning oxirgi kuni, ya'ni shu oyning kunlari soni.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Ekran uchun: foizning o'nlik xonasi butun loyihada bitta joydan. */
export const PLAN_PERCENT_DECIMALS = REPORT_PERCENT_DECIMALS;
