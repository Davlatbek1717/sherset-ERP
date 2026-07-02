import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type {
  BonusFineAggregateInput,
  BonusFineFilter,
  CreateManualBonusFineInput,
} from './hr-bonus-fine.schema.js';

/**
 * Bonus/fine ledger. The 3 `auto_*` sources are written by the HR task
 * pipeline (P3b/c finalize + deadline cron). This service owns:
 *   • list()        — filtered ledger view
 *   • createManual() — admin hand-entered bonus/fine (source='manual')
 *   • aggregate()    — per-employee Σbonus/Σfine for a period (Oylik tabs)
 *
 * `rule` source rows are written by the rule engine (P5c).
 */
@Injectable()
export class HrBonusFineService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, filter: BonusFineFilter) {
    const where: Record<string, unknown> = { accountId };
    if (filter.employeeId) where.employeeId = filter.employeeId;
    if (filter.kind) where.kind = filter.kind;
    if (filter.source) where.source = filter.source;
    if (filter.dateFrom || filter.dateTo) {
      where.createdAt = {
        ...(filter.dateFrom && { gte: filter.dateFrom }),
        ...(filter.dateTo && { lte: filter.dateTo }),
      };
    }
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.hrBonusFineLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        include: {
          employee: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.client.hrBonusFineLog.count({ where }),
    ]);
    return { rows, total, page: filter.page, limit: filter.limit };
  }

  /** Admin hand-enters a bonus or fine. createdById = the acting admin. */
  async createManual(accountId: string, actingUserId: string, input: CreateManualBonusFineInput) {
    const amount = BigInt(input.amountMinor);
    if (amount <= 0n) {
      throw new BadRequestException("Miqdor musbat bo'lishi kerak");
    }
    // Verify employee belongs to this account.
    const emp = await this.prisma.client.employee.findFirst({
      where: { id: input.employeeId, accountId, archived: false },
      select: { id: true, name: true },
    });
    if (!emp) throw new BadRequestException('Xodim topilmadi');

    return this.prisma.client.hrBonusFineLog.create({
      data: {
        accountId,
        employeeId: input.employeeId,
        employeeName: emp.name, // snapshot (§13.17)
        kind: input.kind,
        source: 'manual',
        amountMinor: amount,
        reason: input.reason ?? null,
        createdById: actingUserId,
      },
    });
  }

  async remove(accountId: string, id: string): Promise<{ ok: true }> {
    // Only manual rows are deletable — auto_* rows are an audit trail tied to
    // task finalize and must not be hand-removed (would desync KPI totals).
    const row = await this.prisma.client.hrBonusFineLog.findFirst({
      where: { id, accountId },
      select: { id: true, source: true },
    });
    if (!row) throw new BadRequestException('Yozuv topilmadi');
    if (row.source !== 'manual') {
      throw new BadRequestException(
        "Faqat qo'lda kiritilgan yozuvlarni o'chirish mumkin (auto yozuvlar audit izi)",
      );
    }
    await this.prisma.client.hrBonusFineLog.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Σbonus, Σfine, net (bonus − fine) for an employee over [dateFrom, dateTo].
   * BigInt arithmetic — never cast amounts to Number. Powers the Oylik final
   * salary tab + per-employee KPI override page.
   */
  async aggregate(accountId: string, input: BonusFineAggregateInput) {
    const rows = await this.prisma.client.hrBonusFineLog.findMany({
      where: {
        accountId,
        employeeId: input.employeeId,
        createdAt: { gte: input.dateFrom, lte: input.dateTo },
      },
      select: { kind: true, amountMinor: true, source: true },
    });

    let bonusMinor = 0n;
    let fineMinor = 0n;
    const bySource: Record<string, bigint> = {};
    for (const r of rows) {
      if (r.kind === 'bonus') bonusMinor += r.amountMinor;
      else fineMinor += r.amountMinor;
      bySource[r.source] = (bySource[r.source] ?? 0n) + r.amountMinor;
    }

    return {
      bonusMinor: bonusMinor.toString(),
      fineMinor: fineMinor.toString(),
      netMinor: (bonusMinor - fineMinor).toString(),
      bySource: Object.fromEntries(Object.entries(bySource).map(([k, v]) => [k, v.toString()])),
      count: rows.length,
    };
  }

  /** Internal BigInt accessor for the salary engine (P5d) — no JSON coercion. */
  async aggregateRaw(
    accountId: string,
    employeeId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<{ bonusMinor: bigint; fineMinor: bigint }> {
    const rows = await this.prisma.client.hrBonusFineLog.findMany({
      where: { accountId, employeeId, createdAt: { gte: dateFrom, lte: dateTo } },
      select: { kind: true, amountMinor: true },
    });
    let bonusMinor = 0n;
    let fineMinor = 0n;
    for (const r of rows) {
      if (r.kind === 'bonus') bonusMinor += r.amountMinor;
      else fineMinor += r.amountMinor;
    }
    return { bonusMinor, fineMinor };
  }
}
