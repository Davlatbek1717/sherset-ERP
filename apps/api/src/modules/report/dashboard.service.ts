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
import { CurrencyTally, consolidateToBase, loadRateContext } from './report-rate-ctx.util.js';
import { ReportService } from './report.service.js';

/** Products with qty - reservedQty <= this threshold are counted as low-stock. V1 hardcoded. */
const LOW_STOCK_THRESHOLD = 5;

/** How many overdue rows we surface per panel. moysklad caps at ~10 too. */
const OVERDUE_LIMIT = 10;

/** How many months go into the cash-flow chart next to "Деньги". */
const CASH_FLOW_CHART_MONTHS = 6;

@Injectable()
export class DashboardService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReportService) private readonly salesService: ReportService,
    @Inject(CashFlowService) private readonly cashFlowService: CashFlowService,
    @Inject(CounterpartyBalanceService)
    private readonly cpBalanceService: CounterpartyBalanceService,
  ) {}

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
      this.computeOverdueInvoices(accountId, now),
      this.computeMoneyByOrg(accountId),
      this.computeMoneyChart(accountId, now),
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
    const moneyTotalSumMinor = moneyByOrg
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
        byOrg: moneyByOrg,
        chart: moneyChart,
      },

      recentDocs: await this.computeRecentDocs(accountId),

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
   * UNION ALL is faster than 12 separate Promise.all queries because
   * each leg only walks its own (account_id, updated_at) index for
   * the top-20 rows.
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
        SELECT 'customer-order' AS type, id, name AS number, applicable AS posted,
               moment AS moment_date, agent_id, organization_id, sum_minor, currency, updated_at AS modified_at
          FROM customer_orders WHERE account_id = ${accountId}::uuid
        UNION ALL
        SELECT 'demand', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
          FROM demands WHERE account_id = ${accountId}::uuid
        UNION ALL
        SELECT 'invoice-out', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
          FROM invoices_out WHERE account_id = ${accountId}::uuid
        UNION ALL
        SELECT 'invoice-in', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
          FROM invoices_in WHERE account_id = ${accountId}::uuid
        UNION ALL
        SELECT 'supply', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
          FROM supplies WHERE account_id = ${accountId}::uuid
        UNION ALL
        SELECT 'sales-return', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
          FROM sales_returns WHERE account_id = ${accountId}::uuid
        UNION ALL
        SELECT 'purchase-order', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
          FROM purchase_orders WHERE account_id = ${accountId}::uuid
        UNION ALL
        SELECT 'purchase-return', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
          FROM purchase_returns WHERE account_id = ${accountId}::uuid
        UNION ALL
        SELECT 'cash-in', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
          FROM cash_in WHERE account_id = ${accountId}::uuid
        UNION ALL
        SELECT 'cash-out', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
          FROM cash_out WHERE account_id = ${accountId}::uuid
        UNION ALL
        SELECT 'payment-in', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
          FROM payments_in WHERE account_id = ${accountId}::uuid
        UNION ALL
        SELECT 'payment-out', id, name, applicable, moment, agent_id, organization_id, sum_minor, currency, updated_at
          FROM payments_out WHERE account_id = ${accountId}::uuid
      ) recent
      ORDER BY modified_at DESC
      LIMIT 20
    `;

    if (rows.length === 0) return [];

    // Bulk-resolve agent + org names so we don't N+1 the per-row joins.
    const agentIds = Array.from(new Set(rows.map((r) => r.agent_id).filter(Boolean)));
    const orgIds = Array.from(
      new Set(rows.map((r) => r.organization_id).filter((x): x is string => Boolean(x))),
    );
    const [agents, orgs] = await Promise.all([
      this.prisma.client.counterparty.findMany({
        where: { accountId, id: { in: agentIds } },
        select: { id: true, name: true },
      }),
      this.prisma.client.organization.findMany({
        where: { accountId, id: { in: orgIds } },
        select: { id: true, name: true },
      }),
    ]);
    const agentName = new Map(agents.map((a) => [a.id, a.name]));
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
    };
  }

  /**
   * Invoices are overdue when paymentPlannedMoment is in the past and
   * there's still unpaid balance (`payedSumMinor < sumMinor`). We
   * intentionally don't filter by `applicable` because a posted but
   * unpaid invoice is still an open receivable.
   */
  private async computeOverdueInvoices(accountId: string, now: Date): Promise<OverdueBlock> {
    // Prisma doesn't support column-vs-column comparisons in `where`,
    // so we fetch with the date predicate and filter the unpaid check
    // in JS. The same predicate runs in the aggregate via raw SQL.
    const candidateRows = await this.prisma.client.invoiceOut.findMany({
      where: {
        accountId,
        deletedAt: null,
        paymentPlannedMoment: { lt: now },
      },
      select: {
        id: true,
        name: true,
        sumMinor: true,
        payedSumMinor: true,
        paymentPlannedMoment: true,
        agent: { select: { name: true } },
      },
      orderBy: { paymentPlannedMoment: 'asc' },
      take: OVERDUE_LIMIT * 4, // over-fetch to allow JS-side filter
    });

    const overdue = candidateRows.filter((r) => r.payedSumMinor < r.sumMinor);
    const top = overdue.slice(0, OVERDUE_LIMIT);

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
    const ctx = await loadRateContext(this.prisma.client, accountId);
    // M-12 (Faza 17): kursi topilmagan valyuta jamiga QO'SHILMAYDI (ilgari
    // face-value qo'shilardi). Dashboard vidjeti qoldiqni alohida ko'rsatuvchi
    // maydonga ega emas — bu OCHIQ QARZ (rejadagi Faza 17 hisobotida qayd etilgan);
    // to'liq hisobotlar (/reports/*) unconvertedByCurrency bilan qaytaradi.
    const seen = new CurrencyTally();
    let count = 0;
    let totalBase = 0n;
    for (const r of aggRows) {
      count += Number(r.cnt);
      totalBase += consolidateToBase(r.total ?? 0n, r.currency, ctx, seen);
    }

    const items: OverdueDocItem[] = top.map((r) => ({
      id: r.id,
      number: r.name,
      counterpartyName: r.agent?.name ?? null,
      sumMinor: (r.sumMinor - r.payedSumMinor).toString(), // moysklad shows owed amount, not gross
      daysOverdue: this.daysBetween(r.paymentPlannedMoment ?? now, now),
    }));

    return {
      count,
      totalSumMinor: totalBase.toString(),
      items,
    };
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
  private async computeMoneyByOrg(accountId: string): Promise<MoneyByOrgRow[]> {
    const orgs = await this.prisma.client.organization.findMany({
      where: { accountId, archived: false },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    if (orgs.length === 0) return [];

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

    const ctx = await loadRateContext(this.prisma.client, accountId);
    // M-12 (Faza 17): kursi topilmagan valyuta jamiga QO'SHILMAYDI (ilgari
    // face-value qo'shilardi). Dashboard vidjeti qoldiqni alohida ko'rsatuvchi
    // maydonga ega emas — bu OCHIQ QARZ (rejadagi Faza 17 hisobotida qayd etilgan);
    // to'liq hisobotlar (/reports/*) unconvertedByCurrency bilan qaytaradi.
    const seen = new CurrencyTally();
    const balanceByOrg = new Map<string, bigint>();
    for (const r of rows) {
      const base = consolidateToBase(r.balance, r.currency, ctx, seen);
      balanceByOrg.set(r.organization_id, (balanceByOrg.get(r.organization_id) ?? 0n) + base);
    }

    return orgs.map((o) => ({
      orgId: o.id,
      orgName: o.name,
      balanceMinor: (balanceByOrg.get(o.id) ?? 0n).toString(),
    }));
  }

  /**
   * Last 6 months of cash flow, bucketed by month. Each point carries
   * inflow / outflow / running-balance so the recharts component can
   * draw 3 series with one fetch. Months are produced even if empty
   * (sparse data still renders a flat line, matching moysklad).
   */
  private async computeMoneyChart(accountId: string, now: Date): Promise<MoneyChartPoint[]> {
    // First-of-month, six months back from `now`
    const start = new Date(now.getFullYear(), now.getMonth() - (CASH_FLOW_CHART_MONTHS - 1), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1); // exclusive

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

    const ctx = await loadRateContext(this.prisma.client, accountId);
    // M-12 (Faza 17): kursi topilmagan valyuta jamiga QO'SHILMAYDI (ilgari
    // face-value qo'shilardi). Dashboard vidjeti qoldiqni alohida ko'rsatuvchi
    // maydonga ega emas — bu OCHIQ QARZ (rejadagi Faza 17 hisobotida qayd etilgan);
    // to'liq hisobotlar (/reports/*) unconvertedByCurrency bilan qaytaradi.
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
