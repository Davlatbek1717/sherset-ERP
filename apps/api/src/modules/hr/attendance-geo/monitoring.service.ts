import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { HR_TZ, tashkentWeekday, toLocalIso } from '../hr-shared/tz.util.js';
import type { DailyMonitoringFilter, MarksFilter } from './monitoring.schema.js';
import {
  type AttendanceState,
  type Presence,
  expandMarks,
  resolveDayRow,
  shiftToSchedule,
} from './monitoring.util.js';
import { SCHEDULE_SELECT, toResolvedSchedule } from './prisma-schedule.util.js';
import { resolveShift } from './resolve-shift.util.js';

const DAY_MS = 24 * 60 * 60 * 1000;

interface EmployeeLite {
  id: string;
  name: string;
  position: string | null;
  department: string | null;
  workLocation: { id: string; name: string } | null;
}
interface DayRecord {
  id: string;
  checkInTime: Date;
  checkOutTime: Date | null;
  lateMinutes: number;
}

export interface MonitoringDailyRow {
  employeeId: string;
  name: string;
  position: string | null;
  department: string | null;
  workLocation: { id: string; name: string } | null;
  schedule: { startTime: string; endTime: string; isDayOff: boolean } | null;
  attendanceState: AttendanceState;
  presence: Presence;
  checkInTime: string | null;
  checkOutTime: string | null;
  lateMinutes: number;
  attendanceId: string | null;
}

/** Xodimlarni kuzatish — live status board + per-employee marks. Read/derive
 *  over HrAttendance; generalises davomat-report.live() to any date. §5.5. */
@Injectable()
export class HrMonitoringService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async daily(accountId: string, filter: DailyMonitoringFilter) {
    const now = new Date();
    const todayLocalDate = formatInTimeZone(now, HR_TZ, 'yyyy-MM-dd');
    const localDate = filter.date ?? todayLocalDate;
    const isToday = localDate === todayLocalDate;
    const dayStart = fromZonedTime(`${localDate}T00:00:00`, HR_TZ);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    // Noon anchor keeps the weekday clear of midnight/DST edges (mirror monthly).
    const weekday = tashkentWeekday(fromZonedTime(`${localDate}T12:00:00`, HR_TZ));

    const employees = await this.prisma.client.employee.findMany({
      where: { accountId, archived: false, attendanceOptIn: true },
      select: {
        id: true,
        name: true,
        position: true,
        department: true,
        workLocation: { select: { id: true, name: true } },
        workSchedules: {
          where: { weekday },
          select: { weekday: true, startTime: true, endTime: true, isDayOff: true },
        },
        // Named HrSchedule is the authoritative shift source (mirror dashboard);
        // the weekday rows above are only the fallback when scheduleId is null.
        schedule: { select: SCHEDULE_SELECT },
      },
      orderBy: { name: 'asc' },
    });

    const records = await this.prisma.client.hrAttendance.findMany({
      where: { accountId, checkInTime: { gte: dayStart, lt: dayEnd } },
      select: {
        id: true,
        employeeId: true,
        checkInTime: true,
        checkOutTime: true,
        lateMinutes: true,
        employee: {
          select: {
            id: true,
            name: true,
            position: true,
            department: true,
            workLocation: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { checkInTime: 'asc' },
    });
    const byEmp = new Map<string, DayRecord[]>();
    const empFromRecord = new Map<string, EmployeeLite>();
    for (const r of records) {
      const list = byEmp.get(r.employeeId);
      const rec: DayRecord = {
        id: r.id,
        checkInTime: r.checkInTime,
        checkOutTime: r.checkOutTime,
        lateMinutes: r.lateMinutes,
      };
      if (list) list.push(rec);
      else byEmp.set(r.employeeId, [rec]);
      if (!empFromRecord.has(r.employeeId)) empFromRecord.set(r.employeeId, r.employee);
    }

    const rows: MonitoringDailyRow[] = [];
    const seen = new Set<string>();
    // Opt-in cohort — resolve the owed shift from the named HrSchedule (or the
    // weekday fallback), same authoritative source as the dashboard.
    for (const emp of employees) {
      seen.add(emp.id);
      const shift = resolveShift({
        date: localDate,
        tz: HR_TZ,
        schedule: emp.schedule ? toResolvedSchedule(emp.schedule) : null,
        weekFallback: emp.workSchedules,
      });
      rows.push(this.buildRow(emp, shiftToSchedule(shift), byEmp.get(emp.id) ?? [], isToday));
    }
    // Record-only employees (admin manually checked in a non-opt-in employee).
    for (const [empId, recs] of byEmp) {
      if (seen.has(empId)) continue;
      const e = empFromRecord.get(empId);
      if (e) rows.push(this.buildRow(e, null, recs, isToday));
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));

    const filtered =
      filter.status === 'all' ? rows : rows.filter((r) => this.matchStatus(r, filter.status));
    return { date: localDate, rows: filtered };
  }

  async marks(accountId: string, employeeId: string, filter: MarksFilter) {
    const emp = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { id: true, name: true, position: true },
    });
    if (!emp) throw new NotFoundException('Xodim topilmadi');

    const fromStart = fromZonedTime(`${filter.from}T00:00:00`, HR_TZ);
    const toStart = fromZonedTime(`${filter.to}T00:00:00`, HR_TZ);
    const toEnd = new Date(toStart.getTime() + DAY_MS);

    const rows = await this.prisma.client.hrAttendance.findMany({
      where: { accountId, employeeId, checkInTime: { gte: fromStart, lt: toEnd } },
      select: {
        id: true,
        checkInTime: true,
        checkOutTime: true,
        lateMinutes: true,
        checkInLat: true,
        checkInLng: true,
        checkInAccuracy: true,
        checkOutLat: true,
        checkOutLng: true,
        autoClosed: true,
      },
      orderBy: { checkInTime: 'asc' },
    });

    const marks = expandMarks(rows).map((m) => ({ ...m, at: toLocalIso(m.at) }));
    return { employee: emp, marks };
  }

  private buildRow(
    emp: EmployeeLite,
    schedule: { startTime: string; endTime: string; isDayOff: boolean } | null,
    recs: DayRecord[],
    isToday: boolean,
  ): MonitoringDailyRow {
    // records arrive ordered by checkInTime asc.
    const arrival = recs[0] ?? null;
    const latest = recs[recs.length - 1] ?? null;
    const { attendanceState, presence } = resolveDayRow({
      schedule,
      arrival: arrival ? { lateMinutes: arrival.lateMinutes } : null,
      latest: latest ? { checkOutTime: latest.checkOutTime } : null,
      isToday,
    });
    return {
      employeeId: emp.id,
      name: emp.name,
      position: emp.position,
      department: emp.department,
      workLocation: emp.workLocation,
      schedule,
      attendanceState,
      presence,
      checkInTime: arrival ? toLocalIso(arrival.checkInTime) : null,
      checkOutTime: latest?.checkOutTime ? toLocalIso(latest.checkOutTime) : null,
      lateMinutes: arrival?.lateMinutes ?? 0,
      attendanceId: arrival?.id ?? null,
    };
  }

  private matchStatus(row: MonitoringDailyRow, status: DailyMonitoringFilter['status']): boolean {
    switch (status) {
      case 'late':
        return row.attendanceState === 'late';
      case 'ontime':
        return row.attendanceState === 'ontime';
      case 'at_work':
        return row.presence === 'at_work';
      case 'absent':
        return row.presence === 'absent';
      default:
        return true;
    }
  }
}
