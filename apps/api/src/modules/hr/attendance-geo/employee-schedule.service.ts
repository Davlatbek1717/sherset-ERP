import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AttendanceConfigSchema, ScheduleWeekSchema } from './attendance-geo.schema.js';

export interface WeekDay {
  weekday: number; // 0=Sun..6=Sat
  startTime: string;
  endTime: string;
  isDayOff: boolean;
}

const DEFAULT_DAY = { startTime: '09:00', endTime: '18:00', isDayOff: false };

/** Per-employee weekly schedule (get/replace) + attendance config (branch + opt-in). */
@Injectable()
export class HrEmployeeScheduleService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Always returns 7 rows (weekday 0..6), filling defaults for unset days. */
  async getWeek(accountId: string, employeeId: string): Promise<WeekDay[]> {
    const rows = await this.prisma.client.employeeWorkSchedule.findMany({
      where: { accountId, employeeId },
      select: { weekday: true, startTime: true, endTime: true, isDayOff: true },
    });
    const byWd = new Map(rows.map((r) => [r.weekday, r]));
    const out: WeekDay[] = [];
    for (let wd = 0; wd < 7; wd++) {
      const r = byWd.get(wd);
      out.push(r ? { ...r } : { weekday: wd, ...DEFAULT_DAY });
    }
    return out;
  }

  async replaceWeek(
    accountId: string,
    employeeId: string,
    raw: unknown,
  ): Promise<{ count: number }> {
    const input = ScheduleWeekSchema.parse(raw);
    await this.assertEmployee(accountId, employeeId);
    await this.prisma.client.$transaction(async (tx) => {
      await tx.employeeWorkSchedule.deleteMany({ where: { accountId, employeeId } });
      if (input.days.length > 0) {
        await tx.employeeWorkSchedule.createMany({
          data: input.days.map((d) => ({ accountId, employeeId, ...d })),
        });
      }
    });
    return { count: input.days.length };
  }

  async setConfig(accountId: string, employeeId: string, raw: unknown) {
    const input = AttendanceConfigSchema.parse(raw);
    await this.assertEmployee(accountId, employeeId);
    if (input.workLocationId) {
      const loc = await this.prisma.client.hrWorkLocation.findFirst({
        where: { id: input.workLocationId, accountId },
        select: { id: true },
      });
      if (!loc) throw new BadRequestException('Filial topilmadi');
    }
    await this.prisma.client.employee.updateMany({
      where: { id: employeeId, accountId },
      data: { workLocationId: input.workLocationId, attendanceOptIn: input.attendanceOptIn },
    });
    return { workLocationId: input.workLocationId, attendanceOptIn: input.attendanceOptIn };
  }

  private async assertEmployee(accountId: string, employeeId: string) {
    const emp = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { id: true },
    });
    if (!emp) throw new NotFoundException('Xodim topilmadi');
  }
}
