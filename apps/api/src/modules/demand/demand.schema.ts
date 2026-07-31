import { z } from 'zod';
import { discountPercent } from '../shared/discount.js';

/**
 * Demand (Отгрузка) — outbound shipment document.
 *
 * FSM: draft → posted (applicable=true, stock deducted)
 *      posted → draft (unpost)
 *      posted → cancelled
 *      draft → (soft-deleted)
 *
 * Mirrors CustomerOrder shape; see workflows/demand.json.
 */

export const DemandStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type DemandState = z.infer<typeof DemandStateSchema>;

export const DemandTransitionSchema = z.enum(['post', 'unpost', 'cancel']);
export type DemandTransitionTarget = z.infer<typeof DemandTransitionSchema>;

/**
 * «Накладные расходы» distribution method for Отгрузка (moysklad
 * «Распределить по»). Live-confirmed on the Отгрузка create form
 * (PARITY-AUDIT §42 [STREAM A]): default is «по цене» (PRICE).
 *
 * OUTBOUND semantics — UNLIKE Приёмка/Оприходование: the overhead is a
 * sale-side expense that lowers the shipment «Прибыль» (folded into
 * Demand.costSumMinor / себестоимость aggregate). It does NOT touch the
 * FIFO basis, SupplyPosition lots, or Stock — "FIFO-basis EMAS".
 */
export const DemandOverheadDistributionSchema = z.enum(['WEIGHT', 'PRICE', 'VOLUME', 'QUANTITY']);
export type DemandOverheadDistribution = z.infer<typeof DemandOverheadDistributionSchema>;

// --- Position ---

export const DemandPositionInputSchema = z.object({
  assortmentKind: z.enum(['product']).default('product'),
  assortmentId: z.string().uuid(),
  // back-link to CustomerOrderPosition when demand derives from CO
  customerOrderPositionId: z.string().uuid().nullish(),
  quantity: z.coerce
    .string()
    .regex(/^\d+(\.\d{1,6})?$/, 'quantity must be a positive decimal')
    .refine((v) => Number(v) > 0, 'quantity must be greater than 0'),
  priceMinor: z.coerce.string().regex(/^\d+$/, 'priceMinor must be a non-negative integer'),
  discount: discountPercent.optional(),
  vat: z.number().int().min(0).max(100).nullish(),
  vatEnabled: z.boolean().default(true),
  // moysklad «Ячейка» — address-storage bin the goods leave FROM (validated
  // against the store on create); `cell` = denormalized «Зона / Ячейка» label.
  // Mirror purchase-return (the other outbound doc).
  cellId: z.string().uuid().nullish(),
  cell: z.string().max(255).nullish(),
});
export type DemandPositionInput = z.infer<typeof DemandPositionInputSchema>;

// --- Create ---

