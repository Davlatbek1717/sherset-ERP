import { Prisma } from '@moysklad/db';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Expected-incoming («Ожидание» / in-transit) quantity — computed QUERY-TIME
 * from active supplier-order positions, NOT read from the (dropped) always-0
 * `Stock.inTransitQty` column.
 *
 * Single source of truth for the in-transit computation, shared by every
 * consumer (stock-balance report flat + grouped, products list). Keeping the
 * `IN_TRANSIT_PO_STATES` set and the per-position clamp in ONE place is the
 * point: if two call-sites each re-implemented the query they would silently
 * drift (the exact silent-wrong-number class the stock-ledger work guards
 * against). Design + grounding: `_IN-TRANSIT-OZHIDANIE-DESIGN-2026-06-12.md`.
 */

/**
 * PO states whose UNRECEIVED positions count as expected-incoming
 * («Ожидание» / in-transit). Grounded against the Sprint-4.4 receipt cascade
 * (purchase-order.service.ts:applyReceipt): `confirmed` = ordered, nothing
 * received yet (full qty expected); `partially_received` = remainder expected.
 * `draft`/`sent` are not yet committed; `fully_received` contributes 0 by
 * construction; `closed`/`cancelled`/soft-deleted are excluded.
 * See `_IN-TRANSIT-OZHIDANIE-DESIGN-2026-06-12.md` §5.
 *
 * NOTE — deliberately NOT gated on `PurchaseOrder.waiting`: that is a manual
 * «Поставить в ожидание» on-hold UI marker (purchase-order.service.ts:602-610,
 * defaults false), a distinct concept from stock in-transit. Gating on it would
 * make «Ожидание» vacuously 0.
 */
export const IN_TRANSIT_PO_STATES = ['confirmed', 'partially_received'];

const DECIMAL_ZERO = new Prisma.Decimal(0);

/** Map key for the per-(store, assortment) in-transit bucket (flat mode). */
export function inTransitStoreKey(storeId: string | null, kind: string, id: string): string {
  return `${storeId ?? ''}|${kind}|${id}`;
}

/** Map key for the per-assortment in-transit bucket (grouped-across-stores). */
export function inTransitAssortmentKey(kind: string, id: string): string {
  return `${kind}|${id}`;
}

@Injectable()
export class StockInTransitService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Per-position un-received quantity over the in-transit PO states, clamped
   * with MAX(0, quantity − receivedQty). Returns one entry per qualifying
   * position (un-aggregated) — `getInTransitMap` / `getInTransitByAssortment`
   * fold these into the keying their caller needs.
   *
   * The clamp is PER POSITION (not Σqty − Σreceived): an over-received line
   * must contribute 0, never a negative that would silently erode another
   * line's expected-incoming.
   */
  private async queryInTransitPositions(
    accountId: string,
    opts: { storeId?: string; assortmentIds?: string[] },
  ): Promise<
    Array<{
      storeId: string;
      assortmentKind: string;
      assortmentId: string;
      remaining: Prisma.Decimal;
    }>
  > {
    const positions = await this.prisma.client.purchaseOrderPosition.findMany({
      where: {
        accountId,
        ...(opts.assortmentIds ? { assortmentId: { in: opts.assortmentIds } } : {}),
        purchaseOrder: {
          accountId,
          deletedAt: null,
          state: { in: IN_TRANSIT_PO_STATES },
          ...(opts.storeId ? { storeId: opts.storeId } : {}),
        },
      },
      select: {
        assortmentKind: true,
        assortmentId: true,
        quantity: true,
        receivedQty: true,
        purchaseOrder: { select: { storeId: true } },
      },
    });

    const out: Array<{
      storeId: string;
      assortmentKind: string;
      assortmentId: string;
      remaining: Prisma.Decimal;
    }> = [];
    for (const p of positions) {
      const remaining = p.quantity.minus(p.receivedQty);
      if (remaining.lessThanOrEqualTo(DECIMAL_ZERO)) continue; // MAX(0, …) — over/fully received contributes 0
      out.push({
        storeId: p.purchaseOrder.storeId,
        assortmentKind: p.assortmentKind,
        assortmentId: p.assortmentId,
        remaining,
      });
    }
    return out;
  }

  /** Expected-incoming per (store, assortment) — for the flat-by-store report. */
  async getInTransitMap(
    accountId: string,
    opts: { storeId?: string; assortmentIds?: string[] } = {},
  ): Promise<Map<string, Prisma.Decimal>> {
    const positions = await this.queryInTransitPositions(accountId, opts);
    const map = new Map<string, Prisma.Decimal>();
    for (const p of positions) {
      const key = inTransitStoreKey(p.storeId, p.assortmentKind, p.assortmentId);
      const prev = map.get(key);
      map.set(key, prev ? prev.plus(p.remaining) : p.remaining);
    }
    return map;
  }

  /**
   * Expected-incoming per assortment, summed across stores — grouped mode and
   * the products list (which aggregates Stock across stores too).
   */
  async getInTransitByAssortment(
    accountId: string,
    opts: { storeId?: string; assortmentIds?: string[] } = {},
  ): Promise<Map<string, Prisma.Decimal>> {
    const positions = await this.queryInTransitPositions(accountId, opts);
    const map = new Map<string, Prisma.Decimal>();
    for (const p of positions) {
      const key = inTransitAssortmentKey(p.assortmentKind, p.assortmentId);
      const prev = map.get(key);
      map.set(key, prev ? prev.plus(p.remaining) : p.remaining);
    }
    return map;
  }
}
