import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export interface DaySchedule {
  startTime: string;
  endTime: string;
  isDayOff: boolean;
}

/** max(0, floor((checkIn - todayScheduleStart)/60000)); grace 0; null/day-off -> 0. */
export function computeLateMinutes(
  checkInUtc: Date,
  schedule: DaySchedule | null,
  tz: string,
): number {
  if (!schedule || schedule.isDayOff) return 0;
  const localDate = formatInTimeZone(checkInUtc, tz, 'yyyy-MM-dd');
  const startUtc = fromZonedTime(`${localDate}T${schedule.startTime}:00`, tz);
  return Math.max(0, Math.floor((checkInUtc.getTime() - startUtc.getTime()) / 60_000));
}
