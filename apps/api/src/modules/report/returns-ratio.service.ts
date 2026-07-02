import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { reportDateBounds } from './report-date-bounds.util.js';

export const ReturnsRatioFilterSchema = z.object({
  /** ISO date — defaults to "30 days ago" if omitted. */
  from: z.string().optional(),
  /** ISO date — defaults to today if omitted. */
  to: z.string().optional(),
  /** Group breakdown by: 'product' (default) or 'counterparty'. */
  groupBy: z.enum(['product', 'counterparty']).default('product'),
  /** Include only rows with at least 1 return. Default true. */
  onlyWithReturns: z
    .preprocess((v) => {
      if (typeof v === 'string') return v === 'true' || v === '1';
      return v;
    }, z.boolean())
    .default(true),
  /** Cap rows. Default 200. */
  limit: z.coerce.number().int().min(1).max(2000).default(200),
});
export type ReturnsRatioFilter = z.infer<typeof ReturnsRatioFilterSchema>;

interface ReturnsRow {
  groupId: string;
  groupName: string;
  groupCode: string | null;
  soldQty: string;
  soldRevenueMinor: string;
  returnedQty: string;
  returnedRevenueMinor: string;
  /** returned / sold, %. 0 when sold=0. Capped at 1000% to avoid silly displays. */
  ratio: number;
}

interface ReturnsRatioResponse {
  from: string;
  to: string;
  groupBy: 'product' | 'counterparty';
  totals: {
    soldQty: string;
    soldRevenueMinor: string;
    returnedQty: string;
    returnedRevenueMinor: string;
    ratio: number;
  };
  rows: ReturnsRow[];
}

/**
 * Returns ratio report.
 *
 * Computes (returned / sold) per product or per counterparty over a
 * window. moysklad-equivalent: "Возвраты", "Доходность товаров".
 *
 * Inputs:
 *   • Demand.posted — sales side
 *   • SalesReturn.posted — returns side
 *
 * `groupBy='product'` — aggregates by `assortment_id`. Variants and
 * bundles show as their own rows (not rolled up to parent product —
 * moysklad's behaviour, since each variant has independent SKU).
 *
 * `groupBy='counterparty'` — aggregates by Demand.agent_id. Used by
 * sales managers to spot customers with abnormally high return rates.
 *
 * Ratio is computed on REVENUE (sumMinor) rather than QTY because that
 * matches accounting reporting and accommodates mixed-price returns.
 */
