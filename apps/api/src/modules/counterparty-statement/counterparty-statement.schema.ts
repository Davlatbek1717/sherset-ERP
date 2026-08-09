import { z } from 'zod';

/**
 * Akt-sverka generatsiyasining so'rov parametrlari (FAZA Q6, `PERF-02`).
 *
 * `dateFrom`/`dateTo` — sana-only («YYYY-MM-DD»), `z.coerce.date()` ularni UTC
 * yarim tuniga aylantiradi; Toshkent kalendar kuniga ochish `reportDateBounds`
 * ning ishi (servisda). Bo'sh `dateFrom` = «birinchi hujjatdan» (davr-boshi
 * qoldig'i faqat `opening` qatorlaridan), bo'sh `dateTo` = «hozirgacha».
 * Bu — `counterparty-act.schema.ts` (`from`/`to`) bilan bir xil shartnoma,
 * faqat nomlar FE'dagi Excel-akt kartochkasi bilan mos.
 */
export const StatementQuerySchema = z
  .object({
    productId: z.string().uuid().optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
  })
  .refine((v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo, {
    message: 'dateFrom dateTo dan keyin bo‘lmasligi kerak',
    path: ['dateFrom'],
  });

export type StatementQueryInput = z.infer<typeof StatementQuerySchema>;
