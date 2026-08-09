import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';

export interface LateFineInput {
  accountId: string;
  attendanceId: string;
  employeeId: string;
  /** Snapshotted at write time (survives renames — HrBonusFineLog §13.17). */
  employeeName: string;
  lateMinutes: number;
}

/** Prisma unique-constraint violation (P2002) — used for idempotency. */
function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string })?.code === 'P2002';
}

/**
 * Kechikish → jarima ledger (config-gated, idempotent).
 *
 * `HrAttendanceNotifyConfig.lateFineEnabled` yoqilган va kechikish
 * `lateThresholdMin`dan oshgan bo'lsa `HrBonusFineLog` (kind='fine',
 * source='auto_late') yozadi. `@@unique([attendanceId, source])` idempotency
 * kafolati — event qayta chiqsa ham bir check-in'ga bitta avto-jarima.
 */
@Injectable()
export class LateFineService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Konfiguratsiya bo'yicha shu kechikishga TEGISHLI jarima summasi.
   * 0n = jarima bo'lmasligi kerak (o'chirilgan / chegaradan past / summa 0).
   */
  private async targetAmount(accountId: string, lateMinutes: number): Promise<bigint> {
    const cfg = await this.prisma.client.hrAttendanceNotifyConfig.findUnique({
      where: { accountId },
    });
    if (!cfg?.lateFineEnabled) return 0n;
    if (lateMinutes <= cfg.lateThresholdMin) return 0n;
    const amount = cfg.lateFinePerMinute
      ? cfg.lateFineAmountMinor * BigInt(lateMinutes)
      : cfg.lateFineAmountMinor;
    return amount > 0n ? amount : 0n;
  }

  private static reason(lateMinutes: number): string {
    return `Kechikish ${lateMinutes} daqiqa`;
  }

  /** Applies the fine if configured + late; returns the fine amount (0n if none). */
  async applyIfLate(i: LateFineInput): Promise<bigint> {
    const amount = await this.targetAmount(i.accountId, i.lateMinutes);
    if (amount === 0n) return 0n;

    try {
      await this.prisma.client.hrBonusFineLog.create({
        data: {
          accountId: i.accountId,
          employeeId: i.employeeId,
          employeeName: i.employeeName,
          kind: 'fine',
          source: 'auto_late',
          amountMinor: amount,
          reason: LateFineService.reason(i.lateMinutes),
          attendanceId: i.attendanceId,
        },
      });
    } catch (e) {
      // Idempotent: a re-emitted event hits the (attendanceId, source) unique
      // index — the fine is already applied, so return its amount, not throw.
      if (isUniqueViolation(e)) return amount;
      throw e;
    }
    return amount;
  }

  /**
   * HR-3 — davomat qatori TUZATILGANDAN keyin avto-jarimani qayta moslash.
   *
   * `applyIfLate` faqat `create` qiladi: unikal `(attendanceId, source)`
   * indeksi tufayli u qayta chaqirilganda ESKI summani o'zgarishsiz qoldiradi.
   * Admin `checkInTime`ni to'g'rilaganda (xodim aslida kechikmagan yoki
   * boshqacha kechikkan) jarima davomat bilan uzilib qolardi va oylikdan
   * noto'g'ri pul ushlanardi.
   *
   * Bu metod reconsile qiladi: kerakli summa 0 bo'lsa qatorni **storno**
   * qiladi (o'chiradi), aks holda **upsert** bilan summa+sababni yangilaydi.
   * Faqat `auto_late` qatoriga tegadi — qo'lda kiritilgan jarima tegilmaydi.
   */
  async syncForAttendance(i: LateFineInput): Promise<bigint> {
    const amount = await this.targetAmount(i.accountId, i.lateMinutes);

    if (amount === 0n) {
      // `deleteMany` — qator bo'lmasa ham xato bermaydi (idempotent storno).
      await this.prisma.client.hrBonusFineLog.deleteMany({
        where: { attendanceId: i.attendanceId, source: 'auto_late' },
      });
      return 0n;
    }

    await this.prisma.client.hrBonusFineLog.upsert({
      where: {
        uq_bonusfine_attendance_source: { attendanceId: i.attendanceId, source: 'auto_late' },
      },
      create: {
        accountId: i.accountId,
        employeeId: i.employeeId,
        employeeName: i.employeeName,
        kind: 'fine',
        source: 'auto_late',
        amountMinor: amount,
        reason: LateFineService.reason(i.lateMinutes),
        attendanceId: i.attendanceId,
      },
      update: {
        amountMinor: amount,
        reason: LateFineService.reason(i.lateMinutes),
      },
    });
    return amount;
  }
}
