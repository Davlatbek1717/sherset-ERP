#!/usr/bin/env tsx
/**
 * migrate-moysklad-data.ts — Real account → Test account sampled migration.
 *
 * Reads from real (READ-ONLY, GET only) using MOYSKLAD_REAL_API_TOKEN,
 * writes to test using MOYSKLAD_API_TOKEN. ID-map saved to
 * `.migration-id-map.json` (gitignored) — resumable.
 *
 * Rate-limit: moysklad allows 45 req / 3 sec; script throttles to 12/sec.
 *
 * Usage:
 *   pnpm migrate-moysklad real-to-test
 *   pnpm migrate-moysklad real-to-test --phase=master
 *   pnpm migrate-moysklad real-to-test --resume
 *   pnpm migrate-moysklad real-to-test --reset
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://api.moysklad.ru/api/remap/1.2';
const ID_MAP_PATH = join(process.cwd(), '.migration-id-map.json');

const REAL_TOKEN = process.env.MOYSKLAD_REAL_API_TOKEN;
const TEST_TOKEN = process.env.MOYSKLAD_API_TOKEN;
if (!REAL_TOKEN || !TEST_TOKEN) {
  console.error('Set MOYSKLAD_REAL_API_TOKEN and MOYSKLAD_API_TOKEN in .env.local');
  process.exit(1);
}

interface EntityConfig {
  name: string;
  endpoint: string; // path under /entity/
  sample: number; // max items
  /**
   * Server-managed fields to strip before POST. Strip these so the test
   * account assigns fresh values instead of inheriting real-account IDs.
   */
  stripFields?: string[];
  /**
   * For document entities — should we migrate positions too?
   */
  hasPositions?: boolean;
  /**
   * Skip entirely. Used when an endpoint requires a paid tariff or a
   * setup step the test account doesn't have.
   */
  skip?: boolean;
}

// Phases run in order. Within a phase, entities are independent of each
// other (no cross-FK), so they can run sequentially without deadlocks.
const PHASES: EntityConfig[][] = [
  // Phase 1 — primitives (no FK to anything)
  [
    { name: 'currency', endpoint: 'entity/currency', sample: 50 },
    { name: 'uom', endpoint: 'entity/uom', sample: 100 },
    { name: 'group', endpoint: 'entity/group', sample: 50 },
    { name: 'productfolder', endpoint: 'entity/productfolder', sample: 50 },
    {
      name: 'pricetype',
      endpoint: 'context/companysettings/pricetype',
      sample: 50,
    },
  ],
  // Phase 2 — master data (FK to phase 1)
  [
    { name: 'organization', endpoint: 'entity/organization', sample: 20 },
    { name: 'store', endpoint: 'entity/store', sample: 20 },
    { name: 'counterparty', endpoint: 'entity/counterparty', sample: 100 },
    { name: 'product', endpoint: 'entity/product', sample: 200 },
    { name: 'service', endpoint: 'entity/service', sample: 50 },
    { name: 'project', endpoint: 'entity/project', sample: 20 },
    { name: 'employee', endpoint: 'entity/employee', sample: 20 },
    { name: 'contract', endpoint: 'entity/contract', sample: 20 },
  ],
  // Phase 3 — documents (FK to phase 1+2). Positions migrated inline.
  [
    { name: 'purchaseorder', endpoint: 'entity/purchaseorder', sample: 150, hasPositions: true },
    { name: 'customerorder', endpoint: 'entity/customerorder', sample: 150, hasPositions: true },
    { name: 'supply', endpoint: 'entity/supply', sample: 150, hasPositions: true },
    { name: 'demand', endpoint: 'entity/demand', sample: 150, hasPositions: true },
    { name: 'invoicein', endpoint: 'entity/invoicein', sample: 150, hasPositions: true },
    { name: 'invoiceout', endpoint: 'entity/invoiceout', sample: 150, hasPositions: true },
    { name: 'paymentin', endpoint: 'entity/paymentin', sample: 150 },
    { name: 'paymentout', endpoint: 'entity/paymentout', sample: 150 },
    { name: 'cashin', endpoint: 'entity/cashin', sample: 100 },
    { name: 'cashout', endpoint: 'entity/cashout', sample: 100 },
  ],
  // Phase 4 — returns + warehouse ops
  [
    { name: 'salesreturn', endpoint: 'entity/salesreturn', sample: 100, hasPositions: true },
    { name: 'purchasereturn', endpoint: 'entity/purchasereturn', sample: 100, hasPositions: true },
    { name: 'move', endpoint: 'entity/move', sample: 100, hasPositions: true },
    { name: 'loss', endpoint: 'entity/loss', sample: 100, hasPositions: true },
    { name: 'enter', endpoint: 'entity/enter', sample: 100, hasPositions: true },
    { name: 'inventory', endpoint: 'entity/inventory', sample: 100, hasPositions: true },
  ],
];

