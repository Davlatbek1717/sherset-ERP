import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { reportDateBounds } from './report-date-bounds.util.js';
import {
  CurrencyTally,
  type UnconvertedAmount,
  consolidateToBase,
  loadRateContext,
} from './report-rate-ctx.util.js';

export const AverageBasketFilterSchema = z.object({
  /** ISO date — defaults to "30 days ago" if omitted. */
  from: z.string().optional(),
  /** ISO date — defaults to today if omitted. */
  to: z.string().optional(),
  /** Time bucket: 'day' | 'week' | 'month'. Default 'day'. */
  granularity: z.enum(['day', 'week', 'month']).default('day'),
});
export type AverageBasketFilter = z.infer<typeof AverageBasketFilterSchema>;

interface BasketRow {
  /** ISO date string at the start of the bucket. */
  bucket: string;
  orderCount: number;
  revenueMinor: string;
  /** Average order value (revenue / orders), tiyin. */
  averageBasketMinor: string;
  /** Total qty across all positions in the bucket. */
  totalQty: string;
  /** Avg items per order (totalQty / orderCount). */
  averageItemsPerOrder: number;
}

interface AverageBasketResponse {
  from: string;
  to: string;
  granularity: 'day' | 'week' | 'month';
  totals: {
    orderCount: number;
    revenueMinor: string;
    averageBasketMinor: string;
    totalQty: string;
    averageItemsPerOrder: number;
  };
  rows: BasketRow[];
  /** Account base (валюта учёта) — revenue consolidated into it. */
  currency: string;
  /** True when demands in scope span >1 currency (revenue is converted). */
  mixedCurrency: boolean;
  /**
   * M-12: rates-siz valyuta jamiga QO'SHILMAYDI — shu yerda o'z valyutasida
   * alohida qaytadi («konvertatsiya qilinmagan» qatori). Bo'sh = hammasi
   * konsolidatsiya qilindi.
   */
  unconvertedByCurrency: UnconvertedAmount[];
}

/**
 * Average basket size report.
 *
 * Per time bucket (day / week / month), reports:
 *   • orderCount      — distinct posted Demands
 *   • revenueMinor    — sum of demand.sumMinor (tiyin)
 *   • averageBasket   — revenue / orderCount (tiyin)
 *   • totalQty        — sum of position quantities
 *   • avgItemsPerOrder — totalQty / orderCount
 *
 * moysklad-equivalent: "Средний чек" + "Среднее число товаров в чеке".
 * Used by retail / e-commerce managers to track basket-size trends —
 * direct indicator of cross-sell effectiveness and promotional impact.
 */
@Injectable()
export class AverageBasketService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async report(accountId: string, rawFilter: unknown): Promise<AverageBasketResponse> {
    const filter = AverageBasketFilterSchema.parse(rawFilter);
    const to = filter.to ? new Date(filter.to) : new Date();
    const from = filter.from
      ? new Date(filter.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    // Asia/Tashkent calendar-day half-open window [gte, lt) — a date-only `to`
    // must include the WHOLE last day (`moment <= to` dropped it). See util.
    const { gte, lt } = reportDateBounds(from, to);

    const truncUnit =
      filter.granularity === 'day' ? 'day' : filter.granularity === 'week' ? 'week' : 'month';
    const ctx = await loadRateContext(this.prisma.client, accountId);
    const seen = new CurrencyTally();

    type Row = {
      bucket: Date;
      currency: string;
      /** M-11: hujjatning muzlatilgan kursi (×10^8). */
      rate_value: bigint | null;
      order_count: bigint;
      revenue: bigint;
      total_qty: string;
    };

    // Group also by currency; each (bucket,currency) revenue is base-consolidated
    // in JS (a demand has one currency, so order_count/qty stay correct).
    //
    // revenue = SUM(d.sum_minor) over de-fanned demand rows (no position join in
    // the FROM) — a position join would count each demand's sum_minor once per
    // position (fan-out inflation), which would inflate the average basket.
    // total_qty is a per-demand correlated position-sum so it stays correct
    // without fanning the demand rows.
    //
    // M-11 (Faza Q8): `d.rate_value` joins the key so a closed bucket keeps the
    // rate its own documents were booked with (no restatement when the Currency
    // table moves). A demand carries one (currency, rate_value) pair, so the
    // extra split leaves order_count / total_qty correct.
    const rows = await this.prisma.client.$queryRawUnsafe<Row[]>(
      `
      SELECT
        date_trunc($1, d.moment)                            AS bucket,
        d.currency                                          AS currency,
        d.rate_value                                        AS rate_value,
        COUNT(DISTINCT d.id)::bigint                        AS order_count,
        COALESCE(SUM(d.sum_minor), 0)::bigint               AS revenue,
        COALESCE(SUM(
          (SELECT COALESCE(SUM(dp.quantity), 0)
             FROM demand_positions dp
            WHERE dp.demand_id = d.id)
        ), 0)::text                                         AS total_qty
      FROM demands d
      WHERE d.account_id = $2::uuid
        AND d.state = 'posted'
        AND d.deleted_at IS NULL
        AND d.moment >= $3
        AND d.moment < $4
      GROUP BY bucket, d.currency, d.rate_value
      ORDER BY bucket ASC
      `,
      truncUnit,
      accountId,
      gte,
      lt,
    );

    // Fold per bucket (insertion order = chronological, rows arrive ORDER BY bucket).
    const byBucket = new Map<string, { orderCount: number; revenue: bigint; qty: number }>();
    for (const r of rows) {
      const key = r.bucket.toISOString();
      let agg = byBucket.get(key);
      if (!agg) {
        agg = { orderCount: 0, revenue: 0n, qty: 0 };
        byBucket.set(key, agg);
      }
      agg.orderCount += Number(r.order_count);
      agg.revenue += consolidateToBase(r.revenue, r.currency, ctx, seen, r.rate_value ?? undefined);
      agg.qty += Number(r.total_qty);
    }

    let totalOrders = 0;
    let totalRevenue = 0n;
    let totalQty = 0;
    const out: BasketRow[] = Array.from(byBucket.entries()).map(([bucket, agg]) => {
      const orderCount = agg.orderCount;
      const qty = agg.qty;
      const avgBasket = orderCount > 0 ? agg.revenue / BigInt(orderCount) : 0n;
      const avgItems = orderCount > 0 ? qty / orderCount : 0;
      totalOrders += orderCount;
      totalRevenue += agg.revenue;
      totalQty += qty;
      return {
        bucket,
        orderCount,
        revenueMinor: agg.revenue.toString(),
        averageBasketMinor: avgBasket.toString(),
        totalQty: qty.toString(),
        averageItemsPerOrder: Number(avgItems.toFixed(2)),
      };
    });

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      granularity: filter.granularity,
      totals: {
        orderCount: totalOrders,
        revenueMinor: totalRevenue.toString(),
        averageBasketMinor: totalOrders > 0 ? (totalRevenue / BigInt(totalOrders)).toString() : '0',
        totalQty: totalQty.toString(),
        averageItemsPerOrder: totalOrders > 0 ? Number((totalQty / totalOrders).toFixed(2)) : 0,
      },
      rows: out,
      currency: ctx.baseCode,
      mixedCurrency: seen.mixed,
      unconvertedByCurrency: seen.unconvertedRows(),
    };
  }
}
