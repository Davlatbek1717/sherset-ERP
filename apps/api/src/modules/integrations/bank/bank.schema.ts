import { z } from 'zod';

export const BankCodeSchema = z.enum([
  'nbu',
  'asaka',
  'anor',
  'kapital',
  'tbc',
  'trustbank',
  'hamkor',
]);
export type BankCode = z.infer<typeof BankCodeSchema>;

export const SaveBankApiConfigSchema = z.object({
  bankCode: BankCodeSchema,
  stir: z.string().regex(/^\d{9}$|^\d{14}$/),
  bankAccount: z.string().min(20).max(50),
  bankMfo: z.string().regex(/^\d{5}$/),
  apiBaseUrl: z.string().url().max(255),
  creds: z.record(z.string(), z.string().max(2000)).optional(),
});
export type SaveBankApiConfigInput = z.infer<typeof SaveBankApiConfigSchema>;

export const ListBankApiConfigsSchema = z.object({
  bankCode: BankCodeSchema.optional(),
  enabled: z.union([z.boolean(), z.string()]).optional(),
});
export type ListBankApiConfigsInput = z.infer<typeof ListBankApiConfigsSchema>;
