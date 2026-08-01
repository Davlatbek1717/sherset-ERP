import { z } from 'zod';
import { BulkIdsSchema } from '../shared/bulk.js';
import { csvUuid } from '../shared/csv.js';

const uuid = z.string().uuid();
const bigIntString = z
  .union([z.string(), z.number()])
  .transform((v) => BigInt(String(v)))
  .or(z.bigint());

export const OrderStateSchema = z.enum([
  'draft',
  'confirmed',
  'awaiting_payment',
  'paid',
  'partially_shipped',
  'fully_shipped',
  'closed',
  'cancelled',
]);
export type OrderState = z.infer<typeof OrderStateSchema>;

/**
 * Bulk «Статус ▾» quick-set — apply one account-defined custom status
 * (a State row, entityType="customerorder") to many orders, or `null` to
 * clear it. Distinct from BulkTransitionSchema (FSM `state`).
 */
export const BulkSetStatusSchema = BulkIdsSchema.extend({
  statusId: uuid.nullable(),
});
export type BulkSetStatusInput = z.infer<typeof BulkSetStatusSchema>;

export const CustomerOrderPositionInput = z.object({
  // Persisted position id — sent by the detail form for EXISTING lines so an
  // update edits the row IN PLACE (diff-upsert) instead of delete+recreate:
  // identity preservation keeps shippedQty and DemandPosition links alive.
  // Absent on /new payloads and on freshly added lines.
  id: uuid.optional(),
  assortmentKind: z.enum(['product', 'service', 'bundle', 'variant']).default('product'),
  assortmentId: uuid,
  quantity: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .pipe(z.number().positive("Miqdor 0 dan katta bo'lishi kerak")),
  priceMinor: bigIntString,
  discount: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .pipe(z.number().min(0).max(100))
    .optional()
    .default(0),
  vat: z.number().int().min(0).max(100).nullable().optional(),
  vatEnabled: z.boolean().default(true),
  // «Зарезерв.» — per-line reserve quantity (moysklad: editable per row). The
  // service clamps it to [0, quantity] and, after the order is written, reserves
  // exactly this much stock atomically (Serializable). Default 0 = no reserve, so
  // existing payloads that omit it behave exactly as before (zero-regression).
  reservedQty: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .pipe(z.number().min(0))
    .optional()
    .default(0),
});

