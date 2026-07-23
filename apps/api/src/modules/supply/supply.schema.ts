import { z } from 'zod';
import { discountPercent } from '../shared/discount.js';

/**
 * Supply (Приёмка) schema — inbound receipt of goods.
 *
 * FSM: draft → posted (stock +, cost recorded) → draft (unpost)
 *      draft → (soft-deleted)
 *
 * Mirror of Demand. Adds FIFO lot tracking via SupplyPosition.remainingQty.
 */

export const SupplyStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type SupplyState = z.infer<typeof SupplyStateSchema>;

export const SupplyTransitionSchema = z.enum(['post', 'unpost', 'cancel']);
export type SupplyTransitionTarget = z.infer<typeof SupplyTransitionSchema>;

/**
 * «Накладные расходы» distribution method (moysklad «Распределять по»).
 * WEIGHT — by product weight (g), VOLUME — by product volume (ml),
 * PRICE — by line value (after-discount tiyin), QUANTITY — by units.
 * Mirrors Supply.overheadDistribution (db default WEIGHT).
 */
export const SupplyOverheadDistributionSchema = z.enum(['WEIGHT', 'PRICE', 'VOLUME', 'QUANTITY']);
export type SupplyOverheadDistribution = z.infer<typeof SupplyOverheadDistributionSchema>;

export const SupplyPositionInputSchema = z.object({
  assortmentKind: z.enum(['product']).default('product'),
  assortmentId: z.string().uuid(),
  // Sprint 4.4: optional back-link to PurchaseOrderPosition this delivery fulfils.
  purchaseOrderPositionId: z.string().uuid().nullish(),
  quantity: z.coerce.string().regex(/^\d+(\.\d{1,6})?$/, 'quantity must be a positive decimal'),
  priceMinor: z.coerce.string().regex(/^\d+$/, 'priceMinor must be a non-negative integer'),
  discount: discountPercent.optional(),
  vat: z.number().int().min(0).max(100).nullish(),
  vatEnabled: z.boolean().default(true),
  // moysklad «Номер ГТД» / «Сумма ГТД» / «Страна» — import/customs block
  // (live-confirmed on Приёмка, PARITY-AUDIT §41). gtdSumMinor = tiyin.
  gtdNumber: z.string().max(255).nullish(),
  gtdSumMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'gtdSumMinor must be a non-negative integer')
    .nullish(),
  countryId: z.string().uuid().nullish(),
  // moysklad «Ячейка» — address-storage bin. `cellId` = picked StoreCell (validated,
  // drives per-cell stock on post); `cell` = denormalized «Зона / Ячейка» label (display).
  cellId: z.string().uuid().nullish(),
  cell: z.string().max(255).nullish(),
});
export type SupplyPositionInput = z.infer<typeof SupplyPositionInputSchema>;

