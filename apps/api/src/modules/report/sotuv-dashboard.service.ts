import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { reportDateBounds } from './report-date-bounds.util.js';

/**
 * «Sotuv dashboard» (Sherset custom) — the daily kassa summary the owner
 * reads every evening. One call answers: how many POS sales happened today,
 * how much money actually came in (sales + debt repayments), what the profit
 * was, how much new debt was written, where the debt ledger stands, what the
 * warehouse is worth, and how each cashier performed.
 *
 * Source data (all «today» = one Asia/Tashkent calendar day, half-open UTC
 * window via reportDateBounds):
 *  - sales        = RetailSale state='posted', postedAt in window. The paid
 *    portion is sumMinor − advancePaymentSumMinor (advance… stores the POS
 *    debt split — see retail-sale.service.post). Cash is netted of change.
 *  - debt income  = posted CashIn (naqd) + PaymentIn (bank/karta) in window —
 *    both decrement CounterpartyBalance on post, i.e. they ARE the repayments.
 *  - expenses     = posted CashOut + PaymentOut in window.
 *  - profit       = Σ position.sumMinor − Σ quantity × product.buyPrice over
 *    today's posted sales. Service lines (productId NULL) contribute revenue
 *    with zero cost. buyPrice is treated as base-currency tiyin (the account
 *    is UZS-only; matches the app-wide cost-math assumption on Product).
 *  - debt ledger  = CounterpartyBalance signs: positive → mijoz bizga qarzdor
 *    («Mijoz qarzlari»), negative → biz qarzdormiz («Shaxsiy qarzlar»).
 *  - stock value  = Σ stocks.qty × products.buy_price (qty > 0 rows only).
 *  - cashiers     = today's posted sales grouped by session cashier.
 */
export const SotuvDashboardFilterSchema = z.object({
  /** Tashkent calendar day, "YYYY-MM-DD". Defaults to today. (legacy single-day param) */
  date: z.coerce.date().optional(),
  /** Range start, "YYYY-MM-DD" (Tashkent day, inclusive). Wins over `date`. */
  dateFrom: z.coerce.date().optional(),
  /** Range end, "YYYY-MM-DD" (Tashkent day, inclusive). Defaults: dateFrom bilan kelsa bugun, yolg'iz kelsa e'tiborga olinmaydi. */
  dateTo: z.coerce.date().optional(),
});

export type SotuvDashboardFilter = z.infer<typeof SotuvDashboardFilterSchema>;

/**
 * Collapse any instant to the UTC-midnight of ITS Tashkent calendar day —
 * the exact input shape reportDateBounds expects (FE date-only coercion).
 */
