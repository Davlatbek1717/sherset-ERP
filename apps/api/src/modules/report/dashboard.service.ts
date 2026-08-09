import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CashFlowService } from './cash-flow.service.js';
import { CounterpartyBalanceService } from './counterparty-balance.service.js';
import {
  type DashboardFilterInput,
  DashboardFilterSchema,
  type DashboardPeriodValue,
  type DashboardResult,
  type MoneyByOrgRow,
  type MoneyChartPoint,
  type OverdueBlock,
  type OverdueDocItem,
  type SalesBlock,
  type SalesChartPoint,
} from './dashboard.schema.js';
// Analitika TZ §4 — yagona formulalar qatlami. `percentOf` deb nomlangan:
// bu faylda `percent` lokal o'zgaruvchi sifatida band.
import { percent as percentOf } from './metrics/index.js';
import {
  CurrencyTally,
  type RateContext,
  type UnconvertedAmount,
  consolidateToBase,
  loadRateContext,
} from './report-rate-ctx.util.js';
import { ReportService } from './report.service.js';
import { TtlCache } from './ttl-cache.util.js';

/** Products with qty - reservedQty <= this threshold are counted as low-stock. V1 hardcoded. */
const LOW_STOCK_THRESHOLD = 5;

/** How many overdue rows we surface per panel. moysklad caps at ~10 too. */
const OVERDUE_LIMIT = 10;

/** How many months go into the cash-flow chart next to "Деньги". */
const CASH_FLOW_CHART_MONTHS = 6;

/**
 * Rows in the "Недавние документы" block. Also the per-table LIMIT inside the
 * UNION — see `computeRecentDocs`; the two MUST stay equal, or the block could
 * miss a document that belongs in the global top-N.
 */
const RECENT_DOCS_LIMIT = 20;

/**
 * PERF-06 — how long the "Деньги" aggregates stay servable from memory.
 *
 * Both of them UNION the four money tables with no date floor on the balance
 * side, i.e. they scan the account's ENTIRE payment history on every open of
 * the most-opened page in the product. 30s is the deliberate trade: the tile
 * can lag a just-posted payment by up to half a minute (it is a summary
 * widget, not a ledger — /money and the cash-flow report are never cached),
 * while a burst of users opening the homepage costs one aggregate instead of
 * one each.
 *
 * NOT reading from the materialized MoneyOperation ledger instead: that
 * journal has no backfill (Faza 11), so it only knows documents created after
 * 2026-08-08 — sourcing the dashboard from it would silently understate every
 * tenant's cash position.
 */
const MONEY_CACHE_TTL_MS = 30_000;

/**
 * What the by-org money pass produces. The unconverted tally travels WITH the
 * rows because both go through the same TTL cache — a cached hit that dropped
 * the tally would make the "не удалось конвертировать" banner flicker off for
 * 30 s while the numbers it warns about stayed on screen.
 */
