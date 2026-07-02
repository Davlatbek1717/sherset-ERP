import { z } from 'zod';

/**
 * KPI tier: at `min`% achievement, payout = `payout`% of monthlyKpiBudget.
 * Tiers must be non-empty + sorted ascending by `min` for the lookup util
 * to walk them deterministically.
 *
 * Yangibolim default tiers (master spec § 8):
 *   [{min: 50, payout: 20}, {min: 75, payout: 50},
 *    {min: 100, payout: 100}, {min: 120, payout: 130}]
 */
export const KpiTierSchema = z.object({
  min: z.number().min(0).max(10_000),
  payout: z.number().min(0).max(10_000),
});
export type KpiTier = z.infer<typeof KpiTierSchema>;

/** Server-side upsert payload. Money fields accept string/number — server coerces to BigInt. */
export const UpsertSalaryConfigSchema = z
  .object({
    fixWeight: z.number().min(0).max(1),
    kpiWeight: z.number().min(0).max(1),
    bonusWeight: z.number().min(0).max(1),
    monthlySalesTarget: z.union([z.string(), z.number(), z.bigint()]),
    monthlyKpiBudget: z.union([z.string(), z.number(), z.bigint()]),
    commissionPercent: z.number().min(0).max(100),
    kpiTiers: z.array(KpiTierSchema).min(1, 'Kamida bitta KPI darajasi kerak'),
  })
  .superRefine((v, ctx) => {
    const sum = v.fixWeight + v.kpiWeight + v.bonusWeight;
    // Float tolerance — admin types 0.7 + 0.2 + 0.1 → 0.99999... in JSON
    if (Math.abs(sum - 1) > 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fixWeight'],
        message: `Vaznlar yig'indisi 1.0 bo'lishi kerak (hozir ${sum.toFixed(3)})`,
      });
    }
    // Tiers must be sorted ascending by min — tier-lookup walks them in order.
    for (let i = 1; i < v.kpiTiers.length; i++) {
      const prev = v.kpiTiers[i - 1];
      const cur = v.kpiTiers[i];
      if (prev && cur && cur.min <= prev.min) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['kpiTiers', i, 'min'],
          message: "Tier'lar `min` bo'yicha o'sib borishi kerak",
        });
      }
    }
  });
export type UpsertSalaryConfigInput = z.infer<typeof UpsertSalaryConfigSchema>;

/** Defaults used when no row exists for the account yet (yangibolim parity). */
export const DEFAULT_KPI_TIERS: KpiTier[] = [
  { min: 50, payout: 20 },
  { min: 75, payout: 50 },
  { min: 100, payout: 100 },
  { min: 120, payout: 130 },
];

export const DEFAULT_SALARY_CONFIG = {
  fixWeight: 0.7,
  kpiWeight: 0.2,
  bonusWeight: 0.1,
  monthlySalesTarget: 20_000_000_00n, // 20M so'm
  monthlyKpiBudget: 2_000_000_00n, // 2M so'm
  commissionPercent: 1.5,
  kpiTiers: DEFAULT_KPI_TIERS,
} as const;
