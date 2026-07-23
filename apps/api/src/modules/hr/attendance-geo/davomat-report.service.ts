import { Inject, Injectable } from '@nestjs/common';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { HR_TZ, startOfLocalDay, tashkentWeekday } from '../hr-shared/tz.util.js';
import type { MonthlyReportFilter } from './attendance-geo.schema.js';
import { type MonthlyRow, computeMonthlyAttendance } from './monthly-report.util.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MonthlyEmployeeReport {
  employeeId: string;
  name: string;
  rows: MonthlyRow[];
  presentDays: number;
  lateDays: number;
  absentDays: number;
  dayOffDays: number;
  lateMinutesTotal: number;
}

/** Monthly attendance report (schedule x attendance) + today's live board. */
@Injectable()
export class HrDavomatReportService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async monthly(
    accountId: string,
    filter: MonthlyReportFilter,
  ): Promise<{ yearMonth: string; employees: MonthlyEmployeeReport[] }> {
    const { yearMonth, employeeId } = filter;
    const y = Number(yearMonth.slice(0, 4));
    const m = Number(yearMonth.slice(5, 7));
    const nextYm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    const monthStart = fromZonedTime(`${yearMonth}-01T00:00:00`, HR_TZ);
    const monthEnd = fromZonedTime(`${nextYm}-01T00:00:00`, HR_TZ);
    const todayLocalDate = formatInTimeZone(new Date(), HR_TZ, 'yyyy-MM-dd');

    const employees = await this.prisma.client.employee.findMany({
      where: {
        accountId,
        archived: false,
        ...(employeeId ? { id: employeeId } : { attendanceOptIn: true }),
      },
      select: {
        id: true,
        name: true,
        workSchedules: {
          select: { weekday: true, startTime: true, endTime: true, isDayOff: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const out: MonthlyEmployeeReport[] = [];
    for (const emp of employees) {
      const attendance = await this.prisma.client.hrAttendance.findMany({
        where: { accountId, employeeId: emp.id, checkInTime: { gte: monthStart, lt: monthEnd } },
        select: { checkInTime: true, checkOutTime: true, lateMinutes: true },
        orderBy: { checkInTime: 'asc' },
      });
      const agg = computeMonthlyAttendance({
        yearMonth,
        week: emp.workSchedules,
        attendance,
        tz: HR_TZ,
        todayLocalDate,
      });
      out.push({
        employeeId: emp.id,
        name: emp.name,
        rows: agg.rows,
        presentDays: agg.presentDays,
        lateDays: agg.lateDays,
        absentDays: agg.absentDays,
        dayOffDays: agg.dayOffDays,
        lateMinutesTotal: agg.rows.reduce((a, r) => a + r.lateMinutes, 0),
      });
    }
    return { yearMonth, employees: out };
  }

  /** Today's board: present (with status) + scheduled-but-absent opted-in employees. */
  async live(accountId: string) {
    const now = new Date();
    const dayStart = startOfLocalDay(now);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    const weekday = tashkentWeekday(now);

    const records = await this.prisma.client.hrAttendance.findMany({
      where: { accountId, checkInTime: { gte: dayStart, lt: dayEnd } },
      include: { employee: { select: { id: true, name: true } } },
      orderBy: { checkInTime: 'asc' },
    });
    const presentIds = new Set(records.map((r) => r.employeeId));

    const scheduled = await this.prisma.client.employeeWorkSchedule.findMany({
      where: {
        accountId,
        weekday,
        isDayOff: false,
        employee: { attendanceOptIn: true, archived: false },
      },
      select: { employee: { select: { id: true, name: true } } },
    });
    const absent = scheduled
      .filter((s) => !presentIds.has(s.employee.id))
      .map((s) => ({ employeeId: s.employee.id, name: s.employee.name }));

    return {
      present: records.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        name: r.employee.name,
        checkInTime: r.checkInTime,
        checkOutTime: r.checkOutTime,
        lateMinutes: r.lateMinutes,
        source: r.source,
        autoClosed: r.autoClosed,
        status: r.checkOutTime ? ('left' as const) : ('at_work' as const),
      })),
      absent,
    };
  }
}
