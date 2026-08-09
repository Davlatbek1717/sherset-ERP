import { z } from 'zod';
import { IsoDateTime, MinorAmount, Uuid } from './wire.js';

/**
 * DOCUMENT LIST ROWS — the payload of the four big `GET /<documents>` grids.
 *
 * These are the pages audit finding `FE-12` was actually about: `/demands`
 * hand-declared a 40-field `DemandRow` describing a response nothing compares
 * against the server. Drop one `include` in `demand.service.ts#list` and the
 * page renders `undefined` in a column with a green `tsc`.
 *
 * Each schema below is a documented LOWER BOUND: `list()` uses a Prisma
 * `include`, so the wire response carries every scalar of the model plus the
 * relations selected here. The keys written down are the ones the grid reads,
 * and `provenance.ts` ties every one of them to the place in `apps/api` that
 * produces it.
 *
 * Wire rules apply throughout (see `wire.ts`): `BigInt` money columns are
 * decimal STRINGS, `DateTime` columns are ISO strings.
 */

/** `{ id, name }` relation projection — the shape of almost every `select` here. */
const NamedRef = z.object({ id: Uuid, name: z.string() });

/**
 * Counterparty as a document list projects it. `legalTitle` («Полное
 * наименование») is selected ALONGSIDE `name` by every document list service —
 * the grids fall back to it when the short name is blank.
 */
export const AgentRefSchema = z.object({
  id: Uuid,
  name: z.string(),
  legalTitle: z.string().nullable(),
});
export type AgentRef = z.infer<typeof AgentRefSchema>;

/**
 * moysklad «Статус» — the account-defined custom status pill (a `State` row),
 * which is ORTHOGONAL to the FSM `state` (`draft`/`posted`/`cancelled`).
 * Conflating the two is a recurring parity bug: the coloured pill in the grid
 * is this one, `state` is the lifecycle.
 */
export const DocumentStatusRefSchema = z.object({
  id: Uuid,
  name: z.string(),
  color: z.string().nullable(),
});
export type DocumentStatusRef = z.infer<typeof DocumentStatusRefSchema>;

/**
 * `GET /demands` row — «Отгрузки».
 *
 * The widest list payload in the app, and the one the audit named. Five of its
 * keys are NOT columns and NOT relations: `returnSumMinor`, `modifiedByName`,
 * `group`, `shipmentAddressComment` and `attributeDisplay` are assembled by
 * `demand.service.ts#enrichListRows` in batch after the query. They have their
 * own provenance source for exactly that reason — a refactor that drops the
 * enrichment step would leave the `include` intact and the columns empty.
 */
export const DemandRowSchema = z.object({
  id: Uuid,
  name: z.string(),
  /** FSM lifecycle: `draft` | `posted` | `cancelled`. NOT the «Статус» pill. */
  state: z.string(),
  applicable: z.boolean(),
  sumMinor: MinorAmount,
  payedSumMinor: MinorAmount,
  currency: z.string(),
  printed: z.boolean(),
  published: z.boolean(),
  description: z.string().nullable(),
  moment: IsoDateTime,
  agent: AgentRefSchema,
  organization: NamedRef,
  store: NamedRef,
  owner: NamedRef.nullable(),
  customerOrder: NamedRef.nullable(),
  /** «Грузополучатель». */
  consignee: NamedRef.nullable(),
  status: DocumentStatusRefSchema.nullable(),
  /** «Счёт контрагента» — gear column, hidden by default. */
  agentAccount: z
    .object({ id: Uuid, accountNumber: z.string(), bankName: z.string().nullable() })
    .nullable(),
  /** «Счёт организации» — gear column, hidden by default. */
  organizationAccount: z
    .object({ id: Uuid, accountNumber: z.string().nullable(), name: z.string() })
    .nullable(),
  project: NamedRef.nullable(),
  contract: NamedRef.nullable(),
  salesChannel: NamedRef.nullable(),
  overheadSumMinor: MinorAmount,
  /** «Сумма возвратов» — Σ active SalesReturn, computed in `enrichListRows`. */
  returnSumMinor: MinorAmount,
  shipmentAddress: z.string().nullable(),
  /** «Комментарий к адресу доставки» — read out of the `shipmentAddressFull` JSON. */
  shipmentAddressComment: z.string().nullable(),
  shared: z.boolean(),
  /** «Владелец-отдел» — resolved from the `groupId` scalar in `enrichListRows`. */
  group: NamedRef.nullable(),
  updatedAt: IsoDateTime,
  /** «Кто изменил» — last auditLog actor, resolved in `enrichListRows`. */
  modifiedByName: z.string().nullable(),
  attributes: z.record(z.unknown()).nullable(),
  /** reference-attribute code → resolved entity name, built in `enrichListRows`. */
  attributeDisplay: z.record(z.string()),
  _count: z.object({ positions: z.number().int() }),
});
export type DemandRow = z.infer<typeof DemandRowSchema>;

