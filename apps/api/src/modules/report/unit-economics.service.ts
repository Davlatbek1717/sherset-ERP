import { Prisma } from '@moysklad/db';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
// Analitika TZ §4 — yagona formulalar qatlami.
import { grossProfitMinor, marginPercentText } from './metrics/index.js';
import { reportDateBounds } from './report-date-bounds.util.js';
import { consolidateToBase, loadRateContext } from './report-rate-ctx.util.js';

/**
 * «Юнит-экономика» (Unit Economics) — moysklad-parity per-SKU
 * unit-margin breakdown. While Profitability reports per-product
 * TOTALS over a window, Unit Economics shows the average per-unit
 * economics — how much each individual unit sold contributed:
 *
 *   avgPrice    = revenue / qtySold        (after discount)
 *   avgCost     = COGS    / qtySold        (FIFO at post)
 *   avgMargin   = avgPrice − avgCost
 *   marginPct   = avgMargin / avgPrice × 100
 *
 * Plus the underlying volume so the buyer can spot:
 *   • high-volume / low-margin SKUs (cash-cow that needs a price bump)
 *   • low-volume / high-margin SKUs (premium niche worth promoting)
 *   • negative-margin SKUs (loss-leaders to discontinue)
 *
 * Source: same demand_positions × demands JOIN as Profitability,
 * but rows additionally surface the per-unit averages.
 */
export const UnitEconomicsFilterSchema = z.object({
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
  storeId: z.string().uuid().optional(),
  /** Minimum qty threshold to filter out one-off/test sales. Default 1. */
  minQty: z.coerce.number().min(0).default(1),
  /** Cap rows. Default 200, max 2000. */
  limit: z.coerce.number().int().min(1).max(2000).default(200),
});
export type UnitEconomicsFilter = z.infer<typeof UnitEconomicsFilterSchema>;

export interface UnitEconomicsRow {
  productId: string;
  name: string;
  code: string | null;
  uom: string | null;
  /** Total qty sold (Decimal as string). */
  quantitySold: string;
  /** Number of distinct demands the product appeared in. */
  ordersCount: number;
  /** Total revenue (tiyin, BigInt as string). */
  revenueMinor: string;
  /** Total COGS (tiyin). */
  cogsMinor: string;
  /** Per-unit avg price (revenue / qty), in tiyin (BigInt as string). */
  avgPriceMinor: string;
  /** Per-unit avg cost (COGS / qty), in tiyin. */
  avgCostMinor: string;
  /** Per-unit avg margin (avgPrice − avgCost), in tiyin. */
  avgMarginMinor: string;
  /** Margin % as 2-decimal string; empty when revenue=0. */
  marginPercent: string;
}

export interface UnitEconomicsReport {
  filter: UnitEconomicsFilter;
  totals: {
    quantitySold: string;
    ordersCount: number;
    revenueMinor: string;
    cogsMinor: string;
    avgMarginMinor: string;
    marginPercent: string;
  };
  rows: UnitEconomicsRow[];
  /** Account base (валюта учёта). Revenue is consolidated into it; COGS is
   * already base (normalized at supply-post, §Tier-2 step A). */
  currency: string;
  /** True when sales in scope span >1 currency (revenue is converted). */
  mixedCurrency: boolean;
}

@Injectable()
export class UnitEconomicsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async report(accountId: string, raw: unknown): Promise<UnitEconomicsReport> {
    const filter = UnitEconomicsFilterSchema.parse(raw);
    // Date-only range → Asia/Tashkent calendar-day half-open UTC window.
    const { gte, lt } = reportDateBounds(filter.dateFrom, filter.dateTo);
    const ctx = await loadRateContext(this.prisma.client, accountId);
    const seen = new Set<string>();

    // One row per (product, currency). Revenue is in the demand's currency,
    // so it must be base-consolidated before products are ranked/aggregated;
    // COGS (dp.cost_minor) is already base (§Tier-2 step A). minQty / order /
    // limit are applied per-PRODUCT in JS (a SQL HAVING/LIMIT here would act
    // per (product,currency) and double-count multi-currency products).
    type Row = {
      product_id: string;
      name: string | null;
      code: string | null;
      uom: string | null;
      currency: string;
      quantity_sold: string;
      orders_count: bigint;
      revenue_minor: bigint;
      cogs_minor: bigint;
    };

    const storeFilter = filter.storeId
      ? Prisma.sql`AND d.store_id = ${filter.storeId}::uuid`
      : Prisma.empty;

