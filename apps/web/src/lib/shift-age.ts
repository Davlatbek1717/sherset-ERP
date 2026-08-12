/**
 * P4 — smena yoshini ekranda ko'rsatish.
 *
 * Raqamni SERVER beradi (`GET /cashier-sessions/current` → `openMinutes`,
 * `stale`), bu modul faqat uni o'qiladigan matnga aylantiradi. Chegara
 * mantig'i bu yerda TAKRORLANMAYDI: u MK13 registrida yashaydi va server
 * qo'llaydi — «ekran o'zi hisoblasa ikki haqiqat bo'ladi» bug-klassi
 * (narx poli hodisasi) shu bilan yopiladi.
 */

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

export interface ShiftAgeParts {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
}

export function splitShiftAge(openMinutes: number): ShiftAgeParts {
  const total = Number.isFinite(openMinutes) ? Math.max(0, Math.floor(openMinutes)) : 0;
  return {
    days: Math.floor(total / MINUTES_PER_DAY),
    hours: Math.floor((total % MINUTES_PER_DAY) / MINUTES_PER_HOUR),
    minutes: total % MINUTES_PER_HOUR,
  };
}

/**
 * Tarjima kalitlari orqali matn. Chaqiruvchi `t` beradi (next-intl), shuning
 * uchun modul o'zi hech qanday tilga bog'lanmaydi va testda sof qoladi.
 *
 * Eng katta ikki birlik — «11 kun 4 soat 37 daqiqa» chek yorlig'iga sig'maydi
 * va qaror uchun hech nima qo'shmaydi.
 */
export function formatShiftAge(
  openMinutes: number,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const { days, hours, minutes } = splitShiftAge(openMinutes);
  if (days > 0) return t('shift_age_days', { d: days, h: hours });
  if (hours > 0) return t('shift_age_hours', { h: hours, m: minutes });
  return t('shift_age_minutes', { m: minutes });
}
