import { z } from 'zod';

const uuid = z.string().uuid();

const optionalEmpty = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(max).nullish(),
  );

export const CreateOrganizationAccountSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(255),
  isDefault: z.coerce.boolean().default(false),
  currency: z
    .string()
    .length(3)
    .transform((v) => v.toUpperCase())
    .default('UZS'),
  bankName: optionalEmpty(255),
  bankLocation: optionalEmpty(255),
  accountNumber: optionalEmpty(50),
  correspondentAccount: optionalEmpty(50),
  bic: optionalEmpty(20),
});
export type CreateOrganizationAccountInput = z.infer<typeof CreateOrganizationAccountSchema>;

export const UpdateOrganizationAccountSchema = CreateOrganizationAccountSchema.partial().extend({
  // Optimistic-lock token (moysklad parity). REQUIRED on update so a forgetful
  // caller cannot silently bypass the lost-update guard. Absent on Create.
  version: z.number().int().nonnegative(),
});
export type UpdateOrganizationAccountInput = z.infer<typeof UpdateOrganizationAccountSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const OrganizationAccountFilterSchema = z.object({
  archived: boolFromString.optional(),
  organizationId: uuid.optional(),
  currency: z
    .string()
    .length(3)
    .transform((v) => v.toUpperCase())
    .optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type OrganizationAccountFilterInput = z.infer<typeof OrganizationAccountFilterSchema>;
