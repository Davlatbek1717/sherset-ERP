import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { HR_TZ, startOfLocalDay, tashkentWeekday } from '../hr-shared/tz.util.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Nightly auto-checkout. At 23:50 Asia/Tashkent (after the 23:30 KPI snapshot),
 * closes any still-open attendance record at that employee's scheduled end time
 * (min(scheduleEnd, now)), flagging autoClosed=true. This is the backstop for
 * the browser-GPS limitation: if the PWA was closed before KETDI was detected,
 * the departure is imputed from the schedule and HR can correct it manually.
 */
@Injectable()
export class HrDavomatAutoCheckoutCron {
  private readonly logger = new Logger(HrDavomatAutoCheckoutCron.name);
  private static readonly MAX_PER_TICK = 1000;
  private running = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Cron('50 23 * * *', { timeZone: HR_TZ })
  async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Auto-checkout skipped: previous run still in flight');
      return;
    }
    this.running = true;
    try {
      await this.runOnce();
    } catch (e) {
      this.logger.error(`Auto-checkout failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Exposed for tests. `now` injectable for determinism. */
  async runOnce(now: Date = new Date()): Promise<{ closed: number }> {
    const dayStart = startOfLocalDay(now);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);

    const open = await this.prisma.client.hrAttendance.findMany({
      where: { checkOutTime: null, checkInTime: { gte: dayStart, lt: dayEnd } },
      select: { id: true, employeeId: true, checkInTime: true },
      take: HrDavomatAutoCheckoutCron.MAX_PER_TICK,
    });

    let closed = 0;
    for (const rec of open) {
      const weekday = tashkentWeekday(rec.checkInTime);
      const sched = await this.prisma.client.employeeWorkSchedule.findUnique({
        where: { employeeId_weekday: { employeeId: rec.employeeId, weekday } },
        select: { endTime: true, isDayOff: true },
      });
      const localDate = formatInTimeZone(rec.checkInTime, HR_TZ, 'yyyy-MM-dd');
      let checkOut = now;
      if (sched && !sched.isDayOff) {
        const endUtc = fromZonedTime(`${localDate}T${sched.endTime}:00`, HR_TZ);
        checkOut = endUtc < now ? endUtc : now;
      }
      const upd = await this.prisma.client.hrAttendance.updateMany({
        where: { id: rec.id, checkOutTime: null },
        data: { checkOutTime: checkOut, autoClosed: true },
      });
      if (upd.count > 0) closed++;
    }

    if (closed > 0) this.logger.log(`Davomat auto-closed ${closed} open record(s)`);
    return { closed };
  }
}
