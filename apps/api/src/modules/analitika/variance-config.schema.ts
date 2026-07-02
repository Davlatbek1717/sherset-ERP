import { z } from 'zod';

export const UpdateVarianceConfigSchema = z
  .object({
    greenMaxPct: z.number().min(0).max(100),
    yellowMaxPct: z.number().min(0).max(100),
  })
  .refine((v) => v.yellowMaxPct > v.greenMaxPct, {
    message: 'yellowMaxPct must be greater than greenMaxPct',
    path: ['yellowMaxPct'],
  });
export type UpdateVarianceConfigInput = z.infer<typeof UpdateVarianceConfigSchema>;
