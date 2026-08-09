/**
 * MK37 — OYLIK FAKT. Sof modul (Prisma yo'q, soat yo'q).
 *
 * ## Fakt QAYERDAN
 * `employee_daily_kpi_metrics` — kunlik KPI dvigatelining yagona ombori
 * (4M.1). Bu modul u yerdan kelgan qatorlarni oy bo'yicha YIG'ADI, xolos:
 * hech qanday yangi formula yo'q. Sotuvni bu yerda `Demand` dan qayta
 * hisoblash `report/metrics` dan tashqarida ikkinchi haqiqat bo'lardi —
 * 2026-08-02 da bir vaqtda to'rtta foiz implementatsiyasi bo'lgan hodisaning
 * aynan takrori.
 *
 * ## Menejer tuzatmasi ALMASHTIRADI, qo'shmaydi
 * `adjustValue ?? autoValue` — 4M.2 shartnomasi. Qo'shilsa kun ikki marta
 * sanalardi.
 *
 * ## NULL ≠ 0
 * O'lchanmagan kun yig'indiga 0 bo'lib kirmaydi va butun oyni nolga
 * aylantirmaydi ham: mavjud o'lchovlar qo'shiladi, natija esa `complete:
 * false` bayrog'i bilan chiqadi ([[data-quality-flag-layer]]). Hech narsa
 * o'lchanmagan bo'lsa — `value: null`, ya'ni «bilmaymiz», «nol» EMAS.
 */

import { type SalesPlanType, salesPlanTypeDef } from './sales-plan-types.js';

/** `EmployeeDailyKpiMetric` qatorining shu modulga keraklic qismi. */
export interface DailyMetricRow {
  employeeId: string;
  metricKey: string;
  /** Tizim hisoblagani. NULL = O'LCHANMAGAN. */
  autoValue: bigint | null;
  /** Menejer tuzatmasi (4M.2). NULL = tuzatilmagan. */
  adjustValue: bigint | null;
  /** Shu qiymat to'liq manbadan hisoblanganmi. */
  complete: boolean;
}

export interface SalesFact {
  /** Ko'rsatkichning O'Z birligida. NULL = O'LCHANMAGAN (0 EMAS). */
  value: bigint | null;
  /** Hamma hissa qo'shgan qator to'liq manbadan kelganmi. */
  complete: boolean;
  /** Qaysi ko'rsatkichlar haqiqatan hissa qo'shdi — ekranda ko'rinadi. */
  contributingKeys: string[];
  /** `none` = bu turda umuman fakt manbai yo'q (qo'lda kuzatiladi). */
  source: 'metrics' | 'none';
}

/** Kun qiymati: tuzatma bo'lsa u, aks holda avtomat. Ikkalasi ham NULL bo'lishi mumkin. */
function effectiveValue(row: DailyMetricRow): bigint | null {
  return row.adjustValue ?? row.autoValue;
}

/**
 * Bir xodimning bir plan turi bo'yicha oylik fakti.
 *
 * `rows` — o'sha xodimning oy ichidagi HAMMA kunlik ko'rsatkich qatorlari
 * (begonalari shu yerda filtrlanadi, chaqiruvchi ajratmaydi).
 */
export function aggregateSalesFact(
  rows: readonly DailyMetricRow[],
  planType: SalesPlanType,
): SalesFact {
  const def = salesPlanTypeDef(planType);
  if (def.factSource === 'none') {
    return { value: null, complete: false, contributingKeys: [], source: 'none' };
  }

  const wanted = new Set(def.metricKeys);
  let sum: bigint | null = null;
  let complete = true;
  const contributing = new Set<string>();

  for (const row of rows) {
    if (!wanted.has(row.metricKey)) continue;

    const value = effectiveValue(row);
    if (value == null) {
      // O'lchanmagan kun: yig'indini nolga tortmaydi, lekin to'liqlikni
      // buzadi — menejer buni ekranda ko'radi.
      complete = false;
      continue;
    }

    sum = (sum ?? 0n) + value;
    if (!row.complete) complete = false;
    contributing.add(row.metricKey);
  }

  return {
    value: sum,
    // Hech narsa o'lchanmagan bo'lsa «to'liq» deyish yolg'on bo'lardi.
    complete: sum === null ? false : complete,
    contributingKeys: [...contributing],
    source: 'metrics',
  };
}

/**
 * Xodim → (plan turi → fakt). Ekran jadvali shu xaritadan chiziladi.
 *
 * Bir marta o'tishda xodimlarga ajratiladi: har tur uchun butun ro'yxatni
 * qayta skanerlash minglab kunlik qatorda sezilarli bo'lardi.
 */
export function aggregateSalesFactByEmployee(
  rows: readonly DailyMetricRow[],
  planTypes: readonly SalesPlanType[],
): Map<string, Map<SalesPlanType, SalesFact>> {
  const byEmployee = new Map<string, DailyMetricRow[]>();
  for (const row of rows) {
    const bucket = byEmployee.get(row.employeeId);
    if (bucket) bucket.push(row);
    else byEmployee.set(row.employeeId, [row]);
  }

  const out = new Map<string, Map<SalesPlanType, SalesFact>>();
  for (const [employeeId, employeeRows] of byEmployee) {
    const perType = new Map<SalesPlanType, SalesFact>();
    for (const planType of planTypes) {
      perType.set(planType, aggregateSalesFact(employeeRows, planType));
    }
    out.set(employeeId, perType);
  }
  return out;
}

/** Fakt manbai bo'lgan turlarning barcha ko'rsatkich kalitlari (SQL filtri uchun). */
export function factMetricKeys(planTypes: readonly SalesPlanType[]): string[] {
  const keys = new Set<string>();
  for (const planType of planTypes) {
    for (const key of salesPlanTypeDef(planType).metricKeys) keys.add(key);
  }
  return [...keys];
}
