import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { allowedStoreNames } from './picksync-env.util.js';

/** One snapshot position as stored in MsPickList.positions JSON. */
export interface PickListPosition {
  msAssortmentId: string | null;
  name: string;
  qty: number;
  code: string | null;
  barcode: string | null;
  /** Position price in minor units (tiyin), AFTER MoySklad's own semantics. */
  priceMinor?: number;
  /** Percent discount on the position (MoySklad `discount`). */
  discount?: number;
  /** Unit name («шт», «м», …) from assortment.uom. */
  uom?: string | null;
}

/** Position enriched with the CURRENT home cell of the product (read-time). */
export interface ResolvedPosition extends PickListPosition {
  cell: string | null;
}

/**
 * «Yig'ish ro'yxatlari» — pick lists mirrored from the real MoySklad account.
 * The list/detail read side; the poller lives in PickListSyncService.
 *
 * Cells are resolved at READ time (not stored): the owner keeps re-binding
 * products to cells from the phone, and the print must always show the
 * current address. Match key = product.externalCode === MoySklad assortment
 * UUID (how the bulk import wrote every product), with a barcode fallback
 * for products created after the import.
 */
@Injectable()
export class PickListService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, query: Record<string, unknown>) {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const offset = Math.max(Number(query.offset) || 0, 0);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    // Owner 2026-07-27: show only the configured stores for now (Иподром);
    // every order is still SYNCED, so adding a store later reveals history.
    const stores = allowedStoreNames();
    const where = {
      accountId,
      // «Проведено» unchecked = not a real sale (owner 2026-07-27) — hidden;
      // re-proving the order in MoySklad brings it back within a tick.
      applicable: true,
      ...(stores.length ? { storeName: { in: stores } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { agentName: { contains: search, mode: 'insensitive' as const } },
              { ownerName: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.client.msPickList.findMany({
        where,
        orderBy: { moment: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.client.msPickList.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        docType: r.docType,
        moment: r.moment,
        agentName: r.agentName,
        storeName: r.storeName,
        ownerName: r.ownerName,
        sumMinor: r.sumMinor,
        payedMinor: r.payedMinor,
        positionsCount: Array.isArray(r.positions) ? r.positions.length : 0,
        printedAt: r.printedAt,
      })),
      total,
    };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.msPickList.findFirst({ where: { id, accountId } });
    if (!row) throw new NotFoundException(`Pick list ${id} not found`);
    const positions = (Array.isArray(row.positions)
      ? row.positions
      : []) as unknown as PickListPosition[];
    const resolved = await this.resolveCells(accountId, positions);
    return { ...row, positions: resolved };
  }

  /** Stamp printedAt (idempotent — the first print wins, reprints keep it). */
  async markPrinted(accountId: string, id: string) {
    const row = await this.prisma.client.msPickList.findFirst({
      where: { id, accountId },
      select: { id: true, printedAt: true },
    });
    if (!row) throw new NotFoundException(`Pick list ${id} not found`);
    if (row.printedAt) return { id, printedAt: row.printedAt };
    const upd = await this.prisma.client.msPickList.update({
      where: { id },
      data: { printedAt: new Date() },
      select: { id: true, printedAt: true },
    });
    return upd;
  }

  /** Home cells for OUR products by id — the «Печать → Лист сборки» action on
   *  customer-orders/new + sales-returns/new resolves cells for the positions
   *  currently in the form. */
  async cellsByProductIds(
    accountId: string,
    raw: unknown,
  ): Promise<{ cells: Record<string, string | null> }> {
    const ids =
      typeof raw === 'string'
        ? raw
            .split(',')
            .map((s) => s.trim())
            .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
            .slice(0, 500)
        : [];
    if (!ids.length) return { cells: {} };
    const products = await this.prisma.client.product.findMany({
      where: { accountId, id: { in: ids }, deletedAt: null },
      select: { id: true, attributes: true },
    });
    const cells: Record<string, string | null> = {};
    for (const p of products) {
      const attrs = p.attributes as Record<string, unknown> | null;
      const v = attrs?.__yacheyka;
      cells[p.id] = typeof v === 'string' && v.length > 0 ? v : null;
    }
    return { cells };
  }

  /** Attach each position's CURRENT home cell (__yacheyka) from our products. */
  private async resolveCells(
    accountId: string,
    positions: PickListPosition[],
  ): Promise<ResolvedPosition[]> {
    const extIds = [...new Set(positions.map((p) => p.msAssortmentId).filter(Boolean))] as string[];
    const barcodes = [...new Set(positions.map((p) => p.barcode).filter(Boolean))] as string[];
    // PROD reality (2026-07-27 live check): our products carry NO externalCode
    // and their barcodes differ from MoySklad's — but `code` is IDENTICAL in
    // both systems (8/8 sample hit). Code is the workhorse key; externalCode/
    // barcode stay for accounts where they do line up.
    const codes = [...new Set(positions.map((p) => p.code).filter(Boolean))] as string[];
    const products = await this.prisma.client.product.findMany({
      where: {
        accountId,
        deletedAt: null,
        OR: [
          ...(extIds.length ? [{ externalCode: { in: extIds } }] : []),
          ...(barcodes.length ? [{ barcodes: { hasSome: barcodes } }] : []),
          ...(codes.length ? [{ code: { in: codes } }] : []),
        ],
      },
      select: { externalCode: true, barcodes: true, code: true, attributes: true },
    });
    const cellOf = (attrs: unknown): string | null => {
      if (attrs && typeof attrs === 'object' && '__yacheyka' in attrs) {
        const v = (attrs as Record<string, unknown>).__yacheyka;
        return typeof v === 'string' && v.length > 0 ? v : null;
      }
      return null;
    };
    const byExt = new Map<string, string | null>();
    const byBarcode = new Map<string, string | null>();
    const byCode = new Map<string, string | null>();
    for (const p of products) {
      const cell = cellOf(p.attributes);
      if (p.externalCode) byExt.set(p.externalCode, cell);
      if (p.code && !byCode.has(p.code)) byCode.set(p.code, cell);
      for (const b of p.barcodes ?? []) if (!byBarcode.has(b)) byBarcode.set(b, cell);
    }
    return positions.map((p) => ({
      ...p,
      cell:
        (p.msAssortmentId ? byExt.get(p.msAssortmentId) : null) ??
        (p.barcode ? byBarcode.get(p.barcode) : null) ??
        (p.code ? (byCode.get(p.code) ?? null) : null),
    }));
  }
}
