/**
 * `@moysklad/contracts` — one place where an API response shape is written down.
 *
 * The problem it solves (audit finding `FE-12`): every web page hand-declares
 * the shape of the JSON it fetches. 92 files declare their own `ListResponse`;
 * `/cashier-sessions/current` was declared twice with contradictory nullability;
 * `/products` was declared twice with different field sets. Nothing compares
 * any of it against the server, so a changed response is invisible to
 * `tsc` and shows up as a runtime crash instead.
 *
 * The rule that makes this package different from moving those interfaces into
 * a shared file: **a schema here must declare its server provenance**
 * (`provenance.ts`), and `apps/api` fails a test if the server stops producing
 * any key a contract claims. See that file for what the check does and does
 * not prove.
 *
 * Consumption:
 *   - web  → `import type { CurrentSession } from '@moysklad/contracts'`
 *            (type-only: nothing reaches the bundle)
 *   - api  → imports the runtime schemas in tests only, so the source-only
 *            package never has to be built for `tsc` to emit.
 */
export { listEnvelope, type ListEnvelope } from './envelope.js';
export {
  CurrentSessionResponseSchema,
  CurrentSessionSchema,
  SessionStateSchema,
  type CurrentSession,
  type CurrentSessionResponse,
  type SessionState,
} from './cashier-session.js';
export {
  PosProductRowSchema,
  ProductStockSchema,
  SalePriceEntrySchema,
  type PosProductRow,
  type ProductStock,
  type SalePriceEntry,
} from './product.js';
export {
  AgentRefSchema,
  CustomerOrderRowSchema,
  DemandRowSchema,
  DocumentStatusRefSchema,
  InvoiceOutRowSchema,
  SupplyRowSchema,
  type AgentRef,
  type CustomerOrderRow,
  type DemandRow,
  type DocumentStatusRef,
  type InvoiceOutRow,
  type SupplyRow,
} from './document-list.js';
export {
  CounterpartyRowSchema,
  UzRequisitesSchema,
  type CounterpartyRow,
  type UzRequisites,
} from './counterparty.js';
export {
  CashDeskRefSchema,
  CashDeskRowSchema,
  OrganizationRefSchema,
  StoreRefSchema,
  UserRefSchema,
  type CashDeskRef,
  type CashDeskRow,
  type OrganizationRef,
  type StoreRef,
  type UserRef,
} from './reference.js';
export {
  CONTRACT_PROVENANCE,
  flattenSchemaKeys,
  type ContractProvenance,
  type ProvenanceSource,
} from './provenance.js';
export { DecimalString, IsoDateTime, MinorAmount, Uuid } from './wire.js';
