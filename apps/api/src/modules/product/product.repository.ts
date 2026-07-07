import { Prisma } from '@moysklad/db';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import {
  StockInTransitService,
  inTransitAssortmentKey,
} from '../stock/stock-in-transit.service.js';
import { type BulkPriceSpec, computeBulkPrice } from './bulk-price.util.js';
import type { CreateProductInput, ProductFilter, UpdateProductInput } from './product.schema.js';

/** «Изменить цены» per-product spec — the engine inputs plus the target/base ids. */
export type SetPricesSpec = BulkPriceSpec & {
  targetPriceTypeId: string;
  basePriceTypeId?: string | null;
  /** «Изменить валюты» — store under this currency; omit = keep existing/UZS. */
  currencyCode?: string | null;
};

/** «Массовое редактирование» patch — only provided keys are written; null clears. */
export type BulkUpdatePatch = {
  archived?: boolean;
  productFolderId?: string | null;
  country?: string | null;
  uom?: string | null;
  weightG?: number | null;
  volumeML?: number | null;
  vat?: number | null;
  minimumBalanceMinor?: bigint | null;
  supplierId?: string | null;
  mxikCode?: string | null;
  tasnifCode?: string | null;
  tasnifBarcode?: string | null;
  weighed?: boolean;
  trackingType?: string | null;
  discountProhibited?: boolean;
  ownerId?: string | null;
  groupId?: string | null;
  shared?: boolean;
};

/** Zero rollup for the empty page / no-ledger-rows case (whole-unit strings). */
const ZERO_STOCK = { onHand: '0', reserved: '0', inTransit: '0', available: '0' } as const;

