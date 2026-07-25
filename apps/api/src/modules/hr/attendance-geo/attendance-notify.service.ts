import { Inject, Injectable, Logger } from '@nestjs/common';
import { formatInTimeZone } from 'date-fns-tz';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { HR_TZ, startOfLocalDay, tashkentWeekday } from '../hr-shared/tz.util.js';

/**
 * MTProto slot that owns the account's Telegram "Saved Messages" davomat
 * digest lands in — hardcoded per explicit request (2026-07-25). Single
 * fixed recipient (phone +998919258700, the account's own authenticated
 * userbot slot), no settings UI yet; change here if it needs to change.
 */
export const ATTENDANCE_ALERT_VIA_SLOT = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DigestArrivedRow {
  name: string;
  checkInTime: Date;
  lateMinutes: number;
}

export interface DigestAbsentRow {
  name: string;
}

/**
 * One consolidated daily message — replaces the earlier per-event (instant
 * KELDI/KETDI) alerts per explicit request (2026-07-25): "real-vaqt
 * o'chadi, faqat 10:00 hisobot" (real-time off, only the 10:00 report).
 */
export function formatDailyDigestMessage(args: {
  now: Date;
  arrived: DigestArrivedRow[];
  notYetArrived: DigestAbsentRow[];
}): string {
  const dateLabel = formatInTimeZone(args.now, HR_TZ, 'dd-MM-yyyy');
  const lines = [`📋 Davomat hisoboti — ${dateLabel}, soat 10:00`, ''];

  if (args.arrived.length === 0 && args.notYetArrived.length === 0) {
    lines.push("Bugun kuzatiladigan xodim yo'q.");
    return lines.join('\n');
  }

  for (const a of args.arrived) {
    const time = formatInTimeZone(a.checkInTime, HR_TZ, 'HH:mm');
    const lateSuffix = a.lateMinutes > 0 ? ` (${a.lateMinutes} daqiqa kech)` : '';
    lines.push(`🟢 ${a.name} — ${time}${lateSuffix}`);
  }
  for (const m of args.notYetArrived) {
    lines.push(`🔴 ${m.name} — hali kelmadi`);
  }
  return lines.join('\n');
}

/**
 * Builds + enqueues the daily davomat digest (one message per account with
 * opted-in employees) via the existing MTProto self-send outbox. Never
 * throws — a notification failure must never break anything else; each
 * account's digest is isolated so one account's error doesn't block others.
 */
@Injectable()
export class AttendanceNotifyService {
  private readonly logger = new Logger(AttendanceNotifyService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async sendDailyDigest(now: Date = new Date()): Promise<void> {
    const dayStart = startOfLocalDay(now);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    const weekday = tashkentWeekday(now);

    const employees = await this.prisma.client.employee.findMany({
      // archived (soft-deleted) xodimlar hisobotга kirmaydi (main test-parity).
      where: { attendanceOptIn: true, archived: false },
      select: { id: true, accountId: true, name: true },
    });

    const byAccount = new Map<string, typeof employees>();
    for (const emp of employees) {
      const list = byAccount.get(emp.accountId) ?? [];
      list.push(emp);
      byAccount.set(emp.accountId, list);
    }

    for (const [accountId, emps] of byAccount) {
      try {
        const arrived: DigestArrivedRow[] = [];
        const notYetArrived: DigestAbsentRow[] = [];

        for (const emp of emps) {
          const sched = await this.prisma.client.employeeWorkSchedule.findUnique({
            where: { employeeId_weekday: { employeeId: emp.id, weekday } },
            select: { isDayOff: true },
          });
          if (sched?.isDayOff) continue;

          const att = await this.prisma.client.hrAttendance.findFirst({
            where: { employeeId: emp.id, checkInTime: { gte: dayStart, lt: dayEnd } },
            orderBy: { checkInTime: 'asc' },
            select: { checkInTime: true, lateMinutes: true },
          });
          if (att) {
            arrived.push({
              name: emp.name,
              checkInTime: att.checkInTime,
              lateMinutes: att.lateMinutes,
            });
          } else {
            notYetArrived.push({ name: emp.name });
          }
        }

        if (arrived.length === 0 && notYetArrived.length === 0) continue;

        await this.prisma.client.hrTelegramOutbox.create({
          data: {
            accountId,
            toPhone: '',
            toSelf: true,
            viaSlot: ATTENDANCE_ALERT_VIA_SLOT,
            messageText: formatDailyDigestMessage({ now, arrived, notYetArrived }),
            sourceEventType: 'hr.davomat_daily_digest',
            status: 'pending',
          },
        });
      } catch (err) {
        this.logger.warn(
          `Davomat kunlik hisobot (account=${accountId}) navbatga qo'yilmadi: ${(err as Error).message}`,
        );
      }
    }
  }
}
