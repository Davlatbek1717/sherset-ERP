import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { startOfLocalDay, tashkentWeekday } from '../hr-shared/tz.util.js';
import type { DavomatLiveStatus } from './ping-ingest.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DavomatMyToday {
  optIn: boolean;
  workLocation: { id: string; name: string; lat: number; lng: number; radiusMeters: number } | null;
  schedule: { startTime: string; endTime: string; isDayOff: boolean } | null;
  today: {
    checkInTime: Date;
    checkOutTime: Date | null;
    lateMinutes: number;
    source: string;
    autoClosed: boolean;
  } | null;
  status: DavomatLiveStatus;
}

/** Employee-self davomat status (seeds the PWA on open/resume) + opt-in toggle. */
@Injectable()
export class HrDavomatStatusService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async myToday(accountId: string, employeeId: string): Promise<DavomatMyToday> {
    const now = new Date();
    const dayStart = startOfLocalDay(now);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);

    const emp = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: {
        attendanceOptIn: true,
        workLocation: {
          select: { id: true, name: true, lat: true, lng: true, radiusMeters: true },
        },
      },
    });
    const sched = await this.prisma.client.employeeWorkSchedule.findUnique({
      where: { employeeId_weekday: { employeeId, weekday: tashkentWeekday(now) } },
      select: { startTime: true, endTime: true, isDayOff: true },
    });
    const today = await this.prisma.client.hrAttendance.findFirst({
      where: { accountId, employeeId, checkInTime: { gte: dayStart, lt: dayEnd } },
      orderBy: { checkInTime: 'desc' },
      select: {
        checkInTime: true,
        checkOutTime: true,
        lateMinutes: true,
        source: true,
        autoClosed: true,
      },
    });

    const status: DavomatLiveStatus = today
      ? today.checkOutTime
        ? 'left'
        : 'at_work'
      : 'not_arrived';

    return {
      optIn: emp?.attendanceOptIn ?? false,
      workLocation: emp?.workLocation ?? null,
      schedule: sched,
      today,
      status,
    };
  }

  async setOptIn(
    accountId: string,
    employeeId: string,
    optIn: boolean,
  ): Promise<{ optIn: boolean }> {
    await this.prisma.client.employee.updateMany({
      where: { id: employeeId, accountId },
      data: { attendanceOptIn: optIn },
    });
    return { optIn };
  }
}
