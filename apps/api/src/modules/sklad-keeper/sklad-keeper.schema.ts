import { z } from 'zod';

/**
 * SkladKeeper (Sherset custom) — maps a warehouse zone («sklad», the 1st segment
 * of a product's bin code «NN-NN-NN-NN») to the warehouse-keeper (omborchi)
 * responsible for collecting that zone's goods. Used by picking: a sold order's
 * lines are grouped by sklad and each group is assigned to that sklad's keeper.
 */

const uuid = z.string().uuid();

/** Upsert one sklad→keeper mapping. employeeId null ⇒ clear the mapping. */
export const UpsertSkladKeeperSchema = z.object({
  skladNo: z.coerce.number().int().min(0).max(99999),
  employeeId: uuid.nullable(),
  // Windows printer name this zone's picking sheet is routed to (print-agent).
  // Optional; null/omitted leaves it unset.
  printerName: z.string().max(255).nullable().optional(),
});
export type UpsertSkladKeeperInput = z.infer<typeof UpsertSkladKeeperSchema>;
