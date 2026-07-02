import { z } from 'zod';

const uuid = z.string().uuid();

export const PaymentProviderSchema = z.enum([
  'payme',
  'click',
  'uzcard',
  'humo',
  'octo',
  'multicard',
]);
export type PaymentProvider = z.infer<typeof PaymentProviderSchema>;

export const PaymentTxStatusSchema = z.enum([
  'pending',
  'authorized',
  'captured',
  'refunded',
  'cancelled',
  'failed',
]);
export type PaymentTxStatus = z.infer<typeof PaymentTxStatusSchema>;

export const PaymentSourceEntitySchema = z.enum(['CustomerOrder', 'InvoiceOut', 'RetailDemand']);
export type PaymentSourceEntity = z.infer<typeof PaymentSourceEntitySchema>;

export const SavePaymentGatewayConfigSchema = z.object({
  provider: PaymentProviderSchema,
  name: z.string().min(1).max(100),
  merchantId: z.string().min(1).max(100),
  /** Provider-specific credentials bag — e.g. {secretKey, ...}. */
  creds: z.record(z.string(), z.string().max(2000)).optional(),
  testMode: z.coerce.boolean().default(true),
  callbackUrl: z.string().url().max(500).optional(),
});
export type SavePaymentGatewayConfigInput = z.infer<typeof SavePaymentGatewayConfigSchema>;

export const InitiatePaymentSchema = z.object({
  provider: PaymentProviderSchema,
  sourceEntity: PaymentSourceEntitySchema,
  sourceEntityId: uuid,
  amountMinor: z.coerce.number().int().min(1),
});
export type InitiatePaymentInput = z.infer<typeof InitiatePaymentSchema>;

export const ListGatewayTxSchema = z.object({
  provider: PaymentProviderSchema.optional(),
  status: PaymentTxStatusSchema.optional(),
  sourceEntity: PaymentSourceEntitySchema.optional(),
  sourceEntityId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
});
export type ListGatewayTxInput = z.infer<typeof ListGatewayTxSchema>;
