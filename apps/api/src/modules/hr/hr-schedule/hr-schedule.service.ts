import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { HrScheduleFilter, HrScheduleInput } from './hr-schedule.schema.js';

/** "yyyy-MM-dd" from a Prisma @db.Date (stored as midnight UTC — no TZ shift). */
function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface ScheduleDayRow {
  dayIndex: number;
  isWorkday: boolean;
  startTime: string | null;
  endTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
}

/**
 * Named work-schedule (Ish jadvali) template CRUD. Flexible (cyclic Kun 1..N)
 * and free (Erkin) types. Nested days are replaced wholesale in a transaction
 * (mirror employee-schedule replaceWeek). Soft-delete blocks while employees
 * are assigned (mirror work-location remove-guard). See spec §5.1.
 */
@Injectable()
export class HrScheduleService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, filter: HrScheduleFilter) {
    const where = {
      accountId,
      archived: filter.archived,
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' as const } } : {}),
    };
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.hrSchedule.findMany({
        where,
        orderBy: { startDate: 'desc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        include: { _count: { select: { employees: true } } },
      }),
      this.prisma.client.hrSchedule.count({ where }),
    ]);
    return {
      rows: rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        startDate: dateOnly(r.startDate),
        cycleDays: r.cycleDays,
        calcOvertime: r.calcOvertime,
        extendedWorkMin: r.extendedWorkMin,
        archived: r.archived,
        assignedCount: r._count.employees,
      })),
      total,
      page: filter.page,
      limit: filter.limit,
    };
  }

  async findOne(accountId: string, id: string) {
    const row = await this.prisma.client.hrSchedule.findFirst({
      where: { id, accountId },
      include: { days: { orderBy: { dayIndex: 'asc' } }, _count: { select: { employees: true } } },
    });
    if (!row) throw new NotFoundException('Jadval topilmadi');
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      startDate: dateOnly(row.startDate),
      cycleDays: row.cycleDays,
      calcOvertime: row.calcOvertime,
      extendedWorkMin: row.extendedWorkMin,
      archived: row.archived,
      assignedCount: row._count.employees,
      days: row.days.map((d) => ({
        dayIndex: d.dayIndex,
        isWorkday: d.isWorkday,
        startTime: d.startTime,
        endTime: d.endTime,
        breakStart: d.breakStart,
        breakEnd: d.breakEnd,
      })),
    };
  }

  async create(accountId: string, input: HrScheduleInput) {
    const { cycleDays, days } = this.normalize(input);
    const created = await this.prisma.client.$transaction(async (tx) => {
      const schedule = await tx.hrSchedule.create({
        data: {
          accountId,
          name: input.name,
          type: input.type,
          startDate: new Date(input.startDate),
          cycleDays,
          calcOvertime: input.calcOvertime,
          extendedWorkMin: input.extendedWorkMin,
        },
      });
      if (days.length > 0) {
        await tx.hrScheduleDay.createMany({
          data: days.map((d) => ({ accountId, scheduleId: schedule.id, ...d })),
        });
      }
      return schedule;
    });
    return this.findOne(accountId, created.id);
  }

  async update(accountId: string, id: string, input: HrScheduleInput) {
    await this.findOrThrow(accountId, id);
    const { cycleDays, days } = this.normalize(input);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.hrSchedule.update({
        where: { id },
        data: {
          name: input.name,
          type: input.type,
          startDate: new Date(input.startDate),
          cycleDays,
          calcOvertime: input.calcOvertime,
          extendedWorkMin: input.extendedWorkMin,
        },
      });
      await tx.hrScheduleDay.deleteMany({ where: { accountId, scheduleId: id } });
      if (days.length > 0) {
        await tx.hrScheduleDay.createMany({
          data: days.map((d) => ({ accountId, scheduleId: id, ...d })),
        });
      }
    });
    return this.findOne(accountId, id);
  }

  async remove(accountId: string, id: string) {
    const row = await this.findOrThrow(accountId, id);
    const assigned = await this.prisma.client.employee.count({
      where: { accountId, scheduleId: row.id },
    });
    if (assigned > 0) {
      throw new BadRequestException(
        "Jadvalga xodimlar biriktirilgan — avval ularni boshqa jadvalga o'tkazing",
      );
    }
    await this.prisma.client.hrSchedule.update({ where: { id }, data: { archived: true } });
    return { ok: true };
  }

  /** 'free' collapses to a single cycle day with no day rows. */
  private normalize(input: HrScheduleInput): { cycleDays: number; days: ScheduleDayRow[] } {
    if (input.type === 'free') return { cycleDays: 1, days: [] };
    return {
      cycleDays: input.cycleDays,
      days: input.days.map((d) => ({
        dayIndex: d.dayIndex,
        isWorkday: d.isWorkday,
        startTime: d.isWorkday ? d.startTime : null,
        endTime: d.isWorkday ? d.endTime : null,
        breakStart: d.isWorkday ? d.breakStart : null,
        breakEnd: d.isWorkday ? d.breakEnd : null,
      })),
    };
  }

  private async findOrThrow(accountId: string, id: string) {
    const row = await this.prisma.client.hrSchedule.findFirst({ where: { id, accountId } });
    if (!row) throw new NotFoundException('Jadval topilmadi');
    return row;
  }
}
