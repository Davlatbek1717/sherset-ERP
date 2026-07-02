import { z } from 'zod';

/**
 * Shared schemas + helper for bulk operations across all document modules.
 *
 * Every FSM-backed entity (CustomerOrder, Demand, InvoiceOut, Supply, PaymentIn,
 * PurchaseOrder, InvoiceIn, PaymentOut, SalesReturn, PurchaseReturn, Move, Loss,
 * Enter, Inventory) exposes the same three operations in the UI:
 *
 *   - POST /{entity}/bulk-delete     { ids: [] }           → soft-delete many
 *   - POST /{entity}/bulk-transition { ids: [], target }   → run an FSM action
 *
 * Each item runs in its own transaction via `runBulk` — one failure does not
 * abort the batch, and the response enumerates per-id outcomes so the UI can
 * show a partial-success toast ("8/10 deleted, 2 failed").
 */

export const BulkIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});
export type BulkIdsInput = z.infer<typeof BulkIdsSchema>;

export const BulkTransitionSchema = BulkIdsSchema.extend({
  target: z.string().min(1).max(50),
});
export type BulkTransitionInput = z.infer<typeof BulkTransitionSchema>;

/**
 * bulk-print body: the selected ids plus an optional custom PrintTemplate id.
 * Omitted `templateId` → the render path falls back to the account default /
 * built-in form; set → that account-uploaded Word/Excel/HTML template is used
 * (moysklad «Печать» → pick a named print form). Shared by every document
 * module's bulk-print endpoint so custom templates work on every doc type.
 */
export const BulkPrintSchema = BulkIdsSchema.extend({
  templateId: z.string().uuid().optional(),
});
export type BulkPrintInput = z.infer<typeof BulkPrintSchema>;

export interface BulkResult {
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

export async function runBulk<T>(
  ids: string[],
  op: (id: string) => Promise<T>,
): Promise<BulkResult> {
  // Dedupe — a duplicate id in one request would otherwise run `op` against the
  // SAME entity concurrently (Promise.allSettled), racing the unguarded FSM
  // transition path. The same entity can only have one outcome anyway.
  const uniqueIds = [...new Set(ids)];
  const results = await Promise.allSettled(uniqueIds.map((id) => op(id)));
  const succeeded: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  results.forEach((r, i) => {
    const id = uniqueIds[i]!;
    if (r.status === 'fulfilled') {
      succeeded.push(id);
    } else {
      const err = r.reason;
      const msg =
        err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
      failed.push({ id, error: msg });
    }
  });
  return { total: uniqueIds.length, succeeded, failed };
}

/**
 * Index-keyed variant of runBulk for "create many from spreadsheet" import flows.
 * Each row's status is reported by its 0-based index in the input array, so the
 * client can highlight which spreadsheet row failed validation. Rows are processed
 * sequentially to keep error messages deterministic and avoid swamping the DB
 * with parallel writes — ImportWizard inputs rarely exceed ~500 rows.
 */
export interface BulkImportResult<T> {
  total: number;
  inserted: Array<{ index: number; result: T }>;
  failed: Array<{ index: number; error: string }>;
}

export async function runBulkImport<I, T>(
  rows: I[],
  op: (row: I, index: number) => Promise<T>,
): Promise<BulkImportResult<T>> {
  const inserted: Array<{ index: number; result: T }> = [];
  const failed: Array<{ index: number; error: string }> = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      const result = await op(rows[i]!, i);
      inserted.push({ index: i, result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
      failed.push({ index: i, error: msg });
    }
  }
  return { total: rows.length, inserted, failed };
}
