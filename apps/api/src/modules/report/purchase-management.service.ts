import { Prisma } from '@moysklad/db';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
// Analitika TZ §4 — yagona formulalar qatlami.
import { percentText } from './metrics/index.js';
import { reportDateBounds } from './report-date-bounds.util.js';
import {
  CurrencyTally,
  type UnconvertedAmount,
  consolidateToBase,
  loadRateContext,
} from './report-rate-ctx.util.js';

/**
 * «Управление закупками» — moysklad-parity per-supplier purchase
 * activity dashboard. For a given window, aggregates every active
 * supplier's order volume, receipt status, invoicing status,
 * payment status and outstanding balance, so procurement can spot
 * the suppliers that need follow-up at a glance.
 *
 * Source data: PurchaseOrder (state != cancelled, !deletedAt, in
 * window). Joined to Counterparty for the display label. The four
 * money pillars (orderedSum / receivedSum / invoicedSum / payedSum)
 * are SUM-aggregated from the already-maintained header columns;
 * outstanding = ordered − payed; deliveryRate counts orders where
 * deliveryPlannedMoment was met (received before planned date).
 *
 * Sorted by ordered-DESC by default — biggest spend at the top.
 */
export const PurchaseManagementFilterSchema = z.object({
  /** Inclusive lower bound on PurchaseOrder.moment. */
  dateFrom: z.coerce.date(),
  /** Inclusive upper bound (rolled to end-of-day for date-only). */
  dateTo: z.coerce.date(),
  /** Optional store filter (single store) — null = all stores. */
  storeId: z.string().uuid().optional(),
  /** Optional organization filter. */
  organizationId: z.string().uuid().optional(),
  /** Cap suppliers. Default 200, max 2000. */
  limit: z.coerce.number().int().min(1).max(2000).default(200),
});
export type PurchaseManagementFilter = z.infer<typeof PurchaseManagementFilterSchema>;

export interface PurchaseManagementRow {
  agentId: string;
  agentName: string;
  agentLegalTitle: string | null;
  /** Number of POs in the window for this supplier. */
  ordersCount: number;
  /** SUM(sumMinor) — total ordered amount in tiyin. */
  orderedSumMinor: string;
  /** SUM(receivedSumMinor) — total goods value already received. */
  receivedSumMinor: string;
  /** SUM(invoicedSumMinor) — total InvoiceIn coverage. */
  invoicedSumMinor: string;
  /** SUM(payedSumMinor) — total amount already paid. */
  payedSumMinor: string;
  /** ordered − payed; the still-owed amount to this supplier. */
  outstandingMinor: string;
  /**
   * On-time delivery rate as a string with 2 decimals ("82.50") —
   * percentage of completed POs (state in fully_received/closed)
   * whose receipt happened on or before deliveryPlannedMoment.
   * Empty when there are no completed POs in the window.
   */
  onTimeDeliveryPct: string;
}

export interface PurchaseManagementReport {
  filter: PurchaseManagementFilter;
  totals: {
    ordersCount: number;
    orderedSumMinor: string;
    receivedSumMinor: string;
    invoicedSumMinor: string;
    payedSumMinor: string;
    outstandingMinor: string;
  };
  rows: PurchaseManagementRow[];
  /** Account base (валюта учёта) — all sums consolidated into it. */
  currency: string;
  /** True when purchase orders in scope span >1 currency. */
  mixedCurrency: boolean;
  /**
   * M-12: rates-siz valyuta jamiga QO'SHILMAYDI — shu yerda o'z valyutasida
   * alohida qaytadi («konvertatsiya qilinmagan» qatori). Bo'sh = hammasi
   * konsolidatsiya qilindi.
   */
  unconvertedByCurrency: UnconvertedAmount[];
}

@Injectable()
export class PurchaseManagementService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async report(accountId: string, raw: unknown): Promise<PurchaseManagementReport> {
    const filter = PurchaseManagementFilterSchema.parse(raw);
    // Date-only range → Asia/Tashkent calendar-day half-open UTC window.
    const { gte, lt } = reportDateBounds(filter.dateFrom, filter.dateTo);
    const ctx = await loadRateContext(this.prisma.client, accountId);
    const seen = new CurrencyTally();

    type Row = {
      agent_id: string;
      agent_name: string | null;
      agent_legal_title: string | null;
      currency: string;
      /** M-11: hujjatning muzlatilgan kursi (×10^8). */
      rate_value: bigint | null;
      orders_count: bigint;
      ordered_sum_minor: bigint;
      received_sum_minor: bigint;
      invoiced_sum_minor: bigint;
      payed_sum_minor: bigint;
      completed_count: bigint;
      on_time_count: bigint;
    };

    const storeFilter = filter.storeId
      ? Prisma.sql`AND po.store_id = ${filter.storeId}::uuid`
      : Prisma.empty;
    const orgFilter = filter.organizationId
      ? Prisma.sql`AND po.organization_id = ${filter.organizationId}::uuid`
      : Prisma.empty;

