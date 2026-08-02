import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
// Analitika TZ §4 — yagona formulalar qatlami.
import { percent } from './metrics/index.js';
import { reportDateBounds } from './report-date-bounds.util.js';

export const AbcAnalysisFilterSchema = z.object({
  /** ISO date — defaults to "30 days ago" if omitted. */
  from: z.string().optional(),
  /** ISO date — defaults to today if omitted. */
  to: z.string().optional(),
  /** Cap number of products returned. Default 200. */
  limit: z.coerce.number().int().min(1).max(2000).default(200),
});
export type AbcAnalysisFilter = z.infer<typeof AbcAnalysisFilterSchema>;

interface AbcRow {
  productId: string;
  name: string;
  code: string | null;
  qty: string;
  revenueMinor: string;
  cumulativeShare: number;
  classGroup: 'A' | 'B' | 'C';
}

interface AbcSummary {
  classGroup: 'A' | 'B' | 'C';
  itemCount: number;
  qty: string;
  revenueMinor: string;
  share: number;
}

interface AbcResponse {
  from: string;
  to: string;
  totalRevenueMinor: string;
  rows: AbcRow[];
  summary: AbcSummary[];
}

/**
 * ABC analysis report.
 *
 * Sorts products by total revenue from posted Demands in the period
 * (descending) and classifies them by Pareto cumulative share:
 *   class A — top 80% of revenue
 *   class B — next 15%
 *   class C — bottom  5%
 *
 * moysklad-equivalent: "ABC-анализ по выручке". Used by procurement and
 * pricing teams to prioritise high-value items.
 *
 * Notes:
 *   • Uses position-level sumMinor (after discount, before VAT-net split).
 *     This matches moysklad's display and matches the sales report.
 *   • SalesReturn is netted into the revenue (returns reduce class share).
 *   • Variants/bundles aggregate up to their parent product if the
 *     position assortmentKind is 'product'; variant/bundle positions
 *     show as separate rows.
 *   • Empty period (no demands) returns an empty rows[] + summary.
 */
@Injectable()
export class AbcAnalysisService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async report(accountId: string, rawFilter: unknown): Promise<AbcResponse> {
    const filter = AbcAnalysisFilterSchema.parse(rawFilter);
    const to = filter.to ? new Date(filter.to) : new Date();
    const from = filter.from
      ? new Date(filter.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    // Asia/Tashkent calendar-day half-open window [gte, lt) — a date-only `to`
    // must include the WHOLE last day (`moment <= to` dropped it). See util.
    const { gte, lt } = reportDateBounds(from, to);

    type RawRow = {
      assortment_id: string;
      qty_total: string;
      revenue: bigint;
      product_id: string | null;
      name: string | null;
      code: string | null;
    };

    // Demand-side revenue per assortment.
    const demandRows = await this.prisma.client.$queryRaw<RawRow[]>`
      SELECT
        dp.assortment_id::text                                AS assortment_id,
        COALESCE(SUM(dp.quantity), 0)::text                   AS qty_total,
        COALESCE(SUM((dp.price_minor) * dp.quantity), 0)::bigint AS revenue,
        p.id::text                                            AS product_id,
        p.name                                                AS name,
        p.code                                                AS code
      FROM demand_positions dp
      JOIN demands d ON d.id = dp.demand_id
      LEFT JOIN products p ON p.id = dp.assortment_id
      WHERE d.account_id = ${accountId}::uuid
        AND d.state = 'posted'
        AND d.deleted_at IS NULL
        AND d.moment >= ${gte}
        AND d.moment < ${lt}
      GROUP BY dp.assortment_id, p.id, p.name, p.code
    `;

    // SalesReturn-side reductions per assortment (subtract).
    const returnRows = await this.prisma.client.$queryRaw<
      Array<{ assortment_id: string; qty_total: string; revenue: bigint }>
    >`
      SELECT
        srp.assortment_id::text                                AS assortment_id,
        COALESCE(SUM(srp.quantity), 0)::text                   AS qty_total,
        COALESCE(SUM((srp.price_minor) * srp.quantity), 0)::bigint AS revenue
      FROM sales_return_positions srp
      JOIN sales_returns sr ON sr.id = srp.sales_return_id
      WHERE sr.account_id = ${accountId}::uuid
        AND sr.state = 'posted'
        AND sr.deleted_at IS NULL
        AND sr.moment >= ${gte}
        AND sr.moment < ${lt}
      GROUP BY srp.assortment_id
    `;

    const returnsMap = new Map<string, { qty: number; revenue: bigint }>();
    for (const r of returnRows) {
      returnsMap.set(r.assortment_id, {
        qty: Number(r.qty_total),
        revenue: r.revenue,
      });
    }

    const merged = demandRows.map((d) => {
      const ret = returnsMap.get(d.assortment_id) ?? { qty: 0, revenue: 0n };
      const netRevenue = d.revenue - ret.revenue;
      const netQty = Number(d.qty_total) - ret.qty;
      return {
        productId: d.product_id ?? d.assortment_id,
        name: d.name ?? '(unknown)',
        code: d.code,
        qty: netQty,
        revenueMinor: netRevenue,
      };
    });

    // Filter out zero/negative revenue items, sort by revenue desc.
    const positive = merged
      .filter((x) => x.revenueMinor > 0n)
      .sort((a, b) =>
        a.revenueMinor < b.revenueMinor ? 1 : a.revenueMinor > b.revenueMinor ? -1 : 0,
      );

    const totalRevenue = positive.reduce((acc, r) => acc + r.revenueMinor, 0n);
    const rows: AbcRow[] = [];
    let cumulative = 0n;
    for (const r of positive.slice(0, filter.limit)) {
      cumulative += r.revenueMinor;
      // Yagona qatlam (analitika TZ §4). Ilgari bu yerda `(x * 10000n) / total`
      // KESILARDI, boshqa hisobotlar esa yaxlitlardi. Endi sinf chegarasi
      // (A ≤ 80 %) aynan KO'RSATILADIGAN ulushdan hisoblanadi — ko'rgan raqami
      // bilan tegishli sinfi bir-biriga mos keladi.
      const share = percent(cumulative, totalRevenue) ?? 0;
      const classGroup: 'A' | 'B' | 'C' = share <= 80 ? 'A' : share <= 95 ? 'B' : 'C';
      rows.push({
        productId: r.productId,
        name: r.name,
        code: r.code,
        qty: r.qty.toString(),
        revenueMinor: r.revenueMinor.toString(),
        cumulativeShare: share,
        classGroup,
      });
    }

    // Roll up to summary by class.
    const summary: AbcSummary[] = (['A', 'B', 'C'] as const).map((cls) => {
      const cohort = rows.filter((r) => r.classGroup === cls);
      const cohortRevenue = cohort.reduce((acc, r) => acc + BigInt(r.revenueMinor), 0n);
      const cohortQty = cohort.reduce((acc, r) => acc + Number(r.qty), 0);
      const share = percent(cohortRevenue, totalRevenue) ?? 0;
      return {
        classGroup: cls,
        itemCount: cohort.length,
        qty: cohortQty.toString(),
        revenueMinor: cohortRevenue.toString(),
        share,
      };
    });

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totalRevenueMinor: totalRevenue.toString(),
      rows,
      summary,
    };
  }
}
