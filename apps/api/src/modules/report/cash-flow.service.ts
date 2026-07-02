import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type CurrencyRate, toBaseMinor } from '../currency/currency-convert.js';
import {
  type ConsolidatedAmounts,
  type CurrencyAwareRow,
  type RateContext,
  foldCurrencyRows,
} from './cash-flow-consolidate.util.js';
import {
  type CashFlowChannelValue,
  type CashFlowFilterInput,
  CashFlowFilterSchema,
} from './cash-flow.schema.js';
import { reportDateBounds } from './report-date-bounds.util.js';
import { loadRateContext } from './report-rate-ctx.util.js';

export interface CashFlowRow {
  key: string;
  label: string;
  inflowCount: number;
  inflowSumMinor: string;
  outflowCount: number;
  outflowSumMinor: string;
  netSumMinor: string;
  ref?: { id: string; name: string } | null;
}

export interface CashFlowReport {
  filter: CashFlowFilterInput;
  totals: CashFlowRow;
  groups: CashFlowRow[];
  /**
   * The account's base (валюта учёта) currency code. Channel sums are
   * consolidated into it: each currency bucket is converted via the
   * Currency rate (exact BigInt, §Unit-C). For a single-currency
   * tenant (every bucket = base) conversion is identity, so the fast
   * path is byte-identical to a raw sum.
   */
  currency: string;
  /**
   * True when documents in scope span >1 currency. The totals are
   * still base-consolidated; group rows are base-correct for a
   * single-currency tenant — when this is true the UI should surface
   * that group breakdowns mix converted figures.
   */
  mixedCurrency: boolean;
}

const DATE_TRUNC_UNIT: Record<'day' | 'week' | 'month' | 'quarter' | 'year', string> = {
  day: 'day',
  week: 'week',
  month: 'month',
  quarter: 'quarter',
  year: 'year',
};

// Physical table names match the @@map() in schema.prisma — cash_in /
// cash_out are singular; payments_in / payments_out plural. Don't assume.
const CHANNEL_TABLE: Record<CashFlowChannelValue, string> = {
  cash_in: 'cash_in',
  cash_out: 'cash_out',
  payment_in: 'payments_in',
  payment_out: 'payments_out',
};

const CHANNEL_DIRECTION: Record<CashFlowChannelValue, 'in' | 'out'> = {
  cash_in: 'in',
  cash_out: 'out',
  payment_in: 'in',
  payment_out: 'out',
};

const CHANNEL_LABEL: Record<CashFlowChannelValue, string> = {
  cash_in: 'Kassaga kirim (ПКО)',
  cash_out: 'Kassadan chiqim (РКО)',
  payment_in: 'Bank kirim',
  payment_out: 'Bank chiqim',
};