// Always strip — server-managed fields that will conflict.
const ALWAYS_STRIP = [
  'meta', // the entity's own self-href — NOT a FK; we discard before POST
  'id',
  'accountId',
  'created',
  'updated',
  'updatedBy',
  'owner',
  'group',
  'shared',
  'sum',
  'payedSum',
  'shippedSum',
  'invoicedSum',
  'reservedSum',
  'positions', // handled separately if hasPositions
  'attachments',
  'files',
  'syncId',
  'externalCode', // may conflict on retry
  'code', // may conflict on retry
  'updatedAt',
  'createdAt',
  'state', // requires per-entity state mapping; skip for now
  'attributes', // custom attributes; skip
  'taxSystem',
  'rate', // currency rate snapshot — moysklad recomputes
  'vatSum',
  'vatEnabled',
  'vatIncluded',
  // Document-specific
  'applicable', // posted state — recreate as drafts
  'printed',
  'published',
  'syncId',
];

interface IdMap {
  // key: "<entityType>:<realId>" → testId
  [key: string]: string;
}

let idMap: IdMap = existsSync(ID_MAP_PATH)
  ? JSON.parse(readFileSync(ID_MAP_PATH, 'utf8'))
  : {};

function saveIdMap(): void {
  writeFileSync(ID_MAP_PATH, JSON.stringify(idMap, null, 2), 'utf8');
}

let lastRequestAt = 0;
async function throttledFetch(url: string, init: RequestInit): Promise<Response> {
  // moysklad: 45/3s. Stay safer at 12/s → 83ms gap.
  const gap = 90;
  const since = Date.now() - lastRequestAt;
  if (since < gap) await new Promise((r) => setTimeout(r, gap - since));
  lastRequestAt = Date.now();
  return fetch(url, init);
}

async function api(token: string, method: string, url: string, body?: unknown): Promise<unknown> {
  // NOTE: do NOT set Accept-Encoding manually — Node 22's fetch auto-
  // negotiates gzip when the header is absent, and decompresses the
  // response. Setting it ourselves disables auto-decompression AND
  // appears to corrupt the request Content-Type negotiation (moysklad
  // returns 400 «Неверно указан Content-Type»).
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json;charset=utf-8');
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json;charset=utf-8');
    init.body = JSON.stringify(body);
  }
  if (process.env.MIGRATE_DEBUG && body !== undefined) {
    console.log(`>>> ${method} ${url}`);
    console.log(`>>> body keys:`, Object.keys(body as object).join(','));
    console.log(`>>> body sample:`, JSON.stringify(body).slice(0, 300));
  }
  const r = await throttledFetch(url, init);
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`${method} ${url} → ${r.status}: ${text.slice(0, 300)}`);
  }
  if (r.status === 204) return null;
  return r.json();
}

function extractIdFromHref(href: string): string {
  // Match any UUID-shaped path segment — moysklad uses several base
  // routes (entity/, context/companysettings/, etc.).
  const m = href.match(/\/([0-9a-f-]{36})(?:[?/]|$)/);
  if (!m || !m[1]) throw new Error(`Cannot extract UUID from href: ${href}`);
  return m[1];
}

function remapMeta(meta: { href: string; type: string }): { href: string; type: string; mediaType: string } | null {
  const oldId = extractIdFromHref(meta.href);
  let newId = idMap[`${meta.type}:${oldId}`];
  if (!newId) {
    // Fallback: pick any test entity of the same type. Audit reference
    // capture cares about UI shapes, not specific data fidelity — so a
    // document with a substituted counterparty still triggers all the UI
    // states we need (selection, picker dialog, balance line, etc.).
    const fallback = pickFallback(meta.type);
    if (!fallback) return null;
    newId = fallback;
    idMap[`${meta.type}:${oldId}`] = fallback; // cache so subsequent docs hit the same target
  }
  return {
    href: meta.href.replace(oldId, newId),
    type: meta.type,
    mediaType: 'application/json',
  };
}

/**
 * Walk an object tree and remap every `meta.href` whose entity type is
 * in the ID-map. Returns a new object with unmapped FKs dropped (set to
 * undefined) so the field is omitted from the POST body.
 */
