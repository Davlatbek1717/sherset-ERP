import { z } from 'zod';

export const HR_BONUS_FINE_KINDS = ['bonus', 'fine'] as const;
export type HrBonusFineKind = (typeof HR_BONUS_FINE_KINDS)[number];

/** 5 sources (master spec § 8). Only `manual` is admin-enterable here. */
export const HR_BONUS_FINE_SOURCES = [
  'manual',
  'rule',
  'auto_task_reward',
  'auto_task_fine',
  'auto_expire_fine',
] as const;
export type HrBonusFineSource = (typeof HR_BONUS_FINE_SOURCES)[number];

/** Admin manual entry — source is forced to 'manual' server-side. */
export const CreateManualBonusFineSchema = z.object({
  employeeId: z.string().uuid(),
  kind: z.enum(HR_BONUS_FINE_KINDS),
  amountMinor: z.union([z.string(), z.number(), z.bigint()]).refine(
    (v) => {
      try {
        return BigInt(v) > 0n;
      } catch {
        return false;
      }
    },
    { message: "Miqdor musbat butun son bo'lishi kerak" },
  ),
  reason: z.string().max(500).optional().nullable(),
});
export type CreateManualBonusFineInput = z.infer<typeof CreateManualBonusFineSchema>;

export const BonusFineFilterSchema = z.object({
  employeeId: z.string().uuid().optional(),
  kind: z.enum(HR_BONUS_FINE_KINDS).optional(),
  source: z.enum(HR_BONUS_FINE_SOURCES).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});
export type BonusFineFilter = z.infer<typeof BonusFineFilterSchema>;

/** Period aggregate query for an employee (used by the Oylik tabs). */
export const BonusFineAggregateSchema = z.object({
  employeeId: z.string().uuid(),
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
});
export type BonusFineAggregateInput = z.infer<typeof BonusFineAggregateSchema>;
