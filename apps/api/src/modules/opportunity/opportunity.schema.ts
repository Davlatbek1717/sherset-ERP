import { z } from 'zod';

const uuid = z.string().uuid();
const Status = z.enum(['open', 'won', 'lost']);

// Money in tiyin (BigInt) — accept string/number; reject negatives.
const amountTiyin = z
  .union([z.string(), z.number()])
  .transform((v) => {
    const n = typeof v === 'string' ? BigInt(v) : BigInt(Math.round(v));
    return n;
  })
  .refine((n) => n >= 0n, { message: 'Amount must be non-negative' });

export const CreateOpportunitySchema = z.object({
  name: z.string().min(1).max(255),
  pipelineId: uuid.optional(),
  stageId: uuid.optional(),
  counterpartyId: uuid.nullish(),
  contactPersonId: uuid.nullish(),
  amount: amountTiyin.optional(),
  currency: z.string().length(3).default('UZS'),
  probability: z.coerce.number().int().min(0).max(100).nullish(),
  expectedCloseDate: z.coerce.date().nullish(),
  source: z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(50).nullish(),
  ),
  description: z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(4000).nullish(),
  ),
});
export type CreateOpportunityInput = z.infer<typeof CreateOpportunitySchema>;

export const UpdateOpportunitySchema = z.object({
  version: z.number().int().nonnegative(),
  name: z.string().min(1).max(255).optional(),
  counterpartyId: uuid.nullish(),
  contactPersonId: uuid.nullish(),
  amount: amountTiyin.optional(),
  currency: z.string().length(3).optional(),
  probability: z.coerce.number().int().min(0).max(100).nullish(),
  expectedCloseDate: z.coerce.date().nullish(),
  source: z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(50).nullish(),
  ),
  description: z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(4000).nullish(),
  ),
  lostReason: z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(4000).nullish(),
  ),
});
export type UpdateOpportunityInput = z.infer<typeof UpdateOpportunitySchema>;

export const TransitionSchema = z.object({
  stageId: uuid,
  lostReason: z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(4000).nullish(),
  ),
});
export type TransitionInput = z.infer<typeof TransitionSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const OpportunityFilterSchema = z.object({
  pipelineId: uuid.optional(),
  stageId: uuid.optional(),
  counterpartyId: uuid.optional(),
  contactPersonId: uuid.optional(),
  ownerId: uuid.optional(),
  status: Status.optional(),
  archived: boolFromString.optional(),
  search: z.string().max(100).optional(),
  // Period — filters Opportunity.createdAt (moysklad «Период»).
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  // Updated period — moysklad «Когда изменен» — filters Opportunity.updatedAt.
  updatedFrom: z.coerce.date().optional(),
  updatedTo: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'amount', 'expectedCloseDate', 'name', 'number', 'agent'])
    .default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type OpportunityFilterInput = z.infer<typeof OpportunityFilterSchema>;
