import { z } from 'zod';
import { csvUuid } from '../shared/csv.js';
import { discountPercent } from '../shared/discount.js';

/**
 * PurchaseReturn (Возврат поставщику) — goods going back to supplier.
 *
 * FSM (Sprint 5.2):
 *   draft → posted (stock -, Supply/PO receivedSum revert)
 *   posted → draft (unpost)
 *   posted → cancelled
 *   draft → (soft-deleted)
 *
 * Outbound stock side mirror of Supply. Optional back-link to the original
 * Supply (traceability + return-qty cap). If Supply was linked to a PO, we
 * cascade to PO.applyReceipt(..., direction='revert').
 */

export const PurchaseReturnStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type PurchaseReturnState = z.infer<typeof PurchaseReturnStateSchema>;

export const PurchaseReturnTransitionSchema = z.enum(['post', 'unpost', 'cancel']);
export type PurchaseReturnTransitionTarget = z.infer<typeof PurchaseReturnTransitionSchema>;

export const PurchaseReturnPositionInputSchema = z.object({
  assortmentKind: z.enum(['product']).default('product'),
  assortmentId: z.string().uuid(),
  supplyPositionId: z.string().uuid().nullish(),
  quantity: z.coerce.string().regex(/^\d+(\.\d{1,6})?$/, 'quantity must be a positive decimal'),
  priceMinor: z.coerce.string().regex(/^\d+$/, 'priceMinor must be a non-negative integer'),
  discount: discountPercent.optional(),
  vat: z.number().int().min(0).max(100).nullish(),
  vatEnabled: z.boolean().default(true),
  // moysklad «Ячейка» — address-storage bin (validated against the store on
  // create); `cell` = denormalized «Зона / Ячейка» label. Mirror supply.
  cellId: z.string().uuid().nullish(),
  cell: z.string().max(255).nullish(),
});
export type PurchaseReturnPositionInput = z.infer<typeof PurchaseReturnPositionInputSchema>;

