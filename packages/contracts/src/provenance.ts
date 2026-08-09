import type { ZodTypeAny } from 'zod';
import { z } from 'zod';
import { CurrentSessionSchema } from './cashier-session.js';
import { CounterpartyRowSchema } from './counterparty.js';
import {
  CustomerOrderRowSchema,
  DemandRowSchema,
  InvoiceOutRowSchema,
  SupplyRowSchema,
} from './document-list.js';
import { PosProductRowSchema } from './product.js';
import { CashDeskRowSchema, OrganizationRefSchema, StoreRefSchema } from './reference.js';

/**
 * PROVENANCE REGISTRY — why a contract cannot be decorative.
 *
 * A shared type is only worth having if something breaks when the server drifts
 * away from it. A hand-written `interface` on a page has no such tether: that is
 * the whole of FE-12, and it is how `session.cashier.name` reached production
 * as `undefined` (2026-06-08k) with a green typecheck.
 *
 * So every schema exported from this package must declare WHERE ON THE SERVER
 * each of its keys comes from. `apps/api` runs one data-driven test over this
 * table (`contract-conformance.test.ts`): for each entry it flattens the
 * schema's keys, reads the declared server sources out of the real source
 * files, and fails if any contract key is unaccounted for. Adding a schema
 * without adding it here fails too — the registry is checked for completeness
 * against the package's own exports.
 *
 * What this DOES prove: every key the FE relies on is produced by the server
 * today, and a rename/dropped-`include` will fail a test instead of a screen.
 * What it does NOT prove: types (a column changing `Int → String` passes), or
 * that the endpoint is reachable. Those stay Phase-2 browser/runtime work.
 */

/** A place on the server that demonstrably produces a set of response keys. */
export type ProvenanceSource =
  /** Prisma model whose scalar columns are returned wholesale (service uses `include`, not `select`). */
  | { kind: 'model'; model: string; why: string }
  /**
   * The `select`/`include` block inside a named service method.
   *
   * `block` picks WHICH block to read. The default anchors on the first
   * `select:` OR `include:` in the method, which is right for services whose
   * query is the first thing they build. It is WRONG for methods that run a
   * lookup first — `counterparty.service.ts#list` opens with an
   * `attributeMetadata.findMany({ select: { code: true } })` while building the
   * filter, so the default anchor would read a one-key block and quietly
   * "prove" almost nothing. `block: 'include'` anchors on the row `include:`.
   */
  | { kind: 'select'; service: string; method: string; block?: 'include'; why: string }
  /** Every object-literal key inside a named service/repository method (for hand-built blocks). */
  | { kind: 'method'; service: string; method: string; why: string }
  /** A named `z.object({...})` in an apps/api Zod schema — the literal server-Zod ↔ FE-type check. */
  | { kind: 'zod'; file: string; name: string; why: string };

export interface ContractProvenance {
  /** Exported schema name, for test output. */
  contract: string;
  /** The HTTP route this schema describes. */
  endpoint: string;
  schema: ZodTypeAny;
  sources: ProvenanceSource[];
  /**
   * Keys deliberately not traceable to a source, each with a reason. An empty
   * list is the norm; anything here is visible technical debt, not a silent
   * escape hatch.
   */
  exempt?: Array<{ key: string; why: string }>;
}

const API = 'apps/api/src/modules';
const CASHIER_SESSION_SERVICE = `${API}/cashier-session/cashier-session.service.ts`;
const PRODUCT_REPOSITORY = `${API}/product/product.repository.ts`;
const DEMAND_SERVICE = `${API}/demand/demand.service.ts`;
const CUSTOMER_ORDER_SERVICE = `${API}/customer-order/customer-order.service.ts`;
const COUNTERPARTY_SERVICE = `${API}/counterparty/counterparty.service.ts`;
const SUPPLY_SERVICE = `${API}/supply/supply.service.ts`;
const INVOICE_OUT_SERVICE = `${API}/invoice-out/invoice-out.service.ts`;

