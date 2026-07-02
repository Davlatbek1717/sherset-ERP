import { z } from 'zod';

export const MoveStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type MoveState = z.infer<typeof MoveStateSchema>;

export const MoveTransitionSchema = z.enum(['post', 'unpost', 'cancel']);
export type MoveTransitionTarget = z.infer<typeof MoveTransitionSchema>;

export const MovePositionInputSchema = z.object({
  assortmentKind: z.enum(['product']).default('product'),
  assortmentId: z.string().uuid(),
  quantity: z.coerce.string().regex(/^\d+(\.\d{1,6})?$/, 'quantity must be a positive decimal'),
});
export type MovePositionInput = z.infer<typeof MovePositionInputSchema>;

/**
 * «Накладные расходы» distribution method (moysklad «Распределять по»).
 * Move capitalises the inter-warehouse transfer cost into the moved
 * goods' landed cost at the destination store. Structurally compatible
 * with the shared distributeOverhead() helper's method param (§12/§34).
 */
export const MoveOverheadDistributionSchema = z.enum(['WEIGHT', 'PRICE', 'VOLUME', 'QUANTITY']);
export type MoveOverheadDistribution = z.infer<typeof MoveOverheadDistributionSchema>;

export const CreateMoveSchema = z
  .object({
    organizationId: z.string().uuid(),
    sourceStoreId: z.string().uuid(),
    destinationStoreId: z.string().uuid(),
    // moysklad parity — Проект (internal stock doc: no counterparty → no Договор).
    projectId: z.string().uuid().nullish(),
    // Link back to the source order when created via «Создать документ →
    // Перемещение» (the Move model already carries customerOrderId for the
    // order's «Связанные документы» reverse-lookup).
    customerOrderId: z.string().uuid().nullish(),
    moment: z.coerce.date().optional(),
    description: z.string().max(4000).nullish(),
    // moysklad parity (§17) — universal «Внешний код» (col exists, no migration).
    externalCode: z.string().max(50).nullish(),
    // moysklad «Накладные расходы» — inter-warehouse transfer cost
    // capitalised into the destination landed cost (cols exist on Move
    // model; was §40-class silent-drop). §65 — mirrors §12/§34.
    overheadSumMinor: z.coerce
      .string()
      .regex(/^\d+$/, 'overheadSumMinor must be a non-negative integer')
      .default('0'),
    overheadDistribution: MoveOverheadDistributionSchema.default('WEIGHT'),
    overheadCurrency: z.string().length(3).default('UZS'),
    positions: z.array(MovePositionInputSchema).min(1, 'at least one position required'),
    attributes: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((v) => v.sourceStoreId !== v.destinationStoreId, {
    message: 'sourceStoreId and destinationStoreId must differ',
    path: ['destinationStoreId'],
  });
export type CreateMoveInput = z.infer<typeof CreateMoveSchema>;

export const UpdateMoveSchema = z.object({
  version: z.number().int().nonnegative(),
  organizationId: z.string().uuid().optional(),
  sourceStoreId: z.string().uuid().optional(),
  destinationStoreId: z.string().uuid().optional(),
  projectId: z.string().uuid().nullish(),
  moment: z.coerce.date().optional(),
  description: z.string().max(4000).nullish(),
  externalCode: z.string().max(50).nullish(),
  overheadSumMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'overheadSumMinor must be a non-negative integer')
    .optional(),
  overheadDistribution: MoveOverheadDistributionSchema.optional(),
  overheadCurrency: z.string().length(3).optional(),
  positions: z.array(MovePositionInputSchema).min(1).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateMoveInput = z.infer<typeof UpdateMoveSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const MoveFilterSchema = z.object({
  state: MoveStateSchema.optional(),
  organizationId: z.string().uuid().optional(),
  /** «Откуда» — Move.sourceStoreId. */
  sourceStoreId: z.string().uuid().optional(),
  /** «Куда» — Move.destinationStoreId. */
  destinationStoreId: z.string().uuid().optional(),
  /** «Проект» — Move.projectId. */
  projectId: z.string().uuid().optional(),
  /** «Товар или группа» — moves whose positions contain this product. */
  productId: z.string().uuid().optional(),
  /** «Движение по складу» — moves where this store is source OR destination. */
  stockStoreId: z.string().uuid().optional(),
  /** «Общий доступ» — Move.shared (owner-access) flag. */
  shared: boolFromString.optional(),
  /** «Владелец-отдел» — Move.groupId (owner department). */
  groupId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — Move.ownerId. */
  ownerId: z.string().uuid().optional(),
  /** «Кто изменил» — Move.modifiedById (last editor). */
  modifiedById: z.string().uuid().optional(),
  /** «Проведено» — Move.applicable flag. */
  applicable: boolFromString.optional(),
  /** «Напечатано» — Move.printed flag. */
  printed: boolFromString.optional(),
  /** «Отправлено» — Move.published flag. */
  published: boolFromString.optional(),
  search: z.string().max(100).optional(),
  includeDeleted: boolFromString.optional(),
  momentFrom: z.string().optional(),
  momentTo: z.string().optional(),
  /**
   * «Когда изменен» — moysklad parity. Filters on `updatedAt` between the
   * two ISO dates (mirror momentFrom/To).
   */
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  sumMinorFrom: z.coerce.number().int().nonnegative().optional(),
  sumMinorTo: z.coerce.number().int().nonnegative().optional(),
  // NOTE: «Кто изменил» (modifiedById) is SKIPPED — the Move model has no
  // `updatedById` column (only `ownerId` / `groupId`), so there is no backed
  // way to filter "last modified by". Surfacing it would require a schema
  // migration outside this panel-parity task. Internal transfer also has
  // NO agentId / contractId / agentAccountId / organizationAccountId /
  // salesChannelId (N/A — no counterparty), so those filters are absent.
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  // moysklad parity — relational sort for organization / sourceStore /
  // destinationStore exposed by the list-view column headers (handled by
  // MoveService.buildListWhere's orderBy special-case).
  sortBy: z
    .enum(['moment', 'name', 'sumMinor', 'organization', 'sourceStore', 'destinationStore'])
    .default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type MoveFilterInput = z.infer<typeof MoveFilterSchema>;
