import { z } from 'zod';

const uuid = z.string().uuid();
const optionalEmpty = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(max).nullish(),
  );

/**
 * Earn rate rule — JSON schema stored on BonusProgram.earnRateRulesJson.
 * Each rule produces N bonus points per 1 sum spent. Rules are evaluated
 * in priority order; first matching rule wins.
 *
 * V1 supported predicates:
 *   - 'all'          → matches every transaction
 *   - 'productFolder' → matches when the line's product folder is in `folderIds`
 *   - 'productTags'   → matches when the line's product has any tag in `tags`
 */
export const EarnRateRuleSchema = z.object({
  predicate: z.enum(['all', 'productFolder', 'productTags']),
  /** Bonus points per 1 UZS (decimal as string — e.g. "0.05" = 5%). */
  ratePerUnit: z.string().regex(/^\d+(\.\d{1,6})?$/, 'rate: positive decimal'),
  folderIds: z.array(uuid).optional(),
  tags: z.array(z.string().min(1).max(50)).optional(),
  priority: z.coerce.number().int().min(0).max(1000).default(0),
});
export type EarnRateRule = z.infer<typeof EarnRateRuleSchema>;

export const BonusTransactionTypeSchema = z.enum(['EARNING', 'SPENDING']);
export type BonusTransactionType = z.infer<typeof BonusTransactionTypeSchema>;

export const BonusCategoryTypeSchema = z.enum(['REGULAR', 'WELCOME', 'RETURN', 'EXPIRED']);
export type BonusCategoryType = z.infer<typeof BonusCategoryTypeSchema>;

export const BonusTransactionStatusSchema = z.enum(['COMMITTED', 'PENDING', 'CANCELLED']);
export type BonusTransactionStatus = z.infer<typeof BonusTransactionStatusSchema>;

export const CreateBonusProgramSchema = z.object({
  name: z.string().min(1).max(255),
  currency: z.string().length(3).default('UZS'),
  transactionType: BonusTransactionTypeSchema.default('EARNING'),
  earnRateRules: z.array(EarnRateRuleSchema).max(50).optional(),
  allAgents: z.coerce.boolean().default(true),
  agentTags: z.array(z.string().min(1).max(50)).max(20).default([]),
  allProducts: z.coerce.boolean().default(true),
  active: z.coerce.boolean().default(true),
  applicableFromDate: z.string().datetime().nullish(),
});
export type CreateBonusProgramInput = z.infer<typeof CreateBonusProgramSchema>;

export const UpdateBonusProgramSchema = CreateBonusProgramSchema.partial();
export type UpdateBonusProgramInput = z.infer<typeof UpdateBonusProgramSchema>;

export const CreateBonusOperationSchema = z.object({
  agentId: uuid,
  bonusProgramId: uuid.nullish(),
  organizationId: uuid.nullish(),
  transactionType: BonusTransactionTypeSchema,
  categoryType: BonusCategoryTypeSchema.default('REGULAR'),
  bonusValue: z.coerce.number().int(),
  description: optionalEmpty(2000),
  parentEntity: z.string().max(40).nullish(),
  parentId: uuid.nullish(),
});
export type CreateBonusOperationInput = z.infer<typeof CreateBonusOperationSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const BonusProgramFilterSchema = z.object({
  active: boolFromString.optional(),
  archived: boolFromString.optional(),
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
});
export type BonusProgramFilterInput = z.infer<typeof BonusProgramFilterSchema>;

export const BonusOperationFilterSchema = z.object({
  agentId: uuid.optional(),
  bonusProgramId: uuid.optional(),
  transactionType: BonusTransactionTypeSchema.optional(),
  transactionStatus: BonusTransactionStatusSchema.optional(),
  parentEntity: z.string().max(40).optional(),
  parentId: uuid.optional(),
  momentFrom: z.string().optional(),
  momentTo: z.string().optional(),
  // moysklad «Номер или комментарий» search box — matches name (№) or description.
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
});
export type BonusOperationFilterInput = z.infer<typeof BonusOperationFilterSchema>;

export const RedeemBonusSchema = z.object({
  agentId: uuid,
  bonusProgramId: uuid.nullish(),
  /** Points to redeem — must not exceed agent balance. */
  bonusValue: z.coerce.number().int().min(1),
  parentEntity: z.string().max(40).nullish(),
  parentId: uuid.nullish(),
  description: optionalEmpty(2000),
});
export type RedeemBonusInput = z.infer<typeof RedeemBonusSchema>;
