import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { tashkentWeekday } from '../hr-shared/tz.util.js';
import type { DaySchedule } from './late-minutes.util.js';

export interface MonthlyRow {
  date: string; // yyyy-MM-dd local
  checkIn: string | null; // HH:mm local
  checkOut: string | null; // HH:mm local
  lateMinutes: number;
  status: 'present' | 'late' | 'absent' | 'dayoff';
}
interface AttendanceLite {
  checkInTime: Date;
  checkOutTime: Date | null;
  lateMinutes: number;
}

export function computeMonthlyAttendance(args: {
  yearMonth: string; // 'yyyy-MM'
  week: (DaySchedule & { weekday: number })[]; // up to 7 entries by weekday
  attendance: AttendanceLite[];
  tz: string;
  todayLocalDate?: string; // 'yyyy-MM-dd' — days after this are omitted (current month)
}): {
  rows: MonthlyRow[];
  presentDays: number;
  lateDays: number;
  absentDays: number;
  dayOffDays: number;
} {
  const { yearMonth, week, attendance, tz, todayLocalDate } = args;
  const byDate = new Map<string, AttendanceLite>();
  for (const a of attendance) {
    const d = formatInTimeZone(a.checkInTime, tz, 'yyyy-MM-dd');
    if (!byDate.has(d)) byDate.set(d, a); // first check-in of the local day
  }
  const scheduleFor = (weekday: number) => week.find((w) => w.weekday === weekday) ?? null;

  const y = Number(yearMonth.slice(0, 4));
  const m = Number(yearMonth.slice(5, 7)); // 1-based month; Date.UTC(y, m, 0) = last day of month m
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const rows: MonthlyRow[] = [];
  let presentDays = 0;
  let lateDays = 0;
  let absentDays = 0;
  let dayOffDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${yearMonth}-${String(day).padStart(2, '0')}`;
    if (todayLocalDate && date > todayLocalDate) break;
    const weekday = tashkentWeekday(fromZonedTime(`${date}T12:00:00`, tz));
    const sched = scheduleFor(weekday);
    const att = byDate.get(date);
    let status: MonthlyRow['status'];
    if (!sched || sched.isDayOff) {
      status = 'dayoff';
      dayOffDays++;
    } else if (att) {
      if (att.lateMinutes > 0) {
        status = 'late';
        lateDays++;
      } else {
        status = 'present';
      }
      presentDays++; // every attended day counts as present; lateDays is the late subset
    } else {
      status = 'absent';
      absentDays++;
    }
    rows.push({
      date,
      checkIn: att ? formatInTimeZone(att.checkInTime, tz, 'HH:mm') : null,
      checkOut: att?.checkOutTime ? formatInTimeZone(att.checkOutTime, tz, 'HH:mm') : null,
      lateMinutes: att?.lateMinutes ?? 0,
      status,
    });
  }
  return { rows, presentDays, lateDays, absentDays, dayOffDays };
}
