import { z } from 'zod';

/**
 * Upsert a single product's count. kamQty (shortage below system stock) and
 * kopQty (surplus above it) are mutually exclusive — a row can be short OR
 * over, never both. Both zero clears the count (the row is deleted by the
 * service). Quantities are non-negative; the signed net is derived server-side.
 */
export const UpsertCountSchema = z
  .object({
    productId: z.string().uuid(),
    storeId: z.string().uuid(),
    kamQty: z.number().min(0).default(0),
    kopQty: z.number().min(0).default(0),
    note: z.string().max(500).optional(),
  })
  .refine((v) => !(v.kamQty > 0 && v.kopQty > 0), {
    message: 'kamQty and kopQty are mutually exclusive',
    path: ['kopQty'],
  });
export type UpsertCountInput = z.infer<typeof UpsertCountSchema>;

export const COUNT_STATUSES = ['green', 'yellow', 'red'] as const;

/** Approval-inbox views: pending = needs review (yellow/red, undecided). */
export const COUNT_VIEWS = ['pending', 'accepted', 'rejected', 'all'] as const;

export const CountFilterSchema = z.object({
  status: z.enum(COUNT_STATUSES).optional(),
  view: z.enum(COUNT_VIEWS).optional(),
  storeId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
});
export type CountFilterInput = z.infer<typeof CountFilterSchema>;

/** Approve or reject a count — both optionally carry a reason code + note. */
export const ReviewActionSchema = z.object({
  reasonCodeId: z.string().uuid().optional(),
  note: z.string().max(500).optional(),
});
export type ReviewActionInput = z.infer<typeof ReviewActionSchema>;

/** Approve many counts at once. */
export const BulkApproveSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  reasonCodeId: z.string().uuid().optional(),
});
export type BulkApproveInput = z.infer<typeof BulkApproveSchema>;

export const REPORT_PERIODS = ['today', '7d', '30d', 'all'] as const;

/** Money-report filter: optional period window + store. */
export const ReportFilterSchema = z.object({
  period: z.enum(REPORT_PERIODS).default('all'),
  storeId: z.string().uuid().optional(),
});
export type ReportFilterInput = z.infer<typeof ReportFilterSchema>;

/** Reset (clear) current counts — optionally scoped to a store. */
export const ResetSchema = z.object({
  storeId: z.string().uuid().optional(),
});
export type ResetInput = z.infer<typeof ResetSchema>;
