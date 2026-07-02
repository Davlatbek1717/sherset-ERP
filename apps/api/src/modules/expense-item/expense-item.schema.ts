import { z } from 'zod';

export const CreateExpenseItemSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().max(50).optional(),
  externalCode: z.string().max(50).optional(),
  description: z.string().optional(),
});
export type CreateExpenseItemInput = z.infer<typeof CreateExpenseItemSchema>;

// Optional free-text fields accept `null` on update so the edit form can
// CLEAR them (it sends `code.trim() || null`). The service's
// `if (x !== undefined) data.x = x` guard then writes null to the column.
export const UpdateExpenseItemSchema = CreateExpenseItemSchema.partial().extend({
  code: z.string().max(50).nullable().optional(),
  externalCode: z.string().max(50).nullable().optional(),
  description: z.string().nullable().optional(),
  version: z.number().int().nonnegative(),
});
export type UpdateExpenseItemInput = z.infer<typeof UpdateExpenseItemSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const ExpenseItemFilterSchema = z.object({
  archived: boolFromString.optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['name', 'code', 'createdAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type ExpenseItemFilterInput = z.infer<typeof ExpenseItemFilterSchema>;
