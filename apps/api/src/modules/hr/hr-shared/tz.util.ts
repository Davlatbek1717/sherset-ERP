import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const HR_TZ = 'Asia/Tashkent';

/**
 * Format a UTC Date as ISO with +05:00 offset.
 * Yangibolim ekvivalenti: `_to_iso(dt)` helper.
 */
export function toLocalIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return formatInTimeZone(d, HR_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/**
 * Parse an ISO string (with or without offset) back to a UTC Date.
 * If no offset/Z suffix, assumes Tashkent +05.
 */
export function parseLocalIso(iso: string): Date {
  if (!/Z|[+-]\d{2}:?\d{2}$/.test(iso)) {
    return fromZonedTime(iso, HR_TZ);
  }
  return new Date(iso);
}

/**
 * Returns the UTC Date representing 00:00 of d's local day in Tashkent.
 * Useful for "today's range" queries (e.g. KPI daily snapshot at 23:30 local).
 */
export function startOfLocalDay(d: Date): Date {
  const localDateStr = formatInTimeZone(d, HR_TZ, 'yyyy-MM-dd');
  return fromZonedTime(`${localDateStr}T00:00:00`, HR_TZ);
}

/**
 * Returns the DATE-only value (midnight UTC) naming d's local Tashkent day.
 *
 * Use this to LABEL a row, not to bound a query — `startOfLocalDay` is the
 * bound. The two differ and mixing them shifts the label by one day: at 23:30
 * Tashkent on Aug 2, `startOfLocalDay` is Aug 1 19:00 UTC, so reading its UTC
 * calendar fields yields "Aug 1" for a row that actually covers Aug 2.
 *
 * OK 2026-08-04: `hr-kpi.service.ts` now uses THIS helper (it used to derive
 * the label the old way and was a day behind). Existing rows were shifted by
 * migration `20260804190000_hr_kpi_daily_date_fix`. The fix waited for 4M.3
 * because payroll read that table; it now reads the acceptance store, so the
 * label no longer touches money.
 */
export function localDateOnly(d: Date): Date {
  return new Date(`${formatInTimeZone(d, HR_TZ, 'yyyy-MM-dd')}T00:00:00.000Z`);
}

/**
 * Local weekday in Tashkent, 0=Sunday … 6=Saturday (JS getDay convention).
 * NOTE (LOCKED): EmployeeWorkSchedule.weekday uses this 0=Sun..6=Sat scheme —
 * do NOT reuse cron-builder.util.ts's ISO 1=Mon..7=Sun mapping here.
 */
export function tashkentWeekday(d: Date): number {
  // ISO 'i': Mon=1 … Sun=7. %7 maps Sun(7)->0, keeps Mon..Sat as 1..6.
  return Number(formatInTimeZone(d, HR_TZ, 'i')) % 7;
}
