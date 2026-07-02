import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { startOfLocalDay } from '../hr-shared/tz.util.js';
import type { CheckInInput, EditAttendanceInput, ReportFilter } from './hr-attendance.schema.js';

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

  /** Create check-in for an employee. Fails if employee already checked in today. */
  async checkIn(accountId: string, input: CheckInInput) {
    const dayStart = startOfLocalDay(new Date());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const existing = await this.prisma.client.hrAttendance.findFirst({
      where: {
        accountId,
        employeeId: input.employeeId,
        checkInTime: { gte: dayStart, lt: dayEnd },
      },
    });
    if (existing) {
      throw new BadRequestException('Bu xodim bugun allaqachon kelishni belgilagan');
    }

    return this.prisma.client.hrAttendance.create({
      data: {
        accountId,
        employeeId: input.employeeId,
        checkInTime: new Date(),
        notes: input.notes ?? undefined,
      },
      include: { employee: { select: { id: true, name: true } } },
    });
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
