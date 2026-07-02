import { z } from 'zod';

const optionalEmpty = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(max).nullish(),
  );

export const EdoProviderSchema = z.enum(['didox', 'edocs', 'soliq_direct']);
export type EdoProvider = z.infer<typeof EdoProviderSchema>;

export const EdoSubmissionStatusSchema = z.enum([
  'draft',
  'signed',
  'sent',
  'delivered',
  'confirmed',
  'rejected',
  'cancelled',
]);
export type EdoSubmissionStatus = z.infer<typeof EdoSubmissionStatusSchema>;

/**
 * Source entity for an EDO submission. moysklad's EDO flow targets
 * FactureOut primarily (счёт-фактура), but Demand is also acceptable
 * because some operators issue EHF straight from shipment.
 */
export const EdoSourceEntitySchema = z.enum(['FactureOut', 'Demand', 'InvoiceOut']);
export type EdoSourceEntity = z.infer<typeof EdoSourceEntitySchema>;

const stir = z.string().regex(/^\d{9}$|^\d{14}$/, "STIR 9 yoki 14 raqam bo'lishi shart");

export const SaveEdoConfigSchema = z.object({
  provider: EdoProviderSchema.default('didox'),
  stir,
  orgNameCyrl: z.string().min(1).max(255),
  apiBaseUrl: z.string().url().max(255),
  apiToken: z.string().max(2000).optional(),
  pfxPass: z.string().max(500).optional(),
  testMode: z.coerce.boolean().default(true),
});
export type SaveEdoConfigInput = z.infer<typeof SaveEdoConfigSchema>;

export const CreateEdoSubmissionSchema = z.object({
  sourceEntity: EdoSourceEntitySchema,
  sourceEntityId: z.string().uuid(),
});
export type CreateEdoSubmissionInput = z.infer<typeof CreateEdoSubmissionSchema>;

export const ListEdoSubmissionsSchema = z.object({
  status: EdoSubmissionStatusSchema.optional(),
  sourceEntity: EdoSourceEntitySchema.optional(),
  buyerStir: optionalEmpty(20),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
});
export type ListEdoSubmissionsInput = z.infer<typeof ListEdoSubmissionsSchema>;