export const CreateDemandSchema = z.object({
  agentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  storeId: z.string().uuid(),
  customerOrderId: z.string().uuid().nullish(),
  // moysklad parity — Канал продаж / Договор / Проект (optional FK refs).
  salesChannelId: z.string().uuid().nullish(),
  contractId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  // moysklad «Счёт организации» / «Счёт контрагента» — bank-account FK refs.
  // The columns exist on the model; the /new form already sends
  // organizationAccountId — but it was absent from the write schema, so Zod
  // stripped it and the chosen account was silently dropped on create/update.
  organizationAccountId: z.string().uuid().nullish(),
  agentAccountId: z.string().uuid().nullish(),
  // «План. дата отгрузки» — planned shipment date (was sent by /new but had
  // no column/schema field → silently discarded).
  deliveryPlannedMoment: z.coerce.date().nullish(),
  // «План. дата оплаты» — planned payment date (DOM-grounded; mirrors InvoiceOut).
  paymentPlannedMoment: z.coerce.date().nullish(),
  // Адрес доставки — denormalised shipment address (max 500 like the column).
  shipmentAddress: z.string().max(500).nullish(),
  // moysklad «Другие поля» — shipping / logistics block (all optional).
  consignorId: z.string().uuid().nullish(),
  consigneeId: z.string().uuid().nullish(),
  carrierId: z.string().uuid().nullish(),
  cargoName: z.string().max(255).nullish(),
  shipperInstructions: z.string().max(4000).nullish(),
  transportFacility: z.string().max(255).nullish(),
  carNumber: z.string().max(50).nullish(),
  placesCount: z.coerce.number().int().nonnegative().nullish(),
  shippingDocNo: z.string().max(100).nullish(),
  shippingDocDate: z.coerce.date().nullish(),
  stateContractId: z.string().max(100).nullish(),
  // moysklad «Внешний код» — universal external-system sync key (the
  // Demand model already carries the column; UpdateDemandSchema inherits
  // this via .partial()).
  externalCode: z.string().max(50).nullish(),
  moment: z.coerce.date().optional(),
  description: z.string().max(4000).nullish(),
  currency: z.string().length(3).default('UZS'),
  rateValue: z.coerce.string().regex(/^\d+$/).default('100000000'),
  // moysklad «Накладные расходы» (Отгрузка) — sale-side expense that
  // lowers «Прибыль» (folded into costSumMinor at post). Live-confirmed
  // (§42 [STREAM A]); model already carries the columns (no migration).
  // Default distribution «по цене» = PRICE per the live Отгрузка form.
  overheadSumMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'overheadSumMinor must be a non-negative integer')
    .default('0'),
  overheadDistribution: DemandOverheadDistributionSchema.default('PRICE'),
  overheadCurrency: z.string().length(3).default('UZS'),
  vatEnabled: z.boolean().default(true),
  vatIncluded: z.boolean().default(false),
  // «Проведено» on save — moysklad parity: ticking «Проведено» + Сохранить
  // creates AND posts the shipment (stock deducted) in one action. When true,
  // create() runs the SAME verified transition('post') path the detail
  // «Провести» uses. Was silently dropped before (FE sent it, schema omitted it).
  // `.optional()` (not `.default`) so createFromCustomerOrder's `satisfies
  // CreateDemandInput` object need not pass it.
  applicable: z.boolean().optional(),
  positions: z.array(DemandPositionInputSchema), // moysklad allows an empty DRAFT; post() still requires >=1 position
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type CreateDemandInput = z.infer<typeof CreateDemandSchema>;

// --- Update (draft only) ---

export const UpdateDemandSchema = CreateDemandSchema.partial().extend({
  positions: z.array(DemandPositionInputSchema).optional(),
  version: z.number().int().nonnegative(),
});
export type UpdateDemandInput = z.infer<typeof UpdateDemandSchema>;

// --- Create from CustomerOrder (shortcut) ---

export const CreateFromCustomerOrderSchema = z.object({
  storeId: z.string().uuid().optional(), // defaults to CO.storeId
  // Optional per-position quantity override (partial shipment). Key: CO position id.
  quantities: z.record(z.string().uuid(), z.coerce.string().regex(/^\d+(\.\d{1,6})?$/)).optional(),
});
export type CreateFromCustomerOrderInput = z.infer<typeof CreateFromCustomerOrderSchema>;

// --- List filter ---

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

/** CSV-or-array of UUIDs (mirror invoice-out.schema `csvUuid`) — backs the
 *  multi-select inline filter fields (agentIds, productIds, …). */
const csvUuid = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(',')))
  .pipe(z.array(z.string().uuid()).min(1));

/** One custom-attribute («Дополнительные поля») filter clause — mirror
 *  customer-order.schema. `code` = the AttributeMetadata machine name (JSON key);
 *  `value` for equals/contains, `from`/`to` for date|number ranges. */
export const AttrFilterClauseSchema = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]{1,49}$/),
  value: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
export type AttrFilterClause = z.infer<typeof AttrFilterClauseSchema>;

