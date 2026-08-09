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

export const SalesByHourFilterSchema = z.object({
  /** ISO date — defaults to "30 days ago" if omitted. */
  from: z.string().optional(),
  /** ISO date — defaults to today if omitted. */
  to: z.string().optional(),
  /** IANA timezone for the hour grouping. Default Asia/Tashkent (UZ). */
  timezone: z.string().default('Asia/Tashkent'),
});
export type SalesByHourFilter = z.infer<typeof SalesByHourFilterSchema>;

interface HourRow {
  hour: number;
  orderCount: number;
  revenueMinor: string;
  qty: string;
}

interface SalesByHourResponse {
  from: string;
  to: string;
  timezone: string;
  rows: HourRow[];
  /** Hour with the highest revenue (24-bin argmax). */
  peakHour: number | null;
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
 * Sales by hour-of-day report.
 *
 * Buckets posted Demands into 24 hourly bins (0-23) using the requested
 * timezone for grouping. Returns revenue / order count / qty per hour
 * across the entire window.
 *
 * moysklad-equivalent: "Продажи по часам" — used by retail managers
 * to schedule staffing, identify quiet hours for restocking, and tune
 * promotional flash hours.
 *
 * Timezone defaults to Asia/Tashkent (UTC+5) — matching the UZ retail
 * day. Pass `timezone=UTC` for UTC-relative bucketing.
 */
@Injectable()
export class SalesByHourService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async report(accountId: string, rawFilter: unknown): Promise<SalesByHourResponse> {
    const filter = SalesByHourFilterSchema.parse(rawFilter);
    const to = filter.to ? new Date(filter.to) : new Date();
    const from = filter.from
      ? new Date(filter.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    // Asia/Tashkent calendar-day half-open window [gte, lt) — a date-only `to`
    // must include the WHOLE last day (`moment <= to` dropped it). See util.
    const { gte, lt } = reportDateBounds(from, to);
    const ctx = await loadRateContext(this.prisma.client, accountId);
    const seen = new CurrencyTally();

    type Row = {
      hour: number;
      currency: string;
      order_count: bigint;
      revenue: bigint;
      qty: string;
    };
    // Group also by currency; each (hour,currency) revenue is base-consolidated
    // in JS. A demand has one currency, so order_count/qty stay correct.
    //
    // revenue = SUM(d.sum_minor) over de-fanned demand rows (no position join in
    // the FROM) — a position join would count each demand's sum_minor once per
    // position (fan-out inflation). qty is a per-demand correlated position-sum.
    const rows = await this.prisma.client.$queryRaw<Row[]>`
      SELECT
        EXTRACT(HOUR FROM (d.moment AT TIME ZONE ${filter.timezone}))::int  AS hour,
        d.currency                                                          AS currency,
        COUNT(DISTINCT d.id)::bigint                                         AS order_count,
        COALESCE(SUM(d.sum_minor), 0)::bigint                                AS revenue,
        COALESCE(SUM(
          (SELECT COALESCE(SUM(dp.quantity), 0)
             FROM demand_positions dp
            WHERE dp.demand_id = d.id)
        ), 0)::text                                                         AS qty
      FROM demands d
      WHERE d.account_id = ${accountId}::uuid
        AND d.state = 'posted'
        AND d.deleted_at IS NULL
        AND d.moment >= ${gte}
        AND d.moment < ${lt}
      GROUP BY hour, d.currency
    `;

    // Fold per hour, consolidating revenue to base across currencies.
    const byHour = new Map<number, { orderCount: number; revenue: bigint; qty: number }>();
    for (const r of rows) {
      let agg = byHour.get(r.hour);
      if (!agg) {
        agg = { orderCount: 0, revenue: 0n, qty: 0 };
        byHour.set(r.hour, agg);
      }
      agg.orderCount += Number(r.order_count);
      agg.revenue += consolidateToBase(r.revenue, r.currency, ctx, seen);
      // qty is a Decimal quantity (SUM(dp.quantity)), not an integer — Number, not BigInt.
      agg.qty += Number(r.qty || '0');
    }
    const padded: HourRow[] = Array.from({ length: 24 }, (_, h) => {
      const agg = byHour.get(h);
      return {
        hour: h,
        orderCount: agg?.orderCount ?? 0,
        revenueMinor: (agg?.revenue ?? 0n).toString(),
        qty: (agg?.qty ?? 0).toString(),
      };
    });

    let peakHour: number | null = null;
    let peakRevenue = -1n;
    for (const row of padded) {
      const rev = BigInt(row.revenueMinor);
      if (rev > peakRevenue) {
        peakRevenue = rev;
        peakHour = row.hour;
      }
    }
    if (peakRevenue <= 0n) peakHour = null;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      timezone: filter.timezone,
      rows: padded,
      peakHour,
      currency: ctx.baseCode,
      mixedCurrency: seen.mixed,
      unconvertedByCurrency: seen.unconvertedRows(),
    };
  }
}
