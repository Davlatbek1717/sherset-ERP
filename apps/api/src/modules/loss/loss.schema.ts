import { z } from 'zod';

export const LossStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type LossState = z.infer<typeof LossStateSchema>;

export const LossTransitionSchema = z.enum(['post', 'unpost', 'cancel']);
export type LossTransitionTarget = z.infer<typeof LossTransitionSchema>;

export const LossReasonSchema = z.enum(['damaged', 'expired', 'theft', 'quality', 'other']);
export type LossReason = z.infer<typeof LossReasonSchema>;

export const LossPositionInputSchema = z.object({
  assortmentKind: z.enum(['product']).default('product'),
  assortmentId: z.string().uuid(),
  quantity: z.coerce.string().regex(/^\d+(\.\d{1,6})?$/, 'quantity must be a positive decimal'),
  // moysklad «Причина списания» — per-position free-text reason (NOT the
  // doc-level enum). Mirror EnterPosition.reason.
  reason: z.string().max(255).nullish(),
  // moysklad «Ячейка» — address-storage bin. `cellId` = picked StoreCell (validated,
  // drives per-cell stock on post); `cell` = denormalized «Зона / Ячейка» label (display).
  cellId: z.string().uuid().nullish(),
  cell: z.string().max(255).nullish(),
  // moysklad «Цена» — the EDITABLE себестоимость the line is written off at (tiyin).
  // Default = the product buyPrice; the user may override. LossService.post books
  // THIS value when set (else falls back to the store avg / buyPrice). себестоимость
  // is a product property — decoupled from «Остаток» (a 0/negative-stock write-off
  // still removes value: 066d55fb is about NOT booking 0, not about the source).
  costMinor: z.coerce.string().regex(/^\d+$/, 'costMinor must be a non-negative integer').nullish(),
});
export type LossPositionInput = z.infer<typeof LossPositionInputSchema>;

export const CreateLossSchema = z.object({
  organizationId: z.string().uuid(),
  storeId: z.string().uuid(),
  // moysklad parity — Проект (internal stock doc: no counterparty → no Договор).
  projectId: z.string().uuid().nullish(),
  // moysklad «Статья расходов» (P&L expense item) — REQUIRED on the editor; stored
  // as the item's NAME (Loss.expenseItem is a free-form string the list filter
  // resolves back to ExpenseItem ids). Default «Списания».
  expenseItem: z.string().max(100).nullish(),
  // moysklad «Валюта документа» + rate. Loss is carried in the account base
  // currency (UZS ⇒ rateValue 1e8 ⇒ a no-op), but the field is shown 1:1 with
  // the editor; mirror Enter/PurchaseOrder. rateValue = rate × 1e8 (string).
  currency: z.string().length(3).default('UZS'),
  rateValue: z.coerce
    .string()
    .regex(/^\d+$/, 'rateValue must be a non-negative integer')
    .optional(),
  moment: z.coerce.date().optional(),
  reason: LossReasonSchema.default('other'),
  description: z.string().max(4000).nullish(),
  // moysklad parity (§17) — universal «Внешний код» (col exists, no migration).
  externalCode: z.string().max(50).nullish(),
  // «Проведено» on save — moysklad parity: ticking «Проведено» + Сохранить
  // creates AND posts the write-off (stock removed) in one action. When true,
  // create() runs the SAME verified transition('post') path the detail
  // «Провести» uses. Was silently dropped before (FE sent it, schema omitted it).
  // `.optional()` (not `.default`) so createFromX shortcuts' `satisfies
  // CreateLossInput` object need not pass it.
  applicable: z.boolean().optional(),
  positions: z.array(LossPositionInputSchema),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type CreateLossInput = z.infer<typeof CreateLossSchema>;

export const UpdateLossSchema = CreateLossSchema.partial().extend({
  // moysklad parity: a DRAFT write-off may have 0 positions (work-in-progress) —
  // editing/saving an empty draft must NOT 400 «at least 1 element». The min-1
  // rule belongs at POST time only (LossService.post checks positions.length>0),
  // not on every save. (NB: an empty array still REPLACES — clears — the lines.)
  positions: z.array(LossPositionInputSchema).optional(),
  version: z.number().int().nonnegative(),
});
export type UpdateLossInput = z.infer<typeof UpdateLossSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

/** CSV-or-array of UUIDs (mirror invoice-in.schema `csvUuid`). */
const csvUuid = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(',')))
  .pipe(z.array(z.string().uuid()).min(1));

export const LossFilterSchema = z.object({
  state: LossStateSchema.optional(),
  organizationId: z.string().uuid().optional(),
  /** «Организация» — multi (Loss.organizationId in …). moysklad inline-dropdown. */
  organizationIds: csvUuid.optional(),
  /** «Склад» — Loss.storeId. */
  storeId: z.string().uuid().optional(),
  /** «Склад» — multi (Loss.storeId in …). */
  storeIds: csvUuid.optional(),
  reason: LossReasonSchema.optional(),
  /** «Проект» — Loss.projectId. */
  projectId: z.string().uuid().optional(),
  /** «Проект» — multi (Loss.projectId in …). */
  projectIds: csvUuid.optional(),
  /** «Владелец-отдел» — Loss.groupId. */
  groupId: z.string().uuid().optional(),
  /** «Владелец-отдел» — multi (Loss.groupId in …). */
  groupIds: csvUuid.optional(),
  /** «Владелец-сотрудник» — Loss.ownerId. */
  ownerId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — multi (Loss.ownerId in …). */
  ownerIds: csvUuid.optional(),
  /** «Товар или группа» — positions.some(productId in …). */
  productIds: csvUuid.optional(),
  /** «Кто изменил» — auditLog-approximated (Loss has no modifiedById column). */
  modifiedByIds: csvUuid.optional(),
  /** «Статья расходов» — ExpenseItem ids; resolved to Loss.expenseItem names. */
  expenseItemIds: csvUuid.optional(),
  /** «Общий доступ» — Loss.shared flag. */
  shared: boolFromString.optional(),
  /** «Проведено» — Loss.applicable flag. */
  applicable: boolFromString.optional(),
  /** «Напечатано» — Loss.printed flag. */
  printed: boolFromString.optional(),
  /** «Отправлено» — Loss.published flag. */
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
  // Internal write-off has NO agentId / contractId / agentAccountId /
  // organizationAccountId / salesChannelId (N/A — no counterparty).
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  // moysklad parity — relational sort for organization / store exposed by
  // the list-view column headers (handled by LossService.buildListWhere's
  // orderBy special-case).
  sortBy: z
    .enum(['moment', 'name', 'sumMinor', 'organization', 'store', 'currency'])
    .default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type LossFilterInput = z.infer<typeof LossFilterSchema>;