@Injectable()
export class CashFlowService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async cashFlowReport(accountId: string, raw: unknown): Promise<CashFlowReport> {
    const filter = this.parseFilter(raw);
    const ctx = await loadRateContext(this.prisma.client, accountId);
    const seen = new Set<string>();
    const totals = await this.computeTotals(accountId, filter, ctx, seen);
    let groups: CashFlowRow[] = [];
    if (filter.groupBy !== 'none') {
      groups = await this.computeGroups(accountId, filter, ctx, seen);
    }
    return {
      filter,
      totals,
      groups,
      currency: ctx.baseCode,
      mixedCurrency: seen.size > 1,
    };
  }

  // Rate context loading lives in report-rate-ctx.util.ts (shared with the
  // aging report and any other multi-currency money report).

  // -------------------------------------------------------------------
  // Totals
  // -------------------------------------------------------------------

  private async computeTotals(
    accountId: string,
    filter: CashFlowFilterInput,
    ctx: { baseCode: string; rates: Map<string, CurrencyRate> },
    seen: Set<string>,
  ): Promise<CashFlowRow> {
    const channels = this.activeChannels(filter);

    // Per-table, per-currency aggregate; each bucket is base-consolidated.
    const aggResults = await Promise.all(
      channels.map((ch) => this.aggregateChannel(accountId, filter, ch, ctx, seen)),
    );

    let inflowCount = 0;
    let inflowSum = 0n;
    let outflowCount = 0;
    let outflowSum = 0n;
    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i]!;
      const r = aggResults[i]!;
      if (CHANNEL_DIRECTION[ch] === 'in') {
        inflowCount += r.count;
        inflowSum += r.sum;
      } else {
        outflowCount += r.count;
        outflowSum += r.sum;
      }
    }

    return {
      key: 'totals',
      label: 'Итого',
      inflowCount,
      inflowSumMinor: inflowSum.toString(),
      outflowCount,
      outflowSumMinor: outflowSum.toString(),
      netSumMinor: (inflowSum - outflowSum).toString(),
    };
  }

  private async aggregateChannel(
    accountId: string,
    filter: CashFlowFilterInput,
    channel: CashFlowChannelValue,
    ctx: { baseCode: string; rates: Map<string, CurrencyRate> },
    seen: Set<string>,
  ): Promise<{ count: number; sum: bigint }> {
    const where = this.channelWhere(accountId, filter, channel);
    const buckets = await this.runGroupByCurrency(channel, where);
    let count = 0;
    let sum = 0n;
    for (const b of buckets) {
      count += b._count._all;
      const bucket = (b._sum.sumMinor as bigint | null) ?? 0n;
      const code = b.currency ?? ctx.baseCode;
      seen.add(code);
      if (code === ctx.baseCode) {
        sum += bucket;
        continue;
      }
      const rate = ctx.rates.get(code);
      // No Currency row for this code ⇒ cannot consolidate faithfully;
      // include at face value (the `mixedCurrency` flag warns the UI).
      sum += rate ? toBaseMinor(bucket, rate) : bucket;
    }
    return { count, sum };
  }

  private async runGroupByCurrency(
    channel: CashFlowChannelValue,
    where: Record<string, unknown>,
  ): Promise<
    Array<{ currency: string; _count: { _all: number }; _sum: { sumMinor: bigint | null } }>
  > {
    // Prisma's groupBy has a notoriously strict conditional arg type
    // that does not satisfy through a generic wrapper (a documented
    // Prisma TS limitation — even `<Model>GroupByArgs` won't assign).
    // Narrow the delegate to the exact call we make; the runtime shape
    // is exact and covered by the cash-flow tests.
    type CurrencyBucket = {
      currency: string;
      _count: { _all: number };
      _sum: { sumMinor: bigint | null };
    };
    type GroupByDelegate = {
      groupBy: (args: {
        by: ['currency'];
        where: Record<string, unknown>;
        orderBy: { currency: 'asc' };
        _count: { _all: true };
        _sum: { sumMinor: true };
      }) => Promise<CurrencyBucket[]>;
    };
    const byChannel: Record<CashFlowChannelValue, unknown> = {
      cash_in: this.prisma.client.cashIn,
      cash_out: this.prisma.client.cashOut,
      payment_in: this.prisma.client.paymentIn,
      payment_out: this.prisma.client.paymentOut,
    };
    const delegate = byChannel[channel] as GroupByDelegate;
    return delegate.groupBy({
      by: ['currency'],
      where,
      orderBy: { currency: 'asc' },
      _count: { _all: true },
      _sum: { sumMinor: true },
    });
  }

  // -------------------------------------------------------------------
  // Groups
  // -------------------------------------------------------------------

  private async computeGroups(
    accountId: string,
    filter: CashFlowFilterInput,
    ctx: { baseCode: string; rates: Map<string, CurrencyRate> },
    seen: Set<string>,
  ): Promise<CashFlowRow[]> {
    switch (filter.groupBy) {
      case 'day':
      case 'week':
      case 'month':
      case 'quarter':
      case 'year':
        return this.groupByDate(accountId, filter, filter.groupBy, ctx, seen);
      case 'counterparty':
        return this.groupByFk(accountId, filter, 'agent_id', 'counterparty', ctx, seen);
      case 'organization':
        return this.groupByFk(accountId, filter, 'organization_id', 'organization', ctx, seen);
      case 'channel':
        return this.groupByChannel(accountId, filter, ctx, seen);
      default:
        return [];
    }
  }

  private async groupByDate(
    accountId: string,
    filter: CashFlowFilterInput,
    unit: 'day' | 'week' | 'month' | 'quarter' | 'year',
    ctx: RateContext,
    seen: Set<string>,
  ): Promise<CashFlowRow[]> {
    const truncUnit = DATE_TRUNC_UNIT[unit];
    const channels = this.activeChannels(filter);
    const { gte, lt } = reportDateBounds(filter.dateFrom, filter.dateTo);

    // UNION ALL the 4 tables; carry `currency` so each (bucket,currency)
    // sub-total can be base-consolidated in JS (multi-currency tenants).
    const directionCases = channels
      .map((ch) => {
        const dir = CHANNEL_DIRECTION[ch] === 'in' ? '1' : '-1';
        return `SELECT moment, sum_minor, currency, ${dir}::int AS direction, agent_id, organization_id FROM ${CHANNEL_TABLE[ch]} WHERE account_id = $1::uuid AND state = 'posted' AND deleted_at IS NULL AND moment >= $2 AND moment < $3${
          filter.counterpartyId ? ' AND agent_id = $4::uuid' : ''
        }${filter.organizationId ? ` AND organization_id = $${filter.counterpartyId ? 5 : 4}::uuid` : ''}`;
      })
      .join(' UNION ALL ');

    const params: unknown[] = [accountId, gte, lt];
    if (filter.counterpartyId) params.push(filter.counterpartyId);
    if (filter.organizationId) params.push(filter.organizationId);

    // Group by (bucket, currency); fold to base + collapse per bucket in JS.
    const sql = `
      SELECT
        date_trunc('${truncUnit}', moment AT TIME ZONE 'UTC') AS bucket,
        currency,
        SUM(CASE WHEN direction = 1 THEN 1 ELSE 0 END)::bigint AS inflow_count,
        SUM(CASE WHEN direction = 1 THEN sum_minor ELSE 0 END)::bigint AS inflow_sum,
        SUM(CASE WHEN direction = -1 THEN 1 ELSE 0 END)::bigint AS outflow_count,
        SUM(CASE WHEN direction = -1 THEN sum_minor ELSE 0 END)::bigint AS outflow_sum
      FROM (${directionCases}) AS unified
      GROUP BY bucket, currency
      ORDER BY bucket ASC
    `;

    const rawRows = await this.prisma.client.$queryRawUnsafe<
      Array<{
        bucket: Date;
        currency: string;
        inflow_count: bigint;
        inflow_sum: bigint | null;
        outflow_count: bigint;
        outflow_sum: bigint | null;
      }>
    >(sql, ...params);

    // Preserve chronological order: rows arrive ORDER BY bucket ASC, so the
    // fold map's insertion order matches; remember each bucket's Date for the label.
    const bucketDate = new Map<string, Date>();
    const folded = foldCurrencyRows(
      rawRows.map((r): CurrencyAwareRow => {
        const iso = r.bucket.toISOString();
        if (!bucketDate.has(iso)) bucketDate.set(iso, r.bucket);
        return {
          key: iso,
          currency: r.currency,
          inflowCount: Number(r.inflow_count),
          inflowSumMinor: r.inflow_sum ?? 0n,
          outflowCount: Number(r.outflow_count),
          outflowSumMinor: r.outflow_sum ?? 0n,
        };
      }),
      ctx,
      seen,
    );

    const out: CashFlowRow[] = [];
    for (const [iso, amounts] of folded) {
      const date = bucketDate.get(iso) ?? new Date(iso);
      out.push(this.toCashFlowRow(iso, this.formatDateLabel(date, unit), amounts));
      if (out.length >= filter.limit) break;
    }
    return out;
  }

  private async groupByFk(
    accountId: string,
    filter: CashFlowFilterInput,
    fkColumn: 'agent_id' | 'organization_id',
    refKind: 'counterparty' | 'organization',
    ctx: RateContext,
    seen: Set<string>,
  ): Promise<CashFlowRow[]> {
    const channels = this.activeChannels(filter);
    const { gte, lt } = reportDateBounds(filter.dateFrom, filter.dateTo);

    // Carry `currency` so each (fk,currency) sub-total can be base-consolidated
    // in JS. Top-N ranking must run on the CONSOLIDATED net (post-conversion),
    // so we no longer LIMIT in SQL — the GROUP BY collapses to #fk × #currency
    // rows (bounded, small) and JS does the rank+slice.
    const segments = channels
      .map((ch) => {
        const dir = CHANNEL_DIRECTION[ch] === 'in' ? '1' : '-1';
        return `SELECT ${fkColumn} AS fk, sum_minor, currency, ${dir}::int AS direction FROM ${CHANNEL_TABLE[ch]} WHERE account_id = $1::uuid AND state = 'posted' AND deleted_at IS NULL AND moment >= $2 AND moment < $3${
          filter.counterpartyId ? ' AND agent_id = $4::uuid' : ''
        }${filter.organizationId ? ` AND organization_id = $${filter.counterpartyId ? 5 : 4}::uuid` : ''}`;
      })
      .join(' UNION ALL ');

    const params: unknown[] = [accountId, gte, lt];
    if (filter.counterpartyId) params.push(filter.counterpartyId);
    if (filter.organizationId) params.push(filter.organizationId);

    const sql = `
      SELECT
        fk,
        currency,
        SUM(CASE WHEN direction = 1 THEN 1 ELSE 0 END)::bigint AS inflow_count,
        SUM(CASE WHEN direction = 1 THEN sum_minor ELSE 0 END)::bigint AS inflow_sum,
        SUM(CASE WHEN direction = -1 THEN 1 ELSE 0 END)::bigint AS outflow_count,
        SUM(CASE WHEN direction = -1 THEN sum_minor ELSE 0 END)::bigint AS outflow_sum
      FROM (${segments}) AS unified
      WHERE fk IS NOT NULL
      GROUP BY fk, currency
    `;

    const rawRows = await this.prisma.client.$queryRawUnsafe<
      Array<{
        fk: string;
        currency: string;
        inflow_count: bigint;
        inflow_sum: bigint | null;
        outflow_count: bigint;
        outflow_sum: bigint | null;
      }>
    >(sql, ...params);

    const folded = foldCurrencyRows(
      rawRows.map(
        (r): CurrencyAwareRow => ({
          key: r.fk,
          currency: r.currency,
          inflowCount: Number(r.inflow_count),
          inflowSumMinor: r.inflow_sum ?? 0n,
          outflowCount: Number(r.outflow_count),
          outflowSumMinor: r.outflow_sum ?? 0n,
        }),
      ),
      ctx,
      seen,
    );

    // Rank by consolidated net DESC, then take top `limit`.
    const ranked = [...folded.entries()]
      .sort((a, b) => {
        const netA = a[1].inflowSumMinor - a[1].outflowSumMinor;
        const netB = b[1].inflowSumMinor - b[1].outflowSumMinor;
        return netB > netA ? 1 : netB < netA ? -1 : 0;
      })
      .slice(0, filter.limit);

    const refs = await this.resolveRefs(
      refKind,
      ranked.map(([fk]) => fk),
    );

    return ranked.map(([fk, amounts]) => {
      const ref = refs.get(fk) ?? null;
      const row = this.toCashFlowRow(fk, ref?.name ?? '—', amounts);
      row.ref = ref ? { id: ref.id, name: ref.name } : null;
      return row;
    });
  }

  /** Build a public CashFlowRow from consolidated (base-currency) amounts. */
  private toCashFlowRow(key: string, label: string, amounts: ConsolidatedAmounts): CashFlowRow {
    return {
      key,
      label,
      inflowCount: amounts.inflowCount,
      inflowSumMinor: amounts.inflowSumMinor.toString(),
      outflowCount: amounts.outflowCount,
      outflowSumMinor: amounts.outflowSumMinor.toString(),
      netSumMinor: (amounts.inflowSumMinor - amounts.outflowSumMinor).toString(),
    };
  }

  private async groupByChannel(
    accountId: string,
    filter: CashFlowFilterInput,
    ctx: { baseCode: string; rates: Map<string, CurrencyRate> },
    seen: Set<string>,
  ): Promise<CashFlowRow[]> {
    const channels = this.activeChannels(filter);
    const aggResults = await Promise.all(
      channels.map((ch) => this.aggregateChannel(accountId, filter, ch, ctx, seen)),
    );

    return channels.map((ch, i) => {
      const r = aggResults[i]!;
      const direction = CHANNEL_DIRECTION[ch];
      const sum = r.sum;
      const inflow = direction === 'in' ? sum : 0n;
      const outflow = direction === 'out' ? sum : 0n;
      return {
        key: ch,
        label: CHANNEL_LABEL[ch],
        inflowCount: direction === 'in' ? r.count : 0,
        inflowSumMinor: inflow.toString(),
        outflowCount: direction === 'out' ? r.count : 0,
        outflowSumMinor: outflow.toString(),
        netSumMinor: (inflow - outflow).toString(),
      };
    });
  }

  // -------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------

  private activeChannels(filter: CashFlowFilterInput): CashFlowChannelValue[] {
    if (filter.channel) return [filter.channel];
    return ['cash_in', 'cash_out', 'payment_in', 'payment_out'];
  }

  private channelWhere(
    accountId: string,
    filter: CashFlowFilterInput,
    _channel: CashFlowChannelValue,
  ): Record<string, unknown> {
    const { gte, lt } = reportDateBounds(filter.dateFrom, filter.dateTo);
    return {
      accountId,
      state: 'posted',
      deletedAt: null,
      moment: { gte, lt },
      ...(filter.counterpartyId ? { agentId: filter.counterpartyId } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
    };
  }

  private async resolveRefs(
    kind: 'counterparty' | 'organization',
    ids: string[],
  ): Promise<Map<string, { id: string; name: string }>> {
    if (ids.length === 0) return new Map();
    if (kind === 'counterparty') {
      const rows = await this.prisma.client.counterparty.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      return new Map(rows.map((r) => [r.id, r]));
    }
    const rows = await this.prisma.client.organization.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r]));
  }

  private formatDateLabel(d: Date, unit: 'day' | 'week' | 'month' | 'quarter' | 'year'): string {
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

  private parseFilter(raw: unknown): CashFlowFilterInput {
    const r = CashFlowFilterSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}
