import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { formatInTimeZone } from 'date-fns-tz';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  HR_EVENT,
  type HrAttendanceCheckedInEvent,
  type HrAttendanceCheckedOutEvent,
} from '../hr-shared/hr-events.types.js';
import { HR_TZ, startOfLocalDay } from '../hr-shared/tz.util.js';
import { buildCheckInText, buildCheckOutText } from './attendance-message.util.js';
import { LateFineService } from './late-fine.service.js';

const CHECK_IN_EVENT = 'attendance.check_in';
const CHECK_OUT_EVENT = 'attendance.check_out';

/**
 * Davomat → direktor Telegram bildirishnoma (out-of-band notifier).
 *
 * `HrAdminNotifier` naqshi (spec §11): `@OnEvent({ async, promisify })`, tanasi
 * to'liq `try/catch` — check-in/out oqimi HECH QACHON buzilmaydi (barcha xato
 * `logger.warn` bilan yutiladi). Har event:
 *   1) config o'qi (enabled + notifyCheckIn/Out + directorSlot gate),
 *   2) check-in: avto-jarima qo'lla (idempotent),
 *   3) o'zbekcha xabar tuz,
 *   4) `HrTelegramOutbox`ga self ('me'/Saqlangan xabarlar) qator qo'y (dedup).
 */
@Injectable()
export class HrAttendanceNotifier {
  private readonly logger = new Logger(HrAttendanceNotifier.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LateFineService) private readonly lateFine: LateFineService,
  ) {}

  @OnEvent(HR_EVENT.HR_ATTENDANCE_CHECKED_IN, { async: true, promisify: true })
  async onCheckedIn(evt: HrAttendanceCheckedInEvent): Promise<void> {
    try {
      const cfg = await this.prisma.client.hrAttendanceNotifyConfig.findUnique({
        where: { accountId: evt.accountId },
      });
      if (!cfg?.enabled || !cfg.notifyCheckIn) return;
      if (cfg.directorSlot == null) {
        this.logger.warn(`davomat notify: directorSlot yo'q (acc=${evt.accountId}) — skip`);
        return;
      }
      if (await this.alreadyEnqueued(evt.attendanceId, CHECK_IN_EVENT)) return;

      const emp = await this.loadEmployee(evt.accountId, evt.employeeId);
      const name = emp.name;
      // Auto-fine (idempotent, config-gated) before the message so the fine
      // amount can be shown in the same notification.
      const fineMinor = await this.lateFine.applyIfLate({
        accountId: evt.accountId,
        attendanceId: evt.attendanceId,
        employeeId: evt.employeeId,
        employeeName: name,
        lateMinutes: evt.lateMinutes,
      });

      const messageText = buildCheckInText({
        name,
        timeHHmm: this.fmtTime(evt.at),
        lateMinutes: evt.lateMinutes,
        fineMinor,
        department: emp.department,
        position: emp.position,
      });
      await this.enqueue(evt, cfg.directorSlot, messageText, CHECK_IN_EVENT);
    } catch (e) {
      this.logger.warn(`davomat notify (check-in) failed: ${(e as Error).message}`);
    }
  }

  @OnEvent(HR_EVENT.HR_ATTENDANCE_CHECKED_OUT, { async: true, promisify: true })
  async onCheckedOut(evt: HrAttendanceCheckedOutEvent): Promise<void> {
    try {
      const cfg = await this.prisma.client.hrAttendanceNotifyConfig.findUnique({
        where: { accountId: evt.accountId },
      });
      if (!cfg?.enabled || !cfg.notifyCheckOut) return;
      if (cfg.directorSlot == null) {
        this.logger.warn(`davomat notify: directorSlot yo'q (acc=${evt.accountId}) — skip`);
        return;
      }
      if (await this.alreadyEnqueued(evt.attendanceId, CHECK_OUT_EVENT)) return;

      const emp = await this.loadEmployee(evt.accountId, evt.employeeId);
      const workedLabel = await this.computeWorkedLabel(evt.accountId, evt.employeeId, evt.at);

      const messageText = buildCheckOutText({
        name: emp.name,
        timeHHmm: this.fmtTime(evt.at),
        workedLabel,
      });
      await this.enqueue(evt, cfg.directorSlot, messageText, CHECK_OUT_EVENT);
    } catch (e) {
      this.logger.warn(`davomat notify (check-out) failed: ${(e as Error).message}`);
    }
  }

  // ── helpers ─────────────────────────────────────────────────────────

  /** Employee display fields — FK dept/pos preferred, legacy strings fallback. */
  private async loadEmployee(
    accountId: string,
    employeeId: string,
  ): Promise<{ name: string; department: string | null; position: string | null }> {
    const emp = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: {
        name: true,
        department: true,
        position: true,
        department2: { select: { name: true } },
        position2: { select: { name: true } },
      },
    });
    return {
      name: emp?.name ?? '—',
      department: emp?.department2?.name ?? emp?.department ?? null,
      position: emp?.position2?.name ?? emp?.position ?? null,
    };
  }

  /** Dedup — one outbox row per (attendance, event type). */
  private async alreadyEnqueued(attendanceId: string, sourceEventType: string): Promise<boolean> {
    const existing = await this.prisma.client.hrTelegramOutbox.findFirst({
      where: { sourceDocId: attendanceId, sourceEventType },
      select: { id: true },
    });
    return existing != null;
  }

  private async enqueue(
    evt: { accountId: string; attendanceId: string; employeeId: string },
    directorSlot: number,
    messageText: string,
    sourceEventType: string,
  ): Promise<void> {
    await this.prisma.client.hrTelegramOutbox.create({
      data: {
        accountId: evt.accountId,
        toSelf: true,
        viaSlot: directorSlot,
        toPhone: null,
        messageText,
        status: 'pending',
        sourceEventType,
        sourceDocId: evt.attendanceId,
        employeeId: evt.employeeId,
      },
    });
  }

  /**
   * "Bugun ishlagan" yorlig'i — shu kungi yopilган segmentlar yig'indisi
   * ("Xs Ym"). Ochiq segment yoki 0 daqiqa → yorliq yo'q (null → xabarда
   * tushiriladi). Break-logikasi yo'q (soddalashtirilган — spec ruxsati).
   */
  private async computeWorkedLabel(
    accountId: string,
    employeeId: string,
    at: Date,
  ): Promise<string | null> {
    const dayStart = startOfLocalDay(at);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const rows = await this.prisma.client.hrAttendance.findMany({
      where: {
        accountId,
        employeeId,
        deletedAt: null,
        checkInTime: { gte: dayStart, lt: dayEnd },
      },
      select: { checkInTime: true, checkOutTime: true },
    });
    let minutes = 0;
    for (const r of rows) {
      if (!r.checkOutTime) continue;
      minutes += Math.max(
        0,
        Math.floor((r.checkOutTime.getTime() - r.checkInTime.getTime()) / 60_000),
      );
    }
    if (minutes <= 0) return null;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}s ${m}d` : `${m}d`;
  }

  private fmtTime(at: Date): string {
    try {
      return formatInTimeZone(new Date(at), HR_TZ, 'HH:mm');
    } catch {
      return '—';
    }
  }
}
