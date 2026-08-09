import type { Prisma } from '@moysklad/db';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type ItemsFilterInput,
  ItemsFilterSchema,
  ItemsStatsFilterSchema,
  LOW_STOCK_THRESHOLD,
} from './items.schema.js';
import { type SalePricesJson, pickSalePriceMinor } from './sale-price.util.js';

/**
 * Items row 1:1 with the Alibobo reference (`use-items.ts`).
 * `imageUrl`/`brand`/`vatPercent` are `null` because moysklad's Product model
 * does not track them per row — placeholders kept for contract stability.
 * Money is minor units (tiyin) as `number` to mirror the reference DTO.
 */
export interface ItemRow {
  id: string;
  code: string | null;
  name: string;
  imageUrl: string | null;
  unitName: string | null;
  groupId: string | null;
  groupName: string | null;
  brand: string | null;
  country: string | null;
  vatPercent: number | null;
  buyPrice: number;
  sellPrice: number;
  purchasedQty: number;
  soldQty: number;
  soldInPeriod: number;
  stock: number;
  lastPartnerId: string | null;
  lastPartnerName: string | null;
  lastBuyDate: string | null;
}

export interface ItemsResponse {
  items: ItemRow[];
  /**
   * Filtrga mos tovarlarning TO'LIQ soni (`product.count`, BUTUN scope) —
   * hech qachon kesilgan oynaning uzunligi emas. `PERF-01` ning ildizi aynan
   * `total = filtered.length` edi: 10 000 dan katta katalogda sahifalagich
   * yolg'on gapirardi.
   */
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /**
   * `true` ⇒ javob `MAX_PRODUCTS_PER_QUERY` cap'i tufayli TO'LIQ EMAS
   * (agregat-saralash / `lowStock` yo'li). `false` ⇒ sahifa DB'dan olingan,
   * hech narsa kesilmagan. Jimgina kesish TAQIQ — kesildi bo'lsa AYTILADI.
   */
  truncated: boolean;
}

export interface ItemsStats {
  totalItems: number;
  lowStockCount: number;
  noPartnerCount: number;
  /** `true` ⇒ `lowStockCount` cap-oyna ichida sanaldi (to'liq emas). */
  truncated: boolean;
}

export interface ItemGroupNode {
  groupId: string;
  groupName: string;
  groupPath: string | null;
  itemCount: number;
}

