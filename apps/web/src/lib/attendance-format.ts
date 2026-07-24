/**
 * Attendance duration formatters for the davomat dashboard. Kept i18n-driven
 * (unit suffixes passed in) so no Uzbek/Russian text is hardcoded — the
 * no-hardcoded gate stays green. See spec §5.3.
 */

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Overtime / extra as "02s 01d" (2 soat 01 daqiqa). Suffixes come from i18n
 * (`unit_hour_short` / `unit_minute_short`): uz "s"/"d", ru "ч"/"м".
 */
export function fmtOvertime(minutes: number, units: { h: string; m: string }): string {
  if (!minutes || minutes <= 0) return '--:--';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${pad2(h)}${units.h} ${pad2(m)}${units.m}`;
}

/** Total worked as "HH:MM" (pure numeric, locale-independent). */
export function fmtHhMm(minutes: number): string {
  if (!minutes || minutes <= 0) return '--:--';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${pad2(h)}:${pad2(m)}`;
}
