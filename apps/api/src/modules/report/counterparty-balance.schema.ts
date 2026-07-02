import { z } from 'zod';

const uuid = z.string().uuid();

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const CounterpartyBalanceFilterSchema = z.object({
  /** Restrict to one counterparty (drill-down). */
  counterpartyId: uuid.optional(),
  /** Restrict to one currency. */
  currency: z.string().length(3).toUpperCase().optional(),
  /**
   * Sign filter:
   *  - 'all' (default): every row, including zeros
   *  - 'nonzero': hides zero balances
   *  - 'debtors': only counterparties that owe us (balance > 0)
   *  - 'creditors': only counterparties we owe (balance < 0)
   */
  signFilter: z.enum(['all', 'nonzero', 'debtors', 'creditors']).default('nonzero'),
  /** Free-text search on counterparty name / legalTitle / inn. */
  search: z.string().max(100).optional(),
  /** Include rows for archived counterparties (default false). */
  includeArchived: boolFromString.optional(),
  /**
   * 'none' (default): one row per (counterparty, currency)
   * 'counterparty': sum across currencies, each row consolidated to the
   *                 account base (валюта учёта) first, so the collapsed
   *                 balance is meaningful even for multi-currency
   *                 counterparties. summaries.mixedCurrency flags the case.
   */
  groupBy: z.enum(['none', 'counterparty']).default('none'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type CounterpartyBalanceFilterInput = z.infer<typeof CounterpartyBalanceFilterSchema>;