@Injectable()
export class ItemsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Paginated items list — ikki yo'l, ikkalasida ham `total` BUTUN scope'dan.
   *
   * **A. DB-paginate (cap'siz).** `sort` DB-saralanadigan (`name`/`code`) va
   * `lowStock` yoqilmagan bo'lsa — `orderBy` + `skip`/`take` DB'da bajariladi
   * va Node'ga FAQAT bir sahifa (≤200 qator) keladi. Agregatlar ham faqat shu
   * sahifa uchun hisoblanadi. `truncated: false`.
   *
   * **B. Agregat-yo'l (cap saqlanadi).** `sort` agregatga bog'liq
   * (`stock`/`soldQty`/`sellPrice`) yoki `lowStock` filtri yoqilgan bo'lsa —
   * saralash/filtrlash uchun agregatlar kerak, ular esa SQL'da yo'q. Bu holda
   * `MAX_PRODUCTS_PER_QUERY` oynasi olinadi, LEKIN: (1) oyna endi
   * **deterministik** (`orderBy: name,id` — ilgari tartibsiz `take` edi, ya'ni
   * qaysi 10 000 tushishi DB kayfiyatiga bog'liq edi), (2) `total` baribir
   * butun-scope `count` dan, (3) cap'ga urilgan bo'lsa `truncated: true`.
   *
   * Qidiruv (`search`) IKKALA yo'lda ham SQL `where` da — `take` dan OLDIN.
   */
  async list(accountId: string, raw: unknown): Promise<ItemsResponse> {
    const filter = ItemsFilterSchema.parse(raw);
    const baseWhere = this.buildProductWhere(accountId, filter);

    // Scope'dagi tovarlar soni — kesilgan ro'yxatdan EMAS, DB count'dan.
    const scopeTotal = await this.prisma.client.product.count({ where: baseWhere });

    // `lowStock` agregatga bog'liq filtr, `stock`/`soldQty`/`sellPrice` esa
    // agregatga bog'liq saralash ⇒ ular DB-paginate'ni imkonsiz qiladi.
    const dbSortable = filter.sort === 'name' || filter.sort === 'code';
    const dbPaginate = dbSortable && !filter.lowStock;

    const candidates = await this.prisma.client.product.findMany({
      where: baseWhere,
      select: {
        id: true,
        code: true,
        name: true,
        uom: true,
        productFolderId: true,
        supplierId: true,
        country: true,
        buyPrice: true,
        salePrices: true,
      },
      // Ikkala yo'lda ham OSHKORA tartib: aks holda `take` qaysi qatorni
      // olishi aniqlanmagan bo'lib qoladi (sahifa 1 ham beqaror).
      orderBy: dbPaginate
        ? [{ [filter.sort]: filter.order } as Prisma.ProductOrderByWithRelationInput, { id: 'asc' }]
        : [{ name: 'asc' }, { id: 'asc' }],
      skip: dbPaginate ? (filter.page - 1) * filter.pageSize : 0,
      take: dbPaginate ? filter.pageSize : MAX_PRODUCTS_PER_QUERY,
    });
    const productIds = candidates.map((c) => c.id);

    // Agregatlar faqat olingan to'plam uchun (A yo'lida — bir sahifa).
    const aggregates = await this.loadAggregates(accountId, productIds, filter);
    const defaultPriceTypeId = await this.loadDefaultPriceTypeId(accountId);
    const folderById = await this.loadFolderMap(
      accountId,
      candidates.map((c) => c.productFolderId).filter((x): x is string => !!x),
    );

    // Build rows with computed fields.
    const allRows: ItemRow[] = candidates.map((p) => {
      const sellPrice = Number(
        pickSalePriceMinor(p.salePrices as SalePricesJson, defaultPriceTypeId),
      );
      const agg = aggregates.get(p.id) ?? EMPTY_AGG;
      const folder = p.productFolderId ? folderById.get(p.productFolderId) : undefined;
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        imageUrl: null,
        unitName: p.uom ?? null,
        groupId: p.productFolderId,
        groupName: folder?.name ?? null,
        brand: null,
        country: p.country ?? null,
        vatPercent: null,
        buyPrice: Number(p.buyPrice ?? 0n),
        sellPrice,
        purchasedQty: agg.purchasedQty,
        soldQty: agg.soldQty,
        soldInPeriod: agg.soldInPeriod,
        stock: agg.stock,
        lastPartnerId: agg.lastPartnerId,
        lastPartnerName: null, // hydrated below in one batch
        lastBuyDate: agg.lastBuyDate ? agg.lastBuyDate.toISOString() : null,
      };
    });

    // Hydrate last-partner names in one query.
    const lastPartnerIds = [
      ...new Set(allRows.map((r) => r.lastPartnerId).filter((x): x is string => !!x)),
    ];
    if (lastPartnerIds.length > 0) {
      const cps = await this.prisma.client.counterparty.findMany({
        where: { accountId, id: { in: lastPartnerIds } },
        select: { id: true, name: true },
      });
      const cpName = new Map(cps.map((c) => [c.id, c.name]));
      for (const r of allRows) {
        if (r.lastPartnerId) r.lastPartnerName = cpName.get(r.lastPartnerId) ?? null;
      }
    }

    // A yo'li: DB allaqachon saralab, kerakli sahifani kesib bergan.
    if (dbPaginate) {
      return {
        items: allRows,
        total: scopeTotal,
        page: filter.page,
        pageSize: filter.pageSize,
        totalPages: Math.max(1, Math.ceil(scopeTotal / filter.pageSize)),
        truncated: false,
      };
    }

    // B yo'li: agregatga bog'liq filtr/saralash — JS'da, cap-oyna ichida.
    const capped = scopeTotal > MAX_PRODUCTS_PER_QUERY;

    let filtered = allRows;
    if (filter.lowStock) {
      filtered = filtered.filter((r) => r.stock < LOW_STOCK_THRESHOLD);
    }

    filtered.sort((a, b) => compareRows(a, b, filter.sort, filter.order));

    const start = (filter.page - 1) * filter.pageSize;
    const items = filtered.slice(start, start + filter.pageSize);
    // `lowStock` da butun-scope sonini SQL bera olmaydi (qoldiq — Stock
    // jadvalidagi yig'indi), shuning uchun oyna ichidagi aniq son + `truncated`.
    // Boshqa hollarda `total` butun-scope count.
    const total = filter.lowStock ? filtered.length : scopeTotal;
    const totalPages = Math.max(1, Math.ceil(total / filter.pageSize));
    return {
      items,
      total,
      page: filter.page,
      pageSize: filter.pageSize,
      totalPages,
      truncated: capped,
    };
  }

  /**
   * KPI counts mirroring the reference `/items/stats` — filtered by the same
   * groupId/search/onlyInCart/inCartIds as the list, so the cards match the
   * visible table.
   *
   * `totalItems` va `noPartnerCount` — SQL `count` (butun scope, cap'siz).
   * `lowStockCount` esa qoldiq-yig'indisiga bog'liq (Prisma'da tovar-`where`
   * ustidan aggregate-filtr yo'q), shuning uchun u cap-oyna ichida sanaladi va
   * cap'ga urilgan bo'lsa `truncated: true` bilan OSHKORA belgilanadi.
   */
  async stats(accountId: string, raw: unknown): Promise<ItemsStats> {
    const filter = ItemsStatsFilterSchema.parse(raw);
    const baseWhere = this.buildProductWhere(accountId, filter as ItemsFilterInput);

    const [totalItems, noPartnerCount, products] = await Promise.all([
      this.prisma.client.product.count({ where: baseWhere }),
      this.prisma.client.product.count({ where: { ...baseWhere, supplierId: null } }),
      this.prisma.client.product.findMany({
        where: baseWhere,
        select: { id: true, supplierId: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: MAX_PRODUCTS_PER_QUERY,
      }),
    ]);

    // Stock per product for lowStockCount.
    const stockRows =
      products.length > 0
        ? await this.prisma.client.stock.groupBy({
            by: ['assortmentId'],
            where: {
              accountId,
              assortmentKind: 'product',
              assortmentId: { in: products.map((p) => p.id) },
            },
            _sum: { qty: true },
          })
        : [];
    const stockByProduct = new Map(stockRows.map((s) => [s.assortmentId, Number(s._sum.qty ?? 0)]));
    const lowStockCount = products.filter(
      (p) => (stockByProduct.get(p.id) ?? 0) < LOW_STOCK_THRESHOLD,
    ).length;

    return {
      totalItems,
      lowStockCount,
      noPartnerCount,
      truncated: totalItems > MAX_PRODUCTS_PER_QUERY,
    };
  }

  /**
   * Flat group list with `pathName` ("Parent/Child") + item counts. Frontend
   * builds the tree from this (group-tree-utils).
   */
  async groups(accountId: string): Promise<{ groups: ItemGroupNode[] }> {
    const folders = await this.prisma.client.productFolder.findMany({
      where: { accountId },
      select: {
        id: true,
        name: true,
        pathName: true,
        _count: { select: { products: { where: { archived: false, deletedAt: null } } } },
      },
      orderBy: { name: 'asc' },
    });
    return {
      groups: folders.map((f) => ({
        groupId: f.id,
        groupName: f.name,
        groupPath: f.pathName ?? null,
        itemCount: f._count.products,
      })),
    };
  }

  // ---- helpers ----

  private buildProductWhere(
    accountId: string,
    filter: Partial<ItemsFilterInput>,
  ): Prisma.ProductWhereInput {
    return {
      accountId,
      archived: false,
      deletedAt: null,
      ...(filter.groupId ? { productFolderId: filter.groupId } : {}),
      ...(filter.noPartner ? { supplierId: null } : {}),
      ...(filter.onlyInCart && filter.inCartIds && filter.inCartIds.length > 0
        ? { id: { in: filter.inCartIds } }
        : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' as const } },
              { code: { contains: filter.search, mode: 'insensitive' as const } },
              { article: { contains: filter.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
  }

  private async loadDefaultPriceTypeId(accountId: string): Promise<string | undefined> {
    const dt = await this.prisma.client.priceType.findFirst({
      where: { accountId, isDefault: true },
      select: { id: true },
    });
    return dt?.id;
  }

  private async loadFolderMap(
    accountId: string,
    folderIds: string[],
  ): Promise<Map<string, { name: string }>> {
    const unique = [...new Set(folderIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.client.productFolder.findMany({
      where: { accountId, id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, { name: r.name }]));
  }

  /**
   * Per-product aggregates: purchased (all-time), sold (all-time), soldInPeriod
   * (within [salesFrom, salesTo]), stock (sum across stores), last posted
   * Supply (date + agentId for partner). Single-pass groupBy + one findFirst.
   */
  private async loadAggregates(
    accountId: string,
    productIds: string[],
    filter: ItemsFilterInput,
  ): Promise<Map<string, AggregateRow>> {
    const map = new Map<string, AggregateRow>();
    if (productIds.length === 0) return map;
    for (const id of productIds) map.set(id, { ...EMPTY_AGG });

    const from = filter.salesFrom ? new Date(filter.salesFrom) : null;
    const to = filter.salesTo ? new Date(filter.salesTo) : null;

    const [supplySums, demandAllSums, demandPeriodSums, stockSums, lastSupplies] =
      await Promise.all([
        this.prisma.client.supplyPosition.groupBy({
          by: ['productId'],
          where: {
            accountId,
            productId: { in: productIds },
            supply: { state: 'posted' },
          },
          _sum: { quantity: true },
        }),
        this.prisma.client.demandPosition.groupBy({
          by: ['productId'],
          where: {
            accountId,
            productId: { in: productIds },
            demand: { state: 'posted' },
          },
          _sum: { quantity: true },
        }),
        from || to
          ? this.prisma.client.demandPosition.groupBy({
              by: ['productId'],
              where: {
                accountId,
                productId: { in: productIds },
                demand: {
                  state: 'posted',
                  ...(from || to
                    ? { moment: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
                    : {}),
                },
              },
              _sum: { quantity: true },
            })
          : Promise.resolve([] as Array<{ productId: string | null; _sum: { quantity: unknown } }>),
        this.prisma.client.stock.groupBy({
          by: ['assortmentId'],
          where: {
            accountId,
            assortmentKind: 'product',
            assortmentId: { in: productIds },
          },
          _sum: { qty: true },
        }),
        // Last posted supply per product (one fetch + reduce).
        this.prisma.client.supplyPosition.findMany({
          where: {
            accountId,
            productId: { in: productIds },
            supply: { state: 'posted' },
          },
          select: {
            productId: true,
            supply: { select: { moment: true, agentId: true } },
          },
          orderBy: { supply: { moment: 'desc' } },
          take: 5000,
        }),
      ]);

    for (const r of supplySums) {
      if (!r.productId) continue;
      const cur = map.get(r.productId);
      if (cur) cur.purchasedQty = Number(r._sum.quantity ?? 0);
    }
    for (const r of demandAllSums) {
      if (!r.productId) continue;
      const cur = map.get(r.productId);
      if (cur) cur.soldQty = Number(r._sum.quantity ?? 0);
    }
    // No period filter means "all-time" — mirror soldQty so the column has data.
    if (from || to) {
      for (const r of demandPeriodSums) {
        if (!r.productId) continue;
        const cur = map.get(r.productId);
        if (cur) cur.soldInPeriod = Number(r._sum.quantity ?? 0);
      }
    } else {
      for (const [pid, cur] of map) {
        cur.soldInPeriod = cur.soldQty;
        map.set(pid, cur);
      }
    }
    for (const r of stockSums) {
      const cur = map.get(r.assortmentId);
      if (cur) cur.stock = Number(r._sum.qty ?? 0);
    }
    // Reduce last-supply: first occurrence per productId in moment-desc order wins.
    const seen = new Set<string>();
    for (const pos of lastSupplies) {
      if (!pos.productId || seen.has(pos.productId)) continue;
      seen.add(pos.productId);
      const cur = map.get(pos.productId);
      if (cur) {
        cur.lastBuyDate = pos.supply?.moment ?? null;
        cur.lastPartnerId = pos.supply?.agentId ?? null;
      }
    }
    return map;
  }
}

/**
 * Agregat-yo'lida (B) bir so'rovda Node'ga tortiladigan tovarlar chegarasi.
 *
 * Bu CAP — lekin endi JIM emas: unga urilgan javob `truncated: true`
 * qaytaradi (`PERF-01` ning ildizi «cap bor, ammo hech kim bilmaydi» edi).
 * DB-paginate yo'lida (A) umuman ishlatilmaydi.
 */
export const MAX_PRODUCTS_PER_QUERY = 10_000;

interface AggregateRow {
  purchasedQty: number;
  soldQty: number;
  soldInPeriod: number;
  stock: number;
  lastBuyDate: Date | null;
  lastPartnerId: string | null;
}

const EMPTY_AGG: AggregateRow = {
  purchasedQty: 0,
  soldQty: 0,
  soldInPeriod: 0,
  stock: 0,
  lastBuyDate: null,
  lastPartnerId: null,
};

function compareRows(
  a: ItemRow,
  b: ItemRow,
  sort: 'name' | 'code' | 'stock' | 'soldQty' | 'sellPrice',
  order: 'asc' | 'desc',
): number {
  const dir = order === 'asc' ? 1 : -1;
  switch (sort) {
    case 'name':
      return a.name.localeCompare(b.name) * dir;
    case 'code':
      return (a.code ?? '').localeCompare(b.code ?? '') * dir;
    case 'stock':
      return (a.stock - b.stock) * dir;
    case 'soldQty':
      return (a.soldQty - b.soldQty) * dir;
    case 'sellPrice':
      return (a.sellPrice - b.sellPrice) * dir;
  }
}
