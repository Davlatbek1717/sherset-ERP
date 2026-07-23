import { z } from 'zod';
import { csvUuid } from '../shared/csv.js';

/**
 * PrepaymentReturn (Возврат предоплаты) — refund of a previously taken
 * advance. Mirrors Prepayment in shape but inverts the balance direction:
 *
 *   Prepayment.post     → −sumMinor (customer paid us in advance)
 *   PrepaymentReturn.post → +sumMinor (we paid them back)
 *
 * Always links to a source Prepayment (`prepaymentId`). A single
 * Prepayment can have multiple PrepaymentReturns as long as the running
 * total of returned sums (over `applicable=true` rows) never exceeds the
 * source `Prepayment.sumMinor`. Enforced server-side on transition.
 */

export const PrepaymentReturnStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type PrepaymentReturnState = z.infer<typeof PrepaymentReturnStateSchema>;

export const PrepaymentReturnTransitionSchema = z.enum(['post', 'unpost', 'cancel']);

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

const bigintMinor = z.string().regex(/^\d+$/, 'BigInt minor (faqat raqam)');

export const CreatePrepaymentReturnSchema = z
  .object({
    /** Source prepayment being refunded. Required. */
    prepaymentId: z.string().uuid(),
    /** Agent + organization derived from source by default, can override. */
    agentId: z.string().uuid().optional(),
    organizationId: z.string().uuid().optional(),
    // moysklad parity — Договор / Проект (advance refund has counterparty).
    contractId: z.string().uuid().nullish(),
    projectId: z.string().uuid().nullish(),
    // moysklad parity (§19) — Счёт организации / Счёт контрагента
    // (cols exist, no migration).
    organizationAccountId: z.string().uuid().nullish(),
    agentAccountId: z.string().uuid().nullish(),
    retailShiftId: z.string().uuid().nullish(),
    retailStoreId: z.string().uuid().nullish(),
    moment: z.string().optional(),
    sumMinor: bigintMinor,
    vatSumMinor: bigintMinor.default('0'),
    cashSumMinor: bigintMinor.default('0'),
    noCashSumMinor: bigintMinor.default('0'),
    qrSumMinor: bigintMinor.default('0'),
    vatEnabled: z.boolean().default(true),
    vatIncluded: z.boolean().default(false),
    taxSystem: z.string().max(30).optional(),
    currency: z.string().length(3).default('UZS'),
    rateValue: bigintMinor.default('100000000'),
    description: z.string().max(4096).optional(),
    externalCode: z.string().max(255).optional(),
    applicable: z.boolean().optional(),
  })
  .refine(
    (data) => {
      const cash = BigInt(data.cashSumMinor);
      const noCash = BigInt(data.noCashSumMinor);
      const qr = BigInt(data.qrSumMinor);
      const total = cash + noCash + qr;
      if (total === 0n) return true;
      return total === BigInt(data.sumMinor);
    },
    { message: 'cashSum + noCashSum + qrSum != sumMinor', path: ['sumMinor'] },
  );
export type CreatePrepaymentReturnInput = z.infer<typeof CreatePrepaymentReturnSchema>;

export const UpdatePrepaymentReturnSchema = z
  .object({
    agentId: z.string().uuid().optional(),
    organizationId: z.string().uuid().optional(),
    contractId: z.string().uuid().nullish(),
    projectId: z.string().uuid().nullish(),
    organizationAccountId: z.string().uuid().nullish(),
    agentAccountId: z.string().uuid().nullish(),
    retailShiftId: z.string().uuid().nullish(),
    retailStoreId: z.string().uuid().nullish(),
    moment: z.string().optional(),
    sumMinor: bigintMinor.optional(),
    vatSumMinor: bigintMinor.optional(),
    cashSumMinor: bigintMinor.optional(),
    noCashSumMinor: bigintMinor.optional(),
    qrSumMinor: bigintMinor.optional(),
    vatEnabled: z.boolean().optional(),
    vatIncluded: z.boolean().optional(),
    taxSystem: z.string().max(30).nullable().optional(),
    // currency is intentionally omitted — a refund is locked to the source
    // advance's currency at create, so `.strict()` now rejects any attempt to
    // change it on update (closes the over-return currency-bypass). (2026-06-03g)
    rateValue: bigintMinor.optional(),
    description: z.string().max(4096).nullable().optional(),
    externalCode: z.string().max(255).nullable().optional(),
    // Optimistic-lock token — REQUIRED on update so a forgetful caller can't
    // silently bypass the lost-update guard. The edit form sends the `version`
    // it loaded; the service runs WHERE id = ? AND version = ? and 409s on a
    // stale copy. (.strict() rejects unknown keys, so it MUST be declared.)
    version: z.number().int().nonnegative(),
  })
  .strict();

export const PrepaymentReturnFilterSchema = z.object({
  state: PrepaymentReturnStateSchema.optional(),
  agentId: z.string().uuid().optional(),
  agentIds: csvUuid.optional(),
  organizationId: z.string().uuid().optional(),
  organizationIds: csvUuid.optional(),
  prepaymentId: z.string().uuid().optional(),
  retailShiftId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  applicable: boolFromString.optional(),
  search: z.string().max(100).optional(),
  includeDeleted: boolFromString.optional(),
  momentFrom: z.string().optional(),
  momentTo: z.string().optional(),
  sumMinorFrom: z.coerce.number().int().nonnegative().optional(),
  sumMinorTo: z.coerce.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  sortBy: z.enum(['moment', 'name', 'sumMinor', 'createdAt', 'updatedAt']).default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