/** `GET /customer-orders` row — «Заказы покупателей». */
export const CustomerOrderRowSchema = z.object({
  id: Uuid,
  name: z.string(),
  state: z.string(),
  status: DocumentStatusRefSchema.nullable(),
  applicable: z.boolean(),
  sumMinor: MinorAmount,
  payedSumMinor: MinorAmount,
  shippedSumMinor: MinorAmount,
  invoicedSumMinor: MinorAmount,
  reservedSumMinor: MinorAmount,
  currency: z.string(),
  moment: IsoDateTime,
  deliveryPlannedMoment: IsoDateTime.nullable(),
  printed: z.boolean(),
  published: z.boolean(),
  description: z.string().nullable(),
  agent: AgentRefSchema,
  organization: NamedRef,
  store: NamedRef,
  owner: NamedRef.nullable(),
});
export type CustomerOrderRow = z.infer<typeof CustomerOrderRowSchema>;

/** `GET /supplies` row — «Приёмки». */
export const SupplyRowSchema = z.object({
  id: Uuid,
  name: z.string(),
  state: z.string(),
  applicable: z.boolean(),
  sumMinor: MinorAmount,
  payedSumMinor: MinorAmount,
  currency: z.string(),
  printed: z.boolean(),
  published: z.boolean(),
  description: z.string().nullable(),
  /** Supplier's declared receiving date («Входящая дата»). */
  incomingDate: IsoDateTime.nullable(),
  moment: IsoDateTime,
  /** Supplier's own invoice number («Входящий номер»). */
  incomingNumber: z.string().nullable(),
  agent: AgentRefSchema,
  organization: NamedRef,
  store: NamedRef,
  owner: NamedRef.nullable(),
  status: DocumentStatusRefSchema.nullable(),
  _count: z.object({ positions: z.number().int() }),
});
export type SupplyRow = z.infer<typeof SupplyRowSchema>;

/**
 * `GET /invoices-out` row — «Счета покупателям».
 *
 * `store` is nullable here and NOT nullable on demand/supply: `InvoiceOut`
 * carries an optional `storeId` (an invoice need not name a warehouse), while a
 * shipment/receipt always does.
 */
export const InvoiceOutRowSchema = z.object({
  id: Uuid,
  name: z.string(),
  state: z.string(),
  applicable: z.boolean(),
  sumMinor: MinorAmount,
  payedSumMinor: MinorAmount,
  shippedSumMinor: MinorAmount,
  currency: z.string(),
  moment: IsoDateTime,
  paymentPlannedMoment: IsoDateTime.nullable(),
  printed: z.boolean(),
  published: z.boolean(),
  description: z.string().nullable(),
  agent: AgentRefSchema,
  organization: NamedRef,
  store: NamedRef.nullable(),
  owner: NamedRef.nullable(),
  customerOrder: NamedRef.nullable(),
  status: DocumentStatusRefSchema.nullable(),
  _count: z.object({ positions: z.number().int() }),
});
export type InvoiceOutRow = z.infer<typeof InvoiceOutRowSchema>;
