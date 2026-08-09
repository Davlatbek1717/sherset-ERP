import { fromZonedTime } from 'date-fns-tz';
import { HR_TZ } from '../hr-shared/tz.util.js';

/**
 * Final salary formula (master spec § 0):
 *
 *   finalSalary = fixComponent + kpiEarned + bonusSum − fineSum + commission
 *
 * Pure BigInt arithmetic — every component is already in tiyin (minor
 * units). No Number coercion anywhere on the money path. fineSum is
 * SUBTRACTED; the result MAY be negative if fines exceed everything else
 * (caller decides whether to floor at 0 — we return the true signed value
 * so the Oylik UI can flag an underwater month).
 */
export interface SalaryComponents {
  /**
   * Eskirgan kunlar tuzatmasining SOF summasi (§3.4) — ixtiyoriy.
   *
   * Ataylab ixtiyoriy: bu komponent 4M.3 da qo'shildi va tuzatmasi yo'q
   * oylarda umuman bo'lmaydi. Majburiy qilinsa har chaqiruvchi `0n` yozishi
   * kerak bo'lardi va o'sha `0n` «tuzatma yo'q» bilan «hisoblanmagan» ni
   * aralashtirardi.
   */
  correctionNetMinor?: bigint;

  fixComponentMinor: bigint;
  kpiEarnedMinor: bigint;
  bonusSumMinor: bigint;
  fineSumMinor: bigint;
  commissionMinor: bigint;
}

export function computeFinalSalaryMinor(c: SalaryComponents): bigint {
  return (
    c.fixComponentMinor +
    c.kpiEarnedMinor +
    c.bonusSumMinor -
    c.fineSumMinor +
    c.commissionMinor +
    // TZ §3.4 — eskirgan kunlarning TUZATUVCHI QATORI. Alohida qo'shiluvchi:
    // to'langan oyning KPI raqami qayta yozilmaydi, farq shu oyda ko'rinadi.
    // Musbat = qo'shimcha to'lov, manfiy = ushlanma. `?? 0n` xavfsiz: tuzatma
    // yo'q oyda komponent umuman bo'lmaydi (eski chaqiruvchilar buzilmaydi).
    (c.correctionNetMinor ?? 0n)
  );
}

/**
 * Extract a per-employee base (fix) salary from Employee.salaryConfig Json.
 * Expected shape `{ baseSalaryMinor: string | number }`. Anything missing
 * or malformed → 0n (employee has no fixed component this month).
 *
 * ⚠️ Oylik dvigateli buni TO'G'RIDAN-TO'G'RI chaqirmaydi — `resolveFixComponentMinor`
 * orqali chaqiradi (HR-1). Bu funksiya faqat JSON-override o'quvchisi bo'lib qoldi.
 */
export function extractBaseSalaryMinor(salaryConfig: unknown): bigint {
  return readBaseSalaryOverride(salaryConfig) ?? 0n;
}

/**
 * salaryConfig JSON'idagi override: `bigint` = aniq belgilangan (0 ham sanaladi),
 * `null` = umuman sozlanmagan (yo'q / buzuq / manfiy) ⇒ chaqiruvchi fallback qiladi.
 */
function readBaseSalaryOverride(salaryConfig: unknown): bigint | null {
  if (typeof salaryConfig !== 'object' || salaryConfig === null) return null;
  const raw = (salaryConfig as { baseSalaryMinor?: unknown }).baseSalaryMinor;
  if (raw === undefined || raw === null) return null;
  try {
    const v = BigInt(raw as string | number);
    // Manfiy = ma'nosiz konfiguratsiya, «sozlanmagan» deb qaraladi (fallback).
    return v < 0n ? null : v;
  } catch {
    return null;
  }
}

/**
 * HR-1 — oylikning FIKS komponenti.
 *
 * Muammo: xodim kartochkasi (`hr-employee.service` create/update) bazaviy
 * oylikni `Employee.salaryMinor` USTUNIGA yozadi, oylik dvigateli esa
 * `Employee.salaryConfig` JSON'idan o'qirdi. JSON'ni hech bir mahsulot yo'li
 * to'ldirmaydi (yagona chaqiruvchi — bir martalik smoke-skript), shuning uchun
 * prod'da `fixComponentMinor` HAR DOIM 0n edi va oylik faqat KPI+komissiyadan
 * iborat bo'lib chiqardi.
 *
 * Qoida: JSON override (agar ATAYLAB berilgan bo'lsa, 0 ham) ustun turadi —
 * shu bilan mavjud smoke/seed ma'lumotlari va kelajakdagi per-oy override
 * imkoniyati saqlanadi; aks holda ustun qiymati olinadi.
 */
export function resolveFixComponentMinor(employee: {
  salaryConfig: unknown;
  salaryMinor: bigint | null;
}): bigint {
  const override = readBaseSalaryOverride(employee.salaryConfig);
  if (override !== null) return override;
  const column = employee.salaryMinor ?? 0n;
  return column < 0n ? 0n : column;
}

function parseYearMonth(yearMonth: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!m) throw new Error(`Noto'g'ri yearMonth format (YYYY-MM): ${yearMonth}`);
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  if (month < 1 || month > 12) throw new Error(`Noto'g'ri oy: ${yearMonth}`);
  return { year, month };
}

/**
 * [start, endExclusive) UTC-yarim-tun chegaralari "YYYY-MM" uchun.
 *
 * Bu — **YORLIQ** chegarasi: faqat `localDateOnly` bilan yozilgan DATE-ustunlar
 * uchun (`EmployeeDailyKpi.date`, `HrKpiDailyLog.date`). U yerda UTC-yarim-tun
 * mahalliy kunning NOMI, instant emas ⇒ bu chegara TO'G'RI.
 *
 * ⚠️ Haqiqiy instant ustunlar (`createdAt`, `checkInTime`, `postedAt`) uchun
 * ISHLATMA — `monthInstantBounds` ni ol (HR-7/8, `tz.util.localDateOnly` izohi).
 */
export function monthBounds(yearMonth: string): { start: Date; endExclusive: Date } {
  const { year, month } = parseYearMonth(yearMonth);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return { start, endExclusive };
}

/**
 * HR-7/8 — «YYYY-MM» oyining HAQIQIY (instant) chegarasi Toshkent bo'yicha.
 *
 * `createdAt`/`postedAt` kabi timestamp ustunlarni oy bo'yicha filtrlashda
 * kerak: Toshkent UTC+05 bo'lgani uchun mahalliy oy UTC yarim tundan 5 soat
 * OLDIN boshlanadi. UTC chegarasi ishlatilsa oyning birinchi kunidagi
 * 00:00–05:00 oralig'ida yozilgan jarima/bonus O'TGAN oyga tushib qolardi
 * (va oyning oxirgi kunining 00:00–05:00 i shu oyga qo'shilib ketardi).
 */
export function monthInstantBounds(
  yearMonth: string,
  tz: string = HR_TZ,
): { start: Date; endExclusive: Date } {
  const { year, month } = parseYearMonth(yearMonth);
  const pad = (n: number) => String(n).padStart(2, '0');
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start: fromZonedTime(`${year}-${pad(month)}-01T00:00:00`, tz),
    endExclusive: fromZonedTime(`${nextYear}-${pad(nextMonth)}-01T00:00:00`, tz),
  };
}
