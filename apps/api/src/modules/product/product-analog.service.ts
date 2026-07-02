import { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type SalePricesJson, pickSalePriceMinor } from '../analitika/sale-price.util.js';

/** One analog row as returned to the «Аналоги» tab. `freeStock` is the analog
 *  product's «Свободный остаток» (on-hand − reserved) across every store, as a
 *  whole-unit string — matching how the moysklad column prints it. `salePrice`
 *  is the product's default-tier «Розничная цена» in MINOR units (string).
 *  `isSelf` marks the leading reference row = the route product itself (bold,
 *  non-link, no remove «×»), which moysklad shows for stock/price comparison. */
export interface AnalogRow {
  analogId: string;
  name: string;
  code: string | null;
  article: string | null;
  archived: boolean;
  freeStock: string;
  salePrice: string;
  isSelf?: boolean;
}

/**
 * «Аналоги» — substitute-product list for a product (moysklad product card tab).
 *
 * Stored directionally on `ProductAnalog` (productId → analogId); this service
 * is the single owner of read/add/remove. Every method is tenant-scoped on
 * `accountId` and proves the route product belongs to the caller's account
 * before touching the join (→ 404 otherwise), so a cross-tenant id can neither
 * be read nor linked.
 */
@Injectable()
export class ProductAnalogService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** List a product's analogs (ordered by add-position) with each analog's
   *  «Свободный остаток» and default-tier «Розничная цена». When there is ≥1
   *  analog, the route product itself is PREPENDED as a bold reference row
   *  (`isSelf`), mirroring moysklad. With 0 analogs returns `{ items: [] }` so
   *  the FE empty-state (hint + «⊕ Аналог») stays. Soft-deleted analogs drop. */
  async list(accountId: string, productId: string): Promise<{ items: AnalogRow[] }> {
    const self = await this.assertProduct(accountId, productId);

    // A soft-deleted analog product must drop out of the list — the FK cascade
    // only fires on a HARD delete, but the app soft-deletes (sets deletedAt), so
    // the join row lingers. Filter on the relation so those rows never surface
    // (the row itself is kept, so restoring the product re-shows the analog).
    const live = await this.prisma.client.productAnalog.findMany({
      where: { accountId, productId, analog: { deletedAt: null } },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: {
        analog: {
          select: {
            id: true,
            name: true,
            code: true,
            article: true,
            archived: true,
            salePrices: true,
          },
        },
      },
    });

    // moysklad parity: only show the self reference row when the product HAS
    // analogs — with none the FE renders just the hint + «⊕ Аналог».
    if (live.length === 0) return { items: [] };

    // Default sale-price tier for «Розничная цена» — same resolver the analitika
    // module uses (priceType isDefault → pickSalePriceMinor; first as fallback).
    const defaultType = await this.prisma.client.priceType.findFirst({
      where: { accountId, isDefault: true },
      select: { id: true },
    });
    const salePriceOf = (salePrices: Prisma.JsonValue): string =>
      pickSalePriceMinor(salePrices as SalePricesJson, defaultType?.id).toString();

    // One batched stock query for the analogs AND the route product (the self
    // row needs its own «Свободный остаток» too — no second query).
    const freeById = await this.freeStockByProduct(accountId, [
      productId,
      ...live.map((l) => l.analogId),
    ]);

    const selfRow: AnalogRow = {
      analogId: self.id,
      name: self.name,
      code: self.code,
      article: self.article,
      archived: self.archived,
      freeStock: freeById.get(self.id) ?? '0',
      salePrice: salePriceOf(self.salePrices),
      isSelf: true,
    };

    return {
      items: [
        selfRow,
        ...live.map((l) => ({
          analogId: l.analogId,
          name: l.analog.name,
          code: l.analog.code,
          article: l.analog.article,
          archived: l.analog.archived,
          freeStock: freeById.get(l.analogId) ?? '0',
          salePrice: salePriceOf(l.analog.salePrices),
        })),
      ],
    };
  }

  /** Add one analog. Rejects self-reference (400) and duplicates (409, → the
   *  moysklad «Такой аналог уже добавлен» warning). Appends at the end. */
  async add(accountId: string, productId: string, analogId: string): Promise<AnalogRow> {
    if (productId === analogId) {
      throw new BadRequestException('A product cannot be its own analog');
    }
    await this.assertProduct(accountId, productId);
    const analog = await this.prisma.client.product.findFirst({
      where: { id: analogId, accountId, deletedAt: null },
      select: { id: true, name: true, code: true, article: true, archived: true, salePrices: true },
    });
    if (!analog) throw new NotFoundException(`Analog product ${analogId} not found`);

    const count = await this.prisma.client.productAnalog.count({ where: { accountId, productId } });
    try {
      await this.prisma.client.productAnalog.create({
        data: { accountId, productId, analogId, position: count },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException('Analog already added');
      }
      throw e;
    }

    const defaultType = await this.prisma.client.priceType.findFirst({
      where: { accountId, isDefault: true },
      select: { id: true },
    });
    const freeById = await this.freeStockByProduct(accountId, [analogId]);
    return {
      analogId,
      name: analog.name,
      code: analog.code,
      article: analog.article,
      archived: analog.archived,
      freeStock: freeById.get(analogId) ?? '0',
      salePrice: pickSalePriceMinor(
        analog.salePrices as SalePricesJson,
        defaultType?.id,
      ).toString(),
    };
  }

  /** Remove one analog from a product's list (no-op if it wasn't linked). */
  async remove(accountId: string, productId: string, analogId: string): Promise<{ ok: boolean }> {
    await this.assertProduct(accountId, productId);
    await this.prisma.client.productAnalog.deleteMany({
      where: { accountId, productId, analogId },
    });
    return { ok: true };
  }

  // ---- private helpers ----

  /** Confirm the route product is a live row in this account (→ 404) and return
   *  the fields the self reference row needs (callers ignore the value when they
   *  only need the guard). */
  private async assertProduct(accountId: string, productId: string) {
    const p = await this.prisma.client.product.findFirst({
      where: { id: productId, accountId, deletedAt: null },
      select: { id: true, name: true, code: true, article: true, archived: true, salePrices: true },
    });
    if (!p) throw new NotFoundException(`Product ${productId} not found`);
    return p;
  }

  /**
   * «Свободный остаток» = Σqty − Σreserved across every store, per product, from
   * the live Stock ledger (one grouped query, covered by the stocks index). This
   * is the FREE remainder (the analog-table column's literal meaning) — NOT the
   * products-list DISPLAY «Доступно», which also adds expected-incoming. Emitted
   * as a whole-unit Decimal string, like the product list's stock cluster.
   */
  private async freeStockByProduct(
    accountId: string,
    productIds: string[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (productIds.length === 0) return out;
    const grouped = await this.prisma.client.stock.groupBy({
      by: ['assortmentId'],
      where: { accountId, assortmentKind: 'product', assortmentId: { in: productIds } },
      _sum: { qty: true, reservedQty: true },
    });
    const zero = new Prisma.Decimal(0);
    for (const g of grouped) {
      const free = (g._sum.qty ?? zero).minus(g._sum.reservedQty ?? zero);
      out.set(g.assortmentId, free.toString());
    }
    return out;
  }
}