export const CreateSupplySchema = z.object({
  agentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  storeId: z.string().uuid(),
  // Sprint 4.4: optional back-link to PurchaseOrder this supply delivers against.
  purchaseOrderId: z.string().uuid().nullish(),
  // moysklad parity — Договор / Проект (purchase docs have no sales channel).
  contractId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  // moysklad parity (§12 live capture) — org/agent accounts + Внешний код.
  organizationAccountId: z.string().uuid().nullish(),
  agentAccountId: z.string().uuid().nullish(),
  externalCode: z.string().max(50).nullish(),
  moment: z.coerce.date().optional(),
  incomingDate: z.coerce.date().nullish(),
  incomingNumber: z.string().max(50).nullish(),
  description: z.string().max(4000).nullish(),
  currency: z.string().length(3).default('UZS'),
  rateValue: z.coerce.string().regex(/^\d+$/).default('100000000'),
  // moysklad «Накладные расходы» — extra delivery/customs cost distributed
  // across received positions at post time (raises their FIFO cost basis).
  overheadSumMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'overheadSumMinor must be a non-negative integer')
    .default('0'),
  overheadDistribution: SupplyOverheadDistributionSchema.default('WEIGHT'),
  overheadCurrency: z.string().length(3).default('UZS'),
  vatEnabled: z.boolean().default(true),
  vatIncluded: z.boolean().default(false),
  // «Владелец» / «Владелец-отдел» / «Общий доступ» — set from the owner popover
  // (mirror purchase-order.schema.ts). Tenant-validated in the service before use.
  ownerId: z.string().uuid().nullish(),
  groupId: z.string().uuid().nullish(),
  shared: z.boolean().optional(),
  // «Статус» — account custom status (State row, entityType="supply") picked in
  // the editor header pill; tenant+entityType validated in the service before
  // FK-connect (mirror purchase-return.schema.ts).
  statusId: z.string().uuid().nullish(),
  // «Проведено» on save — moysklad parity: ticking «Проведено» + Сохранить
  // creates AND posts the receipt (stock added) in one action. When true,
  // create() runs the SAME verified transition('post') path the detail
  // «Провести» uses. Was silently dropped before (FE sent it, schema omitted it).
  // `.optional()` (not `.default`) so createFromPurchaseOrder's `satisfies
  // CreateSupplyInput` object need not pass it.
  applicable: z.boolean().optional(),
  positions: z.array(SupplyPositionInputSchema),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type CreateSupplyInput = z.infer<typeof CreateSupplySchema>;

export const UpdateSupplySchema = CreateSupplySchema.partial().extend({
  positions: z.array(SupplyPositionInputSchema).optional(),
  version: z.number().int().nonnegative(),
});
export type UpdateSupplyInput = z.infer<typeof UpdateSupplySchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

/** CSV-or-array of UUIDs (mirror demand.schema `csvUuid`) — backs the
 *  multi-select inline filter fields (agentIds, productIds, …). */
const csvUuid = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(',')))
  .pipe(z.array(z.string().uuid()).min(1));

