import { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  StockInTransitService,
  inTransitAssortmentKey,
  inTransitStoreKey,
} from '../stock/stock-in-transit.service.js';
import { type StockBalanceFilterInput, StockBalanceFilterSchema } from './stock-balance.schema.js';

const DECIMAL_ZERO = new Prisma.Decimal(0);

export interface StockBalanceRow {
  storeId: string | null;
  storeName: string | null;
  assortmentKind: string;
  assortmentId: string;
  productName: string;
  productCode: string | null;
  productUom: string | null;
  /** Decimal as string ("5.500"). */
  qty: string;
  reservedQty: string;
  inTransitQty: string;
  available: string;
}

export interface StockBalanceReport {
  filter: StockBalanceFilterInput;
  items: StockBalanceRow[];
  total: number;
  summaries: {
    totalSku: number;
    /** Sum of qty across the visible page (string Decimal). */
    totalQty: string;
    totalReserved: string;
    totalInTransit: string;
    totalAvailable: string;
  };
}

@Injectable()
export class StockBalanceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    // Expected-incoming («Ожидание» / in-transit) is computed QUERY-TIME from
    // active supplier-order positions by the shared StockInTransitService (the
    // single source of truth shared with the products list) — never read from
    // the dropped always-0 `Stock.inTransitQty` column. Design §4-§5.
    @Inject(StockInTransitService) private readonly inTransit: StockInTransitService,
  ) {}

  async stockBalanceReport(accountId: string, raw: unknown): Promise<StockBalanceReport> {
    const filter = this.parseFilter(raw);

    if (filter.groupBy === 'product') {
      return this.groupedByProduct(accountId, filter);
    }
    return this.flatByStore(accountId, filter);
  }

  // -------------------------------------------------------------------
  // Per-store flat list (default)
  // -------------------------------------------------------------------

  private async flatByStore(
    accountId: string,
    filter: StockBalanceFilterInput,
  ): Promise<StockBalanceReport> {
    const where: Prisma.StockWhereInput = {
      accountId,
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
      ...(filter.assortmentKind ? { assortmentKind: filter.assortmentKind } : {}),
      ...(filter.productId ? { assortmentId: filter.productId } : {}),
      // `hideEmpty` filters on PHYSICAL Stock axes (on-hand / reserved) only.
      // Expected-incoming («Ожидание») is computed query-time below, not stored
      // on Stock, so a product whose only signal is in-transit (no Stock row)
      // is not surfaced here — documented limitation, see `…OZHIDANIE-IMPL…`.
      ...(filter.hideEmpty
        ? {
            OR: [{ qty: { not: 0 } }, { reservedQty: { not: 0 } }],
          }
        : {}),
    };

    // Pre-fetch matching product IDs when search is set; Prisma can't
    // easily filter Stock rows by joined-product fields in one query.
    let productIdFilter: { in: string[] } | undefined;
    if (filter.search) {
      const matches = await this.prisma.client.product.findMany({
        where: {
          accountId,
          deletedAt: null,
          OR: [
            { name: { contains: filter.search, mode: 'insensitive' } },
            { code: { contains: filter.search, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
        take: 500,
      });
      productIdFilter = { in: matches.map((m) => m.id) };
      if (productIdFilter.in.length === 0) {
        // Short-circuit: no products matched → empty report.
        return {
          filter,
          items: [],
          total: 0,
          summaries: {
            totalSku: 0,
            totalQty: '0',
            totalReserved: '0',
            totalInTransit: '0',
            totalAvailable: '0',
          },
        };
      }
      where.assortmentId = productIdFilter;
    }

    // Cursor pagination is intentionally not supported on Stock — the
    // composite PK (accountId, storeId, assortmentKind, assortmentId)
    // makes single-key cursors unreliable across store boundaries. The
    // V1 cap of 500 rows is enough for typical inventory; if you need
    // more, narrow the storeId filter or use the grouped-by-product
    // mode which sums across stores into one row per product.
    const stocks = await this.prisma.client.stock.findMany({
      where,
      orderBy: [{ storeId: 'asc' }, { assortmentId: 'asc' }],
      take: filter.limit,
      include: {
        store: { select: { id: true, name: true } },
      },
    });
    const rows = stocks;

    // Resolve product info (name/code/uom) in a single batched query —
    // we don't have a Stock→Product relation in Prisma because it's
    // polymorphic via assortmentKind.
    const productIds = rows
      .filter((r) => r.assortmentKind === 'product')
      .map((r) => r.assortmentId);
    const products = await this.prisma.client.product.findMany({
      where: { id: { in: productIds }, accountId },
      select: { id: true, name: true, code: true, uom: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Expected-incoming («Ожидание») computed query-time for the visible rows.
    const inTransitMap = await this.inTransit.getInTransitMap(accountId, {
      storeId: filter.storeId,
      assortmentIds: rows.map((r) => r.assortmentId),
    });

    const items: StockBalanceRow[] = rows.map((r) => {
      const product = productMap.get(r.assortmentId);
      const inTransit =
        inTransitMap.get(inTransitStoreKey(r.storeId, r.assortmentKind, r.assortmentId)) ??
        DECIMAL_ZERO;
      // Displayed «Доступно» = Остаток − Резерв + Ожидание (moysklad formula).
      // The posting-sufficiency check (stock.service assertAvailable) stays
      // PHYSICAL (qty − reserved) — see design §6. Do not conflate.
      const available = r.qty.minus(r.reservedQty).plus(inTransit);
      return {
        storeId: r.storeId,
        storeName: r.store?.name ?? null,
        assortmentKind: r.assortmentKind,
        assortmentId: r.assortmentId,
        productName: product?.name ?? '—',
        productCode: product?.code ?? null,
        productUom: product?.uom ?? null,
        qty: r.qty.toString(),
        reservedQty: r.reservedQty.toString(),
        inTransitQty: inTransit.toString(),
        available: available.toString(),
      };
    });

    const total = await this.prisma.client.stock.count({ where });
    const summaries = this.computeSummaries(items);

    return { filter, items, total, summaries };
  }

  // -------------------------------------------------------------------
  // Grouped-by-product (sum across stores)
  // -------------------------------------------------------------------

  private async groupedByProduct(
    accountId: string,
    filter: StockBalanceFilterInput,
  ): Promise<StockBalanceReport> {
    // Sum the PHYSICAL qty / reserved per (assortmentKind, assortmentId).
    // Expected-incoming («Ожидание») is summed query-time below (not a Stock
    // column). orderBy is required by Prisma whenever take is set on groupBy.
    const grouped = await this.prisma.client.stock.groupBy({
      by: ['assortmentKind', 'assortmentId'],
      where: {
        accountId,
        ...(filter.storeId ? { storeId: filter.storeId } : {}),
        ...(filter.assortmentKind ? { assortmentKind: filter.assortmentKind } : {}),
        ...(filter.productId ? { assortmentId: filter.productId } : {}),
      },
      _sum: { qty: true, reservedQty: true },
      orderBy: { _sum: { qty: 'desc' } },
      take: filter.limit,
    });

    let rowsList = grouped;

    if (filter.hideEmpty) {
      // Physical axes only — see the flat-mode note above; in-transit is not a
      // Stock column.
      rowsList = rowsList.filter(
        (g) =>
          (g._sum.qty as Prisma.Decimal | null)?.toString() !== '0' ||
          (g._sum.reservedQty as Prisma.Decimal | null)?.toString() !== '0',
      );
    }

    // Resolve product names + apply search post-filter (could be pushed
    // down with a join in raw SQL — kept simple here since the page
    // limit caps row count).
    const productIds = rowsList
      .filter((g) => g.assortmentKind === 'product')
      .map((g) => g.assortmentId);
    const products = await this.prisma.client.product.findMany({
      where: { id: { in: productIds }, accountId, deletedAt: null },
      select: { id: true, name: true, code: true, uom: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Expected-incoming («Ожидание») summed across stores per assortment.
    const inTransitByAssortment = await this.inTransit.getInTransitByAssortment(accountId, {
      storeId: filter.storeId,
      assortmentIds: rowsList.map((g) => g.assortmentId),
    });

    let items: StockBalanceRow[] = rowsList.map((g) => {
      const product = productMap.get(g.assortmentId);
      const qty = (g._sum.qty as Prisma.Decimal | null) ?? DECIMAL_ZERO;
      const reserved = (g._sum.reservedQty as Prisma.Decimal | null) ?? DECIMAL_ZERO;
      const inTransit =
        inTransitByAssortment.get(inTransitAssortmentKey(g.assortmentKind, g.assortmentId)) ??
        DECIMAL_ZERO;
      // Displayed «Доступно» = Остаток − Резерв + Ожидание (moysklad formula);
      // posting check stays physical (design §6).
      const available = qty.minus(reserved).plus(inTransit);
      return {
        storeId: null,
        storeName: null,
        assortmentKind: g.assortmentKind,
        assortmentId: g.assortmentId,
        productName: product?.name ?? '—',
        productCode: product?.code ?? null,
        productUom: product?.uom ?? null,
        qty: qty.toString(),
        reservedQty: reserved.toString(),
        inTransitQty: inTransit.toString(),
        available: available.toString(),
      };
    });

    if (filter.search) {
      const needle = filter.search.toLowerCase();
      items = items.filter(
        (r) =>
          r.productName.toLowerCase().includes(needle) ||
          (r.productCode?.toLowerCase().includes(needle) ?? false),
      );
    }

    const summaries = this.computeSummaries(items);
    return { filter, items, total: items.length, summaries };
  }

  // -------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------

  private computeSummaries(items: StockBalanceRow[]): StockBalanceReport['summaries'] {
    // Decimal accumulation (not Number) — avoids float drift across many
    // fractional-quantity rows. totalAvailable mirrors the per-row moysklad
    // formula: Σ(qty − reserved + inTransit) = ΣΟстаток − ΣРезерв + ΣΟжидание.
    let totalQty = DECIMAL_ZERO;
    let totalReserved = DECIMAL_ZERO;
    let totalInTransit = DECIMAL_ZERO;
    for (const r of items) {
      totalQty = totalQty.plus(r.qty);
      totalReserved = totalReserved.plus(r.reservedQty);
      totalInTransit = totalInTransit.plus(r.inTransitQty);
    }
    const totalAvailable = totalQty.minus(totalReserved).plus(totalInTransit);
    return {
      totalSku: items.length,
      totalQty: totalQty.toString(),
      totalReserved: totalReserved.toString(),
      totalInTransit: totalInTransit.toString(),
      totalAvailable: totalAvailable.toString(),
    };
  }

  private parseFilter(raw: unknown): StockBalanceFilterInput {
    const r = StockBalanceFilterSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}
