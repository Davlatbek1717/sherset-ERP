import type { Prisma } from '@moysklad/db';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { CommissionReportFilterSchema } from './commission-report.schema.js';

/**
 * CommissionReport read service. moysklad-parity Отчёт комиссионера
 * list + detail. Sprint 7 ships read-only — create / post / cancel
 * lands when we wire the consignment FSM properly.
 *
 * The `paid` quick-filter doesn't fit the draft/posted state well
 * (a posted row may still be unpaid), so it's a separate parameter
 * that compares payedSumMinor >= sumMinor at the SQL level.
 */
@Injectable()
export class CommissionReportService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Shared WHERE builder for the Out-side list + footer aggregate. Extracted
   * (mirrors invoice-out.service) so `listOut` and `aggregateTotalsOut` can't
   * drift on the filter set — CLAUDE.md «no two-place drift». The «Оплата»
   * clause uses a Prisma field reference (cross-column payed vs sum compare).
   */
  private buildListWhereOut(
    accountId: string,
    filter: ReturnType<typeof CommissionReportFilterSchema.parse>,
  ): Prisma.CommissionReportOutWhereInput {
    return {
      accountId,
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.agentId ? { agentId: filter.agentId } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.contractId ? { contractId: filter.contractId } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.printed !== undefined ? { printed: filter.printed } : {}),
      ...(filter.published !== undefined ? { published: filter.published } : {}),
      ...(filter.currency ? { currency: filter.currency } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
              { agent: { name: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(filter.momentFrom || filter.momentTo
        ? {
            moment: tashkentRangeBounds(filter.momentFrom, filter.momentTo),
          }
        : {}),
      ...(filter.sumMinorFrom !== undefined || filter.sumMinorTo !== undefined
        ? {
            sumMinor: {
              ...(filter.sumMinorFrom !== undefined ? { gte: BigInt(filter.sumMinorFrom) } : {}),
              ...(filter.sumMinorTo !== undefined ? { lte: BigInt(filter.sumMinorTo) } : {}),
            },
          }
        : {}),
      ...(filter.rewardSumMinorFrom !== undefined || filter.rewardSumMinorTo !== undefined
        ? {
            rewardSumMinor: {
              ...(filter.rewardSumMinorFrom !== undefined
                ? { gte: BigInt(filter.rewardSumMinorFrom) }
                : {}),
              ...(filter.rewardSumMinorTo !== undefined
                ? { lte: BigInt(filter.rewardSumMinorTo) }
                : {}),
            },
          }
        : {}),
      // Paid-status quick filter — Prisma doesn't support cross-column
      // compares in object syntax, so we use a field reference. Field
      // ref under `gte` means «payedSumMinor >= sumMinor (column)».
      ...(filter.paid !== undefined
        ? filter.paid
          ? { payedSumMinor: { gte: this.prisma.client.commissionReportOut.fields.sumMinor } }
          : { payedSumMinor: { lt: this.prisma.client.commissionReportOut.fields.sumMinor } }
        : {}),
    };
  }

  async listOut(accountId: string, raw: unknown) {
    const filter = CommissionReportFilterSchema.parse(raw);
    const where = this.buildListWhereOut(accountId, filter);

    const rows = await this.prisma.client.commissionReportOut.findMany({
      where,
      // 'agent' is a relation → nested orderBy (mirrors cash-in.service); all
      // other enum values are scalars handled generically (1:1 plan §1.6).
      orderBy:
        filter.sortBy === 'agent'
          ? { agent: { name: filter.sortDir } }
          : { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        agent: { select: { id: true, name: true, legalTitle: true } },
        organization: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        contract: { select: { id: true, name: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.commissionReportOut.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * moysklad list footer «Итого» — sums the ENTIRE filtered set (all pages), not
   * just the current page (the page-summed footer under-counted past row 100).
   * Mirrors invoice-out. `currencies` lets the UI show «—» on a mixed-currency set.
   */
  async aggregateTotalsOut(accountId: string, raw: unknown) {
    const filter = CommissionReportFilterSchema.parse(raw);
    const where = this.buildListWhereOut(accountId, filter);
    const [agg, currencyGroups] = await Promise.all([
      this.prisma.client.commissionReportOut.aggregate({
        where,
        _count: true,
        _sum: {
          sumMinor: true,
          vatSumMinor: true,
          rewardSumMinor: true,
          payedSumMinor: true,
        },
      }),
      this.prisma.client.commissionReportOut.groupBy({ by: ['currency'], where }),
    ]);
    const toStr = (v: bigint | null) => (v ?? 0n).toString();
    return {
      count: agg._count,
      sumMinor: toStr(agg._sum.sumMinor),
      vatSumMinor: toStr(agg._sum.vatSumMinor),
      rewardSumMinor: toStr(agg._sum.rewardSumMinor),
      payedSumMinor: toStr(agg._sum.payedSumMinor),
      currencies: currencyGroups.map((g) => g.currency),
    };
  }

  async findByIdOut(accountId: string, id: string) {
    const row = await this.prisma.client.commissionReportOut.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        owner: { select: { id: true, name: true, email: true } },
        contract: true,
      },
    });
    if (!row) throw new NotFoundException(`CommissionReportOut ${id} not found`);
    return row;
  }

  async listIn(accountId: string, raw: unknown) {
    const filter = CommissionReportFilterSchema.parse(raw);
    const where: Prisma.CommissionReportInWhereInput = {
      accountId,
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.agentId ? { agentId: filter.agentId } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.contractId ? { contractId: filter.contractId } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.printed !== undefined ? { printed: filter.printed } : {}),
      ...(filter.published !== undefined ? { published: filter.published } : {}),
      ...(filter.currency ? { currency: filter.currency } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
              { agent: { name: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(filter.momentFrom || filter.momentTo
        ? {
            moment: tashkentRangeBounds(filter.momentFrom, filter.momentTo),
          }
        : {}),
      ...(filter.sumMinorFrom !== undefined || filter.sumMinorTo !== undefined
        ? {
            sumMinor: {
              ...(filter.sumMinorFrom !== undefined ? { gte: BigInt(filter.sumMinorFrom) } : {}),
              ...(filter.sumMinorTo !== undefined ? { lte: BigInt(filter.sumMinorTo) } : {}),
            },
          }
        : {}),
      ...(filter.paid !== undefined
        ? filter.paid
          ? { payedSumMinor: { gte: this.prisma.client.commissionReportIn.fields.sumMinor } }
          : { payedSumMinor: { lt: this.prisma.client.commissionReportIn.fields.sumMinor } }
        : {}),
    };

    const rows = await this.prisma.client.commissionReportIn.findMany({
      where,
      // 'agent' is a relation → nested orderBy (mirrors cash-in.service); all
      // other enum values are scalars handled generically (1:1 plan §1.6).
      orderBy:
        filter.sortBy === 'agent'
          ? { agent: { name: filter.sortDir } }
          : { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        agent: { select: { id: true, name: true, legalTitle: true } },
        organization: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        contract: { select: { id: true, name: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.commissionReportIn.count({ where });
    return { items, nextCursor, total };
  }

  async findByIdIn(accountId: string, id: string) {
    const row = await this.prisma.client.commissionReportIn.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        owner: { select: { id: true, name: true, email: true } },
        contract: true,
      },
    });
    if (!row) throw new NotFoundException(`CommissionReportIn ${id} not found`);
    return row;
  }
}
