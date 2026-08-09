import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { computePerUnitCost, parseDecimalScaled } from '../../shared/decimal.js';
import {
  DEFAULT_PRICE_THRESHOLD_PERCENT,
  type PriceAuditRow,
  extractPriceChanges,
  reviewPriceChanges,
} from './price-change-control.js';
import {
  DEFAULT_STOCK_THRESHOLDS,
  type StockSignalInput,
  type StockSignalRow,
  type StockSignalThresholds,
  buildStockSignalBoard,
  stockSignalsFor,
} from './stock-signals.js';

/**
 * 4M.8 HTTP orqasidagi I/O qatlami: uch xil zaxira signali + narx
 * o'zgarishi nazorati. **Qoidalar bu yerda emas** — ular sof modullarda
 * (`stock-signals.ts`, `price-change-control.ts`, 37 test). Bu yerda faqat
 * Prisma o'qishlari va shakl moslash.
 *
 * Yangi yozuvchi OCHILMAYDI: signal `Stock` + `StockOperation` dan, narx
 * tarixi mavjud `AuditLog` dan o'qiladi. Ikkinchi manba yaratish ikkinchi
 * haqiqat yaratardi.
 */

/**
 * Sotuv oqimi (chiqim manfiy, qaytarim musbat) — sof sotuv shu to'plamdan
 * yig'iladi. Ombor ichidagi ko'chirish (`move_*`, `cell_*`) va inventarizatsiya
 * ATAYLAB YO'Q: ular pulni aylantirmaydi, faqat joyini o'zgartiradi.
 */
export const SALES_DOC_TYPES = [
  'demand',
  'demand_unpost',
  'demand_cancel',
  'retailsale',
  'salesreturn',
  'salesreturn_unpost',
  'salesreturn_cancel',
] as const;

/** Kirim oqimi — «bu zaxira qachondan beri bizda» savoliga javob. */
export const INFLOW_DOC_TYPES = [
  'supply',
  'enter',
  'move_in',
  'production',
  'processing_produce',
  'inventory_surplus',
] as const;

/** Bir so'rovda ko'riladigan maksimal qoldiq qatori. Kesilsa — OSHKORA. */
export const STOCK_SCAN_CAP = 5000;
/** Bir so'rovda ko'riladigan maksimal audit qatori. Kesilsa — OSHKORA. */
export const PRICE_AUDIT_CAP = 1000;

export interface StockKeyed {
  storeId: string;
  assortmentKind: string;
  assortmentId: string;
}

export interface StockRowShape extends StockKeyed {
  /** Decimal(20,6) satri. */
  qty: string;
  costBalanceMinor: bigint;
}

export interface SalesAggShape extends StockKeyed {
  /** Oynadagi sof qtyDelta yig'indisi (sotuv manfiy). */
  netDelta: string;
}

/**
 * Birlik tan narxi. **NULL ≠ 0** — noma'lumni 0 deb yozish signalni
 * «0 so'm qotgan pul» qilib ko'rsatardi va menejer muammoni ko'rmasdi.
 *
 * Tartib: (1) o'rtacha-tortilgan `Stock.costBalanceMinor ÷ qty` — 18a
 * qaroridan beri butun tizimning COGS bazasi; (2) `Product.buyPrice`
 * fallback; (3) `null`.
 *
 * `costBalanceMinor` DEFAULT 0 bo'lgani uchun 0 = «yozilmagan», narx emas.
 */
export function resolveUnitCostMinor(
  costBalanceMinor: bigint,
  qty: string,
  buyPriceMinor: bigint | null,
): bigint | null {
  if (costBalanceMinor > 0n && parseDecimalScaled(qty) > 0n) {
    const perUnit = computePerUnitCost(costBalanceMinor, qty);
    if (perUnit > 0n) return perUnit;
  }
  return buyPriceMinor != null && buyPriceMinor > 0n ? buyPriceMinor : null;
}

const keyOf = (k: StockKeyed) => `${k.storeId}|${k.assortmentKind}|${k.assortmentId}`;

/**
 * DB shakllarini sof modul kirishiga aylantiradi.
 *
 * Sotuvi bor-u qoldig'i YO'Q tovar ham kiradi: `Stock` qatori 0 bo'lib
 * qolgan bo'lishi mumkin, ammo aynan u eng o'tkir «tugash xavfi». Uni
 * tashlab ketish signalni jimgina yo'q qilardi.
 */