/**
 * Every document list service follows the same two-source shape: `list()` runs
 * one `findMany` with an `include`, so the response carries (1) every scalar of
 * the Prisma model and (2) the relation keys named in that `include`.
 */
const documentListSources = (model: string, service: string): ProvenanceSource[] => [
  {
    kind: 'model',
    model,
    why: `${service} \`list\` uses a Prisma \`include\`, so every ${model} scalar is on the wire.`,
  },
  {
    kind: 'select',
    service,
    method: 'list',
    why: 'The relation projections the grid renders (agent / organization / store / owner / status / …). Dropping one leaves a column empty with a green typecheck — the FE-12 failure mode.',
  },
];

export const CONTRACT_PROVENANCE: ContractProvenance[] = [
  {
    contract: 'CurrentSessionSchema',
    endpoint: 'GET /cashier-sessions/current',
    schema: CurrentSessionSchema,
    sources: [
      {
        kind: 'model',
        model: 'CashierSession',
        why: 'findCurrentForCashier uses `include`, so every CashierSession scalar is returned.',
      },
      {
        kind: 'select',
        service: CASHIER_SESSION_SERVICE,
        method: 'findCurrentForCashier',
        why: 'The four relation includes. Dropping `cashier` here is precisely what crashed the POS register in 2026-06-08k.',
      },
    ],
  },
  {
    contract: 'CashDeskRowSchema',
    endpoint: 'GET /cash-desks',
    schema: CashDeskRowSchema,
    sources: [
      {
        kind: 'model',
        model: 'CashDesk',
        why: 'cash-desk.service.ts `list` spreads the whole row (`{ ...r, balanceMinor: … }`).',
      },
    ],
  },
  {
    contract: 'StoreRefSchema',
    endpoint: 'GET /stores',
    schema: StoreRefSchema,
    sources: [
      {
        kind: 'model',
        model: 'Store',
        why: 'store.service.ts `list` maps rows through serializeStore, which spreads the whole row.',
      },
    ],
  },
  {
    contract: 'OrganizationRefSchema',
    endpoint: 'GET /organizations',
    schema: OrganizationRefSchema,
    sources: [
      {
        kind: 'model',
        model: 'Organization',
        why: 'organization.service.ts `list` returns whole rows.',
      },
    ],
  },
  {
    contract: 'PosProductRowSchema',
    endpoint: 'GET /products',
    schema: PosProductRowSchema,
    sources: [
      {
        kind: 'model',
        model: 'Product',
        why: 'product.repository.ts `list` uses `include`, so every Product scalar is returned.',
      },
      {
        kind: 'method',
        service: PRODUCT_REPOSITORY,
        method: 'attachStock',
        why: 'The live `stock` block is hand-built here, not selected from a column.',
      },
      {
        kind: 'zod',
        file: `${API}/product/product.schema.ts`,
        name: 'SalePriceSchema',
        why: 'Entries of the salePrices JSON column are validated by this server Zod schema — the direct server-Zod ↔ FE-type tie.',
      },
    ],
  },
  {
    contract: 'DemandRowSchema',
    endpoint: 'GET /demands',
    schema: DemandRowSchema,
    sources: [
      ...documentListSources('Demand', DEMAND_SERVICE),
      {
        kind: 'method',
        service: DEMAND_SERVICE,
        method: 'enrichListRows',
        why: 'Five grid columns («Сумма возвратов» / «Кто изменил» / «Владелец-отдел» / «Комментарий к адресу доставки» / attribute display names) are assembled here in batch, AFTER the query. A refactor that drops this step leaves the `include` intact and the columns silently empty.',
      },
    ],
  },
  {
    contract: 'CustomerOrderRowSchema',
    endpoint: 'GET /customer-orders',
    schema: CustomerOrderRowSchema,
    sources: documentListSources('CustomerOrder', CUSTOMER_ORDER_SERVICE),
  },
  {
    contract: 'SupplyRowSchema',
    endpoint: 'GET /supplies',
    schema: SupplyRowSchema,
    sources: documentListSources('Supply', SUPPLY_SERVICE),
  },
  {
    contract: 'InvoiceOutRowSchema',
    endpoint: 'GET /invoices-out',
    schema: InvoiceOutRowSchema,
    sources: documentListSources('InvoiceOut', INVOICE_OUT_SERVICE),
  },
  {
    contract: 'CounterpartyRowSchema',
    endpoint: 'GET /counterparties',
    schema: CounterpartyRowSchema,
    sources: [
      {
        kind: 'model',
        model: 'Counterparty',
        why: 'counterparty.service.ts `list` uses a Prisma `include` and spreads the row (`...rest`), so every Counterparty scalar is on the wire.',
      },
      {
        kind: 'select',
        service: COUNTERPARTY_SERVICE,
        method: 'list',
        block: 'include',
        why: 'The relation projections (owner / modifiedBy / group / groups / state / priceType). `block: include` is REQUIRED here — the method opens with an attributeMetadata `select: { code: true }` for the custom-field filter, and the default anchor would read that one-key block instead.',
      },
      {
        kind: 'method',
        service: COUNTERPARTY_SERVICE,
        method: 'list',
        why: 'The CRM aggregates (balanceMinor / salesCount / salesAmount / first+lastSaleDate / averageCheckMinor / profitMinor / returns* / bank* / event* / discountSumMinor) are hand-assembled from four batched queries in this same method — no column produces them. Four of them are emitted as SHORTHAND properties, which the key extractor was blind to until Faza Q15.',
      },
      {
        kind: 'zod',
        file: `${API}/counterparty/counterparty.schema.ts`,
        name: 'UzRequisitesSchema',
        why: 'inn / pinfl / kpp / birthDate / gender live inside the `uzRequisites` JSON column — no column and no select produces them, but the server validates writes with this Zod schema, so it is the real tether. (Our `gender` is a widened `string` where the server writes `enum([male, female])` — the FE must render whatever is stored, including legacy values.)',
      },
    ],
  },
];