export const DemandFilterSchema = z.object({
  state: DemandStateSchema.optional(),
  agentId: z.string().uuid().optional(),
  /** «Группа контрагента» — filters via the agent (Counterparty) relation's groupId. */
  agentGroupId: z.string().uuid().optional(),
  /** «Счёт контрагента» — Demand.agentAccountId. */
  agentAccountId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  /** «Счёт организации» — Demand.organizationAccountId. */
  organizationAccountId: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  customerOrderId: z.string().uuid().optional(),
  /** «Проект» — Demand.projectId. */
  projectId: z.string().uuid().optional(),
  /** «Договор» — Demand.contractId. */
  contractId: z.string().uuid().optional(),
  /** «Канал продаж» — Demand.salesChannelId. */
  salesChannelId: z.string().uuid().optional(),
  /** «Владелец-отдел» — Demand.groupId (owner department). */
  groupId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — Demand.ownerId. */
  ownerId: z.string().uuid().optional(),
  /** «Грузополучатель» — Demand.consigneeId (single). */
  consigneeId: z.string().uuid().optional(),
  /** «Владелец контрагента» — Counterparty.ownerId (single). */
  agentOwnerId: z.string().uuid().optional(),
  /** «Товар или группа» — narrows to demands whose positions include a product. */
  productId: z.string().uuid().optional(),
  /** «Кто изменил» — auditLog userId → entityIds (Demand has no modifiedById column). */
  modifiedById: z.string().uuid().optional(),
  // --- Multi-select inline filter fields (moysklad checkbox-dropdowns). Each
  //     `*Ids` is a CSV-or-array of UUIDs; buildListWhere prefers it over the
  //     matching single `*Id`. Mirrors invoice-out.schema. ---
  agentIds: csvUuid.optional(),
  agentGroupIds: csvUuid.optional(),
  agentOwnerIds: csvUuid.optional(),
  agentAccountIds: csvUuid.optional(),
  organizationIds: csvUuid.optional(),
  organizationAccountIds: csvUuid.optional(),
  storeIds: csvUuid.optional(),
  projectIds: csvUuid.optional(),
  contractIds: csvUuid.optional(),
  salesChannelIds: csvUuid.optional(),
  groupIds: csvUuid.optional(),
  ownerIds: csvUuid.optional(),
  productIds: csvUuid.optional(),
  consigneeIds: csvUuid.optional(),
  modifiedByIds: csvUuid.optional(),
  /** «Статус» — account-defined custom status (State row, entityType="demand"). */
  statusIds: csvUuid.optional(),
  /** «Общий доступ» — Demand.shared flag. */
  shared: boolFromString.optional(),
  /** «Адрес доставки» — Demand.shipmentAddress contains-match (case-insensitive). */
  shipmentAddress: z.string().max(500).optional(),
  /** «Комментарий к адресу доставки» — Demand.shipmentAddressFull JSON `comment`
   *  sub-field contains-match (the delivery address's comment). */
  shipmentAddressComment: z.string().max(500).optional(),
  /**
   * Custom-attribute («Дополнительные поля») filters — JSON-encoded array of
   * clauses sent by the inline filter as `?attrs=<json>` (e.g. the account's
   * «Уста» field). Decoded + validated here → typed AttrFilterClause[]; buildAttrWhere
   * maps each to a JSON-path WHERE over Demand.attributes. Mirror customer-order.
   */
  attrs: z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (!s) return undefined;
      try {
        return z.array(AttrFilterClauseSchema).max(50).parse(JSON.parse(s));
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'attrs: invalid JSON' });
        return z.NEVER;
      }
    }),
  /**
   * «Оплата» — payment progress computed against payedSumMinor / sumMinor
   * via Prisma 5 field references (no stored boolean). Demand carries the
   * `payedSumMinor` column, populated by the PaymentIn cascade.
   */
  paymentStatus: z.enum(['unpaid', 'partial', 'paid']).optional(),
  /**
   * «Тип возврата» — return progress computed against linked SalesReturn docs
   * (active = applicable, not deleted) summed vs the demand sum. moysklad options:
   *   none    «Без возвратов»        — no active returns reference this demand
   *   partial «Частично возвращено»  — 0 < Σreturned < demand sum
   *   full    «Полностью возвращено» — Σreturned ≥ demand sum (> 0)
   */
  returnStatus: z.enum(['none', 'partial', 'full']).optional(),
  /** «Проведено» — Demand.applicable flag. */
  applicable: boolFromString.optional(),
  /** «Напечатано» — Demand.printed flag. */
  printed: boolFromString.optional(),
  /** «Отправлено» — Demand.published flag. */
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
  // NOTE: «Кто изменил» (modifiedById/modifiedByIds) is wired via the auditLog
  // (Demand has no modifiedById column) — list() pre-queries the DISTINCT
  // entityIds this account's Demand rows were `update`d on by the given user
  // and narrows by id, mirroring invoice-out / loss.
  // NOTE: «Резерв» / «Отгрузка» (shipped progress) are NOT applicable to a
  // shipment doc — a Demand IS the shipment, so there is no shipped-vs-
  // ordered split (those belong to CustomerOrder). Skipped by design.
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  // moysklad 1:1 pager — 0-based page index for offset («M-N из total»)
  // pagination. When present the service uses skip/take instead of the cursor,
  // enabling true previous/first/LAST jumps. Cursor stays for back-compat.
  page: z.coerce.number().int().min(0).optional(),
  sortBy: z
    .enum([
      'moment',
      'name',
      'sumMinor',
      'payedSumMinor',
      'agent',
      // «Грузополучатель» — relation like `agent`; the list column offered no
      // sort while the neighbouring «Контрагент» did (prod QA 2026-07-31).
      'consignee',
      'organization',
      'store',
    ])
    .default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type DemandFilterInput = z.infer<typeof DemandFilterSchema>;