@Injectable()
export class ProductRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StockInTransitService) private readonly inTransit: StockInTransitService,
  ) {}

  /** List with filters, keyset pagination. */
  async list(accountId: string, filter: ProductFilter) {
    // «Когда изменен» — half-open day range over updatedAt (the `To` bound
    // covers the whole chosen day; mirrors the cash-in gold-standard).
    const updatedRange =
      filter.updatedFrom || filter.updatedTo
        ? {
            updatedAt: tashkentRangeBounds(filter.updatedFrom, filter.updatedTo),
          }
        : {};

    // «Группа товаров» (с подгруппами): match the folder + all descendants. The
    // pathName is hierarchical with a `/` separator (parent.pathName + '/' + name,
    // see product-folder.service computePathName), so the subtree = self.id OR any
    // folder whose pathName starts with `${self.pathName}/`. Resolve the folder's
    // pathName once; fall back to the exact folder if it has no pathName.
    let deepFolder: Prisma.ProductWhereInput = {};
    if (filter.productFolderIdDeep) {
      const folder = await this.prisma.client.productFolder.findFirst({
        where: { id: filter.productFolderIdDeep, accountId },
        select: { pathName: true },
      });
      deepFolder = folder?.pathName
        ? {
            productFolder: {
              OR: [
                { id: filter.productFolderIdDeep },
                { pathName: { startsWith: `${folder.pathName}/` } },
              ],
            },
          }
        : { productFolderId: filter.productFolderIdDeep };
    }

    const where: Prisma.ProductWhereInput = {
      accountId,
      deletedAt: null,
      archived: filter.archived,
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.productFolderId !== undefined ? { productFolderId: filter.productFolderId } : {}),
      ...deepFolder,
      ...(filter.trackingType ? { trackingType: filter.trackingType } : {}),
      // «Владелец-сотрудник» / «Владелец-отдел» — multi-select: match ANY of the
      // chosen ids (moysklad checkbox-dropdown parity). Schema yields a string[].
      ...(filter.ownerId?.length ? { ownerId: { in: filter.ownerId } } : {}),
      // «Кто изменил» — last-modifier equality (mirrors PurchaseOrder.modifiedById).
      ...(filter.modifiedById ? { modifiedById: filter.modifiedById } : {}),
      ...(filter.groupId?.length ? { groupId: { in: filter.groupId } } : {}),
      // «Поставщик» multi-select (moysklad checkbox-dropdown parity) — IN over the
      // chosen counterparty ids. Schema (uuidCsv) yields a string[].
      ...(filter.supplierId?.length ? { supplierId: { in: filter.supplierId } } : {}),
      // ISO2 country-of-origin equality. Schema normalises to upper case.
      ...(filter.country ? { country: filter.country } : {}),
      // moysklad-parity discrete Фильтр fields (see ProductFilterSchema).
      ...(filter.name ? { name: { contains: filter.name, mode: 'insensitive' } } : {}),
      ...(filter.article ? { article: { contains: filter.article, mode: 'insensitive' } } : {}),
      ...(filter.code ? { code: { contains: filter.code, mode: 'insensitive' } } : {}),
      ...(filter.externalCode
        ? { externalCode: { contains: filter.externalCode, mode: 'insensitive' } }
        : {}),
      ...(filter.description
        ? { description: { contains: filter.description, mode: 'insensitive' } }
        : {}),
      ...(filter.mxikCode ? { mxikCode: { contains: filter.mxikCode } } : {}),
      // «Код упаковки ТАСНИФ» — has a pack with this TASNIF code.
      ...(filter.packTasnifCode
        ? {
            packs: {
              some: { tasnifCode: { contains: filter.packTasnifCode, mode: 'insensitive' } },
            },
          }
        : {}),
      // Barcodes are exact tokens stored in the String[] column → `has`.
      ...(filter.barcode ? { barcodes: { has: filter.barcode } } : {}),
      ...(filter.weighed !== undefined ? { weighed: filter.weighed } : {}),
      ...(filter.shared !== undefined ? { shared: filter.shared } : {}),
      ...(filter.locSklad != null ? { locSklad: filter.locSklad } : {}),
      ...updatedRange,
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { code: { contains: filter.search, mode: 'insensitive' } },
              { article: { contains: filter.search, mode: 'insensitive' } },
              { externalCode: { contains: filter.search, mode: 'insensitive' } },
              { barcodes: { has: filter.search } },
            ],
          }
        : {}),
      // «Характеристики» (moysklad Фильтр): for each chosen characteristic the product
      // must have a VARIANT whose `characteristics` JSON contains {name, value} for one
      // of the picked values — AND across names, OR within a name's values.
      ...(filter.charFilter
        ? {
            AND: Object.entries(filter.charFilter).map(([name, values]) => ({
              variants: {
                some: {
                  OR: values.map((value) => ({
                    characteristics: { array_contains: [{ name, value }] },
                  })),
                },
              },
            })),
          }
        : {}),
    };

    // Re-order suggestion view (tri-state «Ниже минимума»). Compares each
    // product's LIVE on-hand stock — summed across every store from the
    // maintained Stock ledger — against its re-order threshold. Both sides are
    // in the same ×1000 milliunit scale: Stock.qty is in whole units (so
    // qty × 1000), and the product form stores minimumBalanceMinor as the
    // user's units × 1000. minimum_balance_minor must be > 0 (0 = disabled).
    //   belowMinimum === true  → stock < minimum   (re-order suggestions)
    //   belowMinimum === false → stock ≥ minimum   (sufficiently stocked)
    //
    // NB: this never used the denormalised `Product.stock_minor` column — it was
    // never wired to the ledger (permanently its DEFAULT 0) and was DROPPED
    // 2026-06-12. The old `stock_minor < minimum_balance_minor` query reported
    // every product with a minimum set as "below minimum" regardless of real stock,
    // and the falsy `if (filter.belowMinimum)` guard silently dropped the
    // `false` branch (so «Достаточно» returned everything). We aggregate
    // `Stock` live instead — always correct, no denormalisation drift. Prisma
    // can't express a cross-table aggregate comparison in WhereInput, so we
    // resolve the matching IDs in raw SQL and intersect them via where.id.
    // ── Stock-based filters (moysklad «Выбор товара» Фильтр + «Ниже минимума») ──
    // Prisma can't express cross-table aggregate comparisons in WhereInput, so each
    // stock-based predicate resolves a matching-id Set (raw SQL over the live Stock
    // ledger for the on-hand sign / re-order view, or the Stock groupBy + the
    // in-transit service for the «Доступно»/«Резерв»/«Ожидание» predicates that need
    // the expected-incoming component) and we intersect them into where.id (AND).
    const idSets: Set<string>[] = [];

    // «Ниже минимума» — tri-state vs minimum_balance_minor (×1000 milliunit scale).
    if (filter.belowMinimum !== undefined) {
      const cmp = filter.belowMinimum
        ? Prisma.sql`COALESCE(s.total_qty, 0) * 1000 < p.minimum_balance_minor`
        : Prisma.sql`COALESCE(s.total_qty, 0) * 1000 >= p.minimum_balance_minor`;
      const matched = await this.prisma.client.$queryRaw<{ id: string }[]>`
        SELECT p.id
        FROM products p
        LEFT JOIN (
          SELECT assortment_id, SUM(qty) AS total_qty
          FROM stocks
          WHERE account_id = ${accountId}::uuid
          GROUP BY assortment_id
        ) s ON s.assortment_id = p.id
        WHERE p.account_id = ${accountId}::uuid
          AND p.deleted_at IS NULL
          AND p.minimum_balance_minor > 0
          AND ${cmp}
      `;
      idSets.push(new Set(matched.map((r) => r.id)));
    }

    // «Остаток» (on-hand sign) — the LEFT JOIN + COALESCE makes the «zero» case
    // correctly include products that have no Stock rows at all (on-hand = 0).
    if (filter.stockFilter && filter.stockFilter !== 'any') {
      const oh = Prisma.sql`COALESCE(s.total_qty, 0)`;
      const cmp =
        filter.stockFilter === 'positive'
          ? Prisma.sql`${oh} > 0`
          : filter.stockFilter === 'negative'
            ? Prisma.sql`${oh} < 0`
            : filter.stockFilter === 'zero'
              ? Prisma.sql`${oh} = 0`
              : Prisma.sql`${oh} <> 0`;
      const matched = await this.prisma.client.$queryRaw<{ id: string }[]>`
        SELECT p.id
        FROM products p
        LEFT JOIN (
          SELECT assortment_id, SUM(qty) AS total_qty
          FROM stocks
          WHERE account_id = ${accountId}::uuid
          GROUP BY assortment_id
        ) s ON s.assortment_id = p.id
        WHERE p.account_id = ${accountId}::uuid
          AND p.deleted_at IS NULL
          AND ${cmp}
      `;
      idSets.push(new Set(matched.map((r) => r.id)));
    }

    // «Доступно» / «Только с резервом» / «Только с ожиданием» — need the in-transit
    // (expected-incoming) component, so resolve in JS over the Stock groupBy + the
    // in-transit map. «Доступно» here matches the DISPLAY column exactly:
    // available = Σqty − Σreserved + in-transit. None of these options is «zero»,
    // and reserve/incoming are strictly > 0, so a product with no data never
    // qualifies → iterating the stock-rows ∪ in-transit-keys is complete.
    const needsAggJs =
      (filter.availableFilter && filter.availableFilter !== 'any') ||
      filter.hasReserve === true ||
      filter.hasIncoming === true;
    if (needsAggJs) {
      const [agg, inTransitMap] = await Promise.all([
        this.prisma.client.stock.groupBy({
          by: ['assortmentId'],
          where: { accountId, assortmentKind: 'product' },
          _sum: { qty: true, reservedQty: true },
        }),
        this.inTransit.getInTransitByAssortment(accountId),
      ]);
      const zero = new Prisma.Decimal(0);
      const cand = new Map<
        string,
        { onHand: Prisma.Decimal; reserved: Prisma.Decimal; inTransit: Prisma.Decimal }
      >();
      for (const g of agg) {
        cand.set(g.assortmentId, {
          onHand: g._sum.qty ?? zero,
          reserved: g._sum.reservedQty ?? zero,
          inTransit: zero,
        });
      }
      // in-transit map keys are `${kind}|${id}` (inTransitAssortmentKey) — products only.
      for (const [key, qty] of inTransitMap) {
        if (!key.startsWith('product|')) continue;
        const id = key.slice('product|'.length);
        const e = cand.get(id) ?? { onHand: zero, reserved: zero, inTransit: zero };
        e.inTransit = qty;
        cand.set(id, e);
      }
      if (filter.hasReserve === true) {
        const s = new Set<string>();
        for (const [id, e] of cand) if (e.reserved.gt(0)) s.add(id);
        idSets.push(s);
      }
      if (filter.hasIncoming === true) {
        const s = new Set<string>();
        for (const [id, e] of cand) if (e.inTransit.gt(0)) s.add(id);
        idSets.push(s);
      }
      if (filter.availableFilter && filter.availableFilter !== 'any') {
        const s = new Set<string>();
        for (const [id, e] of cand) {
          const avail = e.onHand.minus(e.reserved).plus(e.inTransit);
          const ok =
            filter.availableFilter === 'positive'
              ? avail.gt(0)
              : filter.availableFilter === 'negative'
                ? avail.lt(0)
                : !avail.isZero();
          if (ok) s.add(id);
        }
        idSets.push(s);
      }
    }

    // Intersect every active stock-filter id-set into where.id (AND semantics).
    if (idSets.length > 0) {
      let inter = idSets[0] ?? new Set<string>();
      for (let i = 1; i < idSets.length; i++) {
        const next = idSets[i];
        if (!next) continue;
        inter = new Set([...inter].filter((id) => next.has(id)));
      }
      where.id = { in: [...inter] };
    }

    // 0-based offset of the requested page (offset mode); undefined → cursor mode.
    const offset = filter.page != null ? (filter.page - 1) * filter.limit : undefined;
    const rows = await this.prisma.client.product.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      // Offset («page») pagination when the caller sends `page` (the /products
      // list — moysklad-style jump-to-any-page); otherwise the legacy cursor
      // look-ahead (the «Выбор товара» modal + any other caller, unchanged).
      take: offset != null ? filter.limit : filter.limit + 1,
      ...(offset != null
        ? { skip: offset }
        : filter.cursor
          ? { cursor: { id: filter.cursor }, skip: 1 }
          : {}),
      include: {
        productFolder: { select: { id: true, name: true, pathName: true } },
        owner: { select: { id: true, name: true, email: true } },
        group: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        // «Кто изменил» column — last-modifier display name (id-only is on the scalar).
        modifiedBy: { select: { id: true, name: true } },
        // «Количество модификаций» column — variant count.
        _count: { select: { variants: true } },
        // «Код упаковки ТАСНИф» column — first pack's TASNIF code.
        packs: { select: { tasnifCode: true }, orderBy: { position: 'asc' }, take: 1 },
        // Main image id only (NOT the bytes) — lets the «Выбор товара» modal +
        // any list render a thumbnail via GET /images/:id/raw without shipping
        // the binary in the list payload. Main image first, else lowest position.
        images: {
          orderBy: [{ isMain: 'desc' }, { position: 'asc' }],
          take: 1,
          select: { id: true },
        },
      },
    });

    const total = await this.prisma.client.product.count({ where });
    // Offset («page») mode: the rows ARE the requested page (skip/take already
    // applied), and hasNext derives from the total. Cursor mode keeps the
    // take=limit+1 look-ahead → hasMore + a nextCursor.
    const usePage = offset != null;
    const hasMore = offset != null ? offset + filter.limit < total : rows.length > filter.limit;
    const pageRows = usePage || !hasMore ? rows : rows.slice(0, filter.limit);
    const nextCursor = usePage
      ? undefined
      : hasMore
        ? pageRows[pageRows.length - 1]?.id
        : undefined;

    const withStock = await this.attachStock(accountId, pageRows);
    // Flatten the single-element `images` relation into a `mainImageId` scalar
    // (drop the relation array from the payload to keep the list response clean).
    const items = withStock.map(({ images, packs, _count, ...rest }) => ({
      ...rest,
      mainImageId: images?.[0]?.id ?? null,
      // «Код упаковки ТАСНИф» (first pack) + «Количество модификаций».
      packTasnif: packs?.[0]?.tasnifCode ?? null,
      variantCount: _count?.variants ?? 0,
    }));

    return { items, nextCursor, total };
  }

  /**
   * Attach the per-product «Остаток»/«Резерв»/«Ожидание»/«Доступно» stock
   * cluster to a page of products by aggregating the LIVE Stock ledger across
   * every store — the same maintained materialisation the «Ниже минимума» filter
   * and the stock-balance report read, so the figures are always live-correct
   * with no denormalisation drift. One grouped query per page (≤100 ids, covered
   * by `@@index([accountId, assortmentKind, assortmentId])`) plus one
   * in-transit query; deliberately NOT a denormalised rollup (the old
   * `Product.stock_minor`/`reserve_minor` columns were designed-but-unwired —
   * permanently DEFAULT 0 — and were DROPPED 2026-06-12).
   *
   * Quantities are emitted as Decimal strings in whole product units (NOT the
   * ×1000 milli-scale the re-order threshold uses), matching how moysklad prints
   * the column. Only `assortmentKind = 'product'` rows exist for products;
   * bundles (computed min-of-components) and services (no stock) carry no ledger
   * rows here and surface as 0 — the FE renders «—» for those kinds.
   *
   * «Ожидание» (in-transit / expected-incoming) is derived QUERY-TIME from
   * active supplier-order positions via the shared `StockInTransitService` —
   * the same source the stock-balance report uses; summed across stores to match
   * this list's cross-store Stock aggregate. The (dropped) always-0
   * `Stock.inTransitQty` column is never read.
   *
   * 🔴 «Доступно» = Остаток − Резерв + Ожидание (moysklad's *display* formula —
   * the design doc names this products-list site explicitly, §6/§211). This is
   * the DISPLAY available-to-promise, NOT `StockService.assertAvailable`'s
   * posting-sufficiency check (which stays PHYSICAL `qty − reserved` — you cannot
   * ship goods that have not physically arrived). Do NOT conflate the two.
   */
  private async attachStock<T extends { id: string }>(accountId: string, page: T[]) {
    if (page.length === 0) return page.map((p) => ({ ...p, stock: ZERO_STOCK }));

    const assortmentIds = page.map((p) => p.id);
    const [grouped, inTransitMap] = await Promise.all([
      this.prisma.client.stock.groupBy({
        by: ['assortmentId'],
        where: {
          accountId,
          assortmentKind: 'product',
          assortmentId: { in: assortmentIds },
        },
        _sum: { qty: true, reservedQty: true },
      }),
      // Expected-incoming («Ожидание») summed across stores per product —
      // mirrors this list's cross-store Stock aggregate (no storeId filter).
      this.inTransit.getInTransitByAssortment(accountId, { assortmentIds }),
    ]);

    const byId = new Map(grouped.map((g) => [g.assortmentId, g]));
    return page.map((p) => {
      const g = byId.get(p.id);
      const onHand = g?._sum.qty ?? new Prisma.Decimal(0);
      const reserved = g?._sum.reservedQty ?? new Prisma.Decimal(0);
      const inTransit =
        inTransitMap.get(inTransitAssortmentKey('product', p.id)) ?? new Prisma.Decimal(0);
      return {
        ...p,
        stock: {
          onHand: onHand.toString(),
          reserved: reserved.toString(),
          inTransit: inTransit.toString(),
          // moysklad display «Доступно» = Остаток − Резерв + Ожидание (design §6).
          // NOT the physical posting check (StockService.assertAvailable).
          available: onHand.minus(reserved).plus(inTransit).toString(),
        },
      };
    });
  }

  /**
   * «Характеристики» filter options — every distinct characteristic name and its
   * distinct values across the account's variants. Powers the one-field-per-
   * characteristic dropdowns at the bottom of the products Фильтр panel.
   */
  async characteristicValues(accountId: string): Promise<{ name: string; values: string[] }[]> {
    const rows = await this.prisma.client.variant.findMany({
      where: { accountId, archived: false },
      select: { characteristics: true },
    });
    const map = new Map<string, Set<string>>();
    for (const r of rows) {
      const chars = (r.characteristics as { name?: string; value?: string }[] | null) ?? [];
      for (const c of chars) {
        if (!c?.name || !c?.value) continue;
        if (!map.has(c.name)) map.set(c.name, new Set());
        map.get(c.name)?.add(c.value);
      }
    }
    return [...map.entries()]
      .map(([name, vals]) => ({ name, values: [...vals].sort((a, b) => a.localeCompare(b, 'ru')) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  async findById(accountId: string, id: string) {
    return this.prisma.client.product.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        productFolder: { select: { id: true, name: true, pathName: true } },
        owner: { select: { id: true, name: true, email: true } },
        group: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        packs: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
        // Multi-bin: additional shelf locations beyond the primary loc* home.
        extraLocations: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
      },
    });
  }

  /** Multi-bin: list a product's ADDITIONAL shelf locations (primary loc* aside). */
  async listLocations(accountId: string, productId: string) {
    return this.prisma.client.productLocation.findMany({
      where: { accountId, productId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Replace-all a product's additional locations in one transaction: wipe the
   * old set, insert the new. Simple + idempotent — the card always sends the
   * full list. Duplicate identical addresses are rejected by the unique index.
   */
  async setLocations(
    accountId: string,
    productId: string,
    locations: Array<{
      sklad: number;
      polka: number | null;
      qavat: number | null;
      yacheyka: number | null;
      qty: number | null;
      note: string | null;
    }>,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.productLocation.deleteMany({ where: { accountId, productId } });
      if (locations.length > 0) {
        await tx.productLocation.createMany({
          data: locations.map((l, i) => ({
            accountId,
            productId,
            sklad: l.sklad,
            polka: l.polka,
            qavat: l.qavat,
            yacheyka: l.yacheyka,
            qty: l.qty,
            note: l.note,
            position: i,
          })),
        });
      }
      return tx.productLocation.findMany({
        where: { accountId, productId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      });
    });
  }

  async create(accountId: string, actorId: string, input: CreateProductInput) {
    return this.prisma.client.product.create({
      data: {
        accountId,
        // «Владелец» (Доступ) — the create form may pick an owner; default to the
        // request actor when omitted (moysklad's behaviour, and back-compat with
        // every existing form that never sent it). The service has already proven
        // a supplied ownerId belongs to this account.
        ownerId: input.ownerId ?? actorId,
        // «Кто изменил» — on create the actor is always the last modifier,
        // mirroring moysklad (a freshly-created product's modifier is its
        // creator), regardless of which owner was chosen above.
        modifiedById: actorId,
        name: input.name,
        code: input.code,
        externalCode: input.externalCode,
        article: input.article,
        description: input.description,
        country: input.country,
        kind: input.kind,
        productFolderId: input.productFolderId,
        groupId: input.groupId,
        supplierId: input.supplierId,
        minPrice: input.minPrice,
        buyPrice: input.buyPrice,
        buyPriceCurrency: input.buyPriceCurrency,
        minPriceCurrency: input.minPriceCurrency,
        salePrices: input.salePrices as Prisma.InputJsonValue | undefined,
        weightG: input.weightG,
        volumeML: input.volumeML,
        weighed: input.weighed,
        uom: input.uom,
        // Warehouse home location (Sherset custom) — 4 numeric bin segments.
        locSklad: input.locSklad,
        locPolka: input.locPolka,
        locQavat: input.locQavat,
        locYacheyka: input.locYacheyka,
        locQty: input.locQty,
        vat: input.vat ?? null,
        vatEnabled: input.vatEnabled,
        useParentVat: input.useParentVat,
        taxSystem: input.taxSystem,
        paymentItemType: input.paymentItemType,
        mxikCode: input.mxikCode,
        trackingType: input.trackingType,
        gtin: input.gtin,
        partialDisposal: input.partialDisposal,
        isSerialTrackable: input.isSerialTrackable,
        discountProhibited: input.discountProhibited,
        minimumBalanceMinor: input.minimumBalanceMinor,
        shared: input.shared,
        barcodes: input.barcodes,
        barcodeTypes: input.barcodeTypes,
        attributes: input.attributes as Prisma.InputJsonValue | undefined,
        ...(input.packs && input.packs.length > 0
          ? {
              packs: {
                create: input.packs.map((p) => ({
                  accountId,
                  name: p.name,
                  uomCode: p.uomCode,
                  multiplier: p.multiplier,
                  barcode: p.barcode,
                  codeType: p.codeType,
                  tasnifCode: p.tasnifCode,
                  position: p.position,
                })),
              },
            }
          : {}),
      },
    });
  }

  async update(
    accountId: string,
    userId: string,
    id: string,
    input: UpdateProductInput,
    expectedVersion: number,
  ) {
    // «Кто изменил» — every field-edit save re-stamps the last modifier with
    // the request actor. Set via the (checked) relation connect; `userId` is
    // the authenticated employee id (= what already populates ownerId on
    // create), so this connect never misses a row.
    const data: Prisma.ProductUpdateInput = { modifiedBy: { connect: { id: userId } } };
    if (input.name !== undefined) data.name = input.name;
    if (input.code !== undefined) data.code = input.code;
    if (input.externalCode !== undefined) data.externalCode = input.externalCode;
    if (input.article !== undefined) data.article = input.article;
    if (input.description !== undefined) data.description = input.description;
    if (input.kind !== undefined) data.kind = input.kind;
    if (input.country !== undefined) data.country = input.country;
    if (input.productFolderId !== undefined) {
      data.productFolder = input.productFolderId
        ? { connect: { id: input.productFolderId } }
        : { disconnect: true };
    }
    if (input.groupId !== undefined) {
      data.group = input.groupId ? { connect: { id: input.groupId } } : { disconnect: true };
    }
    if (input.supplierId !== undefined) {
      data.supplier = input.supplierId
        ? { connect: { id: input.supplierId } }
        : { disconnect: true };
    }
    // «Владелец» (Доступ) — re-owning a product. The service has proven a
    // non-null ownerId belongs to this account before this connect (a bare
    // connect-by-id is NOT account-scoped, so the guard is what blocks
    // cross-tenant re-owning). null clears it.
    if (input.ownerId !== undefined) {
      data.owner = input.ownerId ? { connect: { id: input.ownerId } } : { disconnect: true };
    }
    if (input.minPrice !== undefined) data.minPrice = input.minPrice;
    if (input.buyPrice !== undefined) data.buyPrice = input.buyPrice;
    if (input.buyPriceCurrency !== undefined) data.buyPriceCurrency = input.buyPriceCurrency;
    if (input.minPriceCurrency !== undefined) data.minPriceCurrency = input.minPriceCurrency;
    if (input.salePrices !== undefined) {
      data.salePrices = input.salePrices as unknown as Prisma.InputJsonValue;
    }
    if (input.weightG !== undefined) data.weightG = input.weightG;
    if (input.volumeML !== undefined) data.volumeML = input.volumeML;
    if (input.weighed !== undefined) data.weighed = input.weighed;
    if (input.uom !== undefined) data.uom = input.uom;
    // Warehouse home location (Sherset custom) — null clears a segment.
    if (input.locSklad !== undefined) data.locSklad = input.locSklad;
    if (input.locPolka !== undefined) data.locPolka = input.locPolka;
    if (input.locQavat !== undefined) data.locQavat = input.locQavat;
    if (input.locYacheyka !== undefined) data.locYacheyka = input.locYacheyka;
    if (input.locQty !== undefined) data.locQty = input.locQty;
    if (input.vat !== undefined) data.vat = input.vat;
    if (input.vatEnabled !== undefined) data.vatEnabled = input.vatEnabled;
    if (input.useParentVat !== undefined) data.useParentVat = input.useParentVat;
    if (input.taxSystem !== undefined) data.taxSystem = input.taxSystem;
    if (input.paymentItemType !== undefined) data.paymentItemType = input.paymentItemType;
    if (input.mxikCode !== undefined) data.mxikCode = input.mxikCode;
    if (input.trackingType !== undefined) data.trackingType = input.trackingType;
    if (input.gtin !== undefined) data.gtin = input.gtin;
    if (input.partialDisposal !== undefined) data.partialDisposal = input.partialDisposal;
    if (input.isSerialTrackable !== undefined) data.isSerialTrackable = input.isSerialTrackable;
    if (input.discountProhibited !== undefined) data.discountProhibited = input.discountProhibited;
    if (input.minimumBalanceMinor !== undefined)
      data.minimumBalanceMinor = input.minimumBalanceMinor;
    if (input.shared !== undefined) data.shared = input.shared;
    if (input.barcodes !== undefined) data.barcodes = input.barcodes;
    if (input.barcodeTypes !== undefined) data.barcodeTypes = input.barcodeTypes;
    if (input.attributes !== undefined) {
      data.attributes = input.attributes as Prisma.InputJsonValue;
    }

    // Optimistic lock + pack replacement run together in one transaction so a
    // version conflict (or any failure) rolls back the pack rewrite too —
    // otherwise a rejected save could still have wiped/rewritten the packs.
    return this.prisma.client.$transaction(async (tx) => {
      // Version-checked, version-incrementing update FIRST so a stale write
      // fails fast (P2025) before any pack mutation. The `version` filter is an
      // extra scalar predicate on the unique `id` selector — same mechanism as
      // the `accountId` tenant filter already used across the repo. Zero rows
      // match when the version is stale → Prisma throws P2025, which the service
      // maps to a 409 OptimisticLockException.
      const updated = await tx.product.update({
        where: { id, accountId, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });

      // Packs are replaced wholesale on update — moysklad's behaviour is the
      // same: send the full list, server diffs. Skip if input.packs is
      // undefined (= "don't touch"); empty array = "clear all".
      if (input.packs !== undefined) {
        await tx.productPack.deleteMany({ where: { accountId, productId: id } });
        if (input.packs.length > 0) {
          await tx.productPack.createMany({
            data: input.packs.map((p) => ({
              accountId,
              productId: id,
              name: p.name,
              uomCode: p.uomCode,
              multiplier: p.multiplier,
              barcode: p.barcode,
              codeType: p.codeType,
              tasnifCode: p.tasnifCode,
              position: p.position,
            })),
          });
        }
      }

      return updated;
    });
  }

  /** Archive (soft-state flag toggled). */
  async archive(accountId: string, id: string, archived: boolean) {
    return this.prisma.client.product.update({
      where: { id, accountId },
      data: { archived },
    });
  }

  /** Soft delete. */
  async softDelete(accountId: string, id: string) {
    return this.prisma.client.product.update({
      where: { id, accountId },
      data: { deletedAt: new Date() },
    });
  }

  /** «Переместить» — bulk-set productFolderId (null = root) for the selected,
   * account-scoped products in one query. */
  async bulkMove(accountId: string, ids: string[], productFolderId: string | null) {
    const res = await this.prisma.client.product.updateMany({
      where: { id: { in: ids }, accountId, deletedAt: null },
      data: { productFolderId },
    });
    return { moved: res.count };
  }

  /** Verify a folder belongs to the account (guards «Переместить» cross-tenant). */
  async folderExists(accountId: string, id: string): Promise<boolean> {
    const f = await this.prisma.client.productFolder.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    return f !== null;
  }

  /** «Копировать» — full-fidelity duplicate of a product (+ its packs). code /
   * externalCode are @@unique per account and barcodes shouldn't collide, so
   * those three are cleared on the copy; every other field is carried over. */
  async clone(accountId: string, ownerId: string, id: string) {
    const src = await this.prisma.client.product.findFirst({
      where: { id, accountId, deletedAt: null },
      include: { packs: true },
    });
    if (!src) return null;
    const asJson = (v: Prisma.JsonValue | null): Prisma.InputJsonValue | undefined =>
      v === null ? undefined : (v as Prisma.InputJsonValue);
    return this.prisma.client.product.create({
      data: {
        accountId,
        ownerId,
        modifiedById: ownerId,
        name: src.name,
        code: null,
        externalCode: null,
        article: src.article,
        description: src.description,
        country: src.country,
        kind: src.kind,
        productFolderId: src.productFolderId,
        groupId: src.groupId,
        supplierId: src.supplierId,
        minPrice: src.minPrice,
        buyPrice: src.buyPrice,
        buyPriceCurrency: src.buyPriceCurrency,
        minPriceCurrency: src.minPriceCurrency,
        salePrices: asJson(src.salePrices),
        weightG: src.weightG,
        volumeML: src.volumeML,
        weighed: src.weighed,
        uom: src.uom,
        vat: src.vat,
        vatEnabled: src.vatEnabled,
        useParentVat: src.useParentVat,
        taxSystem: src.taxSystem,
        paymentItemType: src.paymentItemType,
        mxikCode: src.mxikCode,
        trackingType: src.trackingType,
        gtin: src.gtin,
        partialDisposal: src.partialDisposal,
        isSerialTrackable: src.isSerialTrackable,
        discountProhibited: src.discountProhibited,
        minimumBalanceMinor: src.minimumBalanceMinor,
        shared: src.shared,
        barcodes: [],
        barcodeTypes: [],
        attributes: asJson(src.attributes),
        ...(src.packs.length > 0
          ? {
              packs: {
                create: src.packs.map((p) => ({
                  accountId,
                  name: p.name,
                  uomCode: p.uomCode,
                  multiplier: p.multiplier,
                  barcode: p.barcode,
                  codeType: p.codeType,
                  tasnifCode: p.tasnifCode,
                  position: p.position,
                })),
              },
            }
          : {}),
      },
    });
  }

  /** «Изменить цены» — set ONE target price type on a product, computed by the
   * bulk-price engine (fixed / cost-based / other-price ± adjustment, rounding).
   * Other price types on the product are preserved. Skips (no write) when the
   * mode can't yield a price (e.g. cost-based but the product has no buyPrice). */
  async setPrices(accountId: string, id: string, spec: SetPricesSpec) {
    const product = await this.prisma.client.product.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { salePrices: true, buyPrice: true },
    });
    if (!product) return null;
    type SP = { priceTypeId: string; value: string; currencyCode?: string };
    const existing = (Array.isArray(product.salePrices)
      ? product.salePrices
      : []) as unknown as SP[];

    // Resolve the base amount for cost/other modes.
    let base: bigint | null = null;
    if (spec.mode === 'cost') base = product.buyPrice ?? null;
    else if (spec.mode === 'other' && spec.basePriceTypeId) {
      const found = existing.find((p) => p.priceTypeId === spec.basePriceTypeId);
      base = found?.value != null ? BigInt(found.value) : null;
    }

    const next = computeBulkPrice(spec, base);
    if (next == null) return { id, updated: false }; // nothing to write — skip

    const byType = new Map<string, SP>(existing.map((p) => [p.priceTypeId, p]));
    byType.set(spec.targetPriceTypeId, {
      priceTypeId: spec.targetPriceTypeId,
      value: next.toString(),
      currencyCode: spec.currencyCode ?? byType.get(spec.targetPriceTypeId)?.currencyCode ?? 'UZS',
    });
    const updated = await this.prisma.client.product.update({
      where: { id, accountId },
      data: { salePrices: [...byType.values()] as unknown as Prisma.InputJsonValue },
    });
    return updated;
  }

  /** Verify a counterparty (supplier) belongs to the account. */
  async counterpartyExists(accountId: string, id: string): Promise<boolean> {
    const c = await this.prisma.client.counterparty.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    return c !== null;
  }

  /** Verify an employee belongs to the account (guards bulk-edit «Владелец» cross-tenant). */
  async employeeExists(accountId: string, id: string): Promise<boolean> {
    const e = await this.prisma.client.employee.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    return e !== null;
  }

  /** Verify a group belongs to the account (guards bulk-edit «Отдел»/group cross-tenant). */
  async groupExists(accountId: string, id: string): Promise<boolean> {
    const g = await this.prisma.client.group.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    return g !== null;
  }

  /** «Массовое редактирование» — bulk-set common fields on the selection (only the
   * provided fields are changed). One account-scoped updateMany. */
  async bulkUpdate(accountId: string, ids: string[], patch: BulkUpdatePatch) {
    // Unchecked variant exposes scalar FKs (supplierId) for updateMany. Only the
    // provided keys are written; null clears the field (minimumBalanceMinor is
    // NOT nullable → its "clear" is 0).
    const data: Prisma.ProductUncheckedUpdateManyInput = {};
    if (patch.archived !== undefined) data.archived = patch.archived;
    if (patch.productFolderId !== undefined) data.productFolderId = patch.productFolderId;
    if (patch.country !== undefined) data.country = patch.country?.toUpperCase() ?? null;
    if (patch.uom !== undefined) data.uom = patch.uom;
    if (patch.weightG !== undefined) data.weightG = patch.weightG;
    if (patch.volumeML !== undefined) data.volumeML = patch.volumeML;
    if (patch.vat !== undefined) data.vat = patch.vat;
    if (patch.minimumBalanceMinor !== undefined)
      data.minimumBalanceMinor = patch.minimumBalanceMinor ?? 0n;
    if (patch.supplierId !== undefined) data.supplierId = patch.supplierId;
    if (patch.mxikCode !== undefined) data.mxikCode = patch.mxikCode;
    if (patch.weighed !== undefined) data.weighed = patch.weighed;
    if (patch.trackingType !== undefined) data.trackingType = patch.trackingType;
    if (patch.discountProhibited !== undefined) data.discountProhibited = patch.discountProhibited;
    if (patch.ownerId !== undefined) data.ownerId = patch.ownerId;
    if (patch.groupId !== undefined) data.groupId = patch.groupId;
    if (patch.shared !== undefined) data.shared = patch.shared;

    // «Код упаковки ТАСНИФ» / «Штрихкод ТАСНИФ» live on the base pack
    // (ProductPack, position 0). They cannot go through product.updateMany, so
    // they get their own tenant-scoped updateMany over the base packs of the
    // selected products. Products with no base pack are simply not touched for
    // these two fields (there is no packaging row to carry the code).
    const packData: Prisma.ProductPackUncheckedUpdateManyInput = {};
    if (patch.tasnifCode !== undefined) packData.tasnifCode = patch.tasnifCode;
    if (patch.tasnifBarcode !== undefined) packData.barcode = patch.tasnifBarcode;
    const hasPackData = Object.keys(packData).length > 0;

    const res = await this.prisma.client.$transaction(async (tx) => {
      const r = await tx.product.updateMany({
        where: { id: { in: ids }, accountId, deletedAt: null },
        data,
      });
      if (hasPackData) {
        await tx.productPack.updateMany({
          where: { accountId, productId: { in: ids }, variantId: null, position: 0 },
          data: packData,
        });
      }
      return r;
    });
    return { updated: res.count };
  }
}
