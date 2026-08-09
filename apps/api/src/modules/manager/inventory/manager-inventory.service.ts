import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  type SalePricesJson,
  resolveBasePriceMinor,
  resolveWholesaleMinor,
} from '../../retail-sale/price-snapshot.js';
import { computePerUnitCost, parseDecimalScaled } from '../../shared/decimal.js';
import {
  DEFAULT_PRICE_THRESHOLD_PERCENT,
  type PriceAuditRow,
  extractPriceChanges,
  reviewPriceChanges,
} from './price-change-control.js';
import {
  DEFAULT_PRICE_ERROR_THRESHOLDS,
  type PriceErrorDocType,
  type PriceErrorReview,
  type PriceErrorThresholds,
  type SoldLineInput,
  reviewSoldLinePrices,
  summarizePriceErrors,
} from './price-error-control.js';
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
/** Bir so'rovda ko'riladigan maksimal sotuv qatori (har hujjat turi uchun). */
export const SOLD_LINE_CAP = 2000;

/**
 * Haqiqiy sotuv sanaladigan chek holatlari. `refunded` ham KIRADI: to'liq
 * qaytarilgan chek shu holatga o'tadi, lekin narxi o'sha kuni yozilgan va xato
 * bo'lsa xato bo'lib qolgan. `refundedFromId: null` — oyna cheklarni chiqaradi,
 * aks holda bitta xato narx ikki marta ko'rinardi (repo bo'ylab bir xil naqsh:
 * `retail-sale.service.ts` sotuv jamini shunday sanaydi).
 */
export const SOLD_RETAIL_STATES = ['posted', 'refunded'] as const;

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

export interface PriceErrorQuery {
  days?: number;
  decimalTolerancePercent?: number;
  outlierPercent?: number;
  minAverageSample?: number;
  /** Faqat shu hujjat turi. Berilmasa — ikkalasi. */
  docType?: PriceErrorDocType;
  productId?: string;
  limit?: number;
}

// ───────────────────────────────────────────────────────────────────────────
// MK18 — xato narx: DB shakllarini sof modul kirishiga aylantirish
// ───────────────────────────────────────────────────────────────────────────

/** Bitta sotuv qatorining DB'dan o'qilgan xom shakli. */
export interface SoldLineRowShape {
  docType: PriceErrorDocType;
  docId: string;
  docName: string | null;
  lineId: string;
  assortmentKind: 'product' | 'variant';
  /** Sotilgan birlik id'si (tovar yoki modifikatsiya). Xizmat qatorida `null`. */
  assortmentId: string | null;
  assortmentName: string | null;
  quantity: string;
  priceMinor: bigint;
  discountPercent: number;
  /** Qatorga MUZLATILGAN tan narx. */
  costMinor: bigint | null;
  /**
   * Qatorga MUZLATILGAN karta narxi — faqat chekda bor (`basePriceMinor`).
   * Yuk xatida yo'q, u yerda kartaning BUGUNGI narxi ishlatiladi.
   */
  frozenBaseMinor: bigint | null;
  soldById: string | null;
  soldByName: string | null;
  at: Date;
}

/** Tovar/modifikatsiya kartasidan olingan mo'ljallar. */
export interface CardPrices {
  baseMinor: bigint | null;
  wholesaleMinor: bigint | null;
}

/** `product:<id>` / `variant:<id>` — ikki jadval, bitta kalit fazosi. */
export const cardKeyOf = (kind: 'product' | 'variant', id: string) => `${kind}:${id}`;

/**
 * Xom qatorlarni hukm kirishiga aylantiradi va **o'rtacha narx**ni shu
 * to'plamning o'zidan hisoblaydi.
 *
 * O'rtacha — **leave-one-out**: qator o'z o'rtachasiga qo'shilmaydi. Aks holda
 * 3 ta sotuvli tovarda bitta 10× xato o'rtachani o'zi ko'tarib, keyin o'sha
 * o'rtachaga nisbatan «normal» bo'lib chiqardi — detektor o'zini o'zi ko'r
 * qilardi.
 *
 * Nol/manfiy narxli qatorlar o'rtacha havzasiga KIRMAYDI: xato qiymat
 * mo'ljalni buzmasligi kerak.
 */