export const CreateCustomerOrderSchema = z.object({
  name: z.string().max(100).optional(), // autogen if not provided
  // .nullish() (not .optional()): the edit form clears an empty «Внешний код»
  // by sending null — a bare .optional() rejected it ("Expected string,
  // received null") and 400'd every customer-order edit-save with no external
  // code (the common case). The other 7 sales/purchase docs already use
  // .nullish() here; this was the one missed in that sweep. Found by Phase-2
  // browser QA during the optimistic-lock rollout. Service + DB column are
  // null-safe (column is String?, update guards on !== undefined).
  externalCode: z.string().max(50).nullish(),
  agentId: uuid,
  organizationId: uuid,
  storeId: uuid,
  /** Optional contract — moysklad's "Договор" field. */
  contractId: uuid.nullable().optional(),
  /** Optional project — moysklad's "Проект" field. */
  projectId: uuid.nullable().optional(),
  /** Optional sales channel — moysklad's "Канал продаж" field. */
  salesChannelId: uuid.nullable().optional(),
  /** Optional user-defined «Статус» (moysklad custom document status, e.g.
   *  «Текширилмаган») — a State row with entityType="customerorder". Separate
   *  from the `state` FSM lifecycle; null clears it. */
  statusId: uuid.nullable().optional(),
  /** moysklad parity (§15 live capture) — org/agent bank accounts
   *  (shown next to Организация / Контрагент). Cols exist in DB. */
  organizationAccountId: uuid.nullable().optional(),
  agentAccountId: uuid.nullable().optional(),
  /** Document currency — moysklad's "Валюта документа" dropdown.
   *  ISO-4217 alpha-3 (UZS / USD / RUB / EUR). Optional on create
   *  (defaults to UZS at the DB level); optional on update. */
  currency: z.string().length(3).optional(),
  /** Document FX rate × 10^8 (BigInt micro-precision); UZS = 100000000 (rate 1.0).
   *  The /new + edit forms send it from the «Валюта» rate editor. WITHOUT this
   *  field Zod stripped it, so every order silently persisted at the DB default
   *  rate 1.0 — mis-valuing non-UZS orders in base-currency reports/balances. */
  rateValue: bigIntString.optional(),
  /** «Владелец» / «Владелец-отдел» / «Общий доступ» — the create form's owner
   *  popover sends these. WITHOUT declaring them Zod stripped them, so create()
   *  hardcoded owner=creator / group=creator-dept / shared=false and the user's
   *  pick vanished. ownerId + groupId are tenant-validated in the service. */
  ownerId: uuid.nullable().optional(),
  groupId: uuid.nullable().optional(),
  shared: z.boolean().optional(),
  /** Single-line denormalised delivery address (legacy). */
  shipmentAddress: z.string().max(500).nullable().optional(),
  /** Structured delivery address — moysklad's expandable group. */
  shipmentAddressFull: z
    .object({
      country: z.string().optional(),
      index: z.string().optional(),
      city: z.string().optional(),
      street: z.string().optional(),
      building: z.string().optional(),
      apartment: z.string().optional(),
      other: z.string().optional(),
    })
    .nullable()
    .optional(),
  moment: z.string().datetime().optional(),
  deliveryPlannedMoment: z.string().datetime().nullable().optional(),
  // .nullish() (not bare .optional()): the edit form ALWAYS sends `description:
  // form.description || null` (page.tsx:389), so an order with an empty description
  // (the common case) sends null and a bare .optional() 400'd the save ("Expected
  // string, received null"). The externalCode straggler (line 48) was fixed in the
  // sales/purchase sweep but description was missed; column is String? (null-safe).
  description: z.string().nullish(),
  vatEnabled: z.boolean().default(true),
  vatIncluded: z.boolean().default(false),
  // «Проведено» on save — moysklad parity: ticking «Проведено» + Сохранить
  // creates AND confirms the order (state→confirmed, reserves the requested
  // lines) in one action. When true, create() runs the verified
  // transition('confirmed') path. Was silently dropped (FE sent it, schema omitted).
  applicable: z.boolean().optional(),
  positions: z.array(CustomerOrderPositionInput).default([]),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateCustomerOrderSchema = CreateCustomerOrderSchema.partial().extend({
  version: z.number().int().nonnegative(),
});

const boolFromString = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

/**
 * One custom-attribute (доп.поля) filter clause. moysklad surfaces every active
 * CustomerOrder attribute as its own filter field (climart shows «Уста» — a
 * Контрагент reference — and «Санаси» — a date). The clause carries either a
 * single `value` (equality / contains, depending on the attribute's type) or a
 * `from`/`to` date range. `code` must match a real CustomerOrder
 * AttributeMetadata.code — validated against the live metadata in the service so
 * an unknown / archived code is ignored (never an injection vector: Prisma
 * parameterises the JSON path).
 */
export const AttrFilterClauseSchema = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]{1,49}$/),
  value: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
export type AttrFilterClause = z.infer<typeof AttrFilterClauseSchema>;

