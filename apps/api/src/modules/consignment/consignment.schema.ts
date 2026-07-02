import { z } from 'zod';

/**
 * Consignment (Товары на реализации / Realizatsiyadagi tovarlar) —
 * a labeled product batch with optional variant, expiry, and barcode
 * set. Drives FEFO (first-expiring first-out) allocation for
 * perishables and lot-level traceability for regulated goods.
 *
 * Sprint 8 ships read-only list + detail. The create/edit flow
 * (manual batch registration) lands once the receive-with-batch UI
 * is wired into the Supply form — until then batches arrive only
 * through the inbound document path that's already live.
 */
const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const ConsignmentFilterSchema = z.object({
  productId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  archived: boolFromString.optional(),
  search: z.string().max(100).optional(),
  // Expiry range — separate from createdAt because clerks watching
  // for soon-to-expire stock want to scan «expires within X days»
  // independent of when the batch was registered.
  expiryFrom: z.string().optional(),
  expiryTo: z.string().optional(),
  // Quick filter for the most common warehouse alert: «show me
  // anything that already expired but is still on the shelf».
  expiredOnly: boolFromString.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  // 'code' backs the sortable «Код» column (Consignment.code is a scalar → the
  // generic orderBy handles it). Was missing → clicking the header sent an
  // enum-rejected sortBy='code' → 400/no-op (1:1 plan §1.6).
  sortBy: z.enum(['expiryDate', 'createdAt', 'name', 'label', 'code']).default('expiryDate'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type ConsignmentFilterInput = z.infer<typeof ConsignmentFilterSchema>;