    // Group also by currency; each (agent,currency) money column is
    // base-consolidated in JS. Counts are currency-independent. Top-N
    // ranking runs on the CONSOLIDATED ordered sum, so the SQL LIMIT is
    // dropped (GROUP BY collapses to #agent × #currency rows — bounded).
    //
    // M-11 (Faza Q8): `po.rate_value` joins the key so every money pillar is
    // valued at the rate the purchase order itself carries — a closed period
    // is not restated when the Currency table moves.
    const rows = await this.prisma.client.$queryRaw<Row[]>`
      SELECT
        po.agent_id::text                                            AS agent_id,
        cp.name                                                      AS agent_name,
        cp.legal_title                                               AS agent_legal_title,
        po.currency                                                  AS currency,
        po.rate_value                                                AS rate_value,
        COUNT(*)::bigint                                             AS orders_count,
        SUM(po.sum_minor)::bigint                                    AS ordered_sum_minor,
        SUM(po.received_sum_minor)::bigint                           AS received_sum_minor,
        SUM(po.invoiced_sum_minor)::bigint                           AS invoiced_sum_minor,
        SUM(po.payed_sum_minor)::bigint                              AS payed_sum_minor,
        SUM(
          CASE WHEN po.state IN ('fully_received','closed') THEN 1 ELSE 0 END
        )::bigint                                                    AS completed_count,
        SUM(
          CASE
            WHEN po.state IN ('fully_received','closed')
             AND po.delivery_planned_moment IS NOT NULL
             AND po.posted_at IS NOT NULL
             AND po.posted_at <= po.delivery_planned_moment
            THEN 1 ELSE 0
          END
        )::bigint                                                    AS on_time_count
      FROM purchase_orders po
      INNER JOIN counterparties cp ON cp.id = po.agent_id
      WHERE po.account_id = ${accountId}::uuid
        AND po.deleted_at IS NULL
        AND po.state != 'cancelled'
        AND po.moment >= ${gte}::timestamptz
        AND po.moment < ${lt}::timestamptz
        ${storeFilter}
        ${orgFilter}
      GROUP BY po.agent_id, cp.name, cp.legal_title, po.currency, po.rate_value
    `;

    type AgentAgg = {
      agentId: string;
      agentName: string;
      agentLegalTitle: string | null;
      ordersCount: number;
      ordered: bigint;
      received: bigint;
      invoiced: bigint;
      payed: bigint;
      completed: number;
      onTime: number;
    };
    const byAgent = new Map<string, AgentAgg>();
    for (const r of rows) {
      let agg = byAgent.get(r.agent_id);
      if (!agg) {
        agg = {
          agentId: r.agent_id,
          agentName: r.agent_name ?? '—',
          agentLegalTitle: r.agent_legal_title,
          ordersCount: 0,
          ordered: 0n,
          received: 0n,
          invoiced: 0n,
          payed: 0n,
          completed: 0,
          onTime: 0,
        };
        byAgent.set(r.agent_id, agg);
      }
      agg.ordersCount += Number(r.orders_count);
      const docRate = r.rate_value ?? undefined;
      agg.ordered += consolidateToBase(r.ordered_sum_minor, r.currency, ctx, seen, docRate);
      agg.received += consolidateToBase(r.received_sum_minor, r.currency, ctx, seen, docRate);
      agg.invoiced += consolidateToBase(r.invoiced_sum_minor, r.currency, ctx, seen, docRate);
      agg.payed += consolidateToBase(r.payed_sum_minor, r.currency, ctx, seen, docRate);
      agg.completed += Number(r.completed_count);
      agg.onTime += Number(r.on_time_count);
    }

    const out: PurchaseManagementRow[] = Array.from(byAgent.values())
      .sort((a, b) => (b.ordered > a.ordered ? 1 : b.ordered < a.ordered ? -1 : 0))
      .slice(0, filter.limit)
      .map((agg) => {
        const outstanding = agg.ordered - agg.payed;
        // Yagona qatlam (analitika TZ §4). Bu — pul emas, HUJJAT sanog'i, lekin
        // foiz bitta qoida bilan yaxlitlanishi kerak: ta'minotchi «94.5%» deb
        // ko'rinsa, boshqa ekranda «94%» bo'lib qolmasin.
        const onTimePct = percentText(BigInt(agg.onTime), BigInt(agg.completed));
        return {
          agentId: agg.agentId,
          agentName: agg.agentName,
          agentLegalTitle: agg.agentLegalTitle,
          ordersCount: agg.ordersCount,
          orderedSumMinor: agg.ordered.toString(),
          receivedSumMinor: agg.received.toString(),
          invoicedSumMinor: agg.invoiced.toString(),
          payedSumMinor: agg.payed.toString(),
          outstandingMinor: outstanding.toString(),
          onTimeDeliveryPct: onTimePct,
        };
      });

    const totalOrdered = out.reduce((acc, r) => acc + BigInt(r.orderedSumMinor), 0n);
    const totalReceived = out.reduce((acc, r) => acc + BigInt(r.receivedSumMinor), 0n);
    const totalInvoiced = out.reduce((acc, r) => acc + BigInt(r.invoicedSumMinor), 0n);
    const totalPayed = out.reduce((acc, r) => acc + BigInt(r.payedSumMinor), 0n);
    const totalOutstanding = totalOrdered - totalPayed;
    const totalOrders = out.reduce((acc, r) => acc + r.ordersCount, 0);

    return {
      filter,
      totals: {
        ordersCount: totalOrders,
        orderedSumMinor: totalOrdered.toString(),
        receivedSumMinor: totalReceived.toString(),
        invoicedSumMinor: totalInvoiced.toString(),
        payedSumMinor: totalPayed.toString(),
        outstandingMinor: totalOutstanding.toString(),
      },
      rows: out,
      currency: ctx.baseCode,
      mixedCurrency: seen.mixed,
      unconvertedByCurrency: seen.unconvertedRows(),
    };
  }
}
