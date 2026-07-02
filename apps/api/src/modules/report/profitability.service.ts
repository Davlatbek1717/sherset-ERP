import { Prisma } from '@moysklad/db';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { reportDateBounds } from './report-date-bounds.util.js';
import { consolidateToBase, loadRateContext } from './report-rate-ctx.util.js';

/**
 * «Прибыльность» (Profitability) report — moysklad-parity per-SKU
 * margin breakdown for a given period.
 *
 * For each product sold in the window:
 *   revenue   = SUM(qty × price × (1 − discount/100))    (after-discount)
 *   cogs      = SUM(qty × DemandPosition.costMinor)      (FIFO at post)
 *   margin    = revenue − cogs
 *   marginPct = margin / revenue × 100  (empty string when revenue=0)
 *
 * Read off `demand_positions` joined to `demands` (state='posted',
 * not soft-deleted, moment in range). Returns ordered by margin
 * descending so the most profitable SKUs are at the top by default;
 * the UI can re-sort.
 *
 * Per-product only in this version. Future grouping (by counterparty
 * / employee / store) will land as additional `groupBy` enum values.
 */
export const ProfitabilityFilterSchema = z.object({
  /** ISO date or datetime — inclusive lower bound on Demand.moment. */
  dateFrom: z.coerce.date(),
  /** Inclusive upper bound; the service applies end-of-day for date-only. */
  dateTo: z.coerce.date(),
  /** Optional store filter — restricts to demands from a single store. */
  storeId: z.string().uuid().optional(),
  /** Optional product filter — restricts to one SKU (drill-down). */
  productId: z.string().uuid().optional(),
  /** Cap rows. Default 200, max 2000. */
  limit: z.coerce.number().int().min(1).max(2000).default(200),
  /** Hide products with zero revenue (rare but happens for free-with-purchase items). */
  excludeZeroRevenue: z.coerce.boolean().default(true),
});
export type ProfitabilityFilter = z.infer<typeof ProfitabilityFilterSchema>;

export interface ProfitabilityRow {
  productId: string;
  name: string;
  code: string | null;
  uom: string | null;
  /** Total qty sold in the window (Decimal as string). */
  quantitySold: string;
  /** Revenue in tiyin (BigInt as string). */
  revenueMinor: string;
  /** COGS in tiyin (BigInt as string). */
  cogsMinor: string;
  /** Gross margin in tiyin (BigInt as string) = revenue − COGS. */
  marginMinor: string;
  /** Margin percentage as a string with 2 decimals; empty when revenue=0. */
  marginPercent: string;
}

export interface ProfitabilityReport {
  filter: ProfitabilityFilter;
  /** Window-wide totals across all matching positions. */
  totals: {
    quantitySold: string;
    revenueMinor: string;
    cogsMinor: string;
    marginMinor: string;
    marginPercent: string;
  };
  rows: ProfitabilityRow[];
  /** Account base (валюта учёта) — revenue consolidated; COGS already base. */
  currency: string;
  /** True when source demands span >1 currency (revenue is converted). */
  mixedCurrency: boolean;
}

@Injectable()
export class ProfitabilityService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async report(accountId: string, raw: unknown): Promise<ProfitabilityReport> {
    const filter = ProfitabilityFilterSchema.parse(raw);
    // Date-only range → Asia/Tashkent calendar-day half-open UTC window.
    const { gte, lt } = reportDateBounds(filter.dateFrom, filter.dateTo);

    const ctx = await loadRateContext(this.prisma.client, accountId);
    const seen = new Set<string>();

    type Row = {
      product_id: string;
      currency: string;
      name: string | null;
      code: string | null;
      uom: string | null;
      quantity_sold: string;
      revenue_minor: bigint;
      cogs_minor: bigint;
    };

    // Group by (product, currency): revenue (price, demand currency) is
    // base-consolidated per currency in TS; COGS (dp.cost_minor — FIFO cost,
    // already base after supply-post normalization) is summed directly;
    // margin/ranking/excludeZeroRevenue applied AFTER consolidation. SQL
    // LIMIT/HAVING/ORDER dropped → JS does it on base figures.
    const storeFilter = filter.storeId
      ? Prisma.sql`AND d.store_id = ${filter.storeId}::uuid`
      : Prisma.empty;
    const productFilter = filter.productId
      ? Prisma.sql`AND dp.product_id = ${filter.productId}::uuid`
      : Prisma.empty;

    const rows = await this.prisma.client.$queryRaw<Row[]>`
      SELECT
        dp.product_id::text                                          AS product_id,
        d.currency                                                   AS currency,
        p.name                                                       AS name,
        p.code                                                       AS code,
        p.uom                                                        AS uom,
        SUM(dp.quantity)::text                                       AS quantity_sold,
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
        ${productFilter}
      GROUP BY dp.product_id, d.currency, p.name, p.code, p.uom
    `;

    type Agg = {
      name: string | null;
      code: string | null;
      uom: string | null;
      qty: number;
      revenue: bigint;
      cogs: bigint;
    };
    const byProduct = new Map<string, Agg>();
    for (const r of rows) {
      const acc = byProduct.get(r.product_id) ?? {
        name: r.name,
        code: r.code,
        uom: r.uom,
        qty: 0,
        revenue: 0n,
        cogs: 0n,
      };
      acc.qty += Number.parseFloat(r.quantity_sold);
      acc.revenue += consolidateToBase(r.revenue_minor, r.currency, ctx, seen);
      acc.cogs += r.cogs_minor; // already base
      byProduct.set(r.product_id, acc);
    }

    let out: ProfitabilityRow[] = [...byProduct.entries()].map(([productId, a]) => {
      const margin = a.revenue - a.cogs;
      const pct = a.revenue === 0n ? '' : ((Number(margin) / Number(a.revenue)) * 100).toFixed(2);
      return {
        productId,
        name: a.name ?? '—',
        code: a.code,
        uom: a.uom,
        quantitySold: a.qty.toString(),
        revenueMinor: a.revenue.toString(),
        cogsMinor: a.cogs.toString(),
        marginMinor: margin.toString(),
        marginPercent: pct,
      };
    });
    if (filter.excludeZeroRevenue) out = out.filter((r) => BigInt(r.revenueMinor) > 0n);
    out.sort((x, y) =>
      BigInt(y.marginMinor) > BigInt(x.marginMinor)
        ? 1
        : BigInt(y.marginMinor) < BigInt(x.marginMinor)
          ? -1
          : 0,
    );
    out = out.slice(0, filter.limit);

    const totalQty = out.reduce((acc, r) => acc + Number.parseFloat(r.quantitySold), 0);
    const totalRevenue = out.reduce((acc, r) => acc + BigInt(r.revenueMinor), 0n);
    const totalCogs = out.reduce((acc, r) => acc + BigInt(r.cogsMinor), 0n);
    const totalMargin = totalRevenue - totalCogs;
    const totalPct =
      totalRevenue === 0n ? '' : ((Number(totalMargin) / Number(totalRevenue)) * 100).toFixed(2);

    return {
      filter,
      totals: {
        quantitySold: totalQty.toString(),
        revenueMinor: totalRevenue.toString(),
        cogsMinor: totalCogs.toString(),
        marginMinor: totalMargin.toString(),
        marginPercent: totalPct,
      },
      rows: out,
      currency: ctx.baseCode,
      mixedCurrency: seen.size > 1,
    };
  }
}