export function tashkentDayUtcMidnight(instant: Date): Date {
  const shifted = new Date(instant.getTime() + 5 * 60 * 60 * 1000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

/**
 * Inclusive Tashkent-day window the report covers. Pure (unit-tested):
 *  - dateFrom bor  → [dateFrom, dateTo ?? bugun]
 *  - faqat date    → [date, date]  (legacy single-day)
 *  - hech biri yo'q → [bugun, bugun]
 * Teskari diapazon (to < from) bitta from-kunga qisqartiriladi.
 */
export function resolveSotuvWindow(
  filter: Pick<SotuvDashboardFilter, 'date' | 'dateFrom' | 'dateTo'>,
  now: Date = new Date(),
): { fromDay: Date; toDay: Date } {
  let fromDay: Date;
  let toDay: Date;
  if (filter.dateFrom) {
    fromDay = tashkentDayUtcMidnight(filter.dateFrom);
    toDay = tashkentDayUtcMidnight(filter.dateTo ?? now);
  } else if (filter.date) {
    fromDay = tashkentDayUtcMidnight(filter.date);
    toDay = fromDay;
  } else {
    fromDay = tashkentDayUtcMidnight(now);
    toDay = fromDay;
  }
  if (toDay.getTime() < fromDay.getTime()) toDay = fromDay;
  return { fromDay, toDay };
}

export interface PaymentMethodBlock {
  sumMinor: string;
  count: number;
}

export interface CashierRow {
  cashierId: string;
  cashierName: string;
  salesCount: number;
  salesSumMinor: string;
}

export interface SotuvDashboardResult {
  date: string; // window start (YYYY-MM-DD, Tashkent) — legacy alias of dateFrom
  dateFrom: string; // inclusive window start (YYYY-MM-DD, Tashkent)
  dateTo: string; // inclusive window end (YYYY-MM-DD, Tashkent)

  salesCount: number;
  /** Full receipt total incl. the debt portion (Σ sumMinor). */
  salesSumMinor: string;
  /** Paid at the till today = Σ (sumMinor − advancePaymentSumMinor). */
  salesIncomeMinor: string;
  /** Debt repayments received today (posted CashIn + PaymentIn). */
  debtIncomeMinor: string;
  /** salesIncome + debtIncome. */
  totalIncomeMinor: string;

  /** Gross profit on today's sales (revenue − COGS by buyPrice). */
  profitMinor: string;
  /** Posted CashOut + PaymentOut today. */
  expenseMinor: string;
  /** profit − expense. */
  netProfitMinor: string;

  /** New debt written today (Σ advancePaymentSumMinor). */
  newDebtMinor: string;
  /** Σ positive counterparty balances — customers owe us (current, not windowed). */
  customerDebtMinor: string;
  /** |Σ negative counterparty balances| — we owe suppliers/lenders. */
  ourDebtMinor: string;

  /** Active (non-archived, non-deleted) product count. */
  productCount: number;
  /** Σ qty × buyPrice over positive stock rows. */
  stockValueMinor: string;

  /** Till breakdown. naqd includes CashIn repayments; karta includes PaymentIn. */
  payments: {
    cash: PaymentMethodBlock;
    card: PaymentMethodBlock;
    terminal: PaymentMethodBlock;
  };

  cashiers: CashierRow[];
}

@Injectable()
export class SotuvDashboardService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async report(accountId: string, raw: unknown): Promise<SotuvDashboardResult> {
    const filter = SotuvDashboardFilterSchema.parse(raw);
    // Inclusive Tashkent-day window (single day by default; dateFrom/dateTo
    // widen it — windowed metrics aggregate over the range, snapshot metrics
    // (balances, product count, stock value) stay current-point).
    const { fromDay, toDay } = resolveSotuvWindow(filter);
    const { gte, lt } = reportDateBounds(fromDay, toDay);

    const [salesAgg, profitRow, debtIn, expenses, balances, productCount, stockValueRow, cashiers] =
      await Promise.all([
        // Sales headline + payment split in one aggregate.
        this.prisma.client.$queryRaw<
          [
            {
              cnt: number;
              total: bigint | null;
              paid: bigint | null;
              new_debt: bigint | null;
              cash_net: bigint | null;
              cash_cnt: bigint | null;
              card_sum: bigint | null;
              card_cnt: bigint | null;
              terminal_sum: bigint | null;
              terminal_cnt: bigint | null;
            },
          ]
        >`
          SELECT COUNT(*)::int                                            AS cnt,
                 COALESCE(SUM(sum_minor), 0)::bigint                       AS total,
                 COALESCE(SUM(sum_minor - advance_payment_sum_minor), 0)::bigint AS paid,
                 COALESCE(SUM(advance_payment_sum_minor), 0)::bigint       AS new_debt,
                 COALESCE(SUM(cash_amount_minor - change_minor), 0)::bigint AS cash_net,
                 COUNT(*) FILTER (WHERE cash_amount_minor > 0)::bigint      AS cash_cnt,
                 COALESCE(SUM(card_amount_minor), 0)::bigint                AS card_sum,
                 COUNT(*) FILTER (WHERE card_amount_minor > 0)::bigint      AS card_cnt,
                 COALESCE(SUM(terminal_amount_minor), 0)::bigint            AS terminal_sum,
                 COUNT(*) FILTER (WHERE terminal_amount_minor > 0)::bigint  AS terminal_cnt
          FROM retail_sales
          WHERE account_id = ${accountId}::uuid
            AND state = 'posted' AND deleted_at IS NULL
            AND posted_at >= ${gte} AND posted_at < ${lt}
        `,
        // Revenue − COGS over today's sale lines.
        this.prisma.client.$queryRaw<[{ revenue: bigint | null; cost: bigint | null }]>`
          SELECT COALESCE(SUM(rsp.sum_minor), 0)::bigint                          AS revenue,
                 COALESCE(SUM(rsp.quantity * COALESCE(p.buy_price, 0)), 0)::bigint AS cost
          FROM retail_sale_positions rsp
          JOIN retail_sales rs ON rs.id = rsp.retail_sale_id
          LEFT JOIN products p ON p.id = rsp.product_id
          WHERE rs.account_id = ${accountId}::uuid
            AND rs.state = 'posted' AND rs.deleted_at IS NULL
            AND rs.posted_at >= ${gte} AND rs.posted_at < ${lt}
        `,
        // Debt repayments: cash (CashIn) vs bank/card (PaymentIn).
        this.prisma.client.$queryRaw<
          [{ cash_sum: bigint | null; cash_cnt: bigint; bank_sum: bigint | null; bank_cnt: bigint }]
        >`
          SELECT COALESCE(SUM(sum_minor) FILTER (WHERE src = 'cash'), 0)::bigint AS cash_sum,
                 COUNT(*)  FILTER (WHERE src = 'cash')::bigint                    AS cash_cnt,
                 COALESCE(SUM(sum_minor) FILTER (WHERE src = 'bank'), 0)::bigint AS bank_sum,
                 COUNT(*)  FILTER (WHERE src = 'bank')::bigint                    AS bank_cnt
          FROM (
            SELECT sum_minor, 'cash' AS src FROM cash_in
              WHERE account_id = ${accountId}::uuid AND state = 'posted'
                AND deleted_at IS NULL AND moment >= ${gte} AND moment < ${lt}
            UNION ALL
            SELECT sum_minor, 'bank' AS src FROM payments_in
              WHERE account_id = ${accountId}::uuid AND state = 'posted'
                AND deleted_at IS NULL AND moment >= ${gte} AND moment < ${lt}
          ) t
        `,
        // Expenses: everything paid out today.
        this.prisma.client.$queryRaw<[{ total: bigint | null }]>`
          SELECT COALESCE(SUM(sum_minor), 0)::bigint AS total
          FROM (
            SELECT sum_minor FROM cash_out
              WHERE account_id = ${accountId}::uuid AND state = 'posted'
                AND deleted_at IS NULL AND moment >= ${gte} AND moment < ${lt}
            UNION ALL
            SELECT sum_minor FROM payments_out
              WHERE account_id = ${accountId}::uuid AND state = 'posted'
                AND deleted_at IS NULL AND moment >= ${gte} AND moment < ${lt}
          ) t
        `,
        // Debt ledger split by sign (current snapshot).
        this.prisma.client.$queryRaw<[{ debtors: bigint | null; creditors: bigint | null }]>`
          SELECT COALESCE(SUM(balance_minor) FILTER (WHERE balance_minor > 0), 0)::bigint AS debtors,
                 COALESCE(-SUM(balance_minor) FILTER (WHERE balance_minor < 0), 0)::bigint AS creditors
          FROM counterparty_balances
          WHERE account_id = ${accountId}::uuid
        `,
        this.prisma.client.product.count({
          where: { accountId, archived: false, deletedAt: null },
        }),
        this.prisma.client.$queryRaw<[{ value: bigint | null }]>`
          SELECT COALESCE(SUM(s.qty * COALESCE(p.buy_price, 0)), 0)::bigint AS value
          FROM stocks s
          JOIN products p ON p.id = s.assortment_id
          WHERE s.account_id = ${accountId}::uuid
            AND s.assortment_kind = 'product' AND s.qty > 0
        `,
        this.prisma.client.$queryRaw<
          Array<{ cashier_id: string; cashier_name: string; cnt: number; total: bigint | null }>
        >`
          SELECT e.id AS cashier_id, e.name AS cashier_name,
                 COUNT(*)::int AS cnt, COALESCE(SUM(rs.sum_minor), 0)::bigint AS total
          FROM retail_sales rs
          JOIN cashier_sessions cs ON cs.id = rs.session_id
          JOIN employees e ON e.id = cs.cashier_id
          WHERE rs.account_id = ${accountId}::uuid
            AND rs.state = 'posted' AND rs.deleted_at IS NULL
            AND rs.posted_at >= ${gte} AND rs.posted_at < ${lt}
          GROUP BY e.id, e.name
          ORDER BY total DESC
        `,
      ]);

    const s = salesAgg[0];
    const p = profitRow[0];
    const d = debtIn[0];

    const salesIncome = s.paid ?? 0n;
    const debtIncome = (d.cash_sum ?? 0n) + (d.bank_sum ?? 0n);
    const profit = (p.revenue ?? 0n) - (p.cost ?? 0n);
    const expense = expenses[0].total ?? 0n;

    return {
      date: this.tashkentDayIso(fromDay),
      dateFrom: this.tashkentDayIso(fromDay),
      dateTo: this.tashkentDayIso(toDay),

      salesCount: s.cnt,
      salesSumMinor: (s.total ?? 0n).toString(),
      salesIncomeMinor: salesIncome.toString(),
      debtIncomeMinor: debtIncome.toString(),
      totalIncomeMinor: (salesIncome + debtIncome).toString(),

      profitMinor: profit.toString(),
      expenseMinor: expense.toString(),
      netProfitMinor: (profit - expense).toString(),

      newDebtMinor: (s.new_debt ?? 0n).toString(),
      customerDebtMinor: (balances[0].debtors ?? 0n).toString(),
      ourDebtMinor: (balances[0].creditors ?? 0n).toString(),

      productCount,
      stockValueMinor: (stockValueRow[0].value ?? 0n).toString(),

      payments: {
        cash: {
          sumMinor: ((s.cash_net ?? 0n) + (d.cash_sum ?? 0n)).toString(),
          count: Number(s.cash_cnt ?? 0n) + Number(d.cash_cnt),
        },
        card: {
          sumMinor: ((s.card_sum ?? 0n) + (d.bank_sum ?? 0n)).toString(),
          count: Number(s.card_cnt ?? 0n) + Number(d.bank_cnt),
        },
        terminal: {
          sumMinor: (s.terminal_sum ?? 0n).toString(),
          count: Number(s.terminal_cnt ?? 0n),
        },
      },

      cashiers: cashiers.map((c) => ({
        cashierId: c.cashier_id,
        cashierName: c.cashier_name,
        salesCount: c.cnt,
        salesSumMinor: (c.total ?? 0n).toString(),
      })),
    };
  }

  private tashkentDayIso(dayUtcMidnight: Date): string {
    return dayUtcMidnight.toISOString().slice(0, 10);
  }
}
