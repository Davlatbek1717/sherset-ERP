import { z } from 'zod';

const uuid = z.string().uuid();

export const MarketplaceCodeSchema = z.enum(['uzum', 'yandex', 'wildberries', 'ozon']);
export type MarketplaceCode = z.infer<typeof MarketplaceCodeSchema>;

export const SaveMarketplaceConfigSchema = z.object({
  marketplace: MarketplaceCodeSchema,
  shopName: z.string().min(1).max(255),
  sellerId: z.string().min(1).max(100),
  apiBaseUrl: z.string().url().max(255),
  creds: z.record(z.string(), z.string().max(2000)).optional(),
});
export type SaveMarketplaceConfigInput = z.infer<typeof SaveMarketplaceConfigSchema>;

export const ListMarketplaceOrdersSchema = z.object({
  marketplace: MarketplaceCodeSchema.optional(),
  status: z.string().max(40).optional(),
  /** Filter for orders not yet materialised into CustomerOrder. */
  unprocessed: z.union([z.boolean(), z.string()]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
});
export type ListMarketplaceOrdersInput = z.infer<typeof ListMarketplaceOrdersSchema>;

export const RecordMarketplaceOrderSchema = z.object({
  marketplace: MarketplaceCodeSchema,
  externalId: z.string().min(1).max(100),
  status: z.string().min(1).max(40),
  totalMinor: z.coerce.number().int().min(0),
  currency: z.string().length(3).default('UZS'),
  rawJson: z.record(z.string(), z.unknown()),
});
export type RecordMarketplaceOrderInput = z.infer<typeof RecordMarketplaceOrderSchema>;
