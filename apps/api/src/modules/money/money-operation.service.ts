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

    // Filter-scoped totals for the current view — in / out / net split,
    // PER CURRENCY (M-14, Faza 17). Computed against the same `where` so the
    // toolbar metric stays in sync with the visible rows; the sums are
    // BigInt sums at the DB level.
    //
    // Edi: three `aggregate({_sum:{deltaMinor}})` calls with no currency key —
    // in a multi-currency tenant a USD cent and a UZS tiyin landed in the same
    // number and the UI labelled it «so'm». Grouping by currency is the only
    // faithful answer here: MoneyOperation has no rate column of its own, so
    // there is nothing to consolidate WITH at this layer (report-level
    // consolidation lives in `report-rate-ctx.util.ts`).
    const [inRows, outRows] = await Promise.all([
      this.groupSumByCurrency({ ...where, deltaMinor: { gt: 0n } }),
      this.groupSumByCurrency({ ...where, deltaMinor: { lt: 0n } }),
    ]);
    const byCurrency = mergeCurrencyTotals(inRows, outRows);

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
        byCurrency,
        mixedCurrency: byCurrency.length > 1,
      },
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  /** `SUM(delta_minor) GROUP BY currency` for an already-built where clause. */
  private async groupSumByCurrency(where: Prisma.MoneyOperationWhereInput): Promise<CurrencySum[]> {
    const rows = await this.prisma.client.moneyOperation.groupBy({
      by: ['currency'],
      where,
      _sum: { deltaMinor: true },
    });
    return rows.map((r) => ({ currency: r.currency, sum: r._sum.deltaMinor ?? 0n }));
  }
}

interface CurrencySum {
  currency: string;
  sum: bigint;
}

/** One toolbar total, in its own currency — never mixed with another's. */
export interface MoneyOperationCurrencyTotal {
  currency: string;
  /** Inflow sum (≥ 0), BigInt-as-string. */
  inMinor: string;
  /** Outflow sum (≤ 0 — sign preserved, as the ledger stores it). */
  outMinor: string;
  /** `inMinor + outMinor`. */
  netMinor: string;
}

/**
 * Fold the inflow and outflow group-by results into one row per currency.
 * A currency that only has outflows (or only inflows) still gets a row with
 * the other side at 0 — the toolbar must not hide half of a ledger.
 * First-seen order: inflow currencies first, then outflow-only ones.
 */
function mergeCurrencyTotals(
  inRows: CurrencySum[],
  outRows: CurrencySum[],
): MoneyOperationCurrencyTotal[] {
  const acc = new Map<string, { in: bigint; out: bigint }>();
  const ensure = (currency: string) => {
    let e = acc.get(currency);
    if (!e) {
      e = { in: 0n, out: 0n };
      acc.set(currency, e);
    }
    return e;
  };
  for (const r of inRows) ensure(r.currency).in += r.sum;
  for (const r of outRows) ensure(r.currency).out += r.sum;

  return Array.from(acc, ([currency, v]) => ({
    currency,
    inMinor: v.in.toString(),
    outMinor: v.out.toString(),
    netMinor: (v.in + v.out).toString(),
  }));
}