export function assembleSignalInputs(args: {
  stocks: ReadonlyArray<StockRowShape>;
  sales: ReadonlyArray<SalesAggShape>;
  lastSaleAt: ReadonlyMap<string, Date>;
  firstInflowAt: ReadonlyMap<string, Date>;
  buyPrices: ReadonlyMap<string, bigint | null>;
  names: ReadonlyMap<string, string>;
  storeNames: ReadonlyMap<string, string>;
  windowDays: number;
}): StockSignalInput[] {
  const salesByKey = new Map(args.sales.map((s) => [keyOf(s), s]));
  const seen = new Set<string>();

  const build = (k: StockKeyed, qty: string, costBalanceMinor: bigint): StockSignalInput => {
    const key = keyOf(k);
    const netDelta = salesByKey.get(key)?.netDelta ?? '0';
    // Chiqim manfiy ⇒ sof sotuv = −netDelta. Qaytarim ko'p bo'lsa manfiy
    // chiqadi; u «sotuv sur'ati yo'q» degani (sof modul 0/manfiyni shunday
    // o'qiydi), «−5 dona/kun» degan bema'nilik emas.
    const soldScaled = -parseDecimalScaled(netDelta);
    return {
      storeId: k.storeId,
      storeName: args.storeNames.get(k.storeId) ?? null,
      assortmentKind: k.assortmentKind,
      assortmentId: k.assortmentId,
      name: args.names.get(k.assortmentId) ?? null,
      qty,
      unitCostMinor: resolveUnitCostMinor(
        costBalanceMinor,
        qty,
        args.buyPrices.get(k.assortmentId) ?? null,
      ),
      lastSaleAt: args.lastSaleAt.get(key) ?? null,
      soldQty: soldScaled > 0n ? formatScaled(soldScaled) : '0',
      windowDays: args.windowDays,
      stockedSinceAt: args.firstInflowAt.get(key) ?? null,
    };
  };

  const inputs: StockSignalInput[] = [];
  for (const s of args.stocks) {
    seen.add(keyOf(s));
    inputs.push(build(s, s.qty, s.costBalanceMinor));
  }
  for (const s of args.sales) {
    if (seen.has(keyOf(s))) continue;
    // Qoldiq qatori yo'q, lekin sotuv bo'lgan ⇒ qoldiq 0.
    inputs.push(build(s, '0', 0n));
  }
  return inputs;
}