export function assembleSoldLines(
  rows: ReadonlyArray<SoldLineRowShape>,
  cards: ReadonlyMap<string, CardPrices>,
): SoldLineInput[] {
  const pool = new Map<string, { sum: bigint; count: number }>();
  for (const r of rows) {
    if (r.assortmentId == null || r.priceMinor <= 0n) continue;
    const key = cardKeyOf(r.assortmentKind, r.assortmentId);
    const acc = pool.get(key) ?? { sum: 0n, count: 0 };
    acc.sum += r.priceMinor;
    acc.count += 1;
    pool.set(key, acc);
  }

  return rows.map((r) => {
    const key = r.assortmentId == null ? null : cardKeyOf(r.assortmentKind, r.assortmentId);
    const card = key ? cards.get(key) : undefined;
    const agg = key ? pool.get(key) : undefined;

    // Qatorning o'zi havzada bo'lsa — uni chiqarib tashlaymiz.
    const inPool = r.assortmentId != null && r.priceMinor > 0n;
    const count = (agg?.count ?? 0) - (inPool ? 1 : 0);
    const sum = (agg?.sum ?? 0n) - (inPool ? r.priceMinor : 0n);

    return {
      docType: r.docType,
      docId: r.docId,
      docName: r.docName,
      lineId: r.lineId,
      productId: r.assortmentId,
      productName: r.assortmentName,
      quantity: r.quantity,
      priceMinor: r.priceMinor,
      discountPercent: r.discountPercent,
      costMinor: r.costMinor,
      wholesaleMinor: card?.wholesaleMinor ?? null,
      // Muzlatilgan narx USTUN: u aynan sotuv ondagi karta narxi. Kartaning
      // bugungi narxi o'tgan oydagi chekni qayta baholab, o'sha paytda
      // to'g'ri bo'lgan narxni «xato» qilib ko'rsatishi mumkin.
      referenceMinor: r.frozenBaseMinor ?? card?.baseMinor ?? null,
      averageMinor: count > 0 ? sum / BigInt(count) : null,
      averageSampleCount: Math.max(0, count),
      soldById: r.soldById,
      soldByName: r.soldByName,
      at: r.at,
    };
  });
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

  /**
   * MK18 — **xato narx nazorati**. Sotilgan qatorlarni ko'rib chiqadi va
   * mantiqsiz narx qiymatlarini belgilaydi.
   *
   * **BLOKLAMAYDI va HECH NARSA YOZMAYDI** — faqat o'qish (TZ §5.1).
   *
   * Qoidalar bu yerda emas — `price-error-control.ts` da (32 test). Bu yerda
   * faqat Prisma o'qishlari va mo'ljallarni yechish.
   *
   * ⚠️ **Ma'lum cheklovlar (jimgina emas — javobda ham qaytariladi):**
   * 1. **Yuk xatida mo'ljal — kartaning BUGUNGI narxi.** Chekda karta narxi
   *    qatorga muzlatilgan (`basePriceMinor`), yuk xatida esa muzlatilmaydi.
   *    Shuning uchun uzoq oyna yuk xatilari uchun ishonchsiz — default 30 kun.
   * 2. **Optom po'li — kartaning bugungi narx turi.** POS bilan bir xil
   *    qoida ishlatiladi (default bo'lmagan birinchi narx turi), aks holda
   *    kassirga bir pol ko'rsatilib, menejerga boshqasi hisoblanardi.
   * 3. Chek/xat **bekor qilingan** bo'lsa hisobga olinmaydi.
   */
  async priceErrors(accountId: string, query: PriceErrorQuery = {}) {
    const days = clampInt(query.days, DEFAULT_PRICE_DAYS, 1, 365);
    const thresholds: PriceErrorThresholds = {
      decimalTolerancePercent: clampNumber(
        query.decimalTolerancePercent,
        DEFAULT_PRICE_ERROR_THRESHOLDS.decimalTolerancePercent,
        0,
        50,
      ),
      outlierPercent: clampNumber(
        query.outlierPercent,
        DEFAULT_PRICE_ERROR_THRESHOLDS.outlierPercent,
        1,
        1000,
      ),
      minAverageSample: clampInt(
        query.minAverageSample,
        DEFAULT_PRICE_ERROR_THRESHOLDS.minAverageSample,
        1,
        100,
      ),
    };
    const limit = clampInt(query.limit, DEFAULT_GROUP_LIMIT, 1, 500);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const wantRetail = query.docType == null || query.docType === 'retailsale';
    const wantDemand = query.docType == null || query.docType === 'demand';

    const [retailRows, demandRows] = await Promise.all([
      wantRetail
        ? this.prisma.client.retailSalePosition.findMany({
            where: {
              accountId,
              ...(query.productId ? { productId: query.productId } : {}),
              retailSale: {
                state: { in: [...SOLD_RETAIL_STATES] },
                refundedFromId: null,
                moment: { gte: since },
              },
            },
            orderBy: { retailSale: { moment: 'desc' } },
            take: SOLD_LINE_CAP + 1,
            select: {
              id: true,
              productId: true,
              quantity: true,
              priceMinor: true,
              discount: true,
              costMinor: true,
              basePriceMinor: true,
              product: { select: { name: true } },
              retailSale: {
                select: {
                  id: true,
                  name: true,
                  moment: true,
                  ownerId: true,
                  owner: { select: { name: true } },
                },
              },
            },
          })
        : Promise.resolve([]),
      wantDemand
        ? this.prisma.client.demandPosition.findMany({
            where: {
              accountId,
              ...(query.productId ? { assortmentId: query.productId } : {}),
              demand: { state: 'posted', deletedAt: null, moment: { gte: since } },
            },
            orderBy: { demand: { moment: 'desc' } },
            take: SOLD_LINE_CAP + 1,
            select: {
              id: true,
              assortmentKind: true,
              assortmentId: true,
              quantity: true,
              priceMinor: true,
              discount: true,
              costMinor: true,
              product: { select: { name: true } },
              demand: {
                select: {
                  id: true,
                  name: true,
                  moment: true,
                  ownerId: true,
                  owner: { select: { name: true } },
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const truncated = retailRows.length > SOLD_LINE_CAP || demandRows.length > SOLD_LINE_CAP;

    const rows: SoldLineRowShape[] = [
      ...retailRows.slice(0, SOLD_LINE_CAP).map((p) => ({
        docType: 'retailsale' as const,
        docId: p.retailSale.id,
        docName: p.retailSale.name,
        lineId: p.id,
        assortmentKind: 'product' as const,
        assortmentId: p.productId,
        assortmentName: p.product?.name ?? null,
        quantity: p.quantity.toString(),
        priceMinor: p.priceMinor,
        discountPercent: Number(p.discount),
        costMinor: p.costMinor,
        frozenBaseMinor: p.basePriceMinor,
        soldById: p.retailSale.ownerId,
        soldByName: p.retailSale.owner?.name ?? null,
        at: p.retailSale.moment,
      })),
      ...demandRows.slice(0, SOLD_LINE_CAP).map((p) => ({
        docType: 'demand' as const,
        docId: p.demand.id,
        docName: p.demand.name,
        lineId: p.id,
        assortmentKind: (p.assortmentKind === 'variant' ? 'variant' : 'product') as
          | 'product'
          | 'variant',
        assortmentId: p.assortmentId,
        assortmentName: p.product?.name ?? null,
        quantity: p.quantity.toString(),
        priceMinor: p.priceMinor,
        discountPercent: Number(p.discount),
        costMinor: p.costMinor,
        // Yuk xatida muzlatilgan karta narxi YO'Q — kartadan olinadi.
        frozenBaseMinor: null,
        soldById: p.demand.ownerId,
        soldByName: p.demand.owner?.name ?? null,
        at: p.demand.moment,
      })),
    ];

    const cards = await this.loadCardPrices(accountId, rows);
    const reviews = reviewSoldLinePrices(assembleSoldLines(rows, cards), thresholds);
    const flagged = reviews.filter((r) => r.findings.length > 0);
    const summary = summarizePriceErrors(reviews);

    return {
      thresholds,
      days,
      truncated,
      scannedLineCount: rows.length,
      /** Nazorat hech qachon bloklamaydi — mijoz shuni ko'rsatishi uchun. */
      blocking: false,
      ...summary,
      // Eng og'iri tepada: menejer ro'yxatni yuqoridan pastga o'qiydi.
      rows: flagged
        .slice()
        .sort((a, b) => weightOf(b) - weightOf(a) || b.at.getTime() - a.at.getTime())
        .slice(0, limit)
        .map(serializePriceError),
      /** MK06 navbat dvigateliga tayyor elementlar (hali saqlanmaydi). */
      workItems: flagged.slice(0, limit).map((r) => ({
        dedupKey: r.workItem?.dedupKey ?? null,
        ruleType: r.workItem?.ruleType ?? null,
        subjectEmployeeId: r.workItem?.subjectEmployeeId ?? null,
        docType: r.docType,
        docId: r.docId,
        amountMinor: r.workItem?.amountMinor?.toString() ?? null,
        at: r.at.toISOString(),
        kinds: r.findings.map((f) => f.kind),
      })),
    };
  }

  /**
   * Sotilgan birliklarning karta narxlari (ro'yxat narxi + optom pol).
   *
   * Narx turlarini yechish **POS bilan bir xil**: default = `isDefault`, aks
   * holda birinchi pozitsiya; optom = default BO'LMAGAN birinchi narx turi
   * (`retail-sale.service.ts → loadFrozenPrices`). Ikki joyda ikki xil bo'lsa,
   * kassirga bir pol ko'rsatilib, menejerga boshqasi hisoblanardi.
   */
  private async loadCardPrices(
    accountId: string,
    rows: ReadonlyArray<SoldLineRowShape>,
  ): Promise<Map<string, CardPrices>> {
    const productIds = new Set<string>();
    const variantIds = new Set<string>();
    for (const r of rows) {
      if (r.assortmentId == null) continue;
      if (r.assortmentKind === 'variant') variantIds.add(r.assortmentId);
      else productIds.add(r.assortmentId);
    }
    if (productIds.size === 0 && variantIds.size === 0) return new Map();

    const [products, variants, priceTypes] = await Promise.all([
      productIds.size
        ? this.prisma.client.product.findMany({
            where: { accountId, id: { in: [...productIds] } },
            select: { id: true, salePrices: true },
          })
        : Promise.resolve([]),
      variantIds.size
        ? this.prisma.client.variant.findMany({
            where: { accountId, id: { in: [...variantIds] } },
            select: { id: true, salePrices: true },
          })
        : Promise.resolve([]),
      this.prisma.client.priceType.findMany({
        where: { accountId, archived: false },
        orderBy: { position: 'asc' },
        select: { id: true, isDefault: true },
      }),
    ]);

    const defaultTypeId = priceTypes.find((t) => t.isDefault)?.id ?? priceTypes[0]?.id ?? null;
    const wholesaleTypeId = priceTypes.find((t) => t.id !== defaultTypeId)?.id ?? null;

    const out = new Map<string, CardPrices>();
    for (const [kind, list] of [
      ['product', products],
      ['variant', variants],
    ] as const) {
      for (const row of list) {
        const salePrices = row.salePrices as SalePricesJson;
        out.set(cardKeyOf(kind, row.id), {
          baseMinor: resolveBasePriceMinor(salePrices, defaultTypeId),
          wholesaleMinor: resolveWholesaleMinor(salePrices, wholesaleTypeId),
        });
      }
    }
    return out;
  }
}

/** Saralash og'irligi — pul ta'siri bo'lmagan belgilar ham ro'yxatdan tushmasin. */
function weightOf(r: PriceErrorReview): number {
  const amount = r.workItem?.amountMinor;
  return amount == null ? 0 : Number(amount < 0n ? -amount : amount);
}

function serializePriceError(r: PriceErrorReview) {
  return {
    docType: r.docType,
    docId: r.docId,
    docName: r.docName,
    lineId: r.lineId,
    productId: r.productId,
    productName: r.productName,
    quantity: r.quantity,
    priceMinor: r.priceMinor.toString(),
    discountPercent: r.discountPercent,
    // NULL ayni NULL bo'lib qoladi — `?? '0'` bu yerda TAQIQ.
    costMinor: r.costMinor?.toString() ?? null,
    wholesaleMinor: r.wholesaleMinor?.toString() ?? null,
    referenceMinor: r.referenceMinor?.toString() ?? null,
    averageMinor: r.averageMinor?.toString() ?? null,
    /** Mo'ljal muzlatilganmi (chek) yoki bugungi kartadanmi (yuk xati). */
    referenceSource: r.docType === 'retailsale' ? 'frozen' : 'card',
    soldById: r.soldById,
    soldByName: r.soldByName,
    at: r.at.toISOString(),
    blocks: r.blocks,
    unchecked: r.unchecked,
    findings: r.findings.map((f) => ({
      kind: f.kind,
      expectedMinor: f.expectedMinor?.toString() ?? null,
      amountMinor: f.amountMinor?.toString() ?? null,
      factor: f.factor,
      deviationPercent: f.deviationPercent,
    })),
  };
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
