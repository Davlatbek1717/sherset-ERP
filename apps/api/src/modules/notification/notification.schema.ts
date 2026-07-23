import { z } from 'zod';

const uuid = z.string().uuid();

export const NotificationKind = z.enum([
  'task_assigned',
  'task_due_soon',
  'task_overdue',
  'opportunity_won',
  'opportunity_lost',
  'invoice_paid',
  'invoice_overdue',
  'mention',
  'system',
  // F2 (user feature 2026-07-03): cashier pressed «Отправил кладовщику» on a
  // POS refund receipt — the warehouse keeper must accept the returned goods.
  'return_to_warehouse',
]);
export type NotificationKindValue = z.infer<typeof NotificationKind>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const NotificationFilterSchema = z.object({
  unreadOnly: boolFromString.optional(),
  kind: NotificationKind.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(30),
  cursor: uuid.optional(),
});
export type NotificationFilterInput = z.infer<typeof NotificationFilterSchema>;

export const MarkReadSchema = z.object({
  ids: uuid.array().min(1).max(100),
});
export type MarkReadInput = z.infer<typeof MarkReadSchema>;
