import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { consolidateToBase, loadRateContext } from './report-rate-ctx.util.js';

export const AgingFilterSchema = z.object({
  /** 'receivables' (debtors — money customers owe us, default) or 'payables' (suppliers we owe). */
  side: z.enum(['receivables', 'payables']).default('receivables'),
  /** Reporting moment — defaults to NOW. Aging buckets are measured backwards from this. */
  asOf: z.string().optional(),
});
export type AgingFilter = z.infer<typeof AgingFilterSchema>;

interface AgingBucket {
  key: string;
  /** Inclusive lower bound (days). 0 = current. */
  fromDays: number;
  /** Inclusive upper bound (days), or null for "90+". */
  toDays: number | null;
  amountMinor: string;
  invoiceCount: number;
}

interface AgingRow {
  counterpartyId: string;
  counterpartyName: string;
  /** Total outstanding amount across all buckets (tiyin). */
  totalMinor: string;
  /** Per-bucket breakdown. Same buckets in same order across all rows. */
  buckets: AgingBucket[];
  /** Earliest unpaid invoice moment in days (for sorting most-overdue first). */
  oldestDays: number;
}

interface AgingResponse {
  side: 'receivables' | 'payables';
  asOf: string;
  bucketLabels: string[];
  totalsByBucket: AgingBucket[];
  rows: AgingRow[];
  /** Account base (валюта учёта) — all amounts are consolidated into it. */
  currency: string;
  /** True when invoices in scope span >1 currency (amounts are converted). */
  mixedCurrency: boolean;
}

const BUCKETS: Array<Omit<AgingBucket, 'amountMinor' | 'invoiceCount'>> = [
  { key: 'current', fromDays: 0, toDays: 0 },
  { key: '1_30', fromDays: 1, toDays: 30 },
  { key: '31_60', fromDays: 31, toDays: 60 },
  { key: '61_90', fromDays: 61, toDays: 90 },
  { key: '90_plus', fromDays: 91, toDays: null },
];

/**
 * Receivables / payables aging report.
 *
 * For each counterparty with outstanding balance, breaks the unpaid
 * portion into age buckets based on each invoice's `paymentPlannedMoment`
 * (or `moment` if no due date set):
 *   • current  — not yet due
 *   • 1-30     — overdue 1-30 days
 *   • 31-60    — overdue 31-60 days
 *   • 61-90    — overdue 61-90 days
 *   • 90+      — overdue more than 90 days
 *
 * moysklad-equivalent: "Долги контрагентов по срокам". Used by collections
 * teams to prioritise dunning calls (90+ bucket = critical).
 *
 * `side`:
 *   • receivables — InvoiceOut where payedSumMinor < sumMinor
 *   • payables    — InvoiceIn where payedSumMinor < sumMinor
 *
 * Outstanding per invoice = sumMinor - payedSumMinor, allocated to its
 * own age bucket (no proration across buckets — moysklad's behaviour).
 *
 * Cancelled invoices and drafts are excluded.
 */
@Injectable()
export class AgingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async report(accountId: string, rawFilter: unknown): Promise<AgingResponse> {
    const filter = AgingFilterSchema.parse(rawFilter);
    const asOf = filter.asOf ? new Date(filter.asOf) : new Date();
    const ctx = await loadRateContext(this.prisma.client, accountId);
    const seen = new Set<string>();

    type Row = {
      counterparty_id: string;
      counterparty_name: string;
      invoice_id: string;
      due: Date;
      outstanding: bigint;
      currency: string;
    };

