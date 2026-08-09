import type { ZodTypeAny } from 'zod';
import { z } from 'zod';
import { CurrentSessionSchema } from './cashier-session.js';
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
  /** The `select`/`include` block inside a named service method. */
  | { kind: 'select'; service: string; method: string; why: string }
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