function remapFKs(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => remapFKs(v)).filter((v) => v !== undefined);
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Reference with meta.href? Remap it.
    if (obj.meta && typeof obj.meta === 'object') {
      const meta = obj.meta as { href?: string; type?: string };
      if (typeof meta.href === 'string' && typeof meta.type === 'string') {
        const newMeta = remapMeta({ href: meta.href, type: meta.type });
        if (!newMeta) return undefined; // unmapped — drop
        return { ...obj, meta: newMeta };
      }
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const mapped = remapFKs(v);
      if (mapped !== undefined) out[k] = mapped;
    }
    return out;
  }
  return value;
}

function stripFields(obj: Record<string, unknown>, extra: string[] = []): Record<string, unknown> {
  const drop = new Set([...ALWAYS_STRIP, ...extra]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (drop.has(k)) continue;
    out[k] = v;
  }
  return out;
}

async function fetchPositions(token: string, entityType: string, entityId: string): Promise<unknown[]> {
  const url = `${BASE}/entity/${entityType}/${entityId}/positions?limit=1000`;
  const r = (await api(token, 'GET', url)) as { rows?: unknown[] } | null;
  return r?.rows ?? [];
}

async function postPositions(
  token: string,
  entityType: string,
  testEntityId: string,
  positions: unknown[],
): Promise<void> {
  // POST array of positions to /entity/<type>/<id>/positions
  const cleaned = positions
    .map((p) => {
      if (!p || typeof p !== 'object') return null;
      const stripped = stripFields(p as Record<string, unknown>);
      const remapped = remapFKs(stripped) as Record<string, unknown> | undefined;
      // Drop positions whose assortment (product reference) is unmapped
      if (!remapped || !remapped.assortment) return null;
      return remapped;
    })
    .filter(Boolean);
  if (cleaned.length === 0) return;
  await api(token, 'POST', `${BASE}/entity/${entityType}/${testEntityId}/positions`, cleaned);
}

/**
 * For globally-shared entities like Currency and Uom that have the same
 * codes across accounts (ISO standard), we don't POST — we read both
 * sides and build the id-map by matching on `code` (or `name`).
 */
/**
 * Map every real ID to the test account's first existing entity of the
 * same type. Used for entities where the trial test account caps the
 * count (organization: 1) or that come pre-seeded (pricetype: 1).
 *
 * Some endpoints (e.g. context/companysettings/pricetype) return a bare
 * array; others wrap in { rows: [...] }. Handle both.
 */
async function mapAllToFirst(cfg: EntityConfig): Promise<{ migrated: number; skipped: number }> {
  const real = (await api(REAL_TOKEN!, 'GET', `${BASE}/${cfg.endpoint}?limit=1000`)) as
    | { rows?: Array<{ id: string }> }
    | Array<{ id: string }>;
  const test = (await api(TEST_TOKEN!, 'GET', `${BASE}/${cfg.endpoint}?limit=10`)) as
    | { rows?: Array<{ id: string }> }
    | Array<{ id: string }>;
  const realRows = Array.isArray(real) ? real : (real.rows ?? []);
  const testRows = Array.isArray(test) ? test : (test.rows ?? []);
  const testId = testRows[0]?.id;
  if (!testId) return { migrated: 0, skipped: realRows.length };
  for (const r of realRows) {
    if (r.id) idMap[`${cfg.name}:${r.id}`] = testId;
  }
  saveIdMap();
  return { migrated: realRows.length, skipped: 0 };
}

/**
 * After a phase completes, scan the id-map and ensure every entity-type
 * has at least one "fallback" entry for unmapped FK resolution.
 */
function pickFallback(entityType: string): string | undefined {
  for (const [key, val] of Object.entries(idMap)) {
    if (key.startsWith(`${entityType}:`)) return val;
  }
  return undefined;
}

async function migrateByLookup(cfg: EntityConfig, matchField: 'code' | 'isoCode' | 'name'): Promise<{ migrated: number; skipped: number }> {
  const realRows = ((await api(REAL_TOKEN!, 'GET', `${BASE}/${cfg.endpoint}?limit=1000`)) as { rows?: Array<Record<string, string>> }).rows ?? [];
  const testRows = ((await api(TEST_TOKEN!, 'GET', `${BASE}/${cfg.endpoint}?limit=1000`)) as { rows?: Array<Record<string, string>> }).rows ?? [];
  const testByMatch = new Map(testRows.map((t) => [String(t[matchField]).toLowerCase(), t.id]));
  let migrated = 0;
  let skipped = 0;
  for (const r of realRows) {
    const key = String(r[matchField] ?? '').toLowerCase();
    const testId = testByMatch.get(key);
    if (testId && r.id) {
      idMap[`${cfg.name}:${r.id}`] = testId;
      migrated++;
    } else {
      skipped++;
    }
  }
  saveIdMap();
  return { migrated, skipped };
}