    const sql =
      filter.side === 'receivables'
        ? this.prisma.client.$queryRaw<Row[]>`
            SELECT
              io.agent_id::text   AS counterparty_id,
              c.name              AS counterparty_name,
              io.id::text         AS invoice_id,
              COALESCE(io.payment_planned_moment, io.moment) AS due,
              (io.sum_minor - io.payed_sum_minor)::bigint    AS outstanding,
              io.currency         AS currency
            FROM invoices_out io
            JOIN counterparties c ON c.id = io.agent_id
            WHERE io.account_id = ${accountId}::uuid
              AND io.deleted_at IS NULL
              AND io.state NOT IN ('draft', 'cancelled', 'paid')
              AND io.sum_minor > io.payed_sum_minor
          `
        : this.prisma.client.$queryRaw<Row[]>`
            SELECT
              ii.agent_id::text   AS counterparty_id,
              c.name              AS counterparty_name,
              ii.id::text         AS invoice_id,
              COALESCE(ii.payment_planned_moment, ii.moment) AS due,
              (ii.sum_minor - ii.payed_sum_minor)::bigint    AS outstanding,
              ii.currency         AS currency
            FROM invoices_in ii
            JOIN counterparties c ON c.id = ii.agent_id
            WHERE ii.account_id = ${accountId}::uuid
              AND ii.deleted_at IS NULL
              AND ii.state NOT IN ('draft', 'cancelled', 'paid')
              AND ii.sum_minor > ii.payed_sum_minor
          `;
    const rows = await sql;

    type CounterpartyAgg = {
      name: string;
      buckets: Map<string, { amount: bigint; count: number }>;
      oldestDays: number;
      total: bigint;
    };
    const byCp = new Map<string, CounterpartyAgg>();

    for (const row of rows) {
      const ageMs = asOf.getTime() - new Date(row.due).getTime();
      const ageDays = Math.max(0, Math.floor(ageMs / (1000 * 60 * 60 * 24)));
      const bucket = BUCKETS.find(
        (b) => ageDays >= b.fromDays && (b.toDays === null || ageDays <= b.toDays),
      );
      if (!bucket) continue;

      // Consolidate each invoice's outstanding into the account base currency
      // before bucketing — without this a USD invoice's foreign minor units
      // were summed against UZS tiyin (the multi-currency aging bug).
      const outstandingBase = consolidateToBase(row.outstanding, row.currency, ctx, seen);

      let agg = byCp.get(row.counterparty_id);
      if (!agg) {
        agg = {
          name: row.counterparty_name,
          buckets: new Map(BUCKETS.map((b) => [b.key, { amount: 0n, count: 0 }])),
          oldestDays: 0,
          total: 0n,
        };
        byCp.set(row.counterparty_id, agg);
      }
      const bucketAcc = agg.buckets.get(bucket.key)!;
      bucketAcc.amount += outstandingBase;
      bucketAcc.count += 1;
      agg.total += outstandingBase;
      if (ageDays > agg.oldestDays) agg.oldestDays = ageDays;
    }

    const cpRows: AgingRow[] = Array.from(byCp.entries())
      .map(([id, agg]) => ({
        counterpartyId: id,
        counterpartyName: agg.name,
        totalMinor: agg.total.toString(),
        oldestDays: agg.oldestDays,
        buckets: BUCKETS.map((b) => {
          const acc = agg.buckets.get(b.key)!;
          return {
            ...b,
            amountMinor: acc.amount.toString(),
            invoiceCount: acc.count,
          };
        }),
      }))
      .sort((a, b) => b.oldestDays - a.oldestDays);

    const totalsByBucket: AgingBucket[] = BUCKETS.map((b) => {
      let amount = 0n;
      let count = 0;
      for (const cp of byCp.values()) {
        const v = cp.buckets.get(b.key)!;
        amount += v.amount;
        count += v.count;
      }
      return { ...b, amountMinor: amount.toString(), invoiceCount: count };
    });

    return {
      side: filter.side,
      asOf: asOf.toISOString(),
      bucketLabels: BUCKETS.map((b) => b.key),
      totalsByBucket,
      rows: cpRows,
      currency: ctx.baseCode,
      mixedCurrency: seen.size > 1,
    };
  }
}