export const CreatePurchaseReturnSchema = z.object({
  agentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  storeId: z.string().uuid(),
  supplyId: z.string().uuid().nullish(),
  // moysklad parity — Договор / Проект (purchase docs have no sales channel).
  contractId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  // moysklad parity (§13 live capture) — org/agent accounts + Внешний код.
  organizationAccountId: z.string().uuid().nullish(),
  agentAccountId: z.string().uuid().nullish(),
  externalCode: z.string().max(50).nullish(),
  // «Владелец» — owner employee / department / «Общий доступ». Live-grounded on the
  // moysklad return editor (the «Азизбек Н. / Основной» toolbar widget). When omitted
  // the service stamps the creator as owner (the historical default).
  ownerId: z.string().uuid().nullish(),
  groupId: z.string().uuid().nullish(),
  shared: z.boolean().optional(),
  // «Статус» — account custom status (State, entityType="purchasereturn"). The editor's
  // grey «Статус» pill assigns one on create; validated against the tenant in create().
  statusId: z.string().uuid().nullish(),
  moment: z.coerce.date().optional(),
  reason: z.string().max(4000).nullish(),
  description: z.string().max(4000).nullish(),
  currency: z.string().length(3).default('UZS'),
  rateValue: z.coerce.string().regex(/^\d+$/).default('100000000'),
  vatEnabled: z.boolean().default(true),
  vatIncluded: z.boolean().default(false),
  // «Проведено» on save — moysklad parity: ticking «Проведено» + Сохранить
  // creates AND posts the return (stock removed) in one action. When true,
  // create() runs the SAME verified transition('post') path the detail
  // «Провести» uses. Was silently dropped before (FE sent it, schema omitted it).
  // `.optional()` (not `.default`) so createFromSupply's `satisfies
  // CreatePurchaseReturnInput` object need not pass it.
  applicable: z.boolean().optional(),
  // moysklad allows an empty DRAFT return (so «⊕ Задача»/«⊕ Файл» on a brand-new
  // return can silently persist a draft to attach to). Posting (applicable=true) still
  // requires ≥1 position — enforced in create() below, mirroring purchase-orders.
  positions: z.array(PurchaseReturnPositionInputSchema),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type CreatePurchaseReturnInput = z.infer<typeof CreatePurchaseReturnSchema>;

export const UpdatePurchaseReturnSchema = CreatePurchaseReturnSchema.partial().extend({
  positions: z.array(PurchaseReturnPositionInputSchema).optional(),
  version: z.number().int().nonnegative(),
});
export type UpdatePurchaseReturnInput = z.infer<typeof UpdatePurchaseReturnSchema>;

export const CreateFromSupplySchema = z.object({
  storeId: z.string().uuid().optional(),
  quantities: z.record(z.string().uuid(), z.coerce.string().regex(/^\d+(\.\d{1,6})?$/)).optional(),
  reason: z.string().max(4000).nullish(),
});
export type CreateFromSupplyInput = z.infer<typeof CreateFromSupplySchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const PurchaseReturnFilterSchema = z.object({
  state: PurchaseReturnStateSchema.optional(),
  agentId: z.string().uuid().optional(),
  agentIds: csvUuid.optional(),
  /** «Группа контрагента» — filters via the agent (Counterparty) relation's groupId. */
  agentGroupId: z.string().uuid().optional(),
  /** «Владелец контрагента» — filters via the agent (Counterparty) relation's ownerId. */
  agentOwnerId: z.string().uuid().optional(),
  /** «Счёт контрагента» — PurchaseReturn.agentAccountId. */
  agentAccountId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  organizationIds: csvUuid.optional(),
  /** «Счёт организации» — PurchaseReturn.organizationAccountId. */
  organizationAccountId: z.string().uuid().optional(),
  /** «Склад» — PurchaseReturn.storeId (source warehouse). */
  storeId: z.string().uuid().optional(),
  /** «Приемка» — PurchaseReturn.supplyId (back-link to the original Supply).
   *  Kept for the saved-filter / API surface; the moysklad filter panel uses
   *  «Дата приемки» (a DATE range over the linked supply) instead, not this picker. */
  supplyId: z.string().uuid().optional(),
  /** «Товар или группа» — narrows to returns that contain the product (any line). */
  productId: z.string().uuid().optional(),
  /** «Оплата» — derived payment state (payed vs sum cross-column compare). */
  paymentState: z.enum(['paid', 'partlyPaid', 'unpaid']).optional(),
  /** «Дата приемки» — date range over the LINKED supply's `moment` (receipt date). */
  receiptDateFrom: z.string().optional(),
  receiptDateTo: z.string().optional(),
  /** «Общий доступ» — PurchaseReturn.shared flag. */
  shared: boolFromString.optional(),
  /** «Договор» — PurchaseReturn.contractId. */
  contractId: z.string().uuid().optional(),
  /** «Проект» — PurchaseReturn.projectId. */
  projectId: z.string().uuid().optional(),
  /** «Владелец-отдел» — PurchaseReturn.groupId (owner department). */
  groupId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — PurchaseReturn.ownerId. */
  ownerId: z.string().uuid().optional(),
  /** «Проведено» — PurchaseReturn.applicable flag. */
  applicable: boolFromString.optional(),
  /** «Напечатано» — PurchaseReturn.printed flag. */
  printed: boolFromString.optional(),
  /** «Отправлено» — PurchaseReturn.published flag. */
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
  /** «Кто изменил» — PurchaseReturn has no `updatedById` column, so list()/
   *  aggregateTotals() approximate it via the auditLog (DISTINCT entityIds this
   *  user `update`d), mirror invoice-in / supply. */
  modifiedById: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  sortBy: z.enum(['moment', 'name', 'sumMinor', 'agent', 'organization']).default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type PurchaseReturnFilterInput = z.infer<typeof PurchaseReturnFilterSchema>;
