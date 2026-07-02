import { z } from 'zod';

/**
 * CommissionReport (Отчёт комиссионера) — settlement document used in
 * consignment-style trade.
 *
 *  - Out: WE are the commissioner. We sold goods that belong to the
 *    consigner and now report back the volume + cut + payable amount.
 *  - In: WE are the consigner. Someone else sold our goods on
 *    commission and reports back to us.
 *
 * Sprint 7 ships the Out-side list (matches moysklad's primary
 * «Отчёт комиссионера» nav entry); the In-side mirror is wired in
 * the same module but lives at a separate route since the two reports
 * have distinct accounting impact (one is our liability, the other our
 * receivable).
 */
export const CommissionReportStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type CommissionReportState = z.infer<typeof CommissionReportStateSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const CommissionReportFilterSchema = z.object({
  state: CommissionReportStateSchema.optional(),
  agentId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  contractId: z.string().uuid().optional(),
  applicable: boolFromString.optional(),
  printed: boolFromString.optional(),
  published: boolFromString.optional(),
  search: z.string().max(100).optional(),
  includeDeleted: boolFromString.optional(),
  momentFrom: z.string().optional(),
  momentTo: z.string().optional(),
  sumMinorFrom: z.coerce.number().int().nonnegative().optional(),
  sumMinorTo: z.coerce.number().int().nonnegative().optional(),
  rewardSumMinorFrom: z.coerce.number().int().nonnegative().optional(),
  rewardSumMinorTo: z.coerce.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  // Filter on whether the row is fully paid (payedSumMinor >= sumMinor)
  // — the consigner-vs-us settlement state is what most clerks want
  // to see, and it doesn't fit the draft/posted state well.
  paid: boolFromString.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  // 'agent' backs the sortable «Контрагент» column. It is a RELATION, so the
  // service maps it to a nested orderBy ({ agent: { name } }) — adding it here
  // without that mapping would 500. Was missing → header click sent an
  // enum-rejected sortBy='agent' → 400/no-op (1:1 plan §1.6).
  sortBy: z
    .enum(['moment', 'name', 'sumMinor', 'rewardSumMinor', 'payedSumMinor', 'agent'])
    .default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type CommissionReportFilterInput = z.infer<typeof CommissionReportFilterSchema>;
