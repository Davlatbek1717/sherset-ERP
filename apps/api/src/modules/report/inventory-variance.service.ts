import { Prisma } from '@moysklad/db';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { reportDateBounds } from './report-date-bounds.util.js';

export const InventoryVarianceFilterSchema = z.object({
  /** ISO date — defaults to "90 days ago" if omitted. */
  from: z.string().optional(),
  /** ISO date — defaults to today if omitted. */
  to: z.string().optional(),
  /** Optional store filter (single store) — null = all stores. */
  storeId: z.string().uuid().optional(),
  /** Cap rows. Default 200. */
  limit: z.coerce.number().int().min(1).max(2000).default(200),
});
export type InventoryVarianceFilter = z.infer<typeof InventoryVarianceFilterSchema>;

interface VarianceRow {
  inventoryId: string;
  inventoryName: string;
  storeId: string;
  storeName: string;
  moment: string;
  /** Number of position rows with surplus (more than expected). */
  surplusLineCount: number;
  /** Number of position rows with shortage (less than expected). */
  shortageLineCount: number;
  /** Sum of (actualQty - expectedQty) where positive — total excess units. */
  surplusQty: string;
  /** Sum of (expectedQty - actualQty) where positive — total missing units. */
  shortageQty: string;
  /** Sum of |delta| × costMinor — financial impact in tiyin. */
  varianceCostMinor: string;
}

interface InventoryVarianceResponse {
  from: string;
  to: string;
  storeId: string | null;
  totals: {
    inventoryCount: number;
    totalSurplusQty: string;
    totalShortageQty: string;
    totalVarianceCostMinor: string;
  };
  rows: VarianceRow[];
}

/**
 * Inventory variance report.
 *
 * For each posted Inventory document in the window, surfaces the gap
 * between expected and actual stock counts (per-position deltas).
 *
 * moysklad-equivalent: "Расхождения по инвентаризациям" — used by
 * warehouse managers and finance to identify shrinkage hotspots,
 * theft, mis-counted SKUs, and to size insurance reserves.
 *
 * Output fields per Inventory:
 *   • surplusLineCount / shortageLineCount — how many SKU rows in
 *     this inventory had a positive vs negative delta
 *   • surplusQty / shortageQty — aggregate qty deltas (always >= 0)
 *   • varianceCostMinor — total cost impact = Σ|delta_i| × costMinor_i
 *
 * Note: only `posted` Inventory rows are considered (drafts skipped).
 */
@Injectable()
export class InventoryVarianceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async report(accountId: string, rawFilter: unknown): Promise<InventoryVarianceResponse> {
    const filter = InventoryVarianceFilterSchema.parse(rawFilter);
    const to = filter.to ? new Date(filter.to) : new Date();
    const from = filter.from
      ? new Date(filter.from)
      : new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
    // Asia/Tashkent calendar-day half-open window [gte, lt) — a date-only `to`
    // must include the WHOLE last day (`moment <= to` dropped it). See util.
    const { gte, lt } = reportDateBounds(from, to);

    const storeFilter = filter.storeId
      ? Prisma.sql`AND i.store_id = ${filter.storeId}::uuid`
      : Prisma.empty;

    type Row = {
      inventory_id: string;
      inventory_name: string;
      store_id: string;
      store_name: string | null;
      moment: Date;
      surplus_line_count: bigint;
      shortage_line_count: bigint;
      surplus_qty: string;
      shortage_qty: string;
      variance_cost_minor: bigint;
    };

    const rows = await this.prisma.client.$queryRaw<Row[]>`
      SELECT
        i.id::text                                    AS inventory_id,
        i.name                                        AS inventory_name,
        i.store_id::text                              AS store_id,
        s.name                                        AS store_name,
        i.moment                                      AS moment,
        COUNT(*) FILTER (WHERE ip.actual_qty > ip.expected_qty)::bigint AS surplus_line_count,
        COUNT(*) FILTER (WHERE ip.actual_qty < ip.expected_qty)::bigint AS shortage_line_count,
        COALESCE(SUM(GREATEST(ip.actual_qty - ip.expected_qty, 0)), 0)::text AS surplus_qty,
        COALESCE(SUM(GREATEST(ip.expected_qty - ip.actual_qty, 0)), 0)::text AS shortage_qty,
        COALESCE(SUM(ABS(ip.actual_qty - ip.expected_qty) * COALESCE(ip.cost_minor, 0)), 0)::bigint AS variance_cost_minor
      FROM inventories i
      JOIN inventory_positions ip ON ip.inventory_id = i.id
      LEFT JOIN stores s ON s.id = i.store_id
      WHERE i.account_id = ${accountId}::uuid
        AND i.state = 'posted'
        AND i.deleted_at IS NULL
        AND i.moment >= ${gte}
        AND i.moment < ${lt}
        ${storeFilter}
      GROUP BY i.id, i.name, i.store_id, s.name, i.moment
      ORDER BY variance_cost_minor DESC
      LIMIT ${filter.limit}
    `;

    let totalSurplus = 0;
    let totalShortage = 0;
    let totalVarianceCost = 0n;
    const out: VarianceRow[] = rows.map((r) => {
      totalSurplus += Number(r.surplus_qty);
      totalShortage += Number(r.shortage_qty);
      totalVarianceCost += r.variance_cost_minor;
      return {
        inventoryId: r.inventory_id,
        inventoryName: r.inventory_name,
        storeId: r.store_id,
        storeName: r.store_name ?? '(unknown)',
        moment: r.moment.toISOString(),
        surplusLineCount: Number(r.surplus_line_count),
        shortageLineCount: Number(r.shortage_line_count),
        surplusQty: r.surplus_qty,
        shortageQty: r.shortage_qty,
        varianceCostMinor: r.variance_cost_minor.toString(),
      };
    });

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      storeId: filter.storeId ?? null,
      totals: {
        inventoryCount: out.length,
        totalSurplusQty: totalSurplus.toString(),
        totalShortageQty: totalShortage.toString(),
        totalVarianceCostMinor: totalVarianceCost.toString(),
      },
      rows: out,
    };
  }
}
