import { z } from 'zod';

/**
 * 4M.8 HTTP shartnomasi. Chegaralar so'rovda keladi — ular **kodda qattiq
 * yozilmagan** (DoD talabi). Doimiy per-akkaunt sozlama `ManagerRuleConfig`
 * bilan keladi (MK06); shu vaqtgacha default'lar sof modullarda turadi.
 */
export const StockSignalQuerySchema = z.object({
  storeId: z.string().uuid().optional(),
  /** Sotuv sur'ati qaysi oynadan hisoblanadi. */
  windowDays: z.coerce.number().int().min(1).max(365).optional(),
  /** Shuncha kun sotuvsiz tursa — «pul qotdi». */
  deadDays: z.coerce.number().int().min(1).max(3650).optional(),
  /** Qoldiq shuncha kunlik talabga yetmasa — «tugash xavfi». */
  coverDays: z.coerce.number().int().min(0).max(3650).optional(),
  /** Shuncha kunlik talabdan ortig'i — «ortiqcha zaxira». */
  overstockDays: z.coerce.number().int().min(1).max(3650).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type StockSignalQueryInput = z.infer<typeof StockSignalQuerySchema>;

export const PriceChangeQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
  /** Mutlaq foiz chegarasi; undan **oshgani** menejer navbatiga tushadi. */
  thresholdPercent: z.coerce.number().min(0).max(1000).optional(),
  productId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type PriceChangeQueryInput = z.infer<typeof PriceChangeQuerySchema>;
