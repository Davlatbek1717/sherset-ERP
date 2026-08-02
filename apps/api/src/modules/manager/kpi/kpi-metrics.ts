/**
 * Kunlik xodim KPI — ko'rsatkich katalogi (menejer TZ kengaytmasi §2.1).
 *
 * NEGA KATALOG, NEGA YOPIQ USTUNLAR EMAS: mavjud `HrKpiDailyLog` uchta qat'iy
 * ustundan iborat (`personalSalesMinor`, `targetMinor`, `achievementPercent`).
 * Har yangi ko'rsatkich — migratsiya. Bu yerda ko'rsatkich **kalit** bilan
 * ta'riflanadi: yangi o'lchov qo'shish uchun katalogga bitta qator yetadi.
 *
 * Modul SOF — DB ham, soat ham yo'q. Sabab: «bu ko'rsatkich yaxshimi yomonmi»,
 * «soatga qanday bo'linadi», «ma'lumot to'liqmi» degan qarorlar aynan shu
 * turdagi qoidalar — ular servis ichida ko'milib qolsa, testlab bo'lmaydi va
 * asta-sekin ikki joyda ikki xil bo'lib ketadi (1.4 dagi foiz hodisasi).
 */

/** O'lchov birligi — ekran raqamni qanday ko'rsatishini shu hal qiladi. */
export type MetricUnit = 'money' | 'count' | 'percent' | 'minutes';

/**
 * Yo'nalish: qaysi tomon yaxshi. Reyting, rang va «og'ish» belgisi shundan
 * kelib chiqadi — ekran o'zi taxmin qilmaydi.
 */
export type MetricDirection = 'higher_better' | 'lower_better' | 'neutral';

/** Ko'rsatkich qaysi moduldan hisoblanadi — drill-down shu manbaga boradi. */
export type MetricSource = 'cashier' | 'sales' | 'attendance' | 'task' | 'warehouse';

export interface KpiMetricDef {
  key: string;
  labelUz: string;
  labelRu: string;
  unit: MetricUnit;
  direction: MetricDirection;
  source: MetricSource;
  /**
   * Soatga normallashtirilsinmi (§2.5). Yarim kun ishlagan kassirni to'liq kun
   * ishlagan bilan solishtirish adolatsiz — lekin «kechikish daqiqasi» yoki
   * «kassa farqi» kabi ko'rsatkichlarni soatga bo'lish ma'nosiz.
   */
  perHour: boolean;
}

/**
 * Katalog. FAQAT bugun mavjud manbalardan hisoblanadigan ko'rsatkichlar —
 * kelajakdagi o'lchovlar (masalan yetkazish o'z vaqtida) o'z bosqichida
 * qo'shiladi. «Bo'sh ustun» qo'shib qo'yish yolg'on to'liqlik hissi beradi.
 */
export const KPI_METRICS: readonly KpiMetricDef[] = [
  // ── Kassa (CashierSession + CashierAuditEvent) ────────────────────────────
  {
    key: 'cash_revenue',
    labelUz: 'Kassa tushumi',
    labelRu: 'Выручка кассы',
    unit: 'money',
    direction: 'higher_better',
    source: 'cashier',
    perHour: true,
  },
  {
    key: 'receipt_count',
    labelUz: 'Chek soni',
    labelRu: 'Количество чеков',
    unit: 'count',
    direction: 'higher_better',
    source: 'cashier',
    perHour: true,
  },
  {
    key: 'till_variance_abs',
    labelUz: 'Kassa farqi (modul)',
    labelRu: 'Расхождение кассы (модуль)',
    unit: 'money',
    direction: 'lower_better',
    source: 'cashier',
    // Farqni soatga bo'lish ma'nosiz — u smena yakunidagi bir martalik hodisa.
    perHour: false,
  },
  {
    key: 'discount_given',
    labelUz: 'Berilgan chegirma',
    labelRu: 'Предоставленная скидка',
    unit: 'money',
    direction: 'lower_better',
    source: 'cashier',
    perHour: false,
  },
  {
    key: 'below_cost_count',
    labelUz: 'Zararga sotuv (soni)',
    labelRu: 'Продажи ниже себестоимости (кол-во)',
    unit: 'count',
    direction: 'lower_better',
    source: 'cashier',
    perHour: false,
  },
  {
    key: 'below_cost_loss',
    labelUz: 'Zarar summasi',
    labelRu: 'Сумма убытка',
    unit: 'money',
    direction: 'lower_better',
    source: 'cashier',
    perHour: false,
  },
  {
    key: 'cancel_count',
    labelUz: 'Bekor qilingan chek',
    labelRu: 'Отменённые чеки',
    unit: 'count',
    direction: 'lower_better',
    source: 'cashier',
    perHour: false,
  },
  {
    key: 'refund_count',
    labelUz: 'Qaytarish soni',
    labelRu: 'Количество возвратов',
    unit: 'count',
    direction: 'lower_better',
    source: 'cashier',
    perHour: false,
  },
  {
    key: 'cash_gross_profit',
    labelUz: 'Kassa yalpi foydasi',
    labelRu: 'Валовая прибыль кассы',
    unit: 'money',
    direction: 'higher_better',
    source: 'cashier',
    perHour: true,
  },
  {
    key: 'credit_given',
    labelUz: 'Qarzga berilgan',
    labelRu: 'Продано в долг',
    unit: 'money',
    // Qarzga sotish taqiqlanmagan (kassa TZ Q4), lekin u — xavf; menejer
    // o'sishini ko'rib turishi kerak.
    direction: 'lower_better',
    source: 'cashier',
    perHour: false,
  },

  // ── Sotuv (Demand) ────────────────────────────────────────────────────────
  {
    key: 'sales_revenue',
    labelUz: 'Sotuv tushumi',
    labelRu: 'Выручка продаж',
    unit: 'money',
    direction: 'higher_better',
    source: 'sales',
    perHour: true,
  },
  {
    key: 'gross_profit',
    labelUz: 'Yalpi foyda',
    labelRu: 'Валовая прибыль',
    unit: 'money',
    direction: 'higher_better',
    source: 'sales',
    perHour: true,
  },

  // ── Davomat (HrAttendance) ────────────────────────────────────────────────
  {
    key: 'worked_minutes',
    labelUz: 'Ishlangan vaqt',
    labelRu: 'Отработанное время',
    unit: 'minutes',
    direction: 'higher_better',
    source: 'attendance',
    perHour: false,
  },
  {
    key: 'late_minutes',
    labelUz: 'Kechikish',
    labelRu: 'Опоздание',
    unit: 'minutes',
    direction: 'lower_better',
    source: 'attendance',
    perHour: false,
  },

  // ── Vazifa (Task) ─────────────────────────────────────────────────────────
  {
    key: 'tasks_done',
    labelUz: 'Bajarilgan vazifa',
    labelRu: 'Выполненные задачи',
    unit: 'count',
    direction: 'higher_better',
    source: 'task',
    perHour: false,
  },
  {
    key: 'tasks_overdue',
    labelUz: 'Muddati o`tgan vazifa',
    labelRu: 'Просроченные задачи',
    unit: 'count',
    direction: 'lower_better',
    source: 'task',
    perHour: false,
  },

  // ── Ombor (RestockTaskLine) ───────────────────────────────────────────────
  {
    key: 'picked_lines',
    labelUz: 'Yig`ilgan qator',
    labelRu: 'Собрано строк',
    unit: 'count',
    direction: 'higher_better',
    source: 'warehouse',
    perHour: true,
  },
] as const;

