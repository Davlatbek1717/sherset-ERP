import { z } from 'zod';

const uuid = z.string().uuid();

export const CreateBranchSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
  /**
   * Yuridik shaxs (TZ §2.3) — bugun hammasida bitta STIR, shuning uchun
   * ixtiyoriy. Alohida yuridik shaxsli filial kelajakda shu maydon orqali
   * ajratiladi (TZ §5.2), model o'zgarmaydi.
   */
  organizationId: uuid.optional(),
  /**
   * Standart («Asosiy») filial. Akkauntda AYNAN BITTA bo'ladi — servis
   * ikkinchisini rad etadi, DB'da esa qisman-unikal indeks turadi.
   */
  isDefault: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});
export type CreateBranchInput = z.infer<typeof CreateBranchSchema>;

export const UpdateBranchSchema = CreateBranchSchema.partial().extend({
  // Optimistic-lock token: the `version` the edit form loaded (cash-desk naqshi).
  version: z.number().int().nonnegative(),
});
export type UpdateBranchInput = z.infer<typeof UpdateBranchSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const BranchFilterSchema = z.object({
  archived: boolFromString.optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
  sortBy: z.enum(['name', 'code', 'sortOrder', 'createdAt', 'updatedAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type BranchFilterInput = z.infer<typeof BranchFilterSchema>;
