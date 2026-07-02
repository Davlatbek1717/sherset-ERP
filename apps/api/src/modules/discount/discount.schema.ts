import { z } from 'zod';

export const DiscountKindEnum = z.enum(['special', 'accumulative', 'personal', 'product', 'agent']);
export type DiscountKind = z.infer<typeof DiscountKindEnum>;

export const CreateDiscountSchema = z.object({
  name: z.string().min(1).max(255),
  kind: DiscountKindEnum,
  active: z.boolean().default(true),
  allAgents: z.boolean().default(true),
  allProducts: z.boolean().default(true),
  agentTags: z.array(z.string()).default([]),
  rules: z.unknown().optional(),
  earnRateUzsToPoint: z
    .union([z.number(), z.string()])
    .transform((v) => (v === '' || v === null ? undefined : Number(v)))
    .optional(),
  spendRatePointsToUzs: z
    .union([z.number(), z.string()])
    .transform((v) => (v === '' || v === null ? undefined : Number(v)))
    .optional(),
  maxPaidRatePercents: z
    .union([z.number(), z.string()])
    .transform((v) => (v === '' || v === null ? undefined : Number(v)))
    .pipe(z.number().int().min(0).max(100).optional())
    .optional(),
  earnWhileRedeeming: z.boolean().default(false),
  archived: z.boolean().default(false),
});
export type CreateDiscountInput = z.infer<typeof CreateDiscountSchema>;

export const UpdateDiscountSchema = CreateDiscountSchema.partial().extend({
  version: z.number().int().nonnegative(),
});
export type UpdateDiscountInput = z.infer<typeof UpdateDiscountSchema>;

export const DiscountFilterSchema = z.object({
  search: z.string().max(100).optional(),
  kind: DiscountKindEnum.optional(),
  active: z
    .union([z.boolean(), z.string()])
    .transform((v) =>
      typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : undefined,
    )
    .optional(),
  archived: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .default(false),
  sortBy: z.enum(['name', 'kind', 'createdAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type DiscountFilterInput = z.infer<typeof DiscountFilterSchema>;