export const CustomerOrderFilterSchema = z.object({
  search: z.string().optional(),
  state: OrderStateSchema.optional(),
  /** moysklad «Статус» list filter — by the account's custom order status. */
  statusId: uuid.optional(),
  agentId: uuid.optional(),
  agentIds: csvUuid.optional(),
  /** "Группа контрагента" — filters via the agent (Counterparty) relation's groupId. */
  agentGroupId: uuid.optional(),
  /** "Счёт контрагента" — CustomerOrder.agentAccountId. */
  agentAccountId: uuid.optional(),
  organizationId: uuid.optional(),
  organizationIds: csvUuid.optional(),
  organizationAccountId: uuid.optional(),
  storeId: uuid.optional(),
  /** Project FK — moysklad's "Проект" filter. */
  projectId: uuid.optional(),
  /** Contract FK — moysklad's "Договор" filter. */
  contractId: uuid.optional(),
  /** Sales-channel FK — moysklad's "Канал продаж" filter. */
  salesChannelId: uuid.optional(),
  /** "Владелец-отдел" — CustomerOrder.groupId (owner department). */
  groupId: uuid.optional(),
  /** Product FK — narrows to orders containing this assortment id. */
  productId: uuid.optional(),
  /** Payment progress (computed against payedSumMinor / sumMinor). */
  paymentStatus: z.enum(['unpaid', 'partial', 'paid']).optional(),
  /**
   * Shipment progress (computed against shippedSumMinor / sumMinor).
   * `overdue` = planned ship date passed and the order is not fully shipped
   * (moysklad's «Просрочено» option in the «Отгружено» filter).
   */
  shippedStatus: z.enum(['unshipped', 'partial', 'shipped', 'overdue']).optional(),
  /** "Резерв" — reservation progress against reservedSumMinor / sumMinor. */
  reservedStatus: z.enum(['none', 'partial', 'full']).optional(),
  applicable: boolFromString.optional(),
  /** "Напечатано" — CustomerOrder.printed flag. */
  printed: boolFromString.optional(),
  /** "Отправлено" — CustomerOrder.published flag. */
  published: boolFromString.optional(),
  /** "Общий доступ" — CustomerOrder.shared flag. */
  shared: boolFromString.optional(),
  ownerId: uuid.optional(),
  // NOTE: «Кто изменил» (modifiedById) is deferred — CustomerOrder has
  // no `updatedById` column yet. Add such a column before wiring this
  // filter (mirrors the purchase-order modifiedById field).
  /** ISO date (yyyy-mm-dd) — inclusive lower bound on `moment`. */
  momentFrom: z.string().optional(),
  /** ISO date (yyyy-mm-dd) — inclusive upper bound on `moment`. */
  momentTo: z.string().optional(),
  /**
   * «План. дата отгрузки» — moysklad parity (grounded 2026-07-31 on the live
   * #customerorder filter panel, where it sits in the first row next to
   * «Отгружено»). Filters `deliveryPlannedMoment` between the two ISO dates,
   * exactly like momentFrom/To. Orders with a NULL planned date are excluded
   * once either bound is set — a row with no date cannot satisfy a range.
   */
  deliveryPlannedFrom: z.string().optional(),
  deliveryPlannedTo: z.string().optional(),
  /**
   * «Адрес доставки» — moysklad parity (same capture). Case-insensitive
   * substring match on `shipmentAddress`, the flat one-line address the
   * detail form edits.
   */
  shipmentAddress: z.string().max(500).optional(),
  /**
   * «Владелец контрагента» — moysklad parity (same capture). Filters by the
   * OWNER OF THE COUNTERPARTY (Counterparty.ownerId), not the order's own
   * `ownerId`; the two are different people and moysklad lists both filters.
   */
  agentOwnerId: uuid.optional(),
  /**
   * «Срок задачи» — moysklad parity (grounded 2026-07-31: the live filter panel
   * renders it with the same вч·сег·нед·мес day shortcuts as «Период»). Matches
   * orders that have at least one OPEN task whose `dueAt` falls in the range.
   *
   * Task links to documents polymorphically (entity/entityId strings, no Prisma
   * relation), so the service resolves it as a two-step id lookup rather than a
   * relation filter.
   *
   * NOT implemented: «Ближайшая задача» (#20) — the live capture renders it as a
   * combobox whose options are not visible in a static DOM dump, so there is
   * nothing to ground the semantics on (CLAUDE.md §4 → defer, don't guess).
   */
  taskDueFrom: z.string().optional(),
  taskDueTo: z.string().optional(),
  /**
   * "Когда изменен" — moysklad parity. Filters on `updatedAt` between
   * the two ISO dates (mirror momentFrom/To).
   */
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  /** Lower bound on sumMinor (tiyin). */
  sumMinorFrom: z.coerce.number().int().nonnegative().optional(),
  /** Upper bound on sumMinor (tiyin). */
  sumMinorTo: z.coerce.number().int().nonnegative().optional(),
  /**
   * Custom-attribute (доп.поля) filters — a JSON-encoded array of clauses,
   * sent by the inline filter as `?attrs=<json>`. Decoded + validated here so
   * the rest of the service sees a typed `AttrFilterClause[]`. An empty / absent
   * param yields undefined (no attr filtering). Invalid JSON is a 400.
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
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(250).default(25),
  sortBy: z
    .enum([
      'name',
      'moment',
      'createdAt',
      'updatedAt',
      'sumMinor',
      'payedSumMinor',
      'invoicedSumMinor',
      'shippedSumMinor',
      'reservedSumMinor',
      // Relational sorts — handled in service via per-key orderBy
      // construction (joined tables) instead of `{ [sortBy]: dir }`.
      'agent',
      'organization',
    ])
    .default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateCustomerOrderInput = z.infer<typeof CreateCustomerOrderSchema>;
export type UpdateCustomerOrderInput = z.infer<typeof UpdateCustomerOrderSchema>;
export type CustomerOrderFilter = z.infer<typeof CustomerOrderFilterSchema>;
