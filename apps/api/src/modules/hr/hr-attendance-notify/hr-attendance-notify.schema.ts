import { z } from 'zod';

/**
 * Davomat → Telegram bildirishnoma config DTO (akkаunt bo'yicha bitta).
 * Barcha maydonlar ixtiyoriy — partial upsert (faqat kelgan maydonlar
 * yangilanadi). `lateFineAmountMinor` UI'дan string keladi (tiyin, BigInt-safe).
 */
export const UpsertNotifyConfigSchema = z.object({
  enabled: z.boolean().optional(),
  notifyCheckIn: z.boolean().optional(),
  notifyCheckOut: z.boolean().optional(),
  directorSlot: z.number().int().nullable().optional(),
  lateFineEnabled: z.boolean().optional(),
  lateThresholdMin: z.number().int().min(0).optional(),
  // tiyin (minor units) — string so a BigInt never loses precision over JSON.
  lateFineAmountMinor: z
    .union([z.string(), z.number()])
    .refine((v) => {
      try {
        return BigInt(v) >= 0n;
      } catch {
        return false;
      }
    }, 'lateFineAmountMinor must be a non-negative integer')
    .optional(),
  lateFinePerMinute: z.boolean().optional(),
});

export type UpsertNotifyConfigInput = z.infer<typeof UpsertNotifyConfigSchema>;