@Injectable()
export class ReturnsRatioService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async report(accountId: string, rawFilter: unknown): Promise<ReturnsRatioResponse> {
    const filter = ReturnsRatioFilterSchema.parse(rawFilter);
    const to = filter.to ? new Date(filter.to) : new Date();
    const from = filter.from
      ? new Date(filter.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    // Asia/Tashkent calendar-day half-open window [gte, lt) — a date-only `to`
    // must include the WHOLE last day (`moment <= to` dropped it). See util.
    const { gte, lt } = reportDateBounds(from, to);

    type SoldRow = {
      group_id: string;
      group_name: string | null;
      group_code: string | null;
      qty: string;
      revenue: bigint;
    };

    const sold =
      filter.groupBy === 'product'
        ? await this.prisma.client.$queryRaw<SoldRow[]>`
            SELECT
              dp.assortment_id::text                                AS group_id,
              p.name                                                AS group_name,
              p.code                                                AS group_code,
              COALESCE(SUM(dp.quantity), 0)::text                   AS qty,
              COALESCE(SUM(dp.price_minor * dp.quantity), 0)::bigint AS revenue
            FROM demand_positions dp
            JOIN demands d ON d.id = dp.demand_id
            LEFT JOIN products p ON p.id = dp.assortment_id
            WHERE d.account_id = ${accountId}::uuid
              AND d.state = 'posted'
              AND d.deleted_at IS NULL
              AND d.moment >= ${gte}
              AND d.moment < ${lt}
            GROUP BY dp.assortment_id, p.name, p.code
          `
        : await this.prisma.client.$queryRaw<SoldRow[]>`
            SELECT
              d.agent_id::text                                      AS group_id,
              c.name                                                AS group_name,
              c.code                                                AS group_code,
              COALESCE(SUM(dp.quantity), 0)::text                   AS qty,
              COALESCE(SUM(dp.price_minor * dp.quantity), 0)::bigint AS revenue
            FROM demands d
            JOIN demand_positions dp ON dp.demand_id = d.id
            JOIN counterparties c ON c.id = d.agent_id
            WHERE d.account_id = ${accountId}::uuid
              AND d.state = 'posted'
              AND d.deleted_at IS NULL
              AND d.moment >= ${gte}
              AND d.moment < ${lt}
            GROUP BY d.agent_id, c.name, c.code
          `;

    type ReturnedRow = { group_id: string; qty: string; revenue: bigint };
    const returned =
      filter.groupBy === 'product'
        ? await this.prisma.client.$queryRaw<ReturnedRow[]>`
            SELECT
              srp.assortment_id::text                                AS group_id,
              COALESCE(SUM(srp.quantity), 0)::text                   AS qty,
              COALESCE(SUM(srp.price_minor * srp.quantity), 0)::bigint AS revenue
            FROM sales_return_positions srp
            JOIN sales_returns sr ON sr.id = srp.sales_return_id
            WHERE sr.account_id = ${accountId}::uuid
              AND sr.state = 'posted'
              AND sr.deleted_at IS NULL
              AND sr.moment >= ${gte}
              AND sr.moment < ${lt}
            GROUP BY srp.assortment_id
          `
        : await this.prisma.client.$queryRaw<ReturnedRow[]>`
            SELECT
              sr.agent_id::text                                      AS group_id,
              COALESCE(SUM(srp.quantity), 0)::text                   AS qty,
              COALESCE(SUM(srp.price_minor * srp.quantity), 0)::bigint AS revenue
            FROM sales_returns sr
            JOIN sales_return_positions srp ON srp.sales_return_id = sr.id
            WHERE sr.account_id = ${accountId}::uuid
              AND sr.state = 'posted'
              AND sr.deleted_at IS NULL
              AND sr.moment >= ${gte}
              AND sr.moment < ${lt}
            GROUP BY sr.agent_id
          `;

    const returnsMap = new Map<string, { qty: number; revenue: bigint }>();
    for (const r of returned) {
      returnsMap.set(r.group_id, { qty: Number(r.qty), revenue: r.revenue });
    }

    const merged = sold.map((s) => {
      const ret = returnsMap.get(s.group_id) ?? { qty: 0, revenue: 0n };
      const ratio =
        s.revenue > 0n
          ? Math.min(1000, Math.round(Number((ret.revenue * 10000n) / s.revenue)) / 100)
          : 0;
      return {
        groupId: s.group_id,
        groupName: s.group_name ?? '(unknown)',
        groupCode: s.group_code,
        soldQty: s.qty,
        soldRevenueMinor: s.revenue.toString(),
        returnedQty: ret.qty.toString(),
        returnedRevenueMinor: ret.revenue.toString(),
        ratio,
      };
    });

    // Add return-only rows (refund without matching sale in the window —
    // unusual but valid: returns issued for an older sale).
    for (const [gid, ret] of returnsMap) {
      if (!sold.find((s) => s.group_id === gid)) {
        merged.push({
          groupId: gid,
          groupName: '(no sale in window)',
          groupCode: null,
          soldQty: '0',
          soldRevenueMinor: '0',
          returnedQty: ret.qty.toString(),
          returnedRevenueMinor: ret.revenue.toString(),
          ratio: 0,
        });
      }
    }

    let rows = merged;
    if (filter.onlyWithReturns) {
      rows = rows.filter((r) => BigInt(r.returnedRevenueMinor) > 0n);
    }
    rows = rows
      .sort((a, b) =>
        BigInt(b.returnedRevenueMinor) > BigInt(a.returnedRevenueMinor)
          ? 1
          : BigInt(b.returnedRevenueMinor) < BigInt(a.returnedRevenueMinor)
            ? -1
            : 0,
      )
      .slice(0, filter.limit);

    const totSoldQty = sold.reduce((acc, r) => acc + Number(r.qty), 0);
    const totSoldRev = sold.reduce((acc, r) => acc + r.revenue, 0n);
    const totRetQty = returned.reduce((acc, r) => acc + Number(r.qty), 0);
    const totRetRev = returned.reduce((acc, r) => acc + r.revenue, 0n);
    const totRatio =
      totSoldRev > 0n
        ? Math.min(1000, Math.round(Number((totRetRev * 10000n) / totSoldRev)) / 100)
        : 0;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      groupBy: filter.groupBy,
      totals: {
        soldQty: totSoldQty.toString(),
        soldRevenueMinor: totSoldRev.toString(),
        returnedQty: totRetQty.toString(),
        returnedRevenueMinor: totRetRev.toString(),
        ratio: totRatio,
      },
      rows,
    };
  }
}
