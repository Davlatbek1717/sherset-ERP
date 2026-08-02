import { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
// Analitika TZ §4 — yagona formulalar qatlami.
import { marginPercentText } from './metrics/index.js';
import { type PnlFilterInput, PnlFilterSchema, type PnlGroupByValue } from './pnl.schema.js';
import { reportDateBounds } from './report-date-bounds.util.js';
import { type RateContext, consolidateToBase, loadRateContext } from './report-rate-ctx.util.js';

export interface PnlRow {
  key: string;
  label: string;
  /** All money values in tiyin, BigInt-as-string. */
  revenueMinor: string;
  cogsMinor: string;
  grossProfitMinor: string;
  expensesMinor: string;
  netProfitMinor: string;
  /** Net margin in percent ("23.45"); empty string when revenue is 0. */
  marginPercent: string;
}

export interface PnlReport {
  filter: PnlFilterInput;
  totals: PnlRow;
  groups: PnlRow[];
  /** Account base (валюта учёта) — revenue/expenses consolidated into it. */
  currency: string;
  /**
   * True when source docs span >1 currency. Revenue/returns/expenses are
   * converted per-document; COGS is already base (normalized at supply-post,
   * see supply.service cost-currency normalization).
   */
  mixedCurrency: boolean;
}

const DATE_TRUNC_UNIT: Record<Exclude<PnlGroupByValue, 'none'>, string> = {
  day: 'day',
  week: 'week',
  month: 'month',
  quarter: 'quarter',
  year: 'year',
};

@Injectable()
export class PnlService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async pnlReport(accountId: string, raw: unknown): Promise<PnlReport> {
    const filter = this.parseFilter(raw);
    const ctx = await loadRateContext(this.prisma.client, accountId);
    const seen = new Set<string>();

    const totals = await this.computeTotals(accountId, filter, ctx, seen);
    let groups: PnlRow[] = [];
    if (filter.groupBy !== 'none') {
      groups = await this.computeGroups(accountId, filter, ctx, seen);
    }
    return { filter, totals, groups, currency: ctx.baseCode, mixedCurrency: seen.size > 1 };
  }

  // -------------------------------------------------------------------
  // Totals (period summary, no bucketing)
  // -------------------------------------------------------------------

  private async computeTotals(
    accountId: string,
    filter: PnlFilterInput,
    ctx: RateContext,
    seen: Set<string>,
  ): Promise<PnlRow> {
    // Revenue + COGS come from posted Demand minus posted SalesReturn.
    // Other expenses come from posted PaymentOut + CashOut. Each money table
    // is grouped by currency so its document-currency total can be
    // base-consolidated; COGS (demand.cost_sum_minor) is ALREADY base
    // (normalized at supply-post) so it is summed directly.
    const orgClause = filter.organizationId
      ? Prisma.sql`AND organization_id = ${filter.organizationId}::uuid`
      : Prisma.empty;
    const { gte, lt } = reportDateBounds(filter.dateFrom, filter.dateTo);
    const window = Prisma.sql`
      AND state = 'posted' AND deleted_at IS NULL
      AND moment >= ${gte} AND moment < ${lt}`;

    type CurRow = { currency: string; sum_minor: bigint | null; cost_minor: bigint | null };
    const [demandRows, returnRows, payOutRows, cashOutRows] = await Promise.all([
      this.prisma.client.$queryRaw<CurRow[]>`
        SELECT currency, SUM(sum_minor)::bigint AS sum_minor, SUM(cost_sum_minor)::bigint AS cost_minor
        FROM demands WHERE account_id = ${accountId}::uuid ${window} ${orgClause}
        GROUP BY currency`,
      this.prisma.client.$queryRaw<CurRow[]>`
        SELECT currency, SUM(sum_minor)::bigint AS sum_minor, NULL::bigint AS cost_minor
        FROM sales_returns WHERE account_id = ${accountId}::uuid ${window} ${orgClause}
        GROUP BY currency`,
      this.prisma.client.$queryRaw<CurRow[]>`
        SELECT currency, SUM(sum_minor)::bigint AS sum_minor, NULL::bigint AS cost_minor
        FROM payments_out WHERE account_id = ${accountId}::uuid ${window} ${orgClause}
        GROUP BY currency`,
      this.prisma.client.$queryRaw<CurRow[]>`
        SELECT currency, SUM(sum_minor)::bigint AS sum_minor, NULL::bigint AS cost_minor
        FROM cash_out WHERE account_id = ${accountId}::uuid ${window} ${orgClause}
        GROUP BY currency`,
    ]);

    const sumRevenue = (rows: CurRow[]): bigint =>
      rows.reduce(
        (acc, r) => acc + consolidateToBase(r.sum_minor ?? 0n, r.currency, ctx, seen),
        0n,
      );

    const sales = sumRevenue(demandRows);
    // COGS already base — sum directly (do NOT convert).
    const cogs = demandRows.reduce((acc, r) => acc + (r.cost_minor ?? 0n), 0n);
    const returnsAmount = sumRevenue(returnRows);
    const paymentOutSum = sumRevenue(payOutRows);
    const cashOutSum = sumRevenue(cashOutRows);

    return this.buildRow('totals', 'Итого', sales, returnsAmount, cogs, paymentOutSum + cashOutSum);
  }

  // -------------------------------------------------------------------
  // Grouped rows (bucketed by date)
  // -------------------------------------------------------------------

  private async computeGroups(
    accountId: string,
    filter: PnlFilterInput,
    ctx: RateContext,
    seen: Set<string>,
  ): Promise<PnlRow[]> {
    if (filter.groupBy === 'none') return [];
    const truncUnit = DATE_TRUNC_UNIT[filter.groupBy];
    const { gte, lt } = reportDateBounds(filter.dateFrom, filter.dateTo);

    const optionalAnd = (col: string, val: string | undefined) =>
      val ? Prisma.sql`AND ${Prisma.raw(col)} = ${val}::uuid` : Prisma.empty;
    const orgAnd = optionalAnd('organization_id', filter.organizationId);

    // Compute four parallel raw-SQL aggregations with consistent
    // bucket keys, then merge in TS by bucket. Keeping them separate
    // (rather than UNION ALL) is cheaper because each query uses its
    // own table indexes natively.
    // Each query groups by (bucket, currency); revenue is base-consolidated
    // per currency in TS, COGS (cost_minor) is summed directly (already base).
    const [demandRows, returnRows, paymentOutRows, cashOutRows] = await Promise.all([
      this.prisma.client.$queryRaw<
        Array<{
          bucket: Date;
          currency: string;
          sum_minor: bigint | null;
          cost_minor: bigint | null;
        }>
      >`
        SELECT
          date_trunc(${truncUnit}, moment AT TIME ZONE 'UTC') AS bucket,
          currency,
          SUM(sum_minor)::bigint AS sum_minor,
          SUM(cost_sum_minor)::bigint AS cost_minor
        FROM demands
        WHERE account_id = ${accountId}::uuid
          AND state = 'posted'
          AND deleted_at IS NULL
          AND moment >= ${gte}
          AND moment < ${lt}
          ${orgAnd}
        GROUP BY bucket, currency
        ORDER BY bucket ASC
      `,
      this.prisma.client.$queryRaw<
        Array<{ bucket: Date; currency: string; sum_minor: bigint | null }>
      >`
        SELECT
          date_trunc(${truncUnit}, moment AT TIME ZONE 'UTC') AS bucket,
          currency,
          SUM(sum_minor)::bigint AS sum_minor
        FROM sales_returns
        WHERE account_id = ${accountId}::uuid
          AND state = 'posted'
          AND deleted_at IS NULL
          AND moment >= ${gte}
          AND moment < ${lt}
          ${orgAnd}
        GROUP BY bucket, currency
        ORDER BY bucket ASC
      `,
      this.prisma.client.$queryRaw<
        Array<{ bucket: Date; currency: string; sum_minor: bigint | null }>
      >`
        SELECT
          date_trunc(${truncUnit}, moment AT TIME ZONE 'UTC') AS bucket,
          currency,
          SUM(sum_minor)::bigint AS sum_minor
        FROM payments_out
        WHERE account_id = ${accountId}::uuid
          AND state = 'posted'
          AND deleted_at IS NULL
          AND moment >= ${gte}
          AND moment < ${lt}
          ${orgAnd}
        GROUP BY bucket, currency
        ORDER BY bucket ASC
      `,
      this.prisma.client.$queryRaw<
        Array<{ bucket: Date; currency: string; sum_minor: bigint | null }>
      >`
        SELECT
          date_trunc(${truncUnit}, moment AT TIME ZONE 'UTC') AS bucket,
          currency,
          SUM(sum_minor)::bigint AS sum_minor
        FROM cash_out
        WHERE account_id = ${accountId}::uuid
          AND state = 'posted'
          AND deleted_at IS NULL
          AND moment >= ${gte}
          AND moment < ${lt}
          ${orgAnd}
        GROUP BY bucket, currency
        ORDER BY bucket ASC
      `,
    ]);

    type Bucket = {
      sales: bigint;
      cogs: bigint;
      returns: bigint;
      paymentOut: bigint;
      cashOut: bigint;
    };
    const merged = new Map<string, Bucket>();
    const ensure = (k: string) => {
      let b = merged.get(k);
      if (!b) {
        b = { sales: 0n, cogs: 0n, returns: 0n, paymentOut: 0n, cashOut: 0n };
        merged.set(k, b);
      }
      return b;
    };
    for (const r of demandRows) {
      const b = ensure(r.bucket.toISOString());
      b.sales += consolidateToBase(r.sum_minor ?? 0n, r.currency, ctx, seen);
      b.cogs += r.cost_minor ?? 0n; // already base
    }
    for (const r of returnRows) {
      ensure(r.bucket.toISOString()).returns += consolidateToBase(
        r.sum_minor ?? 0n,
        r.currency,
        ctx,
        seen,
      );
    }
    for (const r of paymentOutRows) {
      ensure(r.bucket.toISOString()).paymentOut += consolidateToBase(
        r.sum_minor ?? 0n,
        r.currency,
        ctx,
        seen,
      );
    }
    for (const r of cashOutRows) {
      ensure(r.bucket.toISOString()).cashOut += consolidateToBase(
        r.sum_minor ?? 0n,
        r.currency,
        ctx,
        seen,
      );
    }

    const sortedKeys = Array.from(merged.keys()).sort().slice(0, filter.limit);
    return sortedKeys.map((k) => {
      const b = merged.get(k)!;
      return this.buildRow(
        k,
        this.formatDateLabel(new Date(k), filter.groupBy),
        b.sales,
        b.returns,
        b.cogs,
        b.paymentOut + b.cashOut,
      );
    });
  }

  // -------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------

  private buildRow(
    key: string,
    label: string,
    sales: bigint,
    returnsAmount: bigint,
    cogs: bigint,
    expenses: bigint,
  ): PnlRow {
    const revenue = sales - returnsAmount;
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - expenses;
    // Yagona qatlam (analitika TZ §4). Diqqat: bu yerdagi «marja» sof foydadan
    // (xarajatlar chegirilgandan keyin) hisoblanadi — `profitability`dagi yalpi
    // marjadan farq qiladi. Ikkalasi ham to'g'ri, lekin BO'LINISH bitta joyda.
    const marginPercent = revenue > 0n ? marginPercentText(netProfit, revenue) : '';
    return {
      key,
      label,
      revenueMinor: revenue.toString(),
      cogsMinor: cogs.toString(),
      grossProfitMinor: grossProfit.toString(),
      expensesMinor: expenses.toString(),
      netProfitMinor: netProfit.toString(),
      marginPercent,
    };
  }

  private formatDateLabel(d: Date, unit: PnlGroupByValue): string {
    if (unit === 'none') return 'Итого';
    const iso = d.toISOString();
    if (unit === 'day') return iso.slice(0, 10);
    if (unit === 'week') return `Week of ${iso.slice(0, 10)}`;
    if (unit === 'month') return iso.slice(0, 7);
    if (unit === 'quarter') {
      const q = Math.floor(d.getUTCMonth() / 3) + 1;
      return `${d.getUTCFullYear()}-Q${q}`;
    }
    if (unit === 'year') return String(d.getUTCFullYear());
    return iso;
  }

  private parseFilter(raw: unknown): PnlFilterInput {
    const r = PnlFilterSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}
