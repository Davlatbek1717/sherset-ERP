import { z } from 'zod';

/**
 * InternalOrder (Внутренний заказ) — internal stock-transfer request.
 *
 * Workflow: one warehouse/department posts a request listing the goods it
 * needs ("we want 20 iPhone 15s in store MAIN"). The fulfillment process
 * (typically through a Move document) draws stock from another store and
 * delivers it. The internal order is a paper trail + a planning artifact
 * — it does NOT touch stock balances directly.
 *
 * State machine:
 *   draft → posted (applicable=true; signals "I committed to needing this")
 *   posted → draft (unpost)
 *   draft|posted → cancelled
 *
 * Fulfilment progress: each Move that references this order increments
 * `movedQuantity` per position; aggregated `movedSumMinor` on the header.
 * When all positions are fully moved, the document is informationally
 * "fulfilled" but state remains `posted` — there is no auto-transition
 * (the user can manually cancel or leave it as an audit record).
 */

export const InternalOrderStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type InternalOrderState = z.infer<typeof InternalOrderStateSchema>;

export const InternalOrderTransitionSchema = z.enum(['post', 'unpost', 'cancel']);

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

const bigintMinor = z.string().regex(/^\d+$/, 'BigInt minor (faqat raqam)');
const decimalQty = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'number' ? v.toString() : v))
  .refine((v) => /^\d+(\.\d+)?$/.test(v), 'Decimal quantity required')
  .transform((v) => v);

export const InternalOrderPositionInputSchema = z.object({
  assortmentKind: z.enum(['product', 'variant', 'bundle']).default('product'),
  /** Mirrors the per-document patterns; carrying product/variant/bundle IDs through assortmentId. */
  assortmentId: z.string().uuid(),
  productId: z.string().uuid().optional(),
  quantity: decimalQty,
  /** Optional indicative price for reporting only. */
  priceMinor: bigintMinor.optional(),
  vat: z.number().int().min(0).max(100).nullish(),
  vatEnabled: z.boolean().default(true),
});
export type InternalOrderPositionInput = z.infer<typeof InternalOrderPositionInputSchema>;

export const CreateInternalOrderSchema = z.object({
  organizationId: z.string().uuid(),
  storeId: z.string().uuid(),
  // moysklad parity — Проект (internal stock doc: no counterparty → no Договор).
  projectId: z.string().uuid().nullish(),
  moment: z.string().optional(),
  deliveryPlannedMoment: z.string().optional(),
  vatEnabled: z.boolean().default(true),
  vatIncluded: z.boolean().default(false),
  currency: z.string().length(3).default('UZS'),
  rateValue: bigintMinor.default('100000000'),
  description: z.string().max(4096).optional(),
  externalCode: z.string().max(255).optional(),
  applicable: z.boolean().optional(),
  positions: z.array(InternalOrderPositionInputSchema).min(1, 'Kamida 1 ta pozitsiya'),
});
export type CreateInternalOrderInput = z.infer<typeof CreateInternalOrderSchema>;

export const UpdateInternalOrderSchema = z
  .object({
    organizationId: z.string().uuid().optional(),
    storeId: z.string().uuid().optional(),
    projectId: z.string().uuid().nullish(),
    moment: z.string().optional(),
    deliveryPlannedMoment: z.string().nullable().optional(),
    vatEnabled: z.boolean().optional(),
    vatIncluded: z.boolean().optional(),
    currency: z.string().length(3).optional(),
    rateValue: bigintMinor.optional(),
    description: z.string().max(4096).nullable().optional(),
    externalCode: z.string().max(255).nullable().optional(),
    /** Replace-all semantics: omit to leave existing positions untouched, pass [] to clear. */
    positions: z.array(InternalOrderPositionInputSchema).optional(),
    version: z.number().int().nonnegative(),
  })
  .strict();

export const InternalOrderFilterSchema = z.object({
  state: InternalOrderStateSchema.optional(),
  organizationId: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  /** «Проект» — InternalOrder.projectId. */
  projectId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — InternalOrder.ownerId. */
  ownerId: z.string().uuid().optional(),
  /** «Владелец-отдел» — InternalOrder.groupId. */
  groupId: z.string().uuid().optional(),
  /** «Проведено» — InternalOrder.applicable flag. */
  applicable: boolFromString.optional(),
  /** «Напечатано» — InternalOrder.printed flag. */
  printed: boolFromString.optional(),
  /** «Отправлено» — InternalOrder.published flag. */
  published: boolFromString.optional(),
  search: z.string().max(100).optional(),
  includeDeleted: boolFromString.optional(),
  momentFrom: z.string().optional(),
  momentTo: z.string().optional(),
  deliveryFrom: z.string().optional(),
  deliveryTo: z.string().optional(),
  /**
   * «Когда изменен» — moysklad parity. Filters on `updatedAt` between the
   * two ISO dates (mirror momentFrom/To). Mirrors MoveFilterSchema.
   */
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  sumMinorFrom: z.coerce.number().int().nonnegative().optional(),
  sumMinorTo: z.coerce.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  // NOTE: «Кто изменил» (modifiedById) is SKIPPED — the InternalOrder
  // model has no `updatedById` column (only `ownerId` / `groupId`), so
  // there is no backed way to filter "last modified by". Surfacing it
  // would require a schema migration outside this panel-parity task.
  // InternalOrder also has NO agentId / contractId / agentAccountId /
  // organizationAccountId / salesChannelId — internal stock-transfer
  // request (no counterparty), so those filters are intentionally absent.
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  // moysklad parity — relational sort for organization / store exposed by
  // the list-view column headers (handled by
  // InternalOrderService.buildListWhere's orderBy special-case).
  sortBy: z
    .enum([
      'moment',
      'name',
      'sumMinor',
      'deliveryPlannedMoment',
      'createdAt',
      'updatedAt',
      'organization',
      'store',
    ])
    .default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type InternalOrderFilterInput = z.infer<typeof InternalOrderFilterSchema>;
