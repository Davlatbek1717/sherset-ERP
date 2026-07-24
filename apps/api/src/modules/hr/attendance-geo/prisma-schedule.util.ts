import type { ResolvedScheduleInput } from './resolve-shift.util.js';

/** A Prisma HrSchedule (+days) row as selected for resolveShift. */
export interface PrismaScheduleShape {
  type: string;
  startDate: Date;
  cycleDays: number;
  calcOvertime: boolean;
  extendedWorkMin: number;
  days: {
    dayIndex: number;
    isWorkday: boolean;
    startTime: string | null;
    endTime: string | null;
    breakStart: string | null;
    breakEnd: string | null;
  }[];
}

/** Prisma select shape reused by both dashboard and check-in schedule lookups. */
export const SCHEDULE_SELECT = {
  type: true,
  startDate: true,
  cycleDays: true,
  calcOvertime: true,
  extendedWorkMin: true,
  days: {
    select: {
      dayIndex: true,
      isWorkday: true,
      startTime: true,
      endTime: true,
      breakStart: true,
      breakEnd: true,
    },
  },
} as const;

/** Map a Prisma HrSchedule (+days) to the pure resolveShift input shape. */
export function toResolvedSchedule(s: PrismaScheduleShape): ResolvedScheduleInput {
  return {
    type: s.type === 'free' ? 'free' : 'flexible',
    startDate: s.startDate.toISOString().slice(0, 10),
    cycleDays: s.cycleDays,
    calcOvertime: s.calcOvertime,
    extendedWorkMinutes: s.extendedWorkMin,
    days: s.days.map((d) => ({
      dayIndex: d.dayIndex,
      isWorkday: d.isWorkday,
      startTime: d.startTime,
      endTime: d.endTime,
      breakStart: d.breakStart,
      breakEnd: d.breakEnd,
    })),
  };
}
