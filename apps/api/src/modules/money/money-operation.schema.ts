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
   * produced, so the filter could only return an empty list.)
   *
   * Faza 11 (`M-06`/`M-05`) added three real writers: payment-in/payment-out
   * ('payment_in'/'payment_out', bank side) and the debt payments
   * ('debtpayment', cash side — same slug the counterparty-balance journal
   * already uses as its `docType`). Add a slug here ONLY together with its
   * writer. Locked by web money-kind-contract.test.ts.
   */
  documentKind: z
    .enum(['cash_in', 'cash_out', 'retailsale', 'payment_in', 'payment_out', 'debtpayment'])
    .optional(),
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
