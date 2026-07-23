import { z } from 'zod';

/**
 * «Акт сверки взаимных расчётов» (reconciliation act) input.
 *
 * Mirrors the «Создание акта сверки» panel on the counterparty card: an
 * organization + counterparty + an optional period + optional contract. The
 * act is per-currency (default account base UZS), exactly like the balance the
 * act reconciles. `from`/`to` are date-only ("YYYY-MM-DD"); an empty `from`
 * means "from the very first document" (opening balance 0), an empty `to`
 * means "up to now".
 */
export const CounterpartyActSchema = z.object({
  organizationId: z.string().uuid(),
  counterpartyId: z.string().uuid(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  contractId: z.string().uuid().optional(),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((s) => s.toUpperCase())
    .default('UZS'),
});

export type CounterpartyActInput = z.infer<typeof CounterpartyActSchema>;
