/**
 * MK37 / 2-bo'lim TZ §4.8 · 4-bo'lim TZ §6 — SOTUV REJASI TURLARI. Sof modul.
 *
 * ## Nega lug'at, nega ustunlar emas
 * Reja «summa yoki foyda» bilan cheklanmaydi (TZ 4-bo'lim §6 mijoz soni va
 * undirilgan qarzni ham sanaydi). Har turga ustun ochilsa har yangi o'lchov
 * migratsiya bo'lardi — `HrKpiDailyLog` ning uchta qat'iy ustuni aynan shu
 * sababdan `EmployeeDailyKpiMetric` ga almashtirilgan edi.
 *
 * ## Fakt kaliti — KPI katalogidan, nusxa EMAS
 * `metricKeys` ichidagi har kalit `manager/kpi/kpi-metrics.ts` katalogida
 * bo'lishi SHART (`sales-plan-types.test.ts` shuni qulflaydi). Aks holda reja
 * qo'yilardi-yu unga hech qachon fakt kelmasdi.
 *
 * ## Manba YO'Q — bu ham javob
 * `customer_count` va `collected_debt` uchun bugun hisoblanadigan ko'rsatkich
 * YO'Q. Ular ro'yxatdan olib tashlanmaydi (TZ ularni talab qiladi) va soxta
 * manba ham berilmaydi: `factSource: 'none'` bilan belgilanadi, ekran
 * «qo'lda kuzatiladi» deb ko'rsatadi. Bu `kpi-metrics.ts` dagi `manual`
 * manba naqshining aynan o'zi — cheklov yashirilmaydi.
 */

export const SALES_PLAN_TYPE = {
  /** Tushum — hujjat sotuvi + kassa tushumi. */
  revenue: 'revenue',
  /** Yalpi foyda — tushum − tan narx. */
  profit: 'profit',
  /** Mijoz soni (manba hali yo'q). */
  customerCount: 'customer_count',
  /** Undirilgan qarz (manba hali yo'q). */
  collectedDebt: 'collected_debt',
} as const;

export type SalesPlanType = (typeof SALES_PLAN_TYPE)[keyof typeof SALES_PLAN_TYPE];

/**
 * Birlik — `kpi-metrics.ts` dagi `MetricUnit` ning shu yerda ishlatiladigan
 * qismi. ATAYLAB o'sha lug'at: `manager_rule_configs.thresholdUnit`
 * (`percent | minor | days …`) BUTUNLAY BOSHQA o'q va ikkisini aralashtirish
 * MK14 brauzer-QA da pulni 100× noto'g'ri chizdirgan.
 */
export type SalesPlanUnit = 'money' | 'count';

export interface SalesPlanTypeDef {
  readonly planType: SalesPlanType;
  readonly unit: SalesPlanUnit;
  /** `metrics` — kunlik KPI omboridan; `none` — manba yo'q, qo'lda kuzatiladi. */
  readonly factSource: 'metrics' | 'none';
  /** `EmployeeDailyKpiMetric.metricKey` qiymatlari (yig'indi shu kalitlardan). */
  readonly metricKeys: readonly string[];
}

export const SALES_PLAN_TYPES: Readonly<Record<SalesPlanType, SalesPlanTypeDef>> = {
  [SALES_PLAN_TYPE.revenue]: {
    planType: SALES_PLAN_TYPE.revenue,
    unit: 'money',
    factSource: 'metrics',
    // Ikki manba, kesishmaydi: `sales_revenue` = posted `Demand` (hujjat
    // sotuvi, `ownerId` bo'yicha), `cash_revenue` = `CashierSession`
    // (kassa, `cashierId` bo'yicha). Chakana chek Demand YARATMAYDI, ya'ni
    // qo'shish ikki karra sanoq bermaydi.
    metricKeys: ['sales_revenue', 'cash_revenue'],
  },
  [SALES_PLAN_TYPE.profit]: {
    planType: SALES_PLAN_TYPE.profit,
    unit: 'money',
    factSource: 'metrics',
    metricKeys: ['gross_profit', 'cash_gross_profit'],
  },
  [SALES_PLAN_TYPE.customerCount]: {
    planType: SALES_PLAN_TYPE.customerCount,
    unit: 'count',
    // Katalogda «yangi mijoz soni» ko'rsatkichi YO'Q. Uni bu yerda
    // Counterparty jadvalidan hisoblash `report/metrics` dan tashqarida
    // IKKINCHI formula bo'lardi — taqiqlangan (X4 hodisasi).
    factSource: 'none',
    metricKeys: [],
  },
  [SALES_PLAN_TYPE.collectedDebt]: {
    planType: SALES_PLAN_TYPE.collectedDebt,
    unit: 'money',
    // MK16 undirish ro'yxati bor, lekin «shu xodim qancha undirdi» KPI
    // ko'rsatkichi katalogda yo'q. Qo'shilishi = katalog + kunlik dvigatel
    // ishi (alohida faza), reja esa hozirdan qo'yilaveradi.
    factSource: 'none',
    metricKeys: [],
  },
};

export function isSalesPlanType(value: string): value is SalesPlanType {
  return Object.hasOwn(SALES_PLAN_TYPES, value);
}

export function salesPlanTypeDef(planType: SalesPlanType): SalesPlanTypeDef {
  return SALES_PLAN_TYPES[planType];
}

/** Pul turimi — valyuta MAJBURIYLIGI va ekran formatlashi shundan. */
export function isMoneyPlanType(planType: SalesPlanType): boolean {
  return SALES_PLAN_TYPES[planType].unit === 'money';
}

/** Barcha turlar, barqaror tartibda (ekran ustunlari shu tartibda chiziladi). */
export const SALES_PLAN_TYPE_ORDER: readonly SalesPlanType[] = [
  SALES_PLAN_TYPE.revenue,
  SALES_PLAN_TYPE.profit,
  SALES_PLAN_TYPE.customerCount,
  SALES_PLAN_TYPE.collectedDebt,
];
