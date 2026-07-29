import { z } from 'zod';

/** Omborchi «sanash» — pozitsiya bo'yicha tuzatilgan (kelgan) miqdorlar. */
const decimalStr = z.string().regex(/^\d+(\.\d+)?$/, "Musbat o'nlik son bo'lishi kerak");

export const OmborchiConfirmSchema = z.object({
  adjustments: z
    .array(z.object({ positionId: z.string().uuid(), quantity: decimalStr }))
    .default([]),
});
export type OmborchiConfirmDto = z.infer<typeof OmborchiConfirmSchema>;

export const RejectSchema = z.object({
  reason: z.string().trim().min(1, 'Sabab majburiy').max(500),
});
export type RejectDto = z.infer<typeof RejectSchema>;
