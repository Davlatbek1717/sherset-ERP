import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { reportDateBounds } from './report-date-bounds.util.js';
import { consolidateToBase, loadRateContext } from './report-rate-ctx.util.js';

export const SalesByChannelFilterSchema = z.object({
  /** ISO date — defaults to "30 days ago" if omitted. */
  from: z.string().optional(),
  /** ISO date — defaults to today if omitted. */
  to: z.string().optional(),
});
export type SalesByChannelFilter = z.infer<typeof SalesByChannelFilterSchema>;

interface ChannelRow {
  /** SalesChannel.id, or null for off-channel direct sales. */
  channelId: string | null;
  /** SalesChannel.name, or "Direct" placeholder. */
  channelName: string;
  channelType: string | null;
  /** Number of posted Demands routed through the channel in the window. */
  orderCount: number;
  /** Sum of demand.sumMinor (after discount, before VAT split) — tiyin. */
  revenueMinor: string;
  /** Sum of position.quantity across those demands. */
  qty: string;
  /** Average basket = revenueMinor / orderCount, tiyin. */
  averageBasketMinor: string;
}

interface SalesByChannelResponse {
  from: string;
  to: string;
  totalRevenueMinor: string;
  totalOrderCount: number;
  rows: ChannelRow[];
  /** Account base (валюта учёта) — revenue consolidated into it. */
  currency: string;
  /** True when demands in scope span >1 currency (revenue is converted). */
  mixedCurrency: boolean;
}

/**
 * Sales by channel report.
 *
 * Buckets posted Demands by `salesChannelId` (joined from CustomerOrder
 * if present — Demand inherits the channel of its parent CO; otherwise
 * unbucketed = "Direct"). Returns per-channel revenue / order count /
 * qty / average basket, sorted by revenue desc.
 *
 * moysklad-equivalent: "Продажи по каналам" — used by marketing teams
 * to compare channel performance (online shop vs marketplace vs retail
 * vs B2B direct).
 */
@Injectable()
export class SalesByChannelService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async report(accountId: string, rawFilter: unknown): Promise<SalesByChannelResponse> {
    const filter = SalesByChannelFilterSchema.parse(rawFilter);
    const to = filter.to ? new Date(filter.to) : new Date();
    const from = filter.from
      ? new Date(filter.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    // Asia/Tashkent calendar-day half-open window [gte, lt) — a date-only `to`
    // must include the WHOLE last day (`moment <= to` dropped it). See util.
    const { gte, lt } = reportDateBounds(from, to);
    const ctx = await loadRateContext(this.prisma.client, accountId);
    const seen = new Set<string>();

    type Row = {
      channel_id: string | null;
      channel_name: string | null;
      channel_type: string | null;
      currency: string;
      order_count: bigint;
      revenue: bigint;
      qty: string;
    };

    // Demand has no direct salesChannelId column — it's inherited via CustomerOrder.
    // LEFT JOIN handles the off-channel case (direct demands without CO).
    // Group also by currency so each (channel,currency) revenue can be
    // base-consolidated in JS (a demand has exactly one currency, so
    // order_count/qty stay correct when summed across the currency split).
    //
    // revenue is SUM(d.sum_minor) over the de-fanned demand rows (no position
    // join in the FROM) — a position join would count each demand's sum_minor
    // once per position (fan-out inflation). qty is a per-demand correlated
    // position-sum so it stays correct without fanning the demand rows.
    const rows = await this.prisma.client.$queryRaw<Row[]>`
      SELECT
        co.sales_channel_id::text                       AS channel_id,
        sc.name                                         AS channel_name,
        sc.type                                         AS channel_type,
        d.currency                                      AS currency,
        COUNT(DISTINCT d.id)::bigint                    AS order_count,
        COALESCE(SUM(d.sum_minor), 0)::bigint           AS revenue,
        COALESCE(SUM(
          (SELECT COALESCE(SUM(dp.quantity), 0)
             FROM demand_positions dp
            WHERE dp.demand_id = d.id)
        ), 0)::text                                     AS qty
      FROM demands d
      LEFT JOIN customer_orders co ON co.id = d.customer_order_id
      LEFT JOIN sales_channels sc ON sc.id = co.sales_channel_id
      WHERE d.account_id = ${accountId}::uuid
        AND d.state = 'posted'
        AND d.deleted_at IS NULL
        AND d.moment >= ${gte}
        AND d.moment < ${lt}
      GROUP BY co.sales_channel_id, sc.name, sc.type, d.currency
    `;

    type ChannelAgg = {
      channelId: string | null;
      channelName: string;
      channelType: string | null;
      orderCount: number;
      revenue: bigint;
      qty: number;
    };
    const byChannel = new Map<string, ChannelAgg>();
    for (const r of rows) {
      const key = r.channel_id ?? '__direct__';
      let agg = byChannel.get(key);
      if (!agg) {
        agg = {
          channelId: r.channel_id,
          channelName: r.channel_name ?? 'Direct',
          channelType: r.channel_type,
          orderCount: 0,
          revenue: 0n,
          qty: 0,
        };
        byChannel.set(key, agg);
      }
      agg.orderCount += Number(r.order_count);
      agg.revenue += consolidateToBase(r.revenue, r.currency, ctx, seen);
      // qty is a Decimal quantity (SUM(dp.quantity)), not an integer — Number, not BigInt.
      agg.qty += Number(r.qty || '0');
    }

    const channelRows: ChannelRow[] = Array.from(byChannel.values())
      .sort((a, b) => (b.revenue > a.revenue ? 1 : b.revenue < a.revenue ? -1 : 0))
      .map((agg) => {
        const avg = agg.orderCount > 0 ? agg.revenue / BigInt(agg.orderCount) : 0n;
        return {
          channelId: agg.channelId,
          channelName: agg.channelName,
          channelType: agg.channelType,
          orderCount: agg.orderCount,
          revenueMinor: agg.revenue.toString(),
          qty: agg.qty.toString(),
          averageBasketMinor: avg.toString(),
        };
      });

    const totalRevenue = channelRows.reduce((acc, r) => acc + BigInt(r.revenueMinor), 0n);
    const totalOrderCount = channelRows.reduce((acc, r) => acc + r.orderCount, 0);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totalRevenueMinor: totalRevenue.toString(),
      totalOrderCount,
      rows: channelRows,
      currency: ctx.baseCode,
      mixedCurrency: seen.size > 1,
    };
  }
}
