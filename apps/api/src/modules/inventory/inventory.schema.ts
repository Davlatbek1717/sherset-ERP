import { z } from 'zod';

export const InventoryStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type InventoryState = z.infer<typeof InventoryStateSchema>;

export const InventoryTransitionSchema = z.enum(['post', 'cancel']);
export type InventoryTransitionTarget = z.infer<typeof InventoryTransitionSchema>;

/**
 * Inventory position input — user records actualQty (physical count).
 * expectedQty is snapshot at post time from Stock, not input.
 */
export const InventoryPositionInputSchema = z.object({
  assortmentKind: z.enum(['product']).default('product'),
  assortmentId: z.string().uuid(),
  actualQty: z.coerce.string().regex(/^\d+(\.\d{1,6})?$/, 'actualQty must be non-negative'),
});
export type InventoryPositionInput = z.infer<typeof InventoryPositionInputSchema>;

export const CreateInventorySchema = z.object({
  organizationId: z.string().uuid(),
  storeId: z.string().uuid(),
  // moysklad parity — Проект (internal stock doc: no counterparty → no Договор).
  projectId: z.string().uuid().nullish(),
  moment: z.coerce.date().optional(),
  description: z.string().max(4000).nullish(),
  // moysklad parity (§17) — universal «Внешний код» (col exists, no migration).
  externalCode: z.string().max(50).nullish(),
  positions: z.array(InventoryPositionInputSchema).min(1, 'at least one position required'),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type CreateInventoryInput = z.infer<typeof CreateInventorySchema>;

export const UpdateInventorySchema = CreateInventorySchema.partial().extend({
  positions: z.array(InventoryPositionInputSchema).min(1).optional(),
  version: z.number().int().nonnegative(),
});
export type UpdateInventoryInput = z.infer<typeof UpdateInventorySchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const InventoryFilterSchema = z.object({
  state: InventoryStateSchema.optional(),
  organizationId: z.string().uuid().optional(),
  /** «Склад» — Inventory.storeId. */
  storeId: z.string().uuid().optional(),
  /** «Проект» — Inventory.projectId. */
  projectId: z.string().uuid().optional(),
  /** «Владелец-отдел» — Inventory.groupId. */
  groupId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — Inventory.ownerId. */
  ownerId: z.string().uuid().optional(),
  /** «Проведено» — Inventory.applicable flag. */
  applicable: boolFromString.optional(),
  /** «Напечатано» — Inventory.printed flag. */
  printed: boolFromString.optional(),
  /** «Отправлено» — Inventory.published flag. */
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
  /**
   * «Сумма» — Inventory DOES carry a `sumMinor` column (schema.prisma
   * 5913: "Sum of (counted_qty × cost) — populated when the recount is
   * finalised"). Backed → exposed.
   */
  sumMinorFrom: z.coerce.number().int().nonnegative().optional(),
  sumMinorTo: z.coerce.number().int().nonnegative().optional(),
  // NOTE: «Кто изменил» (modifiedById) is SKIPPED — the Inventory model
  // has no `updatedById` column (only `ownerId` / `groupId`), so there is
  // no backed way to filter "last modified by". Surfacing it would
  // require a schema migration outside this panel-parity task. Physical
  // recount also has NO agentId / contractId / agentAccountId /
  // organizationAccountId / salesChannelId (N/A — no counterparty), so
  // those filters are absent.
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  // moysklad parity — relational sort for organization / store exposed by
  // the list-view column headers (handled by
  // InventoryService.buildListWhere's orderBy special-case). `sumMinor`
  // added since the column is backed.
  sortBy: z.enum(['moment', 'name', 'sumMinor', 'organization', 'store']).default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type InventoryFilterInput = z.infer<typeof InventoryFilterSchema>;
