import { z } from 'zod';

/**
 * MXIK code shape — Soliq's classifier is exactly 17 decimal digits.
 * Anything shorter / longer / non-numeric is rejected at the API boundary
 * so we never half-write a row.
 */
export const MxikCodeSchema = z.string().regex(/^\d{17}$/, 'MXIK code must be exactly 17 digits');

export const MxikSourceSchema = z.enum(['soliq', 'manual', 'override']);
export type MxikSource = z.infer<typeof MxikSourceSchema>;

export const CreateMxikSchema = z.object({
  code: MxikCodeSchema,
  nameUz: z.string().min(1, 'nameUz is required').max(500),
  nameRu: z.string().max(500).optional(),
  nameEn: z.string().max(500).optional(),
  unitCode: z.string().max(20).optional(),
  groupCode: z
    .string()
    .regex(/^\d{1,17}$/, 'groupCode must be 1-17 digits')
    .optional(),
  classCode: z
    .string()
    .regex(/^\d{1,17}$/, 'classCode must be 1-17 digits')
    .optional(),
  source: MxikSourceSchema.default('manual'),
});
export type CreateMxikInput = z.infer<typeof CreateMxikSchema>;

export const UpdateMxikSchema = CreateMxikSchema.partial().omit({ code: true });
export type UpdateMxikInput = z.infer<typeof UpdateMxikSchema>;

export const BulkImportMxikSchema = z.object({
  rows: z.array(CreateMxikSchema).min(1).max(2000),
});
export type BulkImportMxikInput = z.infer<typeof BulkImportMxikSchema>;

const boolFromString = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const MxikFilterSchema = z.object({
  /// Free-text search against the canonical UZ Latin name; case-insensitive.
  search: z.string().max(100).optional(),
  /// Exact-prefix match on the code column. The 17-digit code is hierarchical
  /// (first 4 = section, next 4 = group, etc.), so a 4-char prefix returns
  /// every entry inside that section without a join to groupCode.
  codePrefix: z
    .string()
    .regex(/^\d{1,17}$/, 'codePrefix must be 1-17 digits')
    .optional(),
  source: MxikSourceSchema.optional(),
  archived: boolFromString.optional().default(false),
  cursor: z
    .string()
    .regex(/^\d{17}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).default(25),
  sortBy: z.enum(['code', 'nameUz', 'createdAt']).default('code'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type MxikFilterInput = z.infer<typeof MxikFilterSchema>;

void boolFromString;
