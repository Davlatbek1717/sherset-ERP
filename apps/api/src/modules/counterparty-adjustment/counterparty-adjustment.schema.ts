import { z } from 'zod';

/**
 * CounterpartyAdjustment (Корректировка взаиморасчётов) — manually
 * tweak a counterparty's outstanding balance without going through a
 * regular sales/purchase or payment doc.
 *
 * Typical scenarios:
 *   - Customer reports an «old» debt that's not in our books —
 *     write an INCREASE adjustment so reports stop showing them
 *     as paid up
 *   - We forgive a tiny rounding leftover — write a DECREASE
 *     adjustment with reason «округление»
 *   - Migration from another system carries imported opening
 *     balances — adjustments seed them per-counterparty
 *
 * Direction: INCREASE → counterparty owes us more (their +balance
 *           grows, or our −balance with them grows).
 *            DECREASE → opposite.
 *
 * Sprint 9 ships read-only-ish create + list + detail. Editing the
 * direction after posting is locked (would require rolling the
 * CounterpartyBalanceMovement forward).
 */
export const CounterpartyAdjustmentStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type CounterpartyAdjustmentState = z.infer<typeof CounterpartyAdjustmentStateSchema>;

export const AdjustmentDirectionSchema = z.enum(['INCREASE', 'DECREASE']);
export type AdjustmentDirection = z.infer<typeof AdjustmentDirectionSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const CreateCounterpartyAdjustmentSchema = z.object({
  agentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  // moysklad parity — Договор / Проект (settlement adjustment has counterparty).
  contractId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  direction: AdjustmentDirectionSchema.default('INCREASE'),
  /** Adjustment amount in BigInt minor units (× 100 for 2-decimal currencies). */
  sumMinor: z.string().regex(/^\d+$/, 'BigInt minor (faqat raqam)'),
  currency: z.string().length(3).default('UZS'),
  rateValue: z.string().regex(/^\d+$/).default('100000000'),
  description: z.string().max(4096).optional(),
  moment: z.string().optional(),
  applicable: z.boolean().optional(),
  externalCode: z.string().max(255).optional(),
});

export const CounterpartyAdjustmentFilterSchema = z.object({
  state: CounterpartyAdjustmentStateSchema.optional(),
  direction: AdjustmentDirectionSchema.optional(),
  agentId: z.string().uuid().optional(),
  /** «Группа контрагента» — filters via the agent (Counterparty) relation's groupId. */
  agentGroupId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  /** «Договор» — CounterpartyAdjustment.contractId. */
  contractId: z.string().uuid().optional(),
  /** «Проект» — CounterpartyAdjustment.projectId. */
  projectId: z.string().uuid().optional(),
  /** «Владелец-отдел» — CounterpartyAdjustment.groupId (owner department). */
  groupId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — CounterpartyAdjustment.ownerId. */
  ownerId: z.string().uuid().optional(),
  applicable: boolFromString.optional(),
  search: z.string().max(100).optional(),
  includeDeleted: boolFromString.optional(),
  momentFrom: z.string().optional(),
  momentTo: z.string().optional(),
  /**
   * «Когда изменен» — moysklad parity. Filters on `updatedAt` between the
   * two ISO dates (mirror momentFrom/To). Backed by the `updatedAt` column
   * (`@updatedAt` on CounterpartyAdjustment).
   */
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  sumMinorFrom: z.coerce.number().int().nonnegative().optional(),
  sumMinorTo: z.coerce.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  // NOTE: «Кто изменил» is SKIPPED — CounterpartyAdjustment has no
  // `updatedById` column (only `ownerId`, surfaced as «Владелец-сотрудник»).
  // «Тип документа» is SKIPPED too — in the reference DOM that select is a
  // linked source-document-kind enum (PurchaseOrder / InvoiceIn / Supply /
  // …), NOT the adjustment's own `direction` (INCREASE/DECREASE). No column
  // on this doc backs a source-document-kind filter, so adding it would be
  // unbacked. The `direction` filter (above) stays available for parity.
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  // 'agent' / 'organization' sort by the related row's name (relational
  // orderBy, special-cased in the service). The plain columns are direct
  // CounterpartyAdjustment fields.
  sortBy: z
    .enum(['moment', 'name', 'sumMinor', 'createdAt', 'updatedAt', 'agent', 'organization'])
    .default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const CounterpartyAdjustmentTransitionSchema = z.enum(['post', 'unpost', 'cancel']);

/**
 * Update schema — only fields that are safe to edit while a draft. Once
 * `applicable=true` the balance was already moved, so the controller
 * locks edits and the user must unpost first. The service double-checks
 * to avoid trusting client state.
 */
export const UpdateCounterpartyAdjustmentSchema = z
  .object({
    agentId: z.string().uuid().optional(),
    organizationId: z.string().uuid().optional(),
    contractId: z.string().uuid().nullish(),
    projectId: z.string().uuid().nullish(),
    direction: AdjustmentDirectionSchema.optional(),
    sumMinor: z.string().regex(/^\d+$/, 'BigInt minor (faqat raqam)').optional(),
    currency: z.string().length(3).optional(),
    rateValue: z.string().regex(/^\d+$/).optional(),
    description: z.string().max(4096).nullable().optional(),
    externalCode: z.string().max(255).nullable().optional(),
    moment: z.string().optional(),
    // Optimistic-lock token (moysklad parity): the edit form sends back the
    // `version` it loaded; the service runs a versioned update so a concurrent
    // save can't be silently clobbered. REQUIRED so a forgetful caller can't
    // bypass the lock. (.strict() rejects unknown keys, so it must be declared.)
    version: z.number().int().nonnegative(),
  })
  .strict();

export type CreateCounterpartyAdjustmentInput = z.infer<typeof CreateCounterpartyAdjustmentSchema>;
export type CounterpartyAdjustmentFilterInput = z.infer<typeof CounterpartyAdjustmentFilterSchema>;
