import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { formatInTimeZone } from 'date-fns-tz';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { SCHEDULE_SELECT, toResolvedSchedule } from '../attendance-geo/prisma-schedule.util.js';
import { lateMinutesForShift, resolveShift } from '../attendance-geo/resolve-shift.util.js';
import { HR_TZ, startOfLocalDay } from '../hr-shared/tz.util.js';
import type {
  CheckInInput,
  EditAttendanceInput,
  ManualCheckOutInput,
  ReportFilter,
} from './hr-attendance.schema.js';

@Injectable()
export class HrAttendanceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Today's attendance records (one per employee). */
  async listToday(accountId: string, date?: Date) {
    const dayStart = startOfLocalDay(date ?? new Date());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    return this.prisma.client.hrAttendance.findMany({
      where: {
        accountId,
        checkInTime: { gte: dayStart, lt: dayEnd },
      },
      include: { employee: { select: { id: true, name: true, hrRoles: true } } },
      orderBy: { checkInTime: 'asc' },
    });
  }

  /** Period report — multiple days for one or all employees. */
  async report(accountId: string, filter: ReportFilter) {
    const dayStart = startOfLocalDay(filter.dateFrom);
    const endStart = startOfLocalDay(filter.dateTo);
    const dayEnd = new Date(endStart.getTime() + 24 * 60 * 60 * 1000);
    return this.prisma.client.hrAttendance.findMany({
      where: {
        accountId,
        checkInTime: { gte: dayStart, lt: dayEnd },
        ...(filter.employeeId && { employeeId: filter.employeeId }),
      },
      include: { employee: { select: { id: true, name: true } } },
      orderBy: [{ checkInTime: 'asc' }, { employee: { name: 'asc' } }],
    });
  }

  /**
   * Create a check-in for an employee. Optional `at` (default now) and
   * `workLocationId`; marks source='manual' and computes lateMinutes from the
   * employee's resolved shift (fixing the old path that left it 0). Fails if a
   * record already exists on `at`'s local day.
   */
  async checkIn(accountId: string, input: CheckInInput) {
    const at = input.at ?? new Date();
    const dayStart = startOfLocalDay(at);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    // Soft UX guard against an accidental double manual check-in on `at`'s day.
    // Deliberately NOT a DB unique constraint: the auto-GPS path legitimately
    // creates several rows/day (step-out + return), which aggregateEmployeeDay
    // folds correctly — so a rare concurrent double-submit just yields two rows
    // the dashboard still sums, not a data-integrity break.
    const existing = await this.prisma.client.hrAttendance.findFirst({
      where: {
        accountId,
        employeeId: input.employeeId,
        checkInTime: { gte: dayStart, lt: dayEnd },
      },
    });
    if (existing) {
      throw new BadRequestException('Bu xodim bu kunda allaqachon kelishni belgilagan');
    }

    // Resolve the owed shift so a manual check-in still records lateMinutes.
    const emp = await this.prisma.client.employee.findFirst({
      where: { id: input.employeeId, accountId },
      select: {
        schedule: { select: SCHEDULE_SELECT },
        workSchedules: {
          select: { weekday: true, startTime: true, endTime: true, isDayOff: true },
        },
      },
    });
    if (!emp) throw new NotFoundException('Xodim topilmadi');
    const localDate = formatInTimeZone(at, HR_TZ, 'yyyy-MM-dd');
    const shift = resolveShift({
      date: localDate,
      tz: HR_TZ,
      schedule: emp.schedule ? toResolvedSchedule(emp.schedule) : null,
      weekFallback: emp.workSchedules,
    });
    const lateMinutes = lateMinutesForShift(at, shift, HR_TZ);

    return this.prisma.client.hrAttendance.create({
      data: {
        accountId,
        employeeId: input.employeeId,
        checkInTime: at,
        source: 'manual',
        lateMinutes,
        workLocationId: input.workLocationId ?? undefined,
        notes: input.notes ?? undefined,
      },
      include: { employee: { select: { id: true, name: true } } },
    });
  }

  /**
   * Manual check-out by employee (the dashboard modal picks an employee, not a
   * row id). Atomically closes the open record on `at`'s day; races are guarded
   * by the `checkOutTime: null` filter (mirror ping-ingest). 400 if none open.
   */
  async checkOutByEmployee(accountId: string, input: ManualCheckOutInput) {
    const at = input.at ?? new Date();
    const dayStart = startOfLocalDay(at);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const open = await this.prisma.client.hrAttendance.findFirst({
      where: {
        accountId,
        employeeId: input.employeeId,
        checkInTime: { gte: dayStart, lt: dayEnd },
        checkOutTime: null,
      },
      orderBy: { checkInTime: 'desc' },
    });
    if (!open) throw new BadRequestException('Ochiq davomat yozuvi topilmadi');
    if (at < open.checkInTime) {
      throw new BadRequestException("Ketish vaqti kelishdan oldin bo'la olmaydi");
    }
    const res = await this.prisma.client.hrAttendance.updateMany({
      where: { id: open.id, checkOutTime: null },
      data: { checkOutTime: at, ...(input.notes !== undefined ? { notes: input.notes } : {}) },
    });
    if (res.count === 0) throw new BadRequestException('Ochiq davomat yozuvi topilmadi');
    return { ok: true };
  }

  /** Mark check-out on an existing attendance row. */
  async checkOut(accountId: string, id: string) {
    const row = await this.prisma.client.hrAttendance.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException('Davomat yozuvi topilmadi');
    if (row.checkOutTime) {
      throw new BadRequestException('Allaqachon ketish belgilangan');
    }
    return this.prisma.client.hrAttendance.update({
      where: { id },
      data: { checkOutTime: new Date() },
      include: { employee: { select: { id: true, name: true } } },
    });
  }

  /** Edit attendance (admin only — controller-level guard). */
  async edit(accountId: string, id: string, editorId: string, input: EditAttendanceInput) {
    const row = await this.prisma.client.hrAttendance.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException('Davomat yozuvi topilmadi');

    const data: Record<string, unknown> = {
      editedById: editorId,
      editedAt: new Date(),
    };
    if (input.checkInTime !== undefined) data.checkInTime = input.checkInTime;
    if (input.clearCheckOut) {
      data.checkOutTime = null;
    } else if (input.checkOutTime !== undefined) {
      data.checkOutTime = input.checkOutTime;
    }
    if (input.notes !== undefined) data.notes = input.notes;

    // Validation: checkOut must be after checkIn
    const finalCheckIn = (data.checkInTime as Date | undefined) ?? row.checkInTime;
    const finalCheckOut = data.checkOutTime as Date | null | undefined;
    if (finalCheckOut && finalCheckOut < finalCheckIn) {
      throw new BadRequestException("Ketish vaqti kelishdan oldin bo'la olmaydi");
    }

    return this.prisma.client.hrAttendance.update({
      where: { id },
      data,
      include: { employee: { select: { id: true, name: true } } },
    });
  }

  async delete(accountId: string, id: string) {
    const row = await this.prisma.client.hrAttendance.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException('Davomat yozuvi topilmadi');
    await this.prisma.client.hrAttendance.delete({ where: { id } });
    return { ok: true };
  }
}