export const SupplyFilterSchema = z.object({
  state: SupplyStateSchema.optional(),
  agentId: z.string().uuid().optional(),
  /** «Группа контрагента» — filters via the agent (Counterparty) relation's groupId. */
  agentGroupId: z.string().uuid().optional(),
  /**
   * «Владелец контрагента» — the OWNER EMPLOYEE of the agent (Counterparty),
   * i.e. `agent.ownerId`. Distinct from «Владелец-сотрудник» (`ownerId`, the
   * Supply's own owner). Narrows the same `agent` relation as agentGroupId, so
   * buildListWhere merges them into a single `agent:{}` clause (a second
   * separate `agent` key would overwrite the first — last-key-wins).
   */
  agentOwnerId: z.string().uuid().optional(),
  /** «Счёт контрагента» — Supply.agentAccountId. */
  agentAccountId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  /** «Счёт организации» — Supply.organizationAccountId. */
  organizationAccountId: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  /** «Заказ поставщику» — Supply.purchaseOrderId (back-link to the PO). */
  purchaseOrderId: z.string().uuid().optional(),
  /** «Оплата» — payment progress (payedSumMinor vs sumMinor cross-column). */
  paymentStatus: z.enum(['unpaid', 'partial', 'paid']).optional(),
  /** «Товар или группа» — supplies whose positions include this product. */
  productId: z.string().uuid().optional(),
  /**
   * «Тип возврата» — return progress computed against linked Возврат поставщику
   * (PurchaseReturn.supplyId) docs (active = applicable, not deleted) summed vs
   * the receipt sum. moysklad #supply options:
   *   none    «Без возвратов»        — no active returns reference this receipt
   *   partial «Частично возвращено»  — 0 < Σreturned < receipt sum
   *   full    «Полностью возвращено» — Σreturned ≥ receipt sum (> 0)
   */
  returnStatus: z.enum(['none', 'partial', 'full']).optional(),
  /**
   * «Кто изменил» — the employee who last edited the receipt. Supply has no
   * modifiedById column, so list() pre-queries the DISTINCT auditLog entityIds
   * this user `update`d (mirror demand). A uuid here narrows to those ids.
   */
  modifiedById: z.string().uuid().optional(),
  /** «Договор» — Supply.contractId. */
  contractId: z.string().uuid().optional(),
  /** «Проект» — Supply.projectId. */
  projectId: z.string().uuid().optional(),
  /** «Владелец-отдел» — Supply.groupId (owner department). */
  groupId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — Supply.ownerId. */
  ownerId: z.string().uuid().optional(),
  // --- Multi-select inline filter fields (moysklad checkbox-dropdowns). Each
  //     `*Ids` is a CSV-or-array of UUIDs; buildListWhere prefers it over the
  //     matching single `*Id`. Mirrors demand.schema. ---
  agentIds: csvUuid.optional(),
  agentGroupIds: csvUuid.optional(),
  agentOwnerIds: csvUuid.optional(),
  agentAccountIds: csvUuid.optional(),
  organizationIds: csvUuid.optional(),
  organizationAccountIds: csvUuid.optional(),
  storeIds: csvUuid.optional(),
  projectIds: csvUuid.optional(),
  contractIds: csvUuid.optional(),
  groupIds: csvUuid.optional(),
  ownerIds: csvUuid.optional(),
  productIds: csvUuid.optional(),
  modifiedByIds: csvUuid.optional(),
  /** «Проведено» — Supply.applicable flag. */
  applicable: boolFromString.optional(),
  /** «Напечатано» — Supply.printed flag. */
  printed: boolFromString.optional(),
  /** «Отправлено» — Supply.published flag. */
  published: boolFromString.optional(),
  /** «Общий доступ» — Supply.shared flag. */
  shared: boolFromString.optional(),
  /** «Входящий номер» — Supply.incomingNumber, case-insensitive contains
   *  (a dedicated field in moysklad #supply; the search box also covers it). */
  incomingNumber: z.string().max(50).optional(),
  search: z.string().max(100).optional(),
  includeDeleted: boolFromString.optional(),
  momentFrom: z.string().optional(),
  momentTo: z.string().optional(),
  /** «Входящая дата» — Supply.incomingDate between two ISO dates (mirror momentFrom/To). */
  incomingDateFrom: z.string().optional(),
  incomingDateTo: z.string().optional(),
  /**
   * «Когда изменен» — moysklad parity. Filters on `updatedAt` between the
   * two ISO dates (mirror momentFrom/To).
   */
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  sumMinorFrom: z.coerce.number().int().nonnegative().optional(),
  sumMinorTo: z.coerce.number().int().nonnegative().optional(),
  // NOTE: «Кто изменил» (modifiedById/modifiedByIds) is wired via the auditLog
  // (Supply has no modifiedById column) — list() pre-queries the DISTINCT
  // entityIds this account's Supply rows were `update`d on by the given user(s)
  // and narrows by id, mirroring demand / invoice-out / loss.
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  sortBy: z
    .enum(['moment', 'name', 'sumMinor', 'agent', 'organization', 'store'])
    .default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type SupplyFilterInput = z.infer<typeof SupplyFilterSchema>;

/**
 * Create-from-PurchaseOrder helper input.
 * Mirror of Demand.createFromCustomerOrder. Per-position quantity overrides
 * default to (PO.quantity - PO.receivedQty) — i.e. the remaining undelivered
 * amount.
 */
export const CreateFromPurchaseOrderSchema = z.object({
  storeId: z.string().uuid().optional(), // defaults to PO.storeId
  quantities: z.record(z.string().uuid(), z.coerce.string().regex(/^\d+(\.\d{1,6})?$/)).optional(),
  incomingNumber: z.string().max(50).nullish(),
  incomingDate: z.coerce.date().nullish(),
});
export type CreateFromPurchaseOrderInput = z.infer<typeof CreateFromPurchaseOrderSchema>;
