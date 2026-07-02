import type { Prisma } from '@moysklad/db';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MoneyOperationFilterSchema } from './money-operation.schema.js';

/**
 * Read-only feed of MoneyOperation rows — the union of CashIn / CashOut /
 * PaymentIn / PaymentOut at the ledger level. Cursor-paginated, sorted
 * by `at DESC, id DESC` for deterministic order across pages.
 */
@Injectable()
export class MoneyOperationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawQuery: Record<string, unknown>) {
    const filter = MoneyOperationFilterSchema.parse(rawQuery);

    const where: Prisma.MoneyOperationWhereInput = { accountId };
    if (filter.documentKind) where.documentKind = filter.documentKind;
    if (filter.organizationAccountId) where.organizationAccountId = filter.organizationAccountId;
    if (filter.cashDeskId) where.cashDeskId = filter.cashDeskId;
    if (filter.counterpartyId) where.counterpartyId = filter.counterpartyId;
    if (filter.currency) where.currency = filter.currency;
    if (filter.flow === 'in') where.deltaMinor = { gt: 0n };
    if (filter.flow === 'out') where.deltaMinor = { lt: 0n };
    if (filter.fromDate || filter.toDate) {
      where.at = {};
      if (filter.fromDate) (where.at as Prisma.DateTimeFilter).gte = new Date(filter.fromDate);
      if (filter.toDate) (where.at as Prisma.DateTimeFilter).lte = new Date(filter.toDate);
    }
    if (filter.search) {
      where.description = { contains: filter.search, mode: 'insensitive' };
    }

    const limit = filter.limit;
    const rows = await this.prisma.client.moneyOperation.findMany({
      where,
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        organizationAccount: {
          select: { id: true, name: true },
        },
        cashDesk: {
          select: { id: true, name: true },
        },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const total = await this.prisma.client.moneyOperation.count({ where });

    // Batch-resolve counterparty names (MoneyOperation has no relation
    // — counterpartyId is just an FK column with the related entity in
    // a separate module). One IN query covers the current page.
    const counterpartyIds = Array.from(
      new Set(
        items.map((r) => r.counterpartyId).filter((id): id is string => typeof id === 'string'),
      ),
    );
    const counterparties =
      counterpartyIds.length > 0
        ? await this.prisma.client.counterparty.findMany({
            where: { accountId, id: { in: counterpartyIds } },
            select: { id: true, name: true },
          })
        : [];
    const counterpartyNameById = new Map(counterparties.map((c) => [c.id, c.name]));

    // Filter-scoped totals for the current view — in / out / net split.
    // Computed against the same `where` so the toolbar metric stays in
    // sync with the visible rows. Sum is a bigint sum at the DB level.
    const totals = await this.prisma.client.moneyOperation.aggregate({
      where,
      _sum: { deltaMinor: true },
    });
    const inTotalAgg = await this.prisma.client.moneyOperation.aggregate({
      where: { ...where, deltaMinor: { gt: 0n } },
      _sum: { deltaMinor: true },
    });
    const outTotalAgg = await this.prisma.client.moneyOperation.aggregate({
      where: { ...where, deltaMinor: { lt: 0n } },
      _sum: { deltaMinor: true },
    });

    return {
      items: items.map((r) => ({
        id: r.id,
        at: r.at.toISOString(),
        documentKind: r.documentKind,
        documentId: r.documentId,
        deltaMinor: r.deltaMinor.toString(),
        currency: r.currency,
        counterpartyId: r.counterpartyId,
        counterpartyName: r.counterpartyId
          ? (counterpartyNameById.get(r.counterpartyId) ?? null)
          : null,
        organizationAccountId: r.organizationAccountId,
        organizationAccountName: r.organizationAccount?.name ?? null,
        cashDeskId: r.cashDeskId,
        cashDeskName: r.cashDesk?.name ?? null,
        description: r.description,
      })),
      total,
      totals: {
        netMinor: (totals._sum.deltaMinor ?? 0n).toString(),
        inMinor: (inTotalAgg._sum.deltaMinor ?? 0n).toString(),
        outMinor: (outTotalAgg._sum.deltaMinor ?? 0n).toString(),
      },
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }
}
