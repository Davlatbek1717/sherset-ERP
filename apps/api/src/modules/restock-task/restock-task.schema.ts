import { z } from 'zod';

/**
 * RestockTask (Sherset custom) — «Joylashtirish vazifasi». A cashier sends a
 * posted SalesReturn's goods to a warehouse-keeper (omborchi) to be put back on
 * their home shelves. The task snapshots each returned product + its bin location
 * code; the omborchi confirms each line (scan the senik QR or press «placed»).
 */

const uuid = z.string().uuid();

export const CreateRestockFromSalesReturnSchema = z.object({
  salesReturnId: uuid,
  /** The warehouse-keeper employee the task is assigned to. */
  assigneeId: uuid,
  note: z.string().max(1000).optional(),
});
export type CreateRestockFromSalesReturnInput = z.infer<typeof CreateRestockFromSalesReturnSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const RestockTaskFilterSchema = z.object({
  // 'cancelled' — manba hujjat bekor qilinganda yopiladi (masalan kassir
  // yig'ilayotgan chekni bekor qilsa): omborchi yo'q sotuv uchun tovar
  // yig'masligi kerak, lekin 'done' deb belgilash «yig'ib bo'lindi» degan
  // yolg'on bo'lardi.
  status: z.enum(['pending', 'in_progress', 'done', 'cancelled']).optional(),
  /** 'restock' (inbound, default view) or 'picking' (outbound) — omit = all. */
  type: z.enum(['restock', 'picking']).optional(),
  /** Filter to one source document (e.g. all picking tasks of one order). */
  sourceId: uuid.optional(),
  assigneeId: uuid.optional(),
  /** Only tasks assigned to the current user (the omborchi's own queue). */
  mine: boolFromString.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/** Manual per-line confirm — optional productId echo for an extra safety check. */
export const ConfirmLineSchema = z.object({
  productId: uuid.nullish(),
});

/** QR-scan confirm — the scanned product id (parsed from the senik QR URL). */
export const ConfirmScanSchema = z.object({
  productId: uuid,
});
