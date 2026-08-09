import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { formatInTimeZone } from 'date-fns-tz';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { SCHEDULE_SELECT, toResolvedSchedule } from '../attendance-geo/prisma-schedule.util.js';
import { lateMinutesForShift, resolveShift } from '../attendance-geo/resolve-shift.util.js';
import { LateFineService } from '../hr-attendance-notify/late-fine.service.js';
import { HR_EVENT } from '../hr-shared/hr-events.types.js';
import { HR_TZ, startOfLocalDay } from '../hr-shared/tz.util.js';
import type {
  CheckInInput,
  EditAttendanceInput,
  ManualCheckOutInput,
  ReportFilter,
} from './hr-attendance.schema.js';

@Injectable()
export class HrAttendanceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
    // HR-3: tahrirdan keyin avto-jarimani davomat bilan moslash.
    @Inject(LateFineService) private readonly lateFine: LateFineService,
  ) {}

  /**
   * Xodimning `at` kunidagi SMENASI bo'yicha kechikish daqiqalari.
   * Xodim topilmasa `null` — chaqiruvchi qayta hisobni o'tkazib yuboradi.
   */
  private async recomputeLateMinutes(
    accountId: string,
    employeeId: string,
    at: Date,
  ): Promise<number | null> {
    const emp = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: {
        schedule: { select: SCHEDULE_SELECT },
        workSchedules: {
          select: { weekday: true, startTime: true, endTime: true, isDayOff: true },
        },
      },
    });
    if (!emp) return null;
    const shift = resolveShift({
      date: formatInTimeZone(at, HR_TZ, 'yyyy-MM-dd'),
      tz: HR_TZ,
      schedule: emp.schedule ? toResolvedSchedule(emp.schedule) : null,
      weekFallback: emp.workSchedules,
    });
    return lateMinutesForShift(at, shift, HR_TZ);
  }

  /** Today's attendance records (one per employee). */
  async listToday(accountId: string, date?: Date) {
    const dayStart = startOfLocalDay(date ?? new Date());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    return this.prisma.client.hrAttendance.findMany({
      where: {
        accountId,
        deletedAt: null,
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
        deletedAt: null,
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
        deletedAt: null,
        employeeId: input.employeeId,
        checkInTime: { gte: dayStart, lt: dayEnd },
      },
    });
    if (existing) {
      throw new BadRequestException('Bu xodim bu kunda allaqachon kelishni belgilagan');
    }

    // Resolve the owed shift so a manual check-in still records lateMinutes.
    const lateMinutes = await this.recomputeLateMinutes(accountId, input.employeeId, at);
    if (lateMinutes === null) throw new NotFoundException('Xodim topilmadi');

    const created = await this.prisma.client.hrAttendance.create({
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
    // Out-of-band: notifier applies the fine + sends the director message.
    this.events.emit(HR_EVENT.HR_ATTENDANCE_CHECKED_IN, {
      accountId,
      attendanceId: created.id,
      employeeId: input.employeeId,
      at,
      lateMinutes,
    });
    return created;
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
        deletedAt: null,
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
      where: { id: open.id, checkOutTime: null, deletedAt: null },
      data: { checkOutTime: at, ...(input.notes !== undefined ? { notes: input.notes } : {}) },
    });
    if (res.count === 0) throw new BadRequestException('Ochiq davomat yozuvi topilmadi');
    this.events.emit(HR_EVENT.HR_ATTENDANCE_CHECKED_OUT, {
      accountId,
      attendanceId: open.id,
      employeeId: input.employeeId,
      at,
    });
    return { ok: true };
  }

  /** Mark check-out on an existing attendance row. */
  async checkOut(accountId: string, id: string) {
    const row = await this.prisma.client.hrAttendance.findFirst({
      where: { id, accountId, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Davomat yozuvi topilmadi');
    if (row.checkOutTime) {
      throw new BadRequestException('Allaqachon ketish belgilangan');
    }
    const at = new Date();
    const updated = await this.prisma.client.hrAttendance.update({
      where: { id },
      data: { checkOutTime: at },
      include: { employee: { select: { id: true, name: true } } },
    });
    this.events.emit(HR_EVENT.HR_ATTENDANCE_CHECKED_OUT, {
      accountId,
      attendanceId: id,
      employeeId: row.employeeId,
      at,
    });
    return updated;
  }

  /** Edit attendance (admin only — controller-level guard). */
  async edit(accountId: string, id: string, editorId: string, input: EditAttendanceInput) {
    const row = await this.prisma.client.hrAttendance.findFirst({
      where: { id, accountId, deletedAt: null },
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

    // HR-3 — kelish vaqti tuzatilsa kechikish QAYTA hisoblanadi. Ilgari eski
    // `lateMinutes` qolib ketardi: hisobotda ham, undan kelib chiqqan
    // avto-jarimada ham tuzatish aks etmasdi.
    let recomputedLate: number | null = null;
    if (input.checkInTime !== undefined) {
      recomputedLate = await this.recomputeLateMinutes(accountId, row.employeeId, finalCheckIn);
      if (recomputedLate !== null) data.lateMinutes = recomputedLate;
    }

    const updated = await this.prisma.client.hrAttendance.update({
      where: { id },
      data,
      include: { employee: { select: { id: true, name: true } } },
    });

    // Jarima faqat kechikish HAQIQATAN o'zgarganda moslanadi — aks holda
    // oddiy izoh tahriri ilgari jarimasi bo'lmagan qatorga jarima yozib
    // qo'yishi mumkin edi (konfiguratsiya oradan keyin yoqilgan bo'lsa).
    if (recomputedLate !== null && recomputedLate !== row.lateMinutes) {
      await this.lateFine.syncForAttendance({
        accountId,
        attendanceId: id,
        employeeId: row.employeeId,
        employeeName: updated.employee.name,
        lateMinutes: recomputedLate,
      });
    }

    return updated;
  }

  /**
   * HR-13 (Faza Q7) — SOFT-delete + audit izi + avto-jarima storno.
   *
   * Ilgari bu HARD-delete edi va hech qanday audit yozmasdi: (a) kim qaysi
   * davomatni o'chirganini keyin aniqlab bo'lmasdi, (b)
   * `HrBonusFineLog.attendanceId` xom FK bo'lgani uchun (relation/cascade
   * YO'Q) o'sha check-in'dan kelib chiqqan `auto_late` jarima YETIM qolib
   * oylikdan pul ushlab turaverardi.
   *
   * O'chirish bitta SHARTLI yozuv bilan da'vo qilinadi (`deletedAt: null`) —
   * ikki parallel o'chirish ikki audit qatori/ikki storno yozmaydi.
   */
  async delete(accountId: string, id: string, deletedById?: string) {
    const row = await this.prisma.client.hrAttendance.findFirst({
      where: { id, accountId, deletedAt: null },
      include: { employee: { select: { id: true, name: true } } },
    });
    if (!row) throw new NotFoundException('Davomat yozuvi topilmadi');

    const res = await this.prisma.client.hrAttendance.updateMany({
      where: { id, accountId, deletedAt: null },
      data: { deletedAt: new Date(), deletedById: deletedById ?? null },
    });
    // Poygada yutqazgan chaqiruv — qator allaqachon o'chirilgan.
    if (res.count === 0) throw new NotFoundException('Davomat yozuvi topilmadi');

    await this.lateFine.stornoForAttendance(accountId, id);

    // Qator ko'rinmay ketgani uchun tarkibi audit ichida saqlanadi.
    try {
      await this.prisma.client.auditLog.create({
        data: {
          accountId,
          userId: deletedById ?? null,
          entity: 'HrAttendance',
          entityId: id,
          action: 'delete',
          fieldChanges: {
            employeeId: { before: row.employeeId, after: null },
            employeeName: { before: row.employee.name, after: null },
            checkInTime: { before: row.checkInTime.toISOString(), after: null },
            checkOutTime: { before: row.checkOutTime?.toISOString() ?? null, after: null },
            lateMinutes: { before: row.lateMinutes, after: null },
          },
        },
      });
    } catch {
      // best-effort — o'chirishning o'zi allaqachon muvaffaqiyatli (hr-employee naqshi)
    }

    return { ok: true };
  }
}