    const rows = await this.prisma.client.$queryRaw<Row[]>`
      SELECT
        dp.product_id::text                                          AS product_id,
        p.name                                                       AS name,
        p.code                                                       AS code,
        p.uom                                                        AS uom,
        d.currency                                                   AS currency,
        SUM(dp.quantity)::text                                       AS quantity_sold,
        COUNT(DISTINCT dp.demand_id)::bigint                         AS orders_count,
        SUM(
          (dp.quantity * dp.price_minor * (100 - dp.discount) / 100)::numeric
        )::bigint                                                    AS revenue_minor,
        SUM(
          (dp.quantity * COALESCE(dp.cost_minor, 0))::numeric
        )::bigint                                                    AS cogs_minor
      FROM demand_positions dp
      INNER JOIN demands d
        ON d.id = dp.demand_id
       AND d.account_id = ${accountId}::uuid
       AND d.state = 'posted'
       AND d.deleted_at IS NULL
       AND d.moment >= ${gte}::timestamptz
       AND d.moment < ${lt}::timestamptz
       ${storeFilter}
      LEFT JOIN products p ON p.id = dp.product_id
      WHERE dp.product_id IS NOT NULL
      GROUP BY dp.product_id, p.name, p.code, p.uom, d.currency
    `;

    // Fold (product, currency) rows into one per product, consolidating
    // revenue to base and summing the already-base COGS.
    type Agg = {
      name: string;
      code: string | null;
      uom: string | null;
      qty: number;
      orders: number;
      revenue: bigint;
      cogs: bigint;
    };
    const byProduct = new Map<string, Agg>();
    for (const r of rows) {
      let a = byProduct.get(r.product_id);
      if (!a) {
        a = {
          name: r.name ?? '—',
          code: r.code,
          uom: r.uom,
          qty: 0,
          orders: 0,
          revenue: 0n,
          cogs: 0n,
        };
        byProduct.set(r.product_id, a);
      }
      a.qty += Number.parseFloat(r.quantity_sold);
      a.orders += Number(r.orders_count);
      a.revenue += consolidateToBase(r.revenue_minor, r.currency, ctx, seen);
      a.cogs += r.cogs_minor;
    }

    let out: UnitEconomicsRow[] = [];
    for (const [productId, a] of byProduct) {
      if (a.qty < filter.minQty) continue; // per-product minQty (was SQL HAVING)
      const qty = a.qty;
      const revenue = a.revenue;
      const cogs = a.cogs;
      const avgPriceMinor = qty > 0 ? BigInt(Math.round(Number(revenue) / qty)) : 0n;
      const avgCostMinor = qty > 0 ? BigInt(Math.round(Number(cogs) / qty)) : 0n;
      const avgMarginMinor = avgPriceMinor - avgCostMinor;
      // Yagona qatlam (analitika TZ §4). Ilgari bu yerda foyda QAYTA
      // hisoblanardi (`Number(revenue) - Number(cogs)`) — ikki marta yozilgan
      // formula ikkinchi javob manbai; endi bitta.
      const pct = marginPercentText(grossProfitMinor(revenue, cogs), revenue);
      out.push({
        productId,
        name: a.name,
        code: a.code,
        uom: a.uom,
        quantitySold: qty.toString(),
        ordersCount: a.orders,
        revenueMinor: revenue.toString(),
        cogsMinor: cogs.toString(),
        avgPriceMinor: avgPriceMinor.toString(),
        avgCostMinor: avgCostMinor.toString(),
        avgMarginMinor: avgMarginMinor.toString(),
        marginPercent: pct,
      });
    }
    // Rank by base revenue desc, then cap (was SQL ORDER BY / LIMIT).
    out.sort((x, y) => {
      const xr = BigInt(x.revenueMinor);
      const yr = BigInt(y.revenueMinor);
      return yr > xr ? 1 : yr < xr ? -1 : 0;
    });
    out = out.slice(0, filter.limit);

    const totalQty = out.reduce((acc, r) => acc + Number.parseFloat(r.quantitySold), 0);
    const totalOrders = out.reduce((acc, r) => acc + r.ordersCount, 0);
    const totalRevenue = out.reduce((acc, r) => acc + BigInt(r.revenueMinor), 0n);
    const totalCogs = out.reduce((acc, r) => acc + BigInt(r.cogsMinor), 0n);
    const avgMargin =
      totalQty > 0 ? BigInt(Math.round(Number(totalRevenue - totalCogs) / totalQty)) : 0n;
    const totalPct = marginPercentText(grossProfitMinor(totalRevenue, totalCogs), totalRevenue);

    return {
      filter,
      totals: {
        quantitySold: totalQty.toString(),
        ordersCount: totalOrders,
        revenueMinor: totalRevenue.toString(),
        cogsMinor: totalCogs.toString(),
        avgMarginMinor: avgMargin.toString(),
        marginPercent: totalPct,
      },
      rows: out,
      currency: ctx.baseCode,
      mixedCurrency: seen.size > 1,
    };
  }
}
