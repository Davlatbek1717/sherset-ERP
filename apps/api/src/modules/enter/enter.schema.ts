import { z } from 'zod';

export const EnterStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type EnterState = z.infer<typeof EnterStateSchema>;

export const EnterTransitionSchema = z.enum(['post', 'unpost', 'cancel']);
export type EnterTransitionTarget = z.infer<typeof EnterTransitionSchema>;

export const EnterReasonSchema = z.enum(['initial', 'found', 'gift', 'correction', 'other']);
export type EnterReason = z.infer<typeof EnterReasonSchema>;

/**
 * «Накладные расходы» distribution method (moysklad «Распределять по»).
 * Same 4 methods as Supply (Оприходование is structurally identical to
 * Приёмка: inbound, per-unit costMinor × qty). Structurally compatible
 * with the shared distributeOverhead() helper's method param.
 */
export const EnterOverheadDistributionSchema = z.enum(['WEIGHT', 'PRICE', 'VOLUME', 'QUANTITY']);
export type EnterOverheadDistribution = z.infer<typeof EnterOverheadDistributionSchema>;

export const EnterPositionInputSchema = z.object({
  assortmentKind: z.enum(['product']).default('product'),
  assortmentId: z.string().uuid(),
  quantity: z.coerce.string().regex(/^\d+(\.\d{1,6})?$/, 'quantity must be a positive decimal'),
  // Enter MUST have a cost basis — this sets the FIFO lot cost.
  costMinor: z.coerce.string().regex(/^\d+$/, 'costMinor must be a non-negative integer'),
  // «Причина оприходования» — moysklad-parity free text PER POSITION (max 255).
  reason: z.string().max(255).nullish(),
  // moysklad «Номер ГТД» / «Сумма ГТД» / «Страна» — import/customs block on the
  // #enter create grid (mirror SupplyPosition §41). gtdSumMinor = tiyin.
  gtdNumber: z.string().max(255).nullish(),
  gtdSumMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'gtdSumMinor must be a non-negative integer')
    .nullish(),
  countryId: z.string().uuid().nullish(),
  // «РНПТ» (goods-batch registration no.) + «Ячейка» (warehouse bin) — free text.
  rnpt: z.string().max(255).nullish(),
  // moysklad «Ячейка» — address-storage bin. `cellId` = picked StoreCell (validated,
  // drives per-cell stock on post); `cell` = denormalized «Зона / Ячейка» label (display).
  cellId: z.string().uuid().nullish(),
  cell: z.string().max(255).nullish(),
});
export type EnterPositionInput = z.infer<typeof EnterPositionInputSchema>;

export const CreateEnterSchema = z.object({
  organizationId: z.string().uuid(),
  storeId: z.string().uuid(),
  // moysklad parity — Проект (internal stock doc: no counterparty → no Договор).
  projectId: z.string().uuid().nullish(),
  // moysklad «Владелец» (owner-access popover) — pick the owning employee
  // (ownerId), department (groupId) and «Общий доступ» (shared) on create.
  // Without them the service falls back to the creator + their department
  // (mirrors PurchaseOrder). Tenant-validated in the service before write.
  ownerId: z.string().uuid().nullish(),
  groupId: z.string().uuid().nullish(),
  shared: z.boolean().optional(),
  moment: z.coerce.date().optional(),
  // «Проведено» on save — moysklad creates the document POSTED when checked.
  // When true, create() posts atomically (create + stock apply in one tx).
  applicable: z.boolean().default(false),
  // NOTE: «Причина» is NOT a document-level field in moysklad — it lives on
  // each position (EnterPositionInputSchema.reason). The old doc-level enum is
  // deprecated; do not re-add it here.
  description: z.string().max(4000).nullish(),
  // moysklad parity (§17) — universal «Внешний код» (col exists, no migration).
  externalCode: z.string().max(50).nullish(),
  // «Валюта документа» + rate (Enter model already has the columns). The cost
  // columns are entered in this currency; at post the FIFO stock lot is converted
  // to the account base via rateValue (UZS ⇒ rate 1e8 ⇒ a no-op). Mirror PO.
  currency: z.string().length(3).default('UZS'),
  rateValue: z.coerce
    .string()
    .regex(/^\d+$/, 'rateValue must be a non-negative integer')
    .default('100000000'),
  // moysklad «Накладные расходы» — extra cost distributed across entered
  // positions at post time (raises their FIFO cost basis). Same model as
  // Supply §12; Update inherits via .partial().extend().
  overheadSumMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'overheadSumMinor must be a non-negative integer')
    .default('0'),
  overheadDistribution: EnterOverheadDistributionSchema.default('WEIGHT'),
  overheadCurrency: z.string().length(3).default('UZS'),
  positions: z.array(EnterPositionInputSchema),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type CreateEnterInput = z.infer<typeof CreateEnterSchema>;

export const UpdateEnterSchema = CreateEnterSchema.partial().extend({
  positions: z.array(EnterPositionInputSchema).optional(),
  version: z.number().int().nonnegative(),
});
export type UpdateEnterInput = z.infer<typeof UpdateEnterSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

// «Товар или группа» multi-select — CSV of product uuids (mirrors PO's csvUuid).
const csvUuid = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(',')))
  .pipe(z.array(z.string().uuid()).min(1));

export const EnterFilterSchema = z.object({
  state: EnterStateSchema.optional(),
  organizationId: z.string().uuid().optional(),
  organizationIds: csvUuid.optional(),
  /** «Склад» — Enter.storeId. */
  storeId: z.string().uuid().optional(),
  /** «Проект» — Enter.projectId. */
  projectId: z.string().uuid().optional(),
  /** «Товар или группа» — MULTI-select: filters Enters whose positions contain
   *  ANY of these products (moysklad checkbox-dropdown parity; mirrors PO's
   *  productIds CSV). */
  productIds: csvUuid.optional(),
  /** «Владелец-отдел» — Enter.groupId. */
  groupId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — Enter.ownerId. */
  ownerId: z.string().uuid().optional(),
  /** «Кто изменил» — Enter.modifiedById (last editor; stamped on every write). */
  modifiedById: z.string().uuid().optional(),
  /** «Общий доступ» — Enter.shared flag (moysklad #enter filter parity). */
  shared: boolFromString.optional(),
  /** «Проведено» — Enter.applicable flag. */
  applicable: boolFromString.optional(),
  /** «Напечатано» — Enter.printed flag. */
  printed: boolFromString.optional(),
  /** «Отправлено» — Enter.published flag. */
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
  // NOTE: «Кто изменил» (modifiedById) is now backed by Enter.modifiedById
  // (migration 20260621140000, stamped on every write — mirror Move). Ad-hoc
  // stock entry still has NO agentId / contractId / agentAccountId /
  // organizationAccountId / salesChannelId (N/A — no counterparty), so those
  // filters remain absent.
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  // moysklad parity — relational sort for organization / store exposed by
  // the list-view column headers (handled by EnterService.buildListWhere's
  // orderBy special-case).
  sortBy: z.enum(['moment', 'name', 'sumMinor', 'organization', 'store']).default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type EnterFilterInput = z.infer<typeof EnterFilterSchema>;
