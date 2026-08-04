import { type DailyKpiState, countsTowardPayroll } from '../../manager/kpi/daily-kpi-fsm.js';

/**
 * Qabul → oylik ko'prigi (menejer TZ §4, bosqich 4M.3).
 *
 * SOF MODUL — Prisma yo'q, soat yo'q. Bu yerda bitta savolga javob beriladi:
 * **oylik hisobiga qaysi kunlar kiradi va qaysilari kirmaydi.**
 *
 * 🔴 M-Q8 BLOKLASH SHU YERDA AMALGA OSHADI. Egasining qarori: qabul
 * qilinmagan kun oylik hisobiga **umuman qo'shilmaydi**. Ya'ni menejer kunni
 * ko'rmaguncha, o'sha kunning sotuvi xodimning KPI'siga aylanmaydi.
 *
 * «Qaysi holat oylikka kiradi» ro'yxati BU YERDA TAKRORLANMAYDI — u
 * `daily-kpi-fsm.countsTowardPayroll()` da, yagona joyda. Aks holda FSM'ga
 * yangi holat qo'shilganda ikki ro'yxat bir-biridan uzoqlashardi va pul
 * jimgina noto'g'ri hisoblanardi.
 *
 * NEGA ESKI `HrKpiDailyLog` EMAS: eski jadvalda qabul tushunchasi umuman
 * yo'q, ustiga uning `date` yorlig'i bir kun orqada (`tz.util.localDateOnly`
 * izohiga qara). Ikkalasini sana bo'yicha bog'lash har kunni siljitib
 * yuborardi. Yangi omborda holat ham, sana ham BIR qatorda turadi — join
 * kerak emas. Bu TZ §9 dagi ko'chish tartibining 2-qadami.
 */

/** Oylikka nomzod bitta kun (yangi ombordan o'qilgan xom ko'rinish). */
export interface PayrollDayInput {
  readonly state: DailyKpiState;
  /**
   * Kunning sotuv tushumi, minor. NULL = O'LCHANMAGAN (0 EMAS) — masalan
   * o'sha kuni xodimda umuman sotuv bo'lmagan yoki manba yozilmagan.
   */
  readonly autoSalesMinor: bigint | null;
  /**
   * Menejer tuzatmasi. NULL = tuzatilmagan. Tuzatma G'OLIB: M-Q3 bo'yicha
   * qabul qilingan kun darhol pulga ta'sir qiladi, ya'ni menejer tuzatgan
   * raqam aynan to'lanadigan raqam bo'lishi kerak.
   */
  readonly adjustSalesMinor: bigint | null;
}

export interface PayrollAcceptanceResult {
  /** Oylikka KIRADIGAN sotuv yig'indisi (faqat qabul qilingan kunlar). */
  readonly totalSalesMinor: bigint;
  /** Oylikka kirgan kunlar soni. */
  readonly acceptedDays: number;
  /**
   * Qabul KUTAYOTGAN kunlar soni (hisoblangan, navbatdagi, rad etilgan,
   * eskirgan, eskalatsiyadagi — hammasi). Oylik hujjatida ko'rsatiladi:
   * buxgalter ko'r-ko'rona to'lamasin (TZ §4.4).
   */
  readonly pendingDays: number;
  /**
   * Bloklangan summa — qabul qilinmagani uchun hisobga KIRMAGAN sotuv.
   * Yashirilmaydi: menejer «nega oylik kam» degan savolga javob topa olishi
   * kerak, aks holda blok sabab-noma'lum kamayish bo'lib ko'rinardi.
   */
  readonly blockedSalesMinor: bigint;
}

/**
 * Kunlarni oylik uchun yig'adi.
 *
 * NULL sotuv (o'lchanmagan) yig'indiga 0 qo'shadi — bu «0 deb hisobladik»
 * emas, «qo'shadigan narsa yo'q» degani; kun soniga esa baribir kiradi,
 * chunki u ko'rilgan va qabul qilingan kun.
 */
export function sumAcceptedSales(days: readonly PayrollDayInput[]): PayrollAcceptanceResult {
  let totalSalesMinor = 0n;
  let blockedSalesMinor = 0n;
  let acceptedDays = 0;
  let pendingDays = 0;

  for (const day of days) {
    const fact = day.adjustSalesMinor ?? day.autoSalesMinor ?? 0n;
    if (countsTowardPayroll(day.state)) {
      totalSalesMinor += fact;
      acceptedDays++;
    } else {
      blockedSalesMinor += fact;
      pendingDays++;
    }
  }

  return { totalSalesMinor, acceptedDays, pendingDays, blockedSalesMinor };
}

/**
 * Oylik to'lovga TAYYORmi. Bitta ham qabul qilinmagan kun qolgan bo'lsa —
 * yo'q. Bu bloklovchi TEKSHIRUV emas, ko'rsatkich: hisob baribir hisoblanadi
 * (qabul qilingan kunlar bo'yicha), lekin hujjatda ogohlantirish chiqadi.
 *
 * Nega bloklovchi emas: menejer kasal bo'lsa oylik hisobi umuman
 * hisoblanmay qolardi va buxgalter hech narsa ko'rmasdi. Eskalatsiya
 * klapani (§1.2) o'sha holatni FSM tomonda hal qiladi.
 */
export function payrollHasUnacceptedDays(result: PayrollAcceptanceResult): boolean {
  return result.pendingDays > 0;
}

/** Sotuv ko'rsatkichining kaliti — yagona joyda (dvigatel katalogi bilan bir xil). */
export const PAYROLL_SALES_METRIC_KEY = 'sales_revenue';
