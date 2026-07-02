import type { ScheduleConfig } from '../hr-task-template/hr-task-template.schema.js';

/**
 * Convert HrTaskTemplate.scheduleConfig into a node-cron expression.
 *
 * Weekly (ISO days 1=Mon..7=Sun)  → "M H * * D,D,D"  (cron 0=Sun..6=Sat).
 * Monthly (dayOfMonth 1..31)      → "M H D * *".
 *
 * Examples:
 *   {time:"09:00", mode:"weekly",  days:[1,2,3,4,5]} → "0 9 * * 1,2,3,4,5"
 *   {time:"23:30", mode:"weekly",  days:[7]}         → "30 23 * * 0"     (ISO Sun → cron 0)
 *   {time:"15:00", mode:"monthly", dayOfMonth:15}    → "0 15 15 * *"
 */
export function buildCronExpr(cfg: ScheduleConfig): string {
  const [hStr, mStr] = cfg.time.split(':');
  const hour = Number(hStr);
  const minute = Number(mStr);
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(`Noto'g'ri vaqt formati: ${cfg.time}`);
  }
  if (cfg.mode === 'weekly') {
    if (!cfg.days?.length) throw new Error("weekly rejimi uchun days[] bo'sh bo'lmasligi kerak");
    // ISO 1..7 (Mon..Sun) → cron 1..6,0 (Mon..Sat,Sun)
    const cronDays = [...new Set(cfg.days.map((d) => (d === 7 ? 0 : d)))].sort((a, b) => a - b);
    return `${minute} ${hour} * * ${cronDays.join(',')}`;
  }
  if (cfg.mode === 'monthly') {
    if (cfg.dayOfMonth === undefined || cfg.dayOfMonth === null) {
      throw new Error('monthly rejimi uchun dayOfMonth kerak');
    }
    if (cfg.dayOfMonth < 1 || cfg.dayOfMonth > 31) {
      throw new Error(`dayOfMonth 1-31 oralig'ida bo'lishi kerak: ${cfg.dayOfMonth}`);
    }
    return `${minute} ${hour} ${cfg.dayOfMonth} * *`;
  }
  throw new Error(`Noto'g'ri scheduleConfig.mode: ${(cfg as { mode: string }).mode}`);
}