function formatScaled(scaled: bigint): string {
  const abs = scaled < 0n ? -scaled : scaled;
  const int = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${scaled < 0n ? '-' : ''}${int}${frac ? `.${frac}` : ''}`;
}

export interface StockSignalQuery {
  storeId?: string;
  windowDays?: number;
  deadDays?: number;
  coverDays?: number;
  overstockDays?: number;
  /** Har signal guruhida qaytariladigan qator soni. */
  limit?: number;
}

export interface PriceChangeQuery {
  days?: number;
  thresholdPercent?: number;
  productId?: string;
  limit?: number;
}

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_PRICE_DAYS = 30;
const DEFAULT_GROUP_LIMIT = 50;

@Injectable()
export class ManagerInventoryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Uch xil zaxira signali — o'lchov PUL.
   *
   * ⚠️ Chegaralar hozircha **so'rovdan** keladi (default'lar
   * `DEFAULT_STOCK_THRESHOLDS`). Doimiy per-akkaunt sozlama
   * `ManagerRuleConfig` bilan keladi (MK06) — o'shanda bu joy sozlamani
   * o'qiydi, so'rov esa faqat vaqtinchalik override bo'lib qoladi.
   */
  async stockSignals(accountId: string, query: StockSignalQuery = {}) {
    const now = new Date();
    const windowDays = clampInt(query.windowDays, DEFAULT_WINDOW_DAYS, 1, 365);
    const thresholds: StockSignalThresholds = {
      deadDays: clampInt(query.deadDays, DEFAULT_STOCK_THRESHOLDS.deadDays, 1, 3650),
      coverDays: clampInt(query.coverDays, DEFAULT_STOCK_THRESHOLDS.coverDays, 0, 3650),
      overstockDays: clampInt(query.overstockDays, DEFAULT_STOCK_THRESHOLDS.overstockDays, 1, 3650),
    };
    const limit = clampInt(query.limit, DEFAULT_GROUP_LIMIT, 1, 500);
    const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const storeFilter = query.storeId ? { storeId: query.storeId } : {};

    const [stockRows, salesAgg, lastSaleAgg, firstInflowAgg] = await Promise.all([
      this.prisma.client.stock.findMany({
        where: { accountId, ...storeFilter, NOT: { qty: 0 } },
        select: {
          storeId: true,
          assortmentKind: true,
          assortmentId: true,
          qty: true,
          costBalanceMinor: true,
        },
        take: STOCK_SCAN_CAP + 1,
      }),
      this.prisma.client.stockOperation.groupBy({
        by: ['storeId', 'assortmentKind', 'assortmentId'],
        where: {
          accountId,
          ...storeFilter,
          docType: { in: [...SALES_DOC_TYPES] },
          occurredAt: { gte: windowStart },
        },
        _sum: { qtyDelta: true },
      }),
      this.prisma.client.stockOperation.groupBy({
        by: ['storeId', 'assortmentKind', 'assortmentId'],
        where: {
          accountId,
          ...storeFilter,
          docType: { in: [...SALES_DOC_TYPES] },
          qtyDelta: { lt: 0 },
        },
        _max: { occurredAt: true },
      }),
      this.prisma.client.stockOperation.groupBy({
        by: ['storeId', 'assortmentKind', 'assortmentId'],
        where: { accountId, ...storeFilter, docType: { in: [...INFLOW_DOC_TYPES] } },
        _min: { occurredAt: true },
      }),
    ]);

    const truncated = stockRows.length > STOCK_SCAN_CAP;
    const stocks: StockRowShape[] = stockRows.slice(0, STOCK_SCAN_CAP).map((s) => ({
      storeId: s.storeId,
      assortmentKind: s.assortmentKind,
      assortmentId: s.assortmentId,
      qty: s.qty.toString(),
      costBalanceMinor: s.costBalanceMinor,
    }));

    const sales: SalesAggShape[] = salesAgg.map((s) => ({
      storeId: s.storeId,
      assortmentKind: s.assortmentKind,
      assortmentId: s.assortmentId,
      netDelta: (s._sum.qtyDelta ?? 0).toString(),
    }));

    const toMap = <T>(rows: ReadonlyArray<StockKeyed & { value: T | null }>): Map<string, T> => {
      const m = new Map<string, T>();
      for (const r of rows) if (r.value != null) m.set(keyOf(r), r.value);
      return m;
    };
    const lastSaleAt = toMap(
      lastSaleAgg.map((r) => ({
        storeId: r.storeId,
        assortmentKind: r.assortmentKind,
        assortmentId: r.assortmentId,
        value: r._max.occurredAt,
      })),
    );
    const firstInflowAt = toMap(
      firstInflowAgg.map((r) => ({
        storeId: r.storeId,
        assortmentKind: r.assortmentKind,
        assortmentId: r.assortmentId,
        value: r._min.occurredAt,
      })),
    );

    const productIds = new Set<string>();
    const variantIds = new Set<string>();
    const storeIds = new Set<string>();
    for (const row of [...stocks, ...sales]) {
      storeIds.add(row.storeId);
      if (row.assortmentKind === 'variant') variantIds.add(row.assortmentId);
      else productIds.add(row.assortmentId);
    }

    const [products, variants, stores] = await Promise.all([
      productIds.size
        ? this.prisma.client.product.findMany({
            where: { accountId, id: { in: [...productIds] } },
            select: { id: true, name: true, buyPrice: true },
          })
        : Promise.resolve([]),
      variantIds.size
        ? this.prisma.client.variant.findMany({
            where: { accountId, id: { in: [...variantIds] } },
            select: { id: true, name: true, buyPrice: true },
          })
        : Promise.resolve([]),
      storeIds.size
        ? this.prisma.client.store.findMany({
            where: { accountId, id: { in: [...storeIds] } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const names = new Map<string, string>();
    const buyPrices = new Map<string, bigint | null>();
    for (const p of [...products, ...variants]) {
      names.set(p.id, p.name);
      buyPrices.set(p.id, p.buyPrice);
    }
    const storeNames = new Map(stores.map((s) => [s.id, s.name]));

    const inputs = assembleSignalInputs({
      stocks,
      sales,
      lastSaleAt,
      firstInflowAt,
      buyPrices,
      names,
      storeNames,
      windowDays,
    });

    const rows = inputs.flatMap((i) => stockSignalsFor(i, thresholds, now));
    const board = buildStockSignalBoard(rows);

    return {
      thresholds,
      windowDays,
      generatedAt: now.toISOString(),
      /** Qoldiq jadvali kesildimi — «hammasi ko'rildi» degan yolg'on bo'lmasin. */
      truncated,
      scannedStockRows: stocks.length,
      signals: Object.fromEntries(
        Object.entries(board.signals).map(([kind, group]) => [
          kind,
          {
            totalMinor: group.totalMinor.toString(),
            measuredCount: group.measuredCount,
            unmeasuredCount: group.unmeasuredCount,
            rowCount: group.rows.length,
            /** Ko'rsatilgan qatorlar soni chegaralangan; sanoq to'liq. */
            rows: group.rows.slice(0, limit).map(serializeSignalRow),
          },
        ]),
      ),
    };
  }

  /**
   * Narx o'zgarishi tarixi + chegara nazorati.
   *
   * **BLOKLAMAYDI** — bu endpoint hech qanday yozuv qilmaydi va hech
   * qanday amalni to'xtatmaydi; u faqat «kim, qachon, qancha o'zgartirdi»
   * va «qaysilari menejer ko'rigiga tushadi» degan ro'yxatni beradi.
   *
   * ⚠️ Ma'lum kamchilik: `ProductService.bulkUpdate` («Массовое
   * редактирование») audit YOZMAYDI — ommaviy tahrirda o'zgargan narx bu
   * tarixga TUSHMAYDI. Auditni bulk yo'lga qo'shish alohida ish
   * (`product` moduli), MK11 qamrovidan tashqarida.
   */
  async priceChanges(accountId: string, query: PriceChangeQuery = {}) {
    const days = clampInt(query.days, DEFAULT_PRICE_DAYS, 1, 365);
    const thresholdPercent = clampNumber(
      query.thresholdPercent,
      DEFAULT_PRICE_THRESHOLD_PERCENT,
      0,
      1000,
    );
    const limit = clampInt(query.limit, DEFAULT_GROUP_LIMIT, 1, 500);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const logs = await this.prisma.client.auditLog.findMany({
      where: {
        accountId,
        entity: 'Product',
        action: 'update',
        at: { gte: since },
        ...(query.productId ? { entityId: query.productId } : {}),
      },
      orderBy: { at: 'desc' },
      take: PRICE_AUDIT_CAP + 1,
      select: {
        id: true,
        entityId: true,
        userId: true,
        at: true,
        fieldChanges: true,
        user: { select: { name: true } },
      },
    });

    const truncated = logs.length > PRICE_AUDIT_CAP;
    const rows: PriceAuditRow[] = logs.slice(0, PRICE_AUDIT_CAP).map((l) => ({
      id: l.id,
      entityId: l.entityId,
      userId: l.userId,
      userName: l.user?.name ?? null,
      at: l.at,
      fieldChanges: l.fieldChanges,
    }));

    const productIds = [...new Set(rows.map((r) => r.entityId))];
    const products = productIds.length
      ? await this.prisma.client.product.findMany({
          where: { accountId, id: { in: productIds } },
          select: { id: true, name: true },
        })
      : [];
    const names: Record<string, string | null> = {};
    for (const p of products) names[p.id] = p.name;

    const changes = extractPriceChanges(rows, names);
    const reviews = reviewPriceChanges(changes, { thresholdPercent });
    const queued = reviews.filter((r) => r.workItem != null);

    return {
      thresholdPercent,
      days,
      truncated,
      /** Nazorat hech qachon bloklamaydi — mijoz shuni ko'rsatishi uchun. */
      blocking: false,
      totalCount: reviews.length,
      queuedCount: queued.length,
      changes: reviews.slice(0, limit).map(serializeReview),
      /** MK06 navbat dvigateliga tayyor elementlar (hali saqlanmaydi). */
      workItems: queued.slice(0, limit).map((r) => ({
        ...r.workItem,
        amountMinor: r.workItem?.amountMinor?.toString() ?? null,
        at: r.workItem?.at.toISOString(),
        context: {
          ...r.workItem?.context,
          beforeMinor: r.workItem?.context.beforeMinor?.toString() ?? null,
          afterMinor: r.workItem?.context.afterMinor.toString(),
        },
      })),
    };
  }
}

function serializeSignalRow(row: StockSignalRow) {
  return {
    ...row,
    // NULL ayni NULL bo'lib qoladi — `?? '0'` bu yerda TAQIQ.
    amountMinor: row.amountMinor?.toString() ?? null,
  };
}

function serializeReview(r: ReturnType<typeof reviewPriceChanges>[number]) {
  return {
    auditId: r.auditId,
    productId: r.productId,
    productName: r.productName,
    field: r.field,
    priceTypeId: r.priceTypeId,
    beforeMinor: r.beforeMinor?.toString() ?? null,
    afterMinor: r.afterMinor.toString(),
    deltaMinor: r.deltaMinor?.toString() ?? null,
    deltaPercent: r.deltaPercent,
    unmeasuredReason: r.unmeasuredReason,
    currencyCode: r.currencyCode,
    changedById: r.changedById,
    changedByName: r.changedByName,
    at: r.at.toISOString(),
    exceedsThreshold: r.exceedsThreshold,
    blocks: r.blocks,
    dedupKey: r.workItem?.dedupKey ?? null,
  };
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function clampNumber(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