interface MoneyByOrgResult {
  rows: MoneyByOrgRow[];
  unconvertedByCurrency: UnconvertedAmount[];
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReportService) private readonly salesService: ReportService,
    @Inject(CashFlowService) private readonly cashFlowService: CashFlowService,
    @Inject(CounterpartyBalanceService)
    private readonly cpBalanceService: CounterpartyBalanceService,
  ) {}

  /**
   * PERF-06 caches. Keyed by `accountId` (+ the chart's window start, which
   * rolls over at each month boundary) — a key that forgot the account would
   * serve one tenant's cash position to another.
   */
  private readonly moneyByOrgCache = new TtlCache<MoneyByOrgResult>(MONEY_CACHE_TTL_MS);
  private readonly moneyChartCache = new TtlCache<MoneyChartPoint[]>(MONEY_CACHE_TTL_MS);

  async dashboard(
    accountId: string,
    currentUserId: string,
    raw: unknown,
  ): Promise<DashboardResult> {
    const filter = this.parseFilter(raw);
    const now = new Date();
    const { dateFrom, dateTo } = this.periodBounds(filter.period, now);

    // Comparison windows
    const today = this.periodBounds('today', now);
    const yesterday = this.previousDayBounds(today.dateFrom);
    const previousPeriod = this.previousPeriodBounds(filter.period, dateFrom);

    // Sales chart bucket size depends on the visible period
    const chartGroupBy: 'day' | 'month' = filter.period === 'year' ? 'month' : 'day';

    // PERF-06 — request-scoped rate context. The three money-consolidating
    // blocks below used to call `loadRateContext` each on their own, so a
    // single dashboard hit ran the same Currency query three times. One
    // context also means the three blocks can never disagree about the base
    // currency mid-request.
    const rateCtx = await loadRateContext(this.prisma.client, accountId);

    const [
      // Sales — period totals + today + yesterday + previous period + chart buckets
      salesPeriodReport,
      salesTodayReport,
      salesYesterdayReport,
      salesPrevPeriodReport,
      salesChartReport,
      // Section 2 + 3 + 4
      overdueOrders,
      overdueInvoices,
      moneyByOrg,
      moneyChart,
      // Legacy fields for backwards-compat consumers
      cashFlowPeriodReport,
      cpBalanceReport,
      stockData,
      taskData,
      recentDocs,
    ] = await Promise.all([
      this.salesService.salesReport(accountId, {
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        groupBy: 'none',
      }),
      this.salesService.salesReport(accountId, {
        dateFrom: today.dateFrom.toISOString(),
        dateTo: today.dateTo.toISOString(),
        groupBy: 'none',
      }),
      this.salesService.salesReport(accountId, {
        dateFrom: yesterday.dateFrom.toISOString(),
        dateTo: yesterday.dateTo.toISOString(),
        groupBy: 'none',
      }),
      this.salesService.salesReport(accountId, {
        dateFrom: previousPeriod.dateFrom.toISOString(),
        dateTo: previousPeriod.dateTo.toISOString(),
        groupBy: 'none',
      }),
      this.salesService.salesReport(accountId, {
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        groupBy: chartGroupBy,
      }),
      this.computeOverdueOrders(accountId, now),
      this.computeOverdueInvoices(accountId, now, rateCtx),
      this.computeMoneyByOrg(accountId, rateCtx),
      this.computeMoneyChart(accountId, now, rateCtx),
      this.cashFlowService.cashFlowReport(accountId, {
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        groupBy: 'none',
      }),
      // V2 follow-up: replace with a dedicated aggregate query so totals
      // reflect the entire ledger, not just the top 500 by amount.
      this.cpBalanceService.counterpartyBalanceReport(accountId, {
        signFilter: 'nonzero',
        limit: 500,
        groupBy: 'counterparty',
      }),
      this.computeStock(accountId),
      this.computeTasks(accountId, currentUserId),
      // Was awaited AFTER this Promise.all — a 12-way UNION serialised behind
      // every other block for no reason. It depends on nothing above.
      this.computeRecentDocs(accountId),
    ]);

    // Build sales sub-blocks (today + period) with deltas vs comparison
    const todayBlock = this.buildSalesBlock(
      salesTodayReport.totals,
      salesYesterdayReport.totals,
      'previous_weekday',
      { weekdayIndex: this.previousWeekdayIndex(now) },
    );
    const periodBlock = this.buildSalesBlock(
      salesPeriodReport.totals,
      salesPrevPeriodReport.totals,
      this.periodComparisonLabelKey(filter.period),
    );
    const salesChart = this.buildSalesChart(
      salesChartReport.groups,
      chartGroupBy,
      filter.period,
      dateFrom,
      dateTo,
    );

    // Money total = sum of every org's running balance
    const moneyTotalSumMinor = moneyByOrg.rows
      .reduce((acc, row) => acc + BigInt(row.balanceMinor), 0n)
      .toString();

    const st = salesPeriodReport.totals;
    const cf = cashFlowPeriodReport.totals;
    const cp = cpBalanceReport.summaries;

    return {
      period: filter.period,
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),

      sales: {
        count: st.salesCount,
        sumMinor: st.sumMinor,
        netSumMinor: st.netSumMinor,
        profitMinor: st.profitMinor,
        today: todayBlock,
        period: periodBlock,
        chart: salesChart,
      },

      overdueOrders,
      overdueInvoices,

      money: {
        totalSumMinor: moneyTotalSumMinor,
        byOrg: moneyByOrg.rows,
        chart: moneyChart,
        unconvertedByCurrency: moneyByOrg.unconvertedByCurrency,
      },

      recentDocs,

      // Legacy fields (untouched)
      cashFlow: {
        inflowSumMinor: cf.inflowSumMinor,
        outflowSumMinor: cf.outflowSumMinor,
        netSumMinor: cf.netSumMinor,
      },
      receivables: {
        totalDebtMinor: cp.totalDebtMinor,
        totalCreditMinor: cp.totalCreditMinor,
        debtorCount: cp.debtorCount,
        creditorCount: cp.creditorCount,
      },
      stock: stockData,
      pendingTasks: taskData,
    };
  }

  // -------------------------------------------------------------------
  // Period boundaries
  // -------------------------------------------------------------------

  private periodBounds(period: DashboardPeriodValue, now: Date): { dateFrom: Date; dateTo: Date } {
    // Default upper bound — overridden per-case below so the chart
    // iteration spans the FULL window (Mon-Sun for week, day-1-31 for
    // month, Jan-Dec for year). Moysklad parity: their chart's x-axis
    // always renders the whole period and shows future days as 0,
    // even though aggregates are based on real data only (no future
    // documents to count).
    let dateTo = new Date(now);

    let dateFrom: Date;
    switch (period) {
      case 'today': {
        dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        break;
      }
      case 'week': {
        // Start of current ISO week (Monday) → end at Sunday 23:59:59.
        const dow = now.getDay(); // 0=Sun
        const diff = dow === 0 ? 6 : dow - 1;
        dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff, 0, 0, 0, 0);
        dateTo = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - diff + 6,
          23,
          59,
          59,
          999,
        );
        break;
      }
      case 'month': {
        // 1st of month 00:00:00 → last day of month 23:59:59.999.
        // setMonth(month+1, 0) returns the last day of the current month.
        dateFrom = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        dateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      }
      case 'quarter': {
        const q = Math.floor(now.getMonth() / 3);
        dateFrom = new Date(now.getFullYear(), q * 3, 1, 0, 0, 0, 0);
        dateTo = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
        break;
      }
      case 'year': {
        dateFrom = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        dateTo = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
      }
      default: {
        const _exhaustive: never = period;
        throw new BadRequestException(`Unknown period: ${String(_exhaustive)}`);
      }
    }

    return { dateFrom, dateTo };
  }

  /** Yesterday 00:00 → 23:59:59.999 (used for the today.comparison delta). */
  private previousDayBounds(todayStart: Date): { dateFrom: Date; dateTo: Date } {
    const dateFrom = new Date(todayStart);
    dateFrom.setDate(dateFrom.getDate() - 1);
    const dateTo = new Date(todayStart);
    dateTo.setMilliseconds(dateTo.getMilliseconds() - 1);
    return { dateFrom, dateTo };
  }

  /**
   * The window immediately before the visible period, same length.
   * For `week` it's [start-7d, start-1ms]; for `month` it's previous
   * calendar month; for `year` it's previous calendar year. `today`
   * + `quarter` map to "yesterday" + "previous quarter" with the same
   * length-equal semantics.
   */
  private previousPeriodBounds(
    period: DashboardPeriodValue,
    currentStart: Date,
  ): { dateFrom: Date; dateTo: Date } {
    const dateTo = new Date(currentStart);
    dateTo.setMilliseconds(dateTo.getMilliseconds() - 1);

    const dateFrom = new Date(currentStart);
    switch (period) {
      case 'today': {
        dateFrom.setDate(dateFrom.getDate() - 1);
        break;
      }
      case 'week': {
        dateFrom.setDate(dateFrom.getDate() - 7);
        break;
      }
      case 'month': {
        dateFrom.setMonth(dateFrom.getMonth() - 1);
        break;
      }
      case 'quarter': {
        dateFrom.setMonth(dateFrom.getMonth() - 3);
        break;
      }
      case 'year': {
        dateFrom.setFullYear(dateFrom.getFullYear() - 1);
        break;
      }
    }
    return { dateFrom, dateTo };
  }

  /** Mon=0..Sun=6, JS-style. Used for the "Сегодня" comparison label. */
  private previousWeekdayIndex(now: Date): number {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    const dow = d.getDay(); // 0=Sun..6=Sat
    return dow === 0 ? 6 : dow - 1; // 0=Mon..6=Sun
  }

  private periodComparisonLabelKey(period: DashboardPeriodValue): SalesBlock['comparisonLabelKey'] {
    switch (period) {
      case 'today':
        return 'yesterday';
      case 'week':
      case 'quarter': // closest match — moysklad doesn't use quarter on this surface
        return 'last_week';
      case 'month':
        return 'last_month';
      case 'year':
        return 'last_year';
    }
  }

  // -------------------------------------------------------------------
  // Sales — sub-blocks + chart
  // -------------------------------------------------------------------

  private buildSalesBlock(
    current: { salesCount: number; sumMinor: string },
    previous: { sumMinor: string },
    labelKey: SalesBlock['comparisonLabelKey'],
    extra?: SalesBlock['comparisonLabelExtra'],
  ): SalesBlock {
    const cur = BigInt(current.sumMinor);
    const prev = BigInt(previous.sumMinor);
    const delta = cur - prev;
    // Bo'linish yagona qatlamdan (analitika TZ §4); BUTUN songa yaxlitlash esa
    // shu sirtning ataylab qilingan tanlovi — moysklad panelida foizlar butun
    // ko'rsatiladi. Ya'ni «bir bo'linish, sirt bo'yicha turli ko'rsatish», har
    // sirtda o'z bo'linishi EMAS.
    let percent = 0;
    if (prev !== 0n) {
      percent = Math.round(percentOf(delta, prev) ?? 0);
    } else if (cur !== 0n) {
      // From zero baseline any positive amount reads as +100% on the
      // dashboard tile; a negative amount can't occur (sales are >= 0)
      // so this branch is effectively "+100% or 0%".
      percent = 100;
    }

    return {
      count: current.salesCount,
      sumMinor: current.sumMinor,
      comparisonSumMinor: delta.toString(),
      comparisonPercent: percent,
      comparisonLabelKey: labelKey,
      comparisonLabelExtra: extra,
    };
  }

  /**
   * Convert grouped sales rows into chart-ready points with a localised
   * x-axis label. Day buckets get a `weekdayIndex` (week period) or a
   * day-of-month number (month period); month buckets get a 0-11
   * `monthIndex` the frontend translates into "Янв." etc.
   *
   * Empty buckets are filled with zero so the chart spans the whole
   * window (otherwise recharts would draw a discontinuous line).
   */
  private buildSalesChart(
    groups: Array<{ key: string; label: string; sumMinor: string }>,
    groupBy: 'day' | 'month',
    period: DashboardPeriodValue,
    dateFrom: Date,
    dateTo: Date,
  ): SalesChartPoint[] {
    // Index by bucket-start ISO (YYYY-MM-DD or YYYY-MM-01)
    const bySumIso = new Map<string, string>();
    for (const g of groups) {
      // `key` from ReportService is the bucket date as YYYY-MM-DD.
      // For month buckets it's the first of the month.
      bySumIso.set(g.key.slice(0, 10), g.sumMinor);
    }

    const out: SalesChartPoint[] = [];
    if (groupBy === 'day') {
      // Iterate in UTC to match the SQL `date_trunc(... AT TIME ZONE 'UTC')`
      // bucket keys (otherwise UZ +5 shifts cursor labels by 1 day —
      // e.g. local "Jan 1" toISOString returns "Dec 31").
      const cursor = new Date(
        Date.UTC(dateFrom.getUTCFullYear(), dateFrom.getUTCMonth(), dateFrom.getUTCDate()),
      );
      const stop = new Date(
        Date.UTC(dateTo.getUTCFullYear(), dateTo.getUTCMonth(), dateTo.getUTCDate()),
      );
      while (cursor <= stop) {
        const iso = cursor.toISOString().slice(0, 10);
        const sum = bySumIso.get(iso) ?? '0';
        const dow = cursor.getUTCDay();
        const weekdayIndex = dow === 0 ? 6 : dow - 1; // 0=Mon..6=Sun
        const label =
          period === 'week' ? this.WEEKDAY_LABELS[weekdayIndex]! : String(cursor.getUTCDate());
        out.push({ date: iso, label, sumMinor: sum });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    } else {
      // Year period — 12 monthly buckets. Use dateTo's UTC year (not
      // dateFrom's): periodBounds constructs Jan 1 in local TZ, which
      // in UZ +5 actually lands at "Dec 31 19:00 UTC of the PREVIOUS
      // year" — so dateFrom.getUTCFullYear() returns 2025 when we
      // intend 2026. dateTo (last instant of Dec 31 local) is safely
      // within the intended UTC year either way.
      const year = dateTo.getUTCFullYear();
      for (let m = 0; m < 12; m++) {
        const cursor = new Date(Date.UTC(year, m, 1));
        const iso = cursor.toISOString().slice(0, 10);
        const sum = bySumIso.get(iso) ?? '0';
        out.push({ date: iso, label: this.MONTH_SHORT_RU[m]!, sumMinor: sum });
      }
    }
    return out;
  }

  /** RU short weekday names — moysklad's chart x-axis. */
  private readonly WEEKDAY_LABELS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  /** RU short month names — moysklad's cash-flow x-axis. */
  private readonly MONTH_SHORT_RU = [
    'Янв.',
    'Февр.',
    'Март',
    'Апр.',
    'Май',
    'Июнь',
    'Июль',
    'Авг.',
    'Сент.',
    'Окт.',
    'Нояб.',
    'Дек.',
  ];

  // -------------------------------------------------------------------
  // Section 2: Overdue orders + invoices
  // -------------------------------------------------------------------

  /**
   * Customer orders are considered overdue when their planned delivery
   * date is in the past and they aren't fully closed (state != 'closed'
   * + applicable hasn't been flipped to "delivered" via Demand
   * cascades — we use `applicable=false` as a soft "still open"
   * proxy because moysklad's UX treats unposted documents as the
   * actionable backlog).
   */
  /**
   * Last 20 documents the user touched across the 12 transactional
   * tables (customer-order / demand / invoice-out / invoice-in /
   * supply / sales-return / purchase-order / purchase-return /
   * cash-in / cash-out / payment-in / payment-out), sorted by
   * updated_at DESC. Mirrors moysklad's "Недавние документы" block.
   *
   * PERF-05 — the comment that used to sit here claimed "each leg only walks
   * its own (account_id, updated_at) index for the top-20 rows". BOTH halves
   * of that were false, and fixing only one half does nothing. Measured on
   * this query with 24k rows in one leg (EXPLAIN ANALYZE, Postgres 18):
   *
   *   indexes ✗ / per-leg LIMIT ✗ (as shipped) → Append + top-N Sort, 18 ms
   *   indexes ✓ / per-leg LIMIT ✗              → Append + top-N Sort, 66 ms  ← index unused
   *   indexes ✗ / per-leg LIMIT ✓              → Merge Append + Sorts,  33 ms
   *   indexes ✓ / per-leg LIMIT ✓ (now)        → Merge Append + Index Scans, 0.55 ms
   *
   * The planner will not push the outer LIMIT into UNION ALL branches by
   * itself, so without the per-leg `ORDER BY … LIMIT` it reads EVERY document
   * of the account from all 12 tables and top-N sorts them — adding the
   * indexes alone left it a full scan (row 2). Each leg must ask for its own
   * top-20; the global top-20 is necessarily a subset of that union.
   *
   * Faza Q16 — every leg also carries `AND deleted_at IS NULL`. Without it a
   * soft-deleted document kept showing up in «Недавние документы» (Faza 26
   * DEFER-2). The per-leg `ORDER BY … LIMIT` above MUST survive that edit: the
   * measurement is a property of the query SHAPE, not of the WHERE clause, and
   * `dashboard.service.test.ts` locks both halves (12 filters AND 12 limits).
   */
  private async computeRecentDocs(accountId: string): Promise<DashboardResult['recentDocs']> {
    const rows = await this.prisma.client.$queryRaw<
      Array<{
        type: string;
        id: string;
        number: string;
        posted: boolean;
        moment_date: Date;
        agent_id: string;
        organization_id: string | null;
        sum_minor: bigint;
        currency: string;
        modified_at: Date;
      }>
    >`
      SELECT * FROM (
        (SELECT 'customer-order' AS type, id, name AS number, applicable AS posted,
                moment AS moment_date, agent_id, organization_id, sum_minor, currency, updated_at AS modified_at
           FROM customer_orders WHERE account_id = ${accountId}::uuid AND deleted_at IS NULL
          ORDER BY updated_at DESC LIMIT ${RECENT_DOCS_LIMIT})
        UNION ALL
        (SELECT 'demand', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
           FROM demands WHERE account_id = ${accountId}::uuid AND deleted_at IS NULL
          ORDER BY updated_at DESC LIMIT ${RECENT_DOCS_LIMIT})
        UNION ALL
        (SELECT 'invoice-out', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
           FROM invoices_out WHERE account_id = ${accountId}::uuid AND deleted_at IS NULL
          ORDER BY updated_at DESC LIMIT ${RECENT_DOCS_LIMIT})
        UNION ALL
        (SELECT 'invoice-in', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
           FROM invoices_in WHERE account_id = ${accountId}::uuid AND deleted_at IS NULL
          ORDER BY updated_at DESC LIMIT ${RECENT_DOCS_LIMIT})
        UNION ALL
        (SELECT 'supply', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
           FROM supplies WHERE account_id = ${accountId}::uuid AND deleted_at IS NULL
          ORDER BY updated_at DESC LIMIT ${RECENT_DOCS_LIMIT})
        UNION ALL
        (SELECT 'sales-return', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
           FROM sales_returns WHERE account_id = ${accountId}::uuid AND deleted_at IS NULL
          ORDER BY updated_at DESC LIMIT ${RECENT_DOCS_LIMIT})
        UNION ALL
        (SELECT 'purchase-order', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
           FROM purchase_orders WHERE account_id = ${accountId}::uuid AND deleted_at IS NULL
          ORDER BY updated_at DESC LIMIT ${RECENT_DOCS_LIMIT})
        UNION ALL
        (SELECT 'purchase-return', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
           FROM purchase_returns WHERE account_id = ${accountId}::uuid AND deleted_at IS NULL
          ORDER BY updated_at DESC LIMIT ${RECENT_DOCS_LIMIT})
        UNION ALL
        (SELECT 'cash-in', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
           FROM cash_in WHERE account_id = ${accountId}::uuid AND deleted_at IS NULL
          ORDER BY updated_at DESC LIMIT ${RECENT_DOCS_LIMIT})
        UNION ALL
        (SELECT 'cash-out', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
           FROM cash_out WHERE account_id = ${accountId}::uuid AND deleted_at IS NULL
          ORDER BY updated_at DESC LIMIT ${RECENT_DOCS_LIMIT})
        UNION ALL
        (SELECT 'payment-in', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
           FROM payments_in WHERE account_id = ${accountId}::uuid AND deleted_at IS NULL
          ORDER BY updated_at DESC LIMIT ${RECENT_DOCS_LIMIT})
        UNION ALL
        (SELECT 'payment-out', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
           FROM payments_out WHERE account_id = ${accountId}::uuid AND deleted_at IS NULL
          ORDER BY updated_at DESC LIMIT ${RECENT_DOCS_LIMIT})
      ) recent
      ORDER BY modified_at DESC
      LIMIT ${RECENT_DOCS_LIMIT}
    `;

    if (rows.length === 0) return [];

    // Bulk-resolve agent + org names so we don't N+1 the per-row joins.
    const orgIds = Array.from(
      new Set(rows.map((r) => r.organization_id).filter((x): x is string => Boolean(x))),
    );
    const [agentName, orgs] = await Promise.all([
      this.resolveAgentNames(
        accountId,
        rows.map((r) => r.agent_id),
      ),
      this.prisma.client.organization.findMany({
        where: { accountId, id: { in: orgIds } },
        select: { id: true, name: true },
      }),
    ]);
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));

    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      number: r.number,
      posted: r.posted,
      momentDate: r.moment_date.toISOString(),
      counterpartyName: agentName.get(r.agent_id) ?? null,
      orgName: r.organization_id ? (orgName.get(r.organization_id) ?? null) : null,
      sumMinor: r.sum_minor.toString(),
      currency: r.currency,
      modifiedAt: r.modified_at.toISOString(),
      modifiedByName: null, // requires audit_log join; follow-up
    }));
  }

  private async computeOverdueOrders(accountId: string, now: Date): Promise<OverdueBlock> {
    const overdueRows = await this.prisma.client.customerOrder.findMany({
      where: {
        accountId,
        deletedAt: null,
        applicable: false,
        deliveryPlannedMoment: { lt: now },
      },
      select: {
        id: true,
        name: true,
        sumMinor: true,
        deliveryPlannedMoment: true,
        agent: { select: { name: true } },
      },
      orderBy: { deliveryPlannedMoment: 'asc' }, // most overdue first
      take: OVERDUE_LIMIT,
    });

    // Total count + total sum in one aggregate so the headline number
    // is correct even when rows.length === LIMIT.
    const agg = await this.prisma.client.customerOrder.aggregate({
      where: {
        accountId,
        deletedAt: null,
        applicable: false,
        deliveryPlannedMoment: { lt: now },
      },
      _count: { _all: true },
      _sum: { sumMinor: true },
    });

    const items: OverdueDocItem[] = overdueRows.map((r) => ({
      id: r.id,
      number: r.name,
      counterpartyName: r.agent?.name ?? null,
      sumMinor: r.sumMinor.toString(),
      daysOverdue: this.daysBetween(r.deliveryPlannedMoment ?? now, now),
    }));

    return {
      count: agg._count._all,
      totalSumMinor: ((agg._sum.sumMinor as bigint | null) ?? 0n).toString(),
      items,
      // This block does NOT consolidate: the aggregate sums `sum_minor` across
      // currencies at face value, so nothing is ever "left out" — hence an
      // always-empty list rather than a fake one. The face-value sum itself is
      // an open finding (M-12 class, orders side), tracked in the Faza Q16
      // report; fixing it belongs with a currency-aware aggregate, not here.
      unconvertedByCurrency: [],
    };
  }

  /**
   * Invoices are overdue when paymentPlannedMoment is in the past and
   * there's still unpaid balance (`payedSumMinor < sumMinor`). We
   * intentionally don't filter by `applicable` because a posted but
   * unpaid invoice is still an open receivable.
   */
  private async computeOverdueInvoices(
    accountId: string,
    now: Date,
    ctx: RateContext,
  ): Promise<OverdueBlock> {
    // PERF-11 — items come from the SAME predicate as the aggregate below.
    // Prisma cannot express the column-vs-column `payed_sum_minor <
    // sum_minor`, so this used to take the 40 oldest rows by due date and
    // drop the paid ones in JS. Once the oldest 40 overdue invoices are all
    // settled — which is the steady state after a year of operation, since
    // paid documents keep their old due date — the panel showed `count: N`
    // with an EMPTY list: the live debtors sat below the over-fetch window.
    // Pushing the predicate into SQL makes "top 10 unpaid" exact at any size.
    const top = await this.prisma.client.$queryRaw<
      Array<{
        id: string;
        name: string;
        owed_minor: bigint;
        payment_planned_moment: Date;
        agent_id: string;
      }>
    >`
      SELECT id, name,
             (sum_minor - payed_sum_minor)::bigint AS owed_minor,
             payment_planned_moment,
             agent_id
      FROM invoices_out
      WHERE account_id = ${accountId}::uuid
        AND deleted_at IS NULL
        AND payment_planned_moment < ${now}
        AND payed_sum_minor < sum_minor
      ORDER BY payment_planned_moment ASC
      LIMIT ${OVERDUE_LIMIT}
    `;

    // Aggregate via raw SQL since Prisma can't express column-vs-column.
    // Group by currency so the overdue total can be base-consolidated —
    // a USD invoice's owed amount must convert before joining UZS tiyin.
    const aggRows = await this.prisma.client.$queryRaw<
      Array<{ currency: string; cnt: bigint; total: bigint | null }>
    >`
      SELECT currency,
             COUNT(*)::bigint AS cnt,
             COALESCE(SUM(sum_minor - payed_sum_minor), 0)::bigint AS total
      FROM invoices_out
      WHERE account_id = ${accountId}::uuid
        AND deleted_at IS NULL
        AND payment_planned_moment < ${now}
        AND payed_sum_minor < sum_minor
      GROUP BY currency
    `;
    // M-12 (Faza 17): kursi topilmagan valyuta jamiga QO'SHILMAYDI (ilgari
    // face-value qo'shilardi). Faza Q16 dan boshlab qoldiq JIM emas —
    // `unconvertedByCurrency` bilan javobga chiqadi va vidjet banner chizadi.
    const seen = new CurrencyTally();
    let count = 0;
    let totalBase = 0n;
    for (const r of aggRows) {
      count += Number(r.cnt);
      totalBase += consolidateToBase(r.total ?? 0n, r.currency, ctx, seen);
    }

    // The raw query can't `include` the agent, so resolve the ≤10 names in one
    // go (same bulk-lookup shape recentDocs uses).
    const agentName = await this.resolveAgentNames(
      accountId,
      top.map((r) => r.agent_id),
    );

    const items: OverdueDocItem[] = top.map((r) => ({
      id: r.id,
      number: r.name,
      counterpartyName: agentName.get(r.agent_id) ?? null,
      sumMinor: r.owed_minor.toString(), // moysklad shows owed amount, not gross
      daysOverdue: this.daysBetween(r.payment_planned_moment ?? now, now),
    }));

    return {
      count,
      totalSumMinor: totalBase.toString(),
      items,
      unconvertedByCurrency: seen.unconvertedRows(),
    };
  }

  /**
   * `id → name` for the counterparties referenced by a raw-SQL result set.
   * One query, duplicates collapsed — raw rows carry `agent_id` only, and
   * both callers here (recent docs, overdue invoices) would otherwise N+1.
   */
  private async resolveAgentNames(
    accountId: string,
    agentIds: Array<string | null>,
  ): Promise<Map<string, string>> {
    const ids = Array.from(new Set(agentIds.filter((x): x is string => Boolean(x))));
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.client.counterparty.findMany({
      where: { accountId, id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((a) => [a.id, a.name]));
  }

  /** Calendar-day diff (floor). Always non-negative for inputs in order. */
  private daysBetween(from: Date, to: Date): number {
    const ms = to.getTime() - from.getTime();
    return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
  }

  // -------------------------------------------------------------------
  // Section 3: Money — by-org running balance + 6-month flow chart
  // -------------------------------------------------------------------

  /**
   * Per-organisation cumulative cash position. We compute it as
   * `Σ(payment_in + cash_in) - Σ(payment_out + cash_out)` over all posted,
   * non-deleted records, base-consolidated: each currency's net is
   * converted to the account base via the exact BigInt rate before summing
   * (consistent with the now currency-aware cash-flow report).
   */
  private computeMoneyByOrg(accountId: string, ctx: RateContext): Promise<MoneyByOrgResult> {
    // PERF-06 — whole-history aggregate, cached for MONEY_CACHE_TTL_MS.
    // `ctx` belongs to the request that MISSED the cache; a rate edit inside
    // the TTL window is therefore visible one refresh later, same as a new
    // payment. Both are the accepted staleness of this widget.
    return this.moneyByOrgCache.getOrLoad(accountId, () => this.loadMoneyByOrg(accountId, ctx));
  }

  private async loadMoneyByOrg(accountId: string, ctx: RateContext): Promise<MoneyByOrgResult> {
    const orgs = await this.prisma.client.organization.findMany({
      where: { accountId, archived: false },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    if (orgs.length === 0) return { rows: [], unconvertedByCurrency: [] };

    // UNION ALL the four money tables into a virtual ledger, group by
    // (org, currency) so each currency net can be base-consolidated in JS.
    const rows = await this.prisma.client.$queryRaw<
      Array<{ organization_id: string; currency: string; balance: bigint }>
    >`
      WITH ledger AS (
        SELECT organization_id, currency, sum_minor AS amount FROM payments_in
          WHERE account_id = ${accountId}::uuid AND state = 'posted' AND deleted_at IS NULL
        UNION ALL
        SELECT organization_id, currency, sum_minor AS amount FROM cash_in
          WHERE account_id = ${accountId}::uuid AND state = 'posted' AND deleted_at IS NULL
        UNION ALL
        SELECT organization_id, currency, -sum_minor AS amount FROM payments_out
          WHERE account_id = ${accountId}::uuid AND state = 'posted' AND deleted_at IS NULL
        UNION ALL
        SELECT organization_id, currency, -sum_minor AS amount FROM cash_out
          WHERE account_id = ${accountId}::uuid AND state = 'posted' AND deleted_at IS NULL
      )
      SELECT organization_id, currency, COALESCE(SUM(amount), 0)::bigint AS balance
      FROM ledger
      GROUP BY organization_id, currency
    `;

    // M-12 (Faza 17): kursi topilmagan valyuta jamiga QO'SHILMAYDI (ilgari
    // face-value qo'shilardi). Faza Q16 dan boshlab qoldiq JIM emas — tally
    // rows'lar bilan birga qaytadi va «Деньги» bo'limi banner chizadi.
    const seen = new CurrencyTally();
    const balanceByOrg = new Map<string, bigint>();
    for (const r of rows) {
      const base = consolidateToBase(r.balance, r.currency, ctx, seen);
      balanceByOrg.set(r.organization_id, (balanceByOrg.get(r.organization_id) ?? 0n) + base);
    }

    return {
      rows: orgs.map((o) => ({
        orgId: o.id,
        orgName: o.name,
        balanceMinor: (balanceByOrg.get(o.id) ?? 0n).toString(),
      })),
      unconvertedByCurrency: seen.unconvertedRows(),
    };
  }

  /**
   * Last 6 months of cash flow, bucketed by month. Each point carries
   * inflow / outflow / running-balance so the recharts component can
   * draw 3 series with one fetch. Months are produced even if empty
   * (sparse data still renders a flat line, matching moysklad).
   */
  private computeMoneyChart(
    accountId: string,
    now: Date,
    ctx: RateContext,
  ): Promise<MoneyChartPoint[]> {
    // First-of-month, six months back from `now`
    const start = new Date(now.getFullYear(), now.getMonth() - (CASH_FLOW_CHART_MONTHS - 1), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1); // exclusive

    // PERF-06 — the window is part of the key, so the cache rolls over by
    // itself at each month boundary instead of pinning a stale x-axis.
    return this.moneyChartCache.getOrLoad(`${accountId}:${start.toISOString()}`, () =>
      this.loadMoneyChart(accountId, start, end, ctx),
    );
  }

  private async loadMoneyChart(
    accountId: string,
    start: Date,
    end: Date,
    ctx: RateContext,
  ): Promise<MoneyChartPoint[]> {
    // Carry `currency` so each (month,currency) inflow/outflow can be
    // base-consolidated in JS (consistent with the cash-flow report).
    const rows = await this.prisma.client.$queryRaw<
      Array<{ bucket: Date; currency: string; inflow: bigint; outflow: bigint }>
    >`
      WITH ops AS (
        SELECT moment, currency, sum_minor AS amount, 'in' AS dir FROM payments_in
          WHERE account_id = ${accountId}::uuid AND state = 'posted' AND deleted_at IS NULL
            AND moment >= ${start} AND moment < ${end}
        UNION ALL
        SELECT moment, currency, sum_minor AS amount, 'in' AS dir FROM cash_in
          WHERE account_id = ${accountId}::uuid AND state = 'posted' AND deleted_at IS NULL
            AND moment >= ${start} AND moment < ${end}
        UNION ALL
        SELECT moment, currency, sum_minor AS amount, 'out' AS dir FROM payments_out
          WHERE account_id = ${accountId}::uuid AND state = 'posted' AND deleted_at IS NULL
            AND moment >= ${start} AND moment < ${end}
        UNION ALL
        SELECT moment, currency, sum_minor AS amount, 'out' AS dir FROM cash_out
          WHERE account_id = ${accountId}::uuid AND state = 'posted' AND deleted_at IS NULL
            AND moment >= ${start} AND moment < ${end}
      )
      SELECT date_trunc('month', moment AT TIME ZONE 'UTC') AS bucket,
             currency,
             COALESCE(SUM(CASE WHEN dir='in'  THEN amount ELSE 0 END), 0)::bigint AS inflow,
             COALESCE(SUM(CASE WHEN dir='out' THEN amount ELSE 0 END), 0)::bigint AS outflow
      FROM ops
      GROUP BY bucket, currency
      ORDER BY bucket
    `;

    // M-12 (Faza 17): kursi topilmagan valyuta jamiga QO'SHILMAYDI. Bu yerda
    // tally ATAYLAB qaytarilmaydi: grafik by-org bloki bilan BIR XIL to'rt
    // jadvalni o'qiydi va faqat 6 oylik oyna qo'shadi ⇒ uning konvertatsiya
    // qilinmagan valyutalari to'plami by-org'nikining OSTI-TO'PLAMI. «Деньги»
    // bo'limining bitta banneri (money.unconvertedByCurrency) grafikni ham
    // qoplaydi — ikki manba ikki xil oynani jamlab yolg'on son bermaydi.
    const seen = new CurrencyTally();
    const byMonth = new Map<string, { inflow: bigint; outflow: bigint }>();
    for (const r of rows) {
      const key = r.bucket.toISOString().slice(0, 7); // YYYY-MM
      const prev = byMonth.get(key) ?? { inflow: 0n, outflow: 0n };
      prev.inflow += consolidateToBase(r.inflow, r.currency, ctx, seen);
      prev.outflow += consolidateToBase(r.outflow, r.currency, ctx, seen);
      byMonth.set(key, prev);
    }

    const out: MoneyChartPoint[] = [];
    let runningBalance = 0n;
    const cursor = new Date(start);
    for (let m = 0; m < CASH_FLOW_CHART_MONTHS; m++) {
      const monthKey = cursor.toISOString().slice(0, 7);
      const bucket = byMonth.get(monthKey) ?? { inflow: 0n, outflow: 0n };
      runningBalance += bucket.inflow - bucket.outflow;
      out.push({
        monthIso: `${monthKey}-01`,
        label: this.MONTH_SHORT_RU[cursor.getMonth()]!,
        inflowMinor: bucket.inflow.toString(),
        outflowMinor: bucket.outflow.toString(),
        balanceMinor: runningBalance.toString(),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return out;
  }

  // -------------------------------------------------------------------
  // Stock snapshot
  // -------------------------------------------------------------------

  private async computeStock(accountId: string): Promise<DashboardResult['stock']> {
    // totalSku = all active stock rows for this account.
    // lowStockCount via raw SQL because Prisma cannot filter on a column
    // expression (qty - reserved_qty). LOW_STOCK_THRESHOLD is hardcoded at 5 for V1.
    const [totalSku, lowResult] = await Promise.all([
      this.prisma.client.stock.count({ where: { accountId } }),
      this.prisma.client.$queryRaw<[{ cnt: bigint }]>`
        SELECT COUNT(*)::bigint AS cnt
        FROM stocks
        WHERE account_id = ${accountId}::uuid
          AND (qty - reserved_qty) <= ${LOW_STOCK_THRESHOLD}
      `,
    ]);

    return {
      totalSku,
      lowStockCount: Number(lowResult[0]?.cnt ?? 0n),
    };
  }

  // -------------------------------------------------------------------
  // Task counts
  // -------------------------------------------------------------------

  private async computeTasks(
    accountId: string,
    currentUserId: string,
  ): Promise<DashboardResult['pendingTasks']> {
    const now = new Date();

    const [mine, overdue] = await Promise.all([
      this.prisma.client.task.count({
        where: {
          accountId,
          assigneeId: currentUserId,
          status: { in: ['open', 'in_progress'] },
          archived: false,
        },
      }),
      this.prisma.client.task.count({
        where: {
          accountId,
          status: { in: ['open', 'in_progress'] },
          archived: false,
          dueAt: { lt: now },
        },
      }),
    ]);

    return { mine, overdue };
  }

  // -------------------------------------------------------------------
  // Parse
  // -------------------------------------------------------------------

  private parseFilter(raw: unknown): DashboardFilterInput {
    const r = DashboardFilterSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}
