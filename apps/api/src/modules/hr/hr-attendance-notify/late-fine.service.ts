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

  /** Applies the fine if configured + late; returns the fine amount (0n if none). */
  async applyIfLate(i: LateFineInput): Promise<bigint> {
    const cfg = await this.prisma.client.hrAttendanceNotifyConfig.findUnique({
      where: { accountId: i.accountId },
    });
    if (!cfg?.lateFineEnabled) return 0n;
    if (i.lateMinutes <= cfg.lateThresholdMin) return 0n;

    const amount = cfg.lateFinePerMinute
      ? cfg.lateFineAmountMinor * BigInt(i.lateMinutes)
      : cfg.lateFineAmountMinor;
    if (amount <= 0n) return 0n;

    try {
      await this.prisma.client.hrBonusFineLog.create({
        data: {
          accountId: i.accountId,
          employeeId: i.employeeId,
          employeeName: i.employeeName,
          kind: 'fine',
          source: 'auto_late',
          amountMinor: amount,
          reason: `Kechikish ${i.lateMinutes} daqiqa`,
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
}
