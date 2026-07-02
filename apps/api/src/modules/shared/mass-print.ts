import { z } from 'zod';

/**
 * Shared schema for the "bulk mark-as-printed" half of moysklad's
 * mass-print workflow. The PDF render half lives in the (not-yet-built)
 * print template pipeline — this endpoint only toggles the row's
 * `printed` flag so the list filter and the per-doc badge reflect the
 * operator's state.
 *
 * Used by every FSM document that exposes a `printed: boolean` column
 * (CustomerOrder, Demand, InvoiceOut, Supply, SalesReturn, PurchaseOrder,
 * PurchaseReturn). Each per-row write goes through runBulk so partial
 * batches surface their per-id failures.
 */
export const BulkMarkPrintedSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  printed: z.boolean(),
});
export type BulkMarkPrintedInput = z.infer<typeof BulkMarkPrintedSchema>;
