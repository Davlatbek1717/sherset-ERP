import { z } from 'zod';
import type { UnconvertedAmount } from './report-rate-ctx.util.js';

export const DashboardPeriod = z.enum(['today', 'week', 'month', 'quarter', 'year']);
export type DashboardPeriodValue = z.infer<typeof DashboardPeriod>;

export const DashboardFilterSchema = z.object({
  period: DashboardPeriod.default('month'),
});
export type DashboardFilterInput = z.infer<typeof DashboardFilterSchema>;

/**
 * One of the two metric clusters in moysklad's "Продажи" section: a
 * count + total + a delta vs the previous comparable window. The
 * `comparisonLabelKey` is a discriminator the frontend translates into
 * the localised label (e.g. "со средой" for `previous_weekday` when
 * today is Thursday).
 */
export interface SalesBlock {
  count: number;
  sumMinor: string;
  /** Absolute delta vs the comparison window (signed bigint as string). */
  comparisonSumMinor: string;
  /** Signed percentage delta — `-15` means a 15% drop. `0` if comparison was zero. */
  comparisonPercent: number;
  /**
   * Discriminator for the localised label. The frontend renders it as
   * "По сравнению со средой / с прошлой неделей / с прошлым месяцем /
   * с прошлым годом". `previous_weekday` carries the actual weekday
   * name in `comparisonLabelExtra` (e.g. "среда") so the wire format
   * doesn't need server-side localisation.
   */
  comparisonLabelKey: 'previous_weekday' | 'last_week' | 'last_month' | 'last_year' | 'yesterday';
  /**
   * Optional payload that goes with the label. Currently only used for
   * `previous_weekday` to carry the day-of-week index (0=Mon..6=Sun)
   * so the frontend can pluck the right localised weekday name.
   */
  comparisonLabelExtra?: { weekdayIndex?: number };
}

export interface SalesChartPoint {
  /** ISO start of the bucket (YYYY-MM-DD or YYYY-MM-01). */
  date: string;
  /** Already-localised x-axis label: 'пн', '15', 'Янв.'. */
  label: string;
  sumMinor: string;
}

export interface OverdueDocItem {
  id: string;
  /** Display number, e.g. 'ЗП-2026-00001' / 'СЧ-2026-00042'. */
  number: string;
  counterpartyName: string | null;
  sumMinor: string;
  /** Floor of `(now - dueDate) / 1day`. Always positive (only overdue items returned). */
  daysOverdue: number;
}

export interface OverdueBlock {
  count: number;
  totalSumMinor: string;
  /** Top N overdue items sorted by daysOverdue desc (most overdue first). */
  items: OverdueDocItem[];
  /**
   * `M-12` (Faza 17 DEFER-2 → Faza Q16) — money whose currency has no usable
   * rate, per currency. Those amounts are deliberately NOT part of
   * `totalSumMinor` (adding them at face value is the bug Faza 17 removed);
   * without this field they simply vanished from the widget. Empty array =
   * everything consolidated cleanly, so the UI shows no banner.
   */
  unconvertedByCurrency: UnconvertedAmount[];
}

export interface MoneyByOrgRow {
  orgId: string;
  orgName: string;
  /** Net cash balance for the org (paymentIn - paymentOut + cashIn - cashOut). */
  balanceMinor: string;
}

/**
 * One bucket in the cash-flow line chart shown next to the "Деньги"
 * section. Always six months ending in the current month so the
 * x-axis labels match moysklad's "Нояб. Дек. Янв. Февр. Март Апр.".
 */
export interface MoneyChartPoint {
  monthIso: string; // YYYY-MM-01
  /** Localised short month name: 'Нояб.', 'Дек.', etc. */
  label: string;
  inflowMinor: string;
  outflowMinor: string;
  /** Running balance at the end of the month. */
  balanceMinor: string;
}

export interface RecentDocItem {
  id: string;
  /** Lowercase entity code: 'demand' / 'invoice_out' / 'cash_in' / etc. */
  type: string;
  /** Display number / name. */
  number: string;
  /** True = posted (проведено). */
  posted: boolean;
  momentDate: string;
  counterpartyName: string | null;
  orgName: string | null;
  sumMinor: string;
  currency: string;
  modifiedAt: string;
  modifiedByName: string | null;
}

export interface DashboardResult {
  period: DashboardPeriodValue;
  dateFrom: string; // ISO date string
  dateTo: string; // ISO date string

  // -------------------------------------------------------------------
  // Section 1: Продажи (sales)
  // -------------------------------------------------------------------
  sales: {
    // Period totals (kept for backwards-compat with previous KPI tiles).
    count: number;
    sumMinor: string;
    netSumMinor: string;
    profitMinor: string;
    // moysklad parity sub-blocks:
    today: SalesBlock;
    period: SalesBlock;
    chart: SalesChartPoint[];
  };

  // -------------------------------------------------------------------
  // Section 2: Просроченные заказы / Просроченные счета
  // -------------------------------------------------------------------
  overdueOrders: OverdueBlock;
  overdueInvoices: OverdueBlock;

  // -------------------------------------------------------------------
  // Section 3: Деньги
  // -------------------------------------------------------------------
  money: {
    totalSumMinor: string;
    byOrg: MoneyByOrgRow[];
    chart: MoneyChartPoint[];
    /**
     * `M-12` (Faza Q16) — currencies the money block could not consolidate.
     * Sourced from the by-org (whole-history) pass, which is a SUPERSET of the
     * chart's currency set: both read the same four tables with the same
     * `state='posted'` predicate and the chart only adds a 6-month window, so
     * a currency the chart cannot convert is necessarily present here too.
     * One banner therefore covers the whole "Деньги" section (balance tiles,
     * per-org table and chart alike).
     */
    unconvertedByCurrency: UnconvertedAmount[];
  };

  // -------------------------------------------------------------------
  // Section 4: Недавние документы (cross-entity, currently empty until
  // we wire the audit-log union — section is kept on the wire so the
  // frontend can render the column header even when no rows exist,
  // matching moysklad's empty state exactly.
  // -------------------------------------------------------------------
  recentDocs: RecentDocItem[];

  // -------------------------------------------------------------------
  // Legacy fields kept for backwards-compat with any consumer still
  // hitting the previous shape (other dashboards, mobile clients, ...).
  // None of the new homepage UI reads these, but removing them would
  // break the existing API contract.
  // -------------------------------------------------------------------
  cashFlow: {
    inflowSumMinor: string;
    outflowSumMinor: string;
    netSumMinor: string;
  };
  receivables: {
    totalDebtMinor: string;
    totalCreditMinor: string;
    debtorCount: number;
    creditorCount: number;
  };
  stock: {
    totalSku: number;
    /** Count of products where qty - reservedQty <= LOW_STOCK_THRESHOLD (5). */
    lowStockCount: number;
  };
  pendingTasks: {
    mine: number;
    overdue: number;
  };
}
