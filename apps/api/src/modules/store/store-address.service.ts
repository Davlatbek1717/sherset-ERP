import { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  AssignProductsSchema,
  CellBarcodeLookupSchema,
  CreateCellSchema,
  CreateZoneSchema,
  SetCellStockSchema,
  UpdateCellSchema,
  UpdateZoneSchema,
} from './store-address.schema.js';

/**
 * StoreAddressService — CRUD for warehouse address storage (Адресное хранение):
 * Zones (Зоны) + Cells (Ячейки), both scoped to one warehouse.
 *
 * Tenancy: every query is filtered by `accountId`; mutating endpoints first prove
 * the parent store belongs to the caller (assertStore). Cascade: deleting a store
 * drops its zones+cells (FK onDelete: Cascade); deleting a zone SetNull-s its
 * cells back to the «Без зоны хранения» bucket (FK onDelete: SetNull) — never
 * deletes the cells.
 *
 * Cell status (Свободна/Занята) and per-zone free/occupied counts are NOT computed
 * here yet — they need stock-by-cell (Phase 4). `cellCount` is the only real
 * aggregate exposed now.
 */
@Injectable()
export class StoreAddressService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // Guards
  // -------------------------------------------------------------------

  private async assertStore(accountId: string, storeId: string): Promise<void> {
    const store = await this.prisma.client.store.findFirst({
      where: { id: storeId, accountId },
      select: { id: true },
    });
    if (!store) throw new NotFoundException(`Store ${storeId} not found`);
  }

  /** Verify a zone exists in THIS store (prevents cross-store zone assignment). */
  private async assertZoneInStore(
    accountId: string,
    storeId: string,
    zoneId: string,
  ): Promise<void> {
    const zone = await this.prisma.client.storeZone.findFirst({
      where: { id: zoneId, storeId, accountId },
      select: { id: true },
    });
    if (!zone) {
      throw new BadRequestException('Tanlangan zona bu omborga tegishli emas');
    }
  }

  // -------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------

  /**
   * Full address-storage snapshot for the warehouse card + the doc cell-picker.
   * Zones carry real Всего/Свободно/Занято counts; each cell carries its resolved
   * `zoneName`, an `occupied` flag (holds any stock), and — when `assortmentId` is
   * passed — `productQty` (this product's qty in the cell, drives «С этим товаром»).
   * Occupancy is derived from StockByCell (Phase 4); cells that never received a
   * cell-tagged movement read as «Свободна» (the forward-looking model).
   */
  async getAddressStorage(
    accountId: string,
    storeId: string,
    opts?: { assortmentKind?: string; assortmentId?: string },
  ) {
    await this.assertStore(accountId, storeId);
    const assortmentKind = opts?.assortmentKind ?? 'product';
    const wantProduct = !!opts?.assortmentId;
    const [zones, cells, occupiedRows, productRows] = await Promise.all([
      this.prisma.client.storeZone.findMany({
        where: { accountId, storeId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.client.storeCell.findMany({
        where: { accountId, storeId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      // «Занята» — distinct cellIds that hold ANY stock (qty>0).
      this.prisma.client.stockByCell.findMany({
        where: { accountId, storeId, qty: { gt: 0 } },
        select: { cellId: true },
        distinct: ['cellId'],
      }),
      // «С этим товаром» — this product's per-cell qty (only when asked).
      wantProduct
        ? this.prisma.client.stockByCell.findMany({
            where: {
              accountId,
              storeId,
              assortmentKind,
              assortmentId: opts?.assortmentId,
              qty: { gt: 0 },
            },
            select: { cellId: true, qty: true },
          })
        : Promise.resolve([] as Array<{ cellId: string; qty: unknown }>),
    ]);

    const occupied = new Set(occupiedRows.map((r) => r.cellId));
    const productQtyByCell = new Map(productRows.map((r) => [r.cellId, String(r.qty)]));
    const zoneName = new Map(zones.map((z) => [z.id, z.name]));

    const cellsOut = cells.map((c) => ({
      ...c,
      zoneName: c.zoneId ? (zoneName.get(c.zoneId) ?? null) : null,
      occupied: occupied.has(c.id),
      productQty: wantProduct ? (productQtyByCell.get(c.id) ?? null) : null,
    }));

    // Per-zone Всего / Занято / Свободно (and the «Без зоны хранения» bucket roll-up
    // is computed FE-side from zoneless cells).
    const totalByZone = new Map<string, number>();
    const occByZone = new Map<string, number>();
    for (const c of cellsOut) {
      if (!c.zoneId) continue;
      totalByZone.set(c.zoneId, (totalByZone.get(c.zoneId) ?? 0) + 1);
      if (c.occupied) occByZone.set(c.zoneId, (occByZone.get(c.zoneId) ?? 0) + 1);
    }

    return {
      zones: zones.map((z) => {
        const cellCount = totalByZone.get(z.id) ?? 0;
        const occupiedCount = occByZone.get(z.id) ?? 0;
        return { ...z, cellCount, occupiedCount, freeCount: cellCount - occupiedCount };
      }),
      cells: cellsOut,
    };
  }

  /**
   * «🖨 Этикетка» (F1) — everything currently stored in ONE cell, with the
   * assortment identity the label needs (name + code + first barcode). Kinds:
   * 'variant' resolves from Variant, everything else from Product (the same
   * split ensureAssortmentsInTenant uses). Rows whose assortment row vanished
   * (hard-deleted product) fall back to the raw id so the label still prints.
   */
  async getCellStock(accountId: string, storeId: string, cellId: string) {
    await this.assertStore(accountId, storeId);
    const cell = await this.prisma.client.storeCell.findFirst({
      where: { id: cellId, storeId, accountId },
      select: { id: true, name: true, barcode: true },
    });
    if (!cell) throw new NotFoundException(`Cell ${cellId} not found`);

    const rows = await this.prisma.client.stockByCell.findMany({
      where: { accountId, storeId, cellId, qty: { gt: 0 } },
      select: { assortmentKind: true, assortmentId: true, qty: true },
    });

    // Owner 2026-07-21 «Ko'rish»: the cell view lists EVERY product that lives
    // here — counted stock rows AND home-cell-bound products that have no count
    // yet (they render with qty 0, ready for «Sanash»).
    const bound = await this.prisma.client.product.findMany({
      where: { accountId, attributes: { path: ['__yacheyka'], equals: cell.name } },
      select: { id: true },
      orderBy: { name: 'asc' },
    });
    const stockedIds = new Set(rows.map((r) => r.assortmentId));
    for (const b of bound) {
      if (!stockedIds.has(b.id)) {
        rows.push({
          assortmentKind: 'product',
          assortmentId: b.id,
          qty: new Prisma.Decimal(0),
        });
      }
    }

    const productIds = rows
      .filter((r) => r.assortmentKind !== 'variant')
      .map((r) => r.assortmentId);
    const variantIds = rows
      .filter((r) => r.assortmentKind === 'variant')
      .map((r) => r.assortmentId);
    type Info = {
      id: string;
      name: string;
      code: string | null;
      barcodes: string[];
      description?: string | null;
      images?: Array<{ id: string }>;
    };
    const [products, variants] = await Promise.all([
      productIds.length
        ? this.prisma.client.product.findMany({
            where: { id: { in: productIds }, accountId },
            select: {
              id: true,
              name: true,
              code: true,
              barcodes: true,
              description: true,
              // Main image id only — thumbnails render via GET /images/:id/raw.
              images: {
                orderBy: [{ isMain: 'desc' }, { position: 'asc' }],
                take: 1,
                select: { id: true },
              },
            },
          })
        : Promise.resolve([] as Info[]),
      variantIds.length
        ? this.prisma.client.variant.findMany({
            where: { id: { in: variantIds }, accountId },
            select: { id: true, name: true, code: true, barcodes: true },
          })
        : Promise.resolve([] as Info[]),
    ]);
    const byId = new Map(
      [...products, ...variants].map((p: Info) => [
        p.id,
        {
          name: p.name,
          code: p.code,
          barcode: p.barcodes?.[0] ?? null,
          description: p.description ?? null,
          mainImageId: p.images?.[0]?.id ?? null,
        },
      ]),
    );

    return {
      cell,
      items: rows.map((r) => {
        const info = byId.get(r.assortmentId);
        return {
          assortmentKind: r.assortmentKind,
          assortmentId: r.assortmentId,
          name: info?.name ?? r.assortmentId,
          code: info?.code ?? null,
          barcode: info?.barcode ?? null,
          description: info?.description ?? null,
          mainImageId: info?.mainImageId ?? null,
          qty: r.qty.toString(),
        };
      }),
    };
  }

  /**
   * Scan flow (owner 2026-07-19): resolve a CELL by its printed barcode,
   * account-wide. One hit → the cell (+ store/zone names) with everything a
   * phone needs to show «what lives here»: the bound products (home-cell
   * labels) and the document-derived per-cell stock. Zero hits → empty list;
   * several hits (the same code stuck on two shelves) → the summaries only,
   * so the UI can tell the user the label is ambiguous instead of guessing.
   */
  async lookupCellByBarcode(accountId: string, rawQuery: unknown) {
    const { code } = this.parse(CellBarcodeLookupSchema, rawQuery);
    // Printed labels encode `barcode || name` (cell-label-print), so a label
    // from a cell with no explicit barcode carries its NAME — match both.
    const cells = await this.prisma.client.storeCell.findMany({
      where: { accountId, OR: [{ barcode: code }, { name: code }] },
      select: {
        id: true,
        name: true,
        barcode: true,
        storeId: true,
        store: { select: { name: true } },
        zone: { select: { name: true } },
      },
      take: 5,
    });
    const summaries = cells.map((c) => ({
      id: c.id,
      name: c.name,
      barcode: c.barcode,
      storeId: c.storeId,
      storeName: c.store.name,
      zoneName: c.zone?.name ?? null,
    }));
    const single = cells.length === 1 ? cells[0] : undefined;
    if (!single) return { cells: summaries, products: [], stock: [] };
    const [products, stock] = await Promise.all([
      this.getCellProducts(accountId, single.storeId, single.id),
      this.getCellStock(accountId, single.storeId, single.id),
    ]);
    return { cells: summaries, products: products.items, stock: stock.items };
  }

  // -------------------------------------------------------------------
  // «Добавить товар в ячейку» — product ↔ cell assignment (user 2026-07-06)
  //
  // A product's home cell lives in Product.attributes.__yacheyka (cell CODE) +
  // __polka (zone name) — the SAME binding the product card's «Полка»/«Ячейка»
  // pickers write, so assigning from either side keeps both views consistent.
  // It is a location LABEL, NOT a stock quantity: real per-cell quantity stays
  // document-derived (StockByCell), so this can never create an accounting lie.
  // -------------------------------------------------------------------

  /** Resolve a cell in THIS store (with its zone name) or 404. */
  private async cellWithZone(accountId: string, storeId: string, cellId: string) {
    const cell = await this.prisma.client.storeCell.findFirst({
      where: { id: cellId, storeId, accountId },
      select: { id: true, name: true, zone: { select: { name: true } } },
    });
    if (!cell) throw new NotFoundException(`Cell ${cellId} not found`);
    return cell;
  }

  /** Products whose home cell (__yacheyka) is this cell — «в этой ячейке». */
  async getCellProducts(accountId: string, storeId: string, cellId: string) {
    await this.assertStore(accountId, storeId);
    const cell = await this.cellWithZone(accountId, storeId, cellId);
    const products = await this.prisma.client.product.findMany({
      where: { accountId, attributes: { path: ['__yacheyka'], equals: cell.name } },
      select: { id: true, name: true, code: true, barcodes: true, archived: true },
      orderBy: { name: 'asc' },
    });
    return {
      items: products.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        barcode: p.barcodes?.[0] ?? null,
        archived: p.archived,
      })),
    };
  }

  /**
   * «Sanash» (owner 2026-07-21) — record the PHYSICAL count of one product in
   * one cell as an ABSOLUTE value: upsert the StockByCell row (qty > 0) or
   * delete it (qty = 0). Owner-custom addressing feature: per-cell counts are
   * hand-counted bin contents; store-level totals stay document-derived.
   */
  async setCellStock(accountId: string, storeId: string, cellId: string, raw: unknown) {
    await this.assertStore(accountId, storeId);
    const cell = await this.prisma.client.storeCell.findFirst({
      where: { id: cellId, storeId, accountId },
      select: { id: true },
    });
    if (!cell) throw new NotFoundException();
    const { assortmentId, qty } = this.parse(SetCellStockSchema, raw);
    const product = await this.prisma.client.product.findFirst({
      where: { id: assortmentId, accountId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new NotFoundException();
    if (Number(qty) === 0) {
      await this.prisma.client.stockByCell.deleteMany({
        where: { accountId, storeId, cellId, assortmentKind: 'product', assortmentId },
      });
      return { cellId, assortmentId, qty: '0' };
    }
    const row = await this.prisma.client.stockByCell.upsert({
      where: {
        accountId_storeId_cellId_assortmentKind_assortmentId: {
          accountId,
          storeId,
          cellId,
          assortmentKind: 'product',
          assortmentId,
        },
      },
      create: { accountId, storeId, cellId, assortmentKind: 'product', assortmentId, qty },
      update: { qty },
    });
    return { cellId, assortmentId, qty: row.qty.toString() };
  }

  /** Assign products to this cell — set each product's __yacheyka/__polka. */
  async assignProducts(accountId: string, storeId: string, cellId: string, raw: unknown) {
    await this.assertStore(accountId, storeId);
    const cell = await this.cellWithZone(accountId, storeId, cellId);
    const { productIds } = this.parse(AssignProductsSchema, raw);
    const products = await this.prisma.client.product.findMany({
      where: { accountId, id: { in: productIds } },
      select: { id: true, attributes: true },
    });
    const polka = cell.zone?.name ?? '';
    for (const p of products) {
      const base =
        p.attributes && typeof p.attributes === 'object' && !Array.isArray(p.attributes)
          ? (p.attributes as Record<string, unknown>)
          : {};
      const attrs: Record<string, unknown> = { ...base, __yacheyka: cell.name, __polka: polka };
      await this.prisma.client.product.update({
        where: { id: p.id },
        data: { attributes: attrs as Prisma.InputJsonValue },
      });
    }
    // Report any ids that didn't resolve (deleted / other tenant) — silently skipped.
    return { assigned: products.length, requested: productIds.length };
  }

  /** Remove a product from this cell — clear its __yacheyka/__polka IF it points here. */
  async unassignProduct(accountId: string, storeId: string, cellId: string, productId: string) {
    await this.assertStore(accountId, storeId);
    const cell = await this.cellWithZone(accountId, storeId, cellId);
    const product = await this.prisma.client.product.findFirst({
      where: { id: productId, accountId },
      select: { id: true, attributes: true },
    });
    if (!product) throw new NotFoundException(`Product ${productId} not found`);
    const base =
      product.attributes &&
      typeof product.attributes === 'object' &&
      !Array.isArray(product.attributes)
        ? (product.attributes as Record<string, unknown>)
        : {};
    // Only clear when the product actually lives in THIS cell (avoid wiping a
    // binding that was moved elsewhere between load and click).
    if (base.__yacheyka !== cell.name) return { unassigned: false };
    const { __yacheyka: _y, __polka: _p, ...rest } = base;
    await this.prisma.client.product.update({
      where: { id: product.id },
      data: { attributes: rest as Prisma.InputJsonValue },
    });
    return { unassigned: true };
  }

  /**
   * «Привязать к ячейке, если не задана» — bind ONE product's home cell to this
   * cell ONLY when it has none yet. Used by document editors: picking a «Ячейка»
   * for a cell-less product assigns it, but an existing binding is NEVER
   * overwritten (the account chose "bind only when empty"). Idempotent — a
   * product that already has a __yacheyka is left untouched (no-op result).
   */
  async bindProductIfEmpty(accountId: string, storeId: string, cellId: string, productId: string) {
    await this.assertStore(accountId, storeId);
    const cell = await this.cellWithZone(accountId, storeId, cellId);
    const product = await this.prisma.client.product.findFirst({
      where: { id: productId, accountId },
      select: { id: true, attributes: true },
    });
    if (!product) throw new NotFoundException(`Product ${productId} not found`);
    const base =
      product.attributes &&
      typeof product.attributes === 'object' &&
      !Array.isArray(product.attributes)
        ? (product.attributes as Record<string, unknown>)
        : {};
    const current = typeof base.__yacheyka === 'string' ? base.__yacheyka.trim() : '';
    // Already has a home cell → never overwrite; report it so the caller no-ops.
    if (current) return { bound: false, alreadyBound: true };
    const attrs: Record<string, unknown> = {
      ...base,
      __yacheyka: cell.name,
      __polka: cell.zone?.name ?? '',
    };
    await this.prisma.client.product.update({
      where: { id: product.id },
      data: { attributes: attrs as Prisma.InputJsonValue },
    });
    return { bound: true, yacheyka: cell.name, polka: cell.zone?.name ?? '' };
  }

  // -------------------------------------------------------------------
  // Zone (Зона) CRUD
  // -------------------------------------------------------------------

  async createZone(accountId: string, storeId: string, raw: unknown) {
    await this.assertStore(accountId, storeId);
    const data = this.parse(CreateZoneSchema, raw);
    await this.assertZoneNameFree(accountId, storeId, data.name);
    try {
      return await this.prisma.client.storeZone.create({
        data: { accountId, storeId, name: data.name, sortOrder: data.sortOrder ?? 0 },
      });
    } catch (e) {
      this.rethrowDuplicate(e, 'zona');
      throw e;
    }
  }

  async updateZone(accountId: string, storeId: string, zoneId: string, raw: unknown) {
    await this.assertStore(accountId, storeId);
    const existing = await this.prisma.client.storeZone.findFirst({
      where: { id: zoneId, storeId, accountId },
    });
    if (!existing) throw new NotFoundException(`Zone ${zoneId} not found`);
    const data = this.parse(UpdateZoneSchema, raw);
    if (data.name !== undefined && data.name !== existing.name) {
      await this.assertZoneNameFree(accountId, storeId, data.name, zoneId);
    }
    const patch: Prisma.StoreZoneUpdateInput = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;
    try {
      return await this.prisma.client.storeZone.update({ where: { id: zoneId }, data: patch });
    } catch (e) {
      this.rethrowDuplicate(e, 'zona');
      throw e;
    }
  }

  /** Delete a zone. Its cells are SetNull-ed to «Без зоны» by the FK (not deleted). */
  async deleteZone(accountId: string, storeId: string, zoneId: string) {
    await this.assertStore(accountId, storeId);
    const existing = await this.prisma.client.storeZone.findFirst({
      where: { id: zoneId, storeId, accountId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`Zone ${zoneId} not found`);
    await this.prisma.client.storeZone.delete({ where: { id: zoneId } });
    return { ok: true };
  }

  // -------------------------------------------------------------------
  // Cell (Ячейка) CRUD
  // -------------------------------------------------------------------

  async createCell(accountId: string, storeId: string, raw: unknown) {
    await this.assertStore(accountId, storeId);
    const data = this.parse(CreateCellSchema, raw);
    if (data.zoneId) await this.assertZoneInStore(accountId, storeId, data.zoneId);
    await this.assertCellNameFree(accountId, storeId, data.name);
    try {
      return await this.prisma.client.storeCell.create({
        data: {
          accountId,
          storeId,
          zoneId: data.zoneId ?? null,
          name: data.name,
          barcode: data.barcode ?? null,
          sortOrder: data.sortOrder ?? 0,
        },
      });
    } catch (e) {
      this.rethrowDuplicate(e, 'yacheyka');
      throw e;
    }
  }

  async updateCell(accountId: string, storeId: string, cellId: string, raw: unknown) {
    await this.assertStore(accountId, storeId);
    const existing = await this.prisma.client.storeCell.findFirst({
      where: { id: cellId, storeId, accountId },
    });
    if (!existing) throw new NotFoundException(`Cell ${cellId} not found`);
    const data = this.parse(UpdateCellSchema, raw);
    if (data.name !== undefined && data.name !== existing.name) {
      await this.assertCellNameFree(accountId, storeId, data.name, cellId);
    }
    // Tri-state zoneId: undefined leaves it; null clears it; uuid reassigns (verified).
    if (data.zoneId) await this.assertZoneInStore(accountId, storeId, data.zoneId);

    const patch: Prisma.StoreCellUpdateInput = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.barcode !== undefined) patch.barcode = data.barcode;
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;
    if (data.zoneId !== undefined) {
      patch.zone = data.zoneId === null ? { disconnect: true } : { connect: { id: data.zoneId } };
    }
    try {
      return await this.prisma.client.storeCell.update({ where: { id: cellId }, data: patch });
    } catch (e) {
      this.rethrowDuplicate(e, 'yacheyka');
      throw e;
    }
  }

  async deleteCell(accountId: string, storeId: string, cellId: string) {
    await this.assertStore(accountId, storeId);
    const existing = await this.prisma.client.storeCell.findFirst({
      where: { id: cellId, storeId, accountId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`Cell ${cellId} not found`);
    // A cell holding stock cannot be deleted (parity «нельзя удалить непустую ячейку»;
    // the StockByCell FK is ON DELETE RESTRICT — we check first for a friendly message).
    const stocked = await this.prisma.client.stockByCell.count({
      where: { accountId, storeId, cellId, qty: { gt: 0 } },
    });
    if (stocked > 0) {
      throw new BadRequestException("Yacheykada tovar qoldig'i bor — avval boshqasiga ko'chiring");
    }
    // Purge residual EMPTY StockByCell rows (qty = 0) — an emptied cell keeps a
    // zero-qty materialized row (outflow decrements to 0 without deleting it), and
    // the RESTRICT FK would otherwise reject the delete with a raw 500 even though
    // the cell holds nothing. A zero row carries no stock (absence == zero), so
    // dropping it is loss-free. Both in one tx so the cell can't gain stock
    // between the purge and the delete.
    await this.prisma.client.$transaction(async (tx) => {
      await tx.stockByCell.deleteMany({ where: { accountId, storeId, cellId, qty: { lte: 0 } } });
      await tx.storeCell.delete({ where: { id: cellId } });
    });
    return { ok: true };
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  private parse<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.infer<S> {
    const r = schema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private async assertZoneNameFree(
    accountId: string,
    storeId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const dup = await this.prisma.client.storeZone.findFirst({
      where: { accountId, storeId, name, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    if (dup) throw new BadRequestException(`«${name}» nomli zona allaqachon mavjud`);
  }

  private async assertCellNameFree(
    accountId: string,
    storeId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const dup = await this.prisma.client.storeCell.findFirst({
      where: { accountId, storeId, name, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    if (dup) throw new BadRequestException(`«${name}» nomli yacheyka allaqachon mavjud`);
  }

  /** Map a Prisma unique-constraint race (P2002) to a friendly message. */
  private rethrowDuplicate(e: unknown, kind: 'zona' | 'yacheyka'): void {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new BadRequestException(`Bu nomli ${kind} allaqachon mavjud`);
    }
  }
}
