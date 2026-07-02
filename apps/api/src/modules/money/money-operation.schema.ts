import { z } from 'zod';

/**
 * Unified money-operation list filter — drives /money page (moysklad
 * parity). Surfaces the document kinds that actually write the shared
 * MoneyOperation ledger in one timeline.
 */
export const MoneyOperationFilterSchema = z.object({
  search: z.string().optional(),
  /** "in" = positive deltas. "out" = negative. */
  flow: z.enum(['all', 'in', 'out']).default('all'),
  /**
   * Per-kind filter — must match the de-facto `MoneyOperation.documentKind`
   * values the writers store: cash-in/cash-out services write
   * 'cash_in'/'cash_out', retail-sale writes 'retailsale'. (The original
   * enum said cashin/cashout/paymentin/paymentout — slugs NO writer ever
   * produced, so the filter could only return an empty list. Payments do
   * not write this ledger today; add their slug here + a writer together
   * if that changes. Locked by web money-kind-contract.test.ts.)
   */
  documentKind: z.enum(['cash_in', 'cash_out', 'retailsale']).optional(),
  organizationAccountId: z.string().uuid().optional(),
  cashDeskId: z.string().uuid().optional(),
  counterpartyId: z.string().uuid().optional(),
  currency: z.string().length(3).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(250).default(25),
});
export type MoneyOperationFilter = z.infer<typeof MoneyOperationFilterSchema>;