const BY_KEY = new Map(KPI_METRICS.map((m) => [m.key, m]));

export function metricDef(key: string): KpiMetricDef | undefined {
  return BY_KEY.get(key);
}

/**
 * Ko'rsatkich qiymati — pul va sanoq bir turda saqlanadi.
 *
 * `value` **null bo'lishi mumkin va bu 0 EMAS**: «o'lchanmagan» degani.
 * 1.1/1.2 da o'rnatilgan shartnoma KPI'ga ham o'tadi — nolga aylantirilgan
 * noma'lum qiymat hisobotni yolg'onga aylantiradi (tan narxi yig'ilmagan
 * tovar «100% marja» bo'lib ko'ringan hodisa).
 */
export interface MetricValue {
  key: string;
  /** Minor birlik (pul — tiyin; sanoq/daqiqa — butun son). NULL = o'lchanmagan. */
  value: bigint | null;
  /**
   * Qiymat to'liq manbadan hisoblanganmi. `false` — qisman: masalan kunning
   * ba'zi qatorlarida tan narx muzlatilmagan, shuning uchun foyda kam
   * ko'rsatilgan bo'lishi mumkin. Menejer buni EKRANDA ko'radi.
   */
  complete: boolean;
}

export function measured(key: string, value: bigint, complete = true): MetricValue {
  return { key, value, complete };
}

/** «O'lchab bo'lmadi» — 0 dan farqli. */
export function unmeasured(key: string): MetricValue {
  return { key, value: null, complete: false };
}

/**
 * Kun bo'yicha umumiy to'liqlik: bironta ko'rsatkich chala bo'lsa, kun ham
 * chala. Menejer bitta bayroq ko'radi va shu bilimda qabul qiladi.
 */
export function dayIsComplete(values: ReadonlyArray<MetricValue>): boolean {
  return values.every((v) => v.complete);
}

/**
 * Soatga normallashtirish (§2.5) — «kim ko'p sotdi» emas, «kim samaraliroq
 * ishladi» degan savolga javob beradi.
 *
 * `workedMinutes` nol yoki noma'lum bo'lsa **null** qaytadi: ishlamagan odamni
 * soatiga bo'lish mumkin emas, va 0 deb ko'rsatish uni eng yomon xodimga
 * aylantirib qo'yardi.
 */
export function perHourValue(value: bigint | null, workedMinutes: number | null): bigint | null {
  if (value == null || workedMinutes == null || workedMinutes <= 0) return null;
  // Daqiqadan soatga: ×60, keyin yarim-yuqoriga yaxlitlash (BigInt kesib
  // tashlamasin — kichik qiymatlarda bu sezilarli).
  const minutes = BigInt(Math.trunc(workedMinutes));
  const scaled = value * 60n;
  const half = minutes / 2n;
  return scaled >= 0n ? (scaled + half) / minutes : -((-scaled + half) / minutes);
}

/**
 * Ko'rsatkichning o'z tarixiy o'rtachasidan og'ishi, foizda (§3.5).
 *
 * Menejerga mutlaq raqam emas, **og'ish** kerak: «bugun 2 mln sotdi» hech
 * narsa demaydi, «odatdagidan 40% kam» — darhol savol tug'diradi.
 * O'rtacha nol yoki noma'lum bo'lsa null (bo'lish yo'q).
 */
export function deviationPercent(value: bigint | null, average: bigint | null): number | null {
  if (value == null || average == null || average === 0n) return null;
  const diff = (value - average) * 1000n;
  const denom = average < 0n ? -average : average;
  const num = average < 0n ? -diff : diff;
  const half = denom / 2n;
  const rounded = num >= 0n ? (num + half) / denom : (num - half) / denom;
  return Number(rounded) / 10;
}