/**
 * Flatten a Zod schema to every property name it mentions, at any depth,
 * looking through optional / nullable / array / default / effects wrappers.
 *
 * Used by the conformance test to ask "is this key produced anywhere?". It is
 * intentionally structure-blind: nesting the right key under the wrong parent
 * is not the failure mode we have ever hit, whereas a key vanishing from a
 * `select` is one we have shipped to production.
 */
export function flattenSchemaKeys(schema: ZodTypeAny, seen = new Set<ZodTypeAny>()): Set<string> {
  const keys = new Set<string>();
  if (seen.has(schema)) return keys;
  seen.add(schema);

  const unwrap = (inner: ZodTypeAny) => {
    for (const k of flattenSchemaKeys(inner, seen)) keys.add(k);
  };

  if (schema instanceof z.ZodObject) {
    for (const [key, value] of Object.entries(schema.shape as Record<string, ZodTypeAny>)) {
      keys.add(key);
      unwrap(value);
    }
    return keys;
  }
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    unwrap(schema.unwrap() as ZodTypeAny);
    return keys;
  }
  if (schema instanceof z.ZodArray) {
    unwrap(schema.element as ZodTypeAny);
    return keys;
  }
  if (schema instanceof z.ZodDefault) {
    unwrap(schema._def.innerType as ZodTypeAny);
    return keys;
  }
  if (schema instanceof z.ZodEffects) {
    unwrap(schema.innerType() as ZodTypeAny);
    return keys;
  }
  if (schema instanceof z.ZodUnion) {
    for (const option of schema.options as ZodTypeAny[]) unwrap(option);
    return keys;
  }
  return keys;
}
