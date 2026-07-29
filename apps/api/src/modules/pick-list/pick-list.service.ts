import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/** One snapshot position (kept for the dormant external-sync service's type). */
export interface PickListPosition {
  msAssortmentId: string | null;
  name: string;
  qty: number;
  code: string | null;
  barcode: string | null;
  priceMinor?: number;
  discount?: number;
  uom?: string | null;
}

/** One resolved pick-list position (product + its CURRENT home cell). */
export interface ResolvedPosition {
  name: string;
  qty: number;
  uom: string | null;
  cell: string | null;
}

/**
 * «Yig'ish ro'yxatlari» — pick lists sourced from OUR OWN «Счёт покупателю»
 * (InvoiceOut) documents (own-orders variant, owner 2026-07-28: sales live in
 * THIS app as invoices-out, not mirrored from an external MoySklad account).
 * The list is the warehouse screen; each invoice prints a 72mm pick list
 * grouped by cell («Лист сборки»).
 *
 * Cells are resolved at READ time from the product's `__yacheyka` attribute —
 * re-binding a product to a new cell shows on the very next print. For our own
 * documents the position → product link is direct (productId), so no code/
 * barcode matching is needed.
 */
@Injectable()
export class PickListService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, query: Record<string, unknown>) {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const offset = Math.max(Number(query.offset) || 0, 0);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const where = {
      accountId,
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { agent: { name: { contains: search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.client.invoiceOut.findMany({
        where,
        orderBy: { moment: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          name: true,
          moment: true,
          sumMinor: true,
          payedSumMinor: true,
          agent: { select: { name: true } },
          store: { select: { name: true } },
          owner: { select: { name: true } },
          _count: { select: { positions: true } },
        },
      }),
      this.prisma.client.invoiceOut.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        docType: 'invoiceout',
        moment: r.moment,
        agentName: r.agent?.name ?? null,
        storeName: r.store?.name ?? null,
        ownerName: r.owner?.name ?? null,
        sumMinor: r.sumMinor,
        payedMinor: r.payedSumMinor,
        positionsCount: r._count.positions,
        // Own orders carry no pick-print flag — always «new» (feature parity dropped).
        printedAt: null as Date | null,
      })),
      total,
    };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.invoiceOut.findFirst({
      where: { id, accountId, deletedAt: null },
      select: {
        id: true,
        name: true,
        moment: true,
        description: true,
        agent: { select: { name: true, phone: true } },
        owner: { select: { name: true } },
        positions: {
          orderBy: { position: 'asc' },
          select: {
            quantity: true,
            product: { select: { name: true, uom: true, attributes: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException(`Invoice ${id} not found`);
    const positions: ResolvedPosition[] = row.positions.map((p) => ({
      name: p.product?.name ?? '?',
      qty: Number(p.quantity),
      uom: p.product?.uom ?? null,
      cell: cellOf(p.product?.attributes),
    }));
    return {
      id: row.id,
      name: row.name,
      docType: 'invoiceout',
      moment: row.moment,
      agentName: row.agent?.name ?? null,
      agentPhone: row.agent?.phone ?? null,
      ownerName: row.owner?.name ?? null,
      description: row.description,
      positions,
    };
  }

  /** No-op in the own-orders variant (own orders have no pick-print flag). */
  async markPrinted(_accountId: string, id: string) {
    return { id, printedAt: null as Date | null };
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
      cells[p.id] = cellOf(p.attributes);
    }
    return { cells };
  }
}

/** Read the product's home cell from its `__yacheyka` attribute (else null). */
function cellOf(attrs: unknown): string | null {
  if (attrs && typeof attrs === 'object' && '__yacheyka' in attrs) {
    const v = (attrs as Record<string, unknown>).__yacheyka;
    return typeof v === 'string' && v.length > 0 ? v : null;
  }
  return null;
}
