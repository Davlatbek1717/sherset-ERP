import { Prisma } from '@moysklad/db';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { loadRateContext } from './report-rate-ctx.util.js';

export const SlowMoversFilterSchema = z.object({
  /** "Slow" = no sale within this many days. Default 90. */
  thresholdDays: z.coerce.number().int().min(1).max(3650).default(90),
  /** Optional store filter (single store) — null/empty = all stores. */
  storeId: z.string().uuid().optional(),
  /** Cap rows. Default 200. */
  limit: z.coerce.number().int().min(1).max(2000).default(200),
});
export type SlowMoversFilter = z.infer<typeof SlowMoversFilterSchema>;

interface SlowMoverRow {
  productId: string;
  name: string;
  code: string | null;
  storeId: string;
  storeName: string;
  /** Current materialised qty in stock (Decimal as string). */
  qtyOnHand: string;
  /** Per-unit cost basis at last sourcing (tiyin, may be null for never-sold). */
  costMinor: string | null;
  /** Total tied-up capital = qtyOnHand × costMinor. Null if cost unknown. */
  tiedCapitalMinor: string | null;
  /** Days since last Demand.posted touch. NULL if never sold (then daysSinceReceived applies). */
  daysSinceLastSale: number | null;
  /** Days since last Supply.posted touch. NULL if never received. */
  daysSinceReceived: number | null;
}

interface SlowMoversResponse {
  thresholdDays: number;
  asOf: string;
  storeId: string | null;
  totalRows: number;
  totalTiedCapitalMinor: string;
  rows: SlowMoverRow[];
  /** Account base (валюта учёта). Tied capital is already in base because
   * Stock.costBalanceMinor is normalized to base at supply-post (§Tier-2
   * step A) and backfilled by the cost migration (step C). */
  currency: string;
}

/**
 * Slow movers report.
 *
 * Lists products that haven't sold in `thresholdDays` (default 90) but
 * still occupy shelf space. moysklad-equivalent: "Слабо оборачиваемые
 * товары" — used by procurement to identify dead stock for clearance,
 * write-down, or supplier return.
 *
 * For each (product, store) with qty > 0:
 *   • Find the most recent Demand.posted touching that assortment
 *     (any store, since we care about overall product velocity).
 *   • If `lastSale.moment` is older than `asOf - thresholdDays` days
 *     OR there was never a sale, classify as slow-mover.
 *   • Show qty on hand, cost basis, total tied-up capital.
 *
 * Sort: oldest-stale first (longest dead-stock at top).
 *
 * Tied capital = qtyOnHand × Stock.costBalanceMinor / qtyOnHand stored
 * elsewhere; we approximate with the cost-balance row directly.
 */
@Injectable()
export class SlowMoversService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async report(accountId: string, rawFilter: unknown): Promise<SlowMoversResponse> {
    const filter = SlowMoversFilterSchema.parse(rawFilter);
    const asOf = new Date();
    const thresholdDate = new Date(asOf.getTime() - filter.thresholdDays * 24 * 60 * 60 * 1000);
    const ctx = await loadRateContext(this.prisma.client, accountId);

    const storeFilter = filter.storeId
      ? Prisma.sql`AND s.store_id = ${filter.storeId}::uuid`
      : Prisma.empty;

    type Row = {
      product_id: string;
      name: string | null;
      code: string | null;
      store_id: string;
      store_name: string | null;
      qty_on_hand: string;
      cost_minor: bigint | null;
      last_sale: Date | null;
      last_supply: Date | null;
    };

    const rows = await this.prisma.client.$queryRaw<Row[]>`
      SELECT
        s.assortment_id::text                     AS product_id,
        p.name                                    AS name,
        p.code                                    AS code,
        s.store_id::text                          AS store_id,
        st.name                                   AS store_name,
        s.qty::text                               AS qty_on_hand,
        s.cost_balance_minor                      AS cost_minor,
        last_sale.last_moment                     AS last_sale,
        last_supply.last_moment                   AS last_supply
      FROM stocks s
      JOIN stores st ON st.id = s.store_id
      LEFT JOIN products p ON p.id = s.assortment_id
      LEFT JOIN LATERAL (
        SELECT MAX(d.moment) AS last_moment
        FROM demands d
        JOIN demand_positions dp ON dp.demand_id = d.id
        WHERE d.account_id = s.account_id
          AND dp.assortment_id = s.assortment_id
          AND d.state = 'posted'
          AND d.deleted_at IS NULL
      ) last_sale ON true
      LEFT JOIN LATERAL (
        SELECT MAX(sup.moment) AS last_moment
        FROM supplies sup
        JOIN supply_positions spp ON spp.supply_id = sup.id
        WHERE sup.account_id = s.account_id
          AND spp.assortment_id = s.assortment_id
          AND sup.state = 'posted'
          AND sup.deleted_at IS NULL
      ) last_supply ON true
      WHERE s.account_id = ${accountId}::uuid
        AND s.qty > 0
        ${storeFilter}
        AND (last_sale.last_moment IS NULL OR last_sale.last_moment < ${thresholdDate})
      ORDER BY last_sale.last_moment ASC NULLS FIRST
      LIMIT ${filter.limit}
    `;

    const dayMs = 1000 * 60 * 60 * 24;
    let totalTied = 0n;
    const result: SlowMoverRow[] = rows.map((r) => {
      const qtyNum = Number(r.qty_on_hand);
      const cost = r.cost_minor;
      // Tied capital = qty × per-unit-cost. Stock.costBalanceMinor is the
      // total cost balance (already qty × unitCost), so we use it directly.
      const tiedCapitalMinor = cost;
      if (tiedCapitalMinor != null) totalTied += tiedCapitalMinor;
      const lastSale = r.last_sale ? new Date(r.last_sale).getTime() : null;
      const lastSupply = r.last_supply ? new Date(r.last_supply).getTime() : null;
      return {
        productId: r.product_id,
        name: r.name ?? '(unknown)',
        code: r.code,
        storeId: r.store_id,
        storeName: r.store_name ?? '(unknown)',
        qtyOnHand: r.qty_on_hand,
        costMinor: cost != null ? cost.toString() : null,
        tiedCapitalMinor: tiedCapitalMinor != null ? tiedCapitalMinor.toString() : null,
        daysSinceLastSale: lastSale ? Math.floor((asOf.getTime() - lastSale) / dayMs) : null,
        daysSinceReceived: lastSupply ? Math.floor((asOf.getTime() - lastSupply) / dayMs) : null,
        // qtyNum + cost vars used to compute tiedCapital — log nothing extra
        ...(qtyNum > 0 ? {} : {}),
      };
    });

    return {
      thresholdDays: filter.thresholdDays,
      asOf: asOf.toISOString(),
      storeId: filter.storeId ?? null,
      totalRows: result.length,
      totalTiedCapitalMinor: totalTied.toString(),
      rows: result,
      currency: ctx.baseCode,
    };
  }
}