async function migrateEntity(cfg: EntityConfig): Promise<{ migrated: number; skipped: number }> {
  if (cfg.skip) {
    console.log(`  ⊘ ${cfg.name} (skip)`);
    return { migrated: 0, skipped: 0 };
  }
  // Shared/ISO entities — match by code instead of POSTing.
  if (cfg.name === 'currency') return migrateByLookup(cfg, 'isoCode');
  if (cfg.name === 'uom') return migrateByLookup(cfg, 'code');
  // Trial test account allows only 1 organization — map every real org
  // to the single test org so document FKs resolve.
  if (cfg.name === 'organization') return mapAllToFirst(cfg);
  // pricetype: bare-array endpoint + names rarely match between accounts;
  // simplest is to map every real pricetype to the test account's
  // pre-seeded default.
  if (cfg.name === 'pricetype') return mapAllToFirst(cfg);

  // Fetch up to `sample` rows, paginated
  const rows: Array<Record<string, unknown>> = [];
  const pageSize = 100;
  let offset = 0;
  while (rows.length < cfg.sample) {
    const url = `${BASE}/${cfg.endpoint}?limit=${pageSize}&offset=${offset}`;
    const r = (await api(REAL_TOKEN!, 'GET', url)) as { rows?: Array<Record<string, unknown>>; meta?: { size?: number } };
    const got = r?.rows ?? [];
    if (got.length === 0) break;
    rows.push(...got);
    offset += pageSize;
    if (rows.length >= (r?.meta?.size ?? 0)) break;
  }
  const limited = rows.slice(0, cfg.sample);

  let migrated = 0;
  let skipped = 0;
  for (const [idx, row] of limited.entries()) {
    const realId = row.id as string;
    if (!realId) {
      skipped++;
      continue;
    }
    // Already migrated?
    if (idMap[`${cfg.name}:${realId}`]) {
      skipped++;
      continue;
    }

    try {
      const stripped = stripFields(row, cfg.stripFields);
      const remapped = remapFKs(stripped) as Record<string, unknown>;

      // POST to test
      const result = (await api(TEST_TOKEN!, 'POST', `${BASE}/${cfg.endpoint}`, remapped)) as
        | { id?: string }
        | null;
      if (!result?.id) {
        skipped++;
        continue;
      }
      idMap[`${cfg.name}:${realId}`] = result.id;

      // Migrate positions inline
      if (cfg.hasPositions) {
        try {
          const positions = await fetchPositions(REAL_TOKEN!, cfg.name, realId);
          if (positions.length > 0) {
            await postPositions(TEST_TOKEN!, cfg.name, result.id, positions);
          }
        } catch (e) {
          console.warn(`    positions for ${cfg.name}:${realId} → ${(e as Error).message.slice(0, 100)}`);
        }
      }

      migrated++;
      if ((idx + 1) % 25 === 0) {
        process.stdout.write(`    ${idx + 1}/${limited.length}\n`);
        saveIdMap();
      }
    } catch (e) {
      const msg = (e as Error).message.slice(0, 200);
      console.warn(`    skip ${cfg.name} row ${idx}: ${msg}`);
      skipped++;
    }
  }
  saveIdMap();
  return { migrated, skipped };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const phaseArg = args.find((a) => a.startsWith('--phase='))?.slice(8);
  const reset = args.includes('--reset');

  if (reset) {
    idMap = {};
    saveIdMap();
    console.log('ID-map reset.');
  }

  console.log(`Migration start. ID-map: ${Object.keys(idMap).length} entries cached.`);

  for (const [phaseIdx, phase] of PHASES.entries()) {
    const phaseName = ['master-primitives', 'master-data', 'documents', 'returns-wh'][phaseIdx];
    if (phaseArg && phaseArg !== phaseName) {
      console.log(`Phase ${phaseIdx + 1} (${phaseName}) — skipped (--phase=${phaseArg} only)`);
      continue;
    }
    console.log(`\n=== Phase ${phaseIdx + 1}: ${phaseName} ===`);
    for (const cfg of phase) {
      const t0 = Date.now();
      const { migrated, skipped } = await migrateEntity(cfg);
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  ✓ ${cfg.name}: ${migrated} migrated, ${skipped} skipped (${sec}s)`);
    }
  }

  console.log(`\nDone. ID-map: ${Object.keys(idMap).length} entries.`);
}

main().catch((e) => {
  console.error('Migration failed:', e);
  saveIdMap();
  process.exit(1);
});
