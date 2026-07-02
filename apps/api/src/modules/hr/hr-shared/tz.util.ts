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
