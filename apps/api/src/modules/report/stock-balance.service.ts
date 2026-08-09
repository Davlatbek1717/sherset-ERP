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

/**
 * Qidiruv pre-filtri qancha tovar ID'sini olishga ruxsat beradi.
 *
 * Bu ham CAP — lekin endi JIM emas: unga urilgan so'rov `truncated: true`
 * qaytaradi (`PERF-10` bug-klassining ildizi aynan «cap bor, ammo hech kim
 * bilmaydi» edi). Ilgari flat rejimda 500 turardi, izohsiz.
 */
export const PRODUCT_SEARCH_CAP = 2000;

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
  /**
   * Filtrga mos qatorlarning TO'LIQ soni (sahifa uzunligi EMAS). Grouped
   * rejimda bu — guruh-count agregati, flat rejimda `stock.count`.
   */
  total: number;
  /**
   * `true` ⇒ ko'rsatilgan sahifadan tashqarida yana qator bor (yoki qidiruv
   * pre-filtri `PRODUCT_SEARCH_CAP` ga urildi). `PERF-10`: hisobot hech qachon
   * jimgina kesmaydi — kesilgan bo'lsa buni AYTADI.
   */
  truncated: boolean;
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
    const search = await this.resolveSearchIds(accountId, filter.search);
    if (search && search.ids.length === 0) return this.emptyReport(filter);
    if (search) where.assortmentId = { in: search.ids };

    // Keyset (cursor) pagination is intentionally not supported on Stock —
    // the composite PK (accountId, storeId, assortmentKind, assortmentId)
    // makes single-key cursors unreliable across store boundaries. Offset
    // pagination over a stable (storeId, assortmentId) sort is used instead
    // (`PERF-10`): before this the `limit` cap was the ONLY behaviour and
    // rows beyond it were unreachable.
    const rows = await this.prisma.client.stock.findMany({
      where,
      orderBy: [{ storeId: 'asc' }, { assortmentId: 'asc' }],
      skip: filter.offset,
      take: filter.limit,
      include: {
        store: { select: { id: true, name: true } },
      },
    });

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

    return {
      filter,
      items,
      total,
      truncated: this.isTruncated(filter, total, items.length, search?.capped),
      summaries,
    };
  }

  // -------------------------------------------------------------------
  // Grouped-by-product (sum across stores)
  // -------------------------------------------------------------------

  private async groupedByProduct(
    accountId: string,
    filter: StockBalanceFilterInput,
  ): Promise<StockBalanceReport> {
    // `PERF-10`: `search` va `hideEmpty` ilgari `take` dan KEYIN JS'da
    // qo'llanardi — ya'ni ular top-N qoldiq ichida ishlardi. Qidirilgan tovar
    // qoldig'i kichik bo'lsa hisobot uni «yo'q» deb ko'rsatardi (foydalanuvchi
    // buni xato deb bilmasdi), `hideEmpty` esa to'la bo'lishi mumkin bo'lgan
    // sahifani kaltalatardi. Endi ikkalasi ham DB tomonida, `take` dan OLDIN:
    // qidiruv — `where` product-id pre-filtri, hideEmpty — `having`.
    const search = await this.resolveSearchIds(accountId, filter.search);
    if (search && search.ids.length === 0) return this.emptyReport(filter);

    const where: Prisma.StockWhereInput = {
      accountId,
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
      ...(filter.assortmentKind ? { assortmentKind: filter.assortmentKind } : {}),
      ...(filter.productId ? { assortmentId: filter.productId } : {}),
      ...(search ? { assortmentId: { in: search.ids } } : {}),
    };
    // Physical axes only — see the flat-mode note above; in-transit is not a
    // Stock column, so it cannot participate in a SQL HAVING.
    const having: Prisma.StockScalarWhereWithAggregatesInput | undefined = filter.hideEmpty
      ? { OR: [{ qty: { _sum: { not: 0 } } }, { reservedQty: { _sum: { not: 0 } } }] }
      : undefined;

    // Sum the PHYSICAL qty / reserved per (assortmentKind, assortmentId).
    // Expected-incoming («Ожидание») is summed query-time below (not a Stock
    // column). orderBy is required by Prisma whenever take is set on groupBy.
    const [rowsList, total] = await Promise.all([
      this.prisma.client.stock.groupBy({
        by: ['assortmentKind', 'assortmentId'],
        where,
        having,
        _sum: { qty: true, reservedQty: true },
        orderBy: { _sum: { qty: 'desc' } },
        skip: filter.offset,
        take: filter.limit,
      }),
      this.countGroups(accountId, filter, search?.ids ?? null),
    ]);

    // Resolve product names for the page (search is already applied above).
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

    const items: StockBalanceRow[] = rowsList.map((g) => {
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

    const summaries = this.computeSummaries(items);
    return {
      filter,
      items,
      total,
      truncated: this.isTruncated(filter, total, items.length, search?.capped),
      summaries,
    };
  }

  // -------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------

  /**
   * Qidiruv matnini tovar-ID to'plamiga aylantiradi (`search` yo'q bo'lsa
   * `null`). IKKALA rejim ham shu yagona yo'ldan yuradi — ilgari flat rejimda
   * pre-filtr bor, grouped rejimda esa take'dan keyingi JS-filtr edi va aynan
   * shu assimetriya `PERF-10` ni tug'dirgan.
   *
   * `capped` — cap'ga urilganini bildiradi; chaqiruvchi uni `truncated` ga
   * uzatadi, ya'ni kesish hech qachon jim qolmaydi.
   */
  private async resolveSearchIds(
    accountId: string,
    search: string | undefined,
  ): Promise<{ ids: string[]; capped: boolean } | null> {
    if (!search) return null;
    const matches = await this.prisma.client.product.findMany({
      where: {
        accountId,
        deletedAt: null,
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
      take: PRODUCT_SEARCH_CAP,
    });
    return { ids: matches.map((m) => m.id), capped: matches.length >= PRODUCT_SEARCH_CAP };
  }

  /**
   * Grouped rejimdagi qatorlarning TO'LIQ soni — `GROUP BY` natijasi ustidan
   * `COUNT(*)`. Prisma `groupBy` ning o'zi count qaytarmaydi, `take`siz
   * chaqirish esa butun guruh-to'plamini Node'ga tortadi (aynan qochayotgan
   * narsa), shuning uchun bitta agregat-so'rov. `where`/`having` yuqoridagi
   * Prisma so'rovi bilan bir xil bo'lishi SHART.
   */
  private async countGroups(
    accountId: string,
    filter: StockBalanceFilterInput,
    productIds: string[] | null,
  ): Promise<number> {
    const conds: Prisma.Sql[] = [Prisma.sql`account_id = ${accountId}::uuid`];
    if (filter.storeId) conds.push(Prisma.sql`store_id = ${filter.storeId}::uuid`);
    if (filter.assortmentKind) conds.push(Prisma.sql`assortment_kind = ${filter.assortmentKind}`);
    if (filter.productId) conds.push(Prisma.sql`assortment_id = ${filter.productId}::uuid`);
    if (productIds && productIds.length > 0) {
      conds.push(
        Prisma.sql`assortment_id IN (${Prisma.join(productIds.map((id) => Prisma.sql`${id}::uuid`))})`,
      );
    }
    const having = filter.hideEmpty
      ? Prisma.sql`HAVING SUM(qty) <> 0 OR SUM(reserved_qty) <> 0`
      : Prisma.empty;
    const rows = await this.prisma.client.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM (
        SELECT 1 FROM stocks
        WHERE ${Prisma.join(conds, ' AND ')}
        GROUP BY assortment_kind, assortment_id
        ${having}
      ) g`;
    return Number(rows[0]?.count ?? 0n);
  }

  /**
   * Sahifadan tashqarida qator qoldimi. Qidiruv pre-filtri cap'ga urilgan
   * bo'lsa ham `true` — u ham kesish (faqat boshqa o'qda).
   */
  private isTruncated(
    filter: StockBalanceFilterInput,
    total: number,
    pageLength: number,
    searchCapped: boolean | undefined,
  ): boolean {
    return searchCapped === true || total > filter.offset + pageLength;
  }

  private emptyReport(filter: StockBalanceFilterInput): StockBalanceReport {
    return {
      filter,
      items: [],
      total: 0,
      truncated: false,
      summaries: {
        totalSku: 0,
        totalQty: '0',
        totalReserved: '0',
        totalInTransit: '0',
        totalAvailable: '0',
      },
    };
  }

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
