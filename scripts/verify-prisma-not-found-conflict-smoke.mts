/**
 * Runtime verification: a Prisma record-not-found (`P2025`) that reaches the
 * controller boundary now returns a friendly HTTP 404 (mutate-by-id) — NOT a raw
 * 500. Completes the global `PrismaExceptionFilter` family after 11y (P2003/P2014
 * → 409/400) and 11aa (P2002 → 409) with the SAME chokepoint.
 *
 * Bug class measured: EVERY direct delete/update pre-checks existence (findById →
 * a clean 404 already), so a naive "delete a non-existent id" is NOT the gap. The
 * *escaping* P2025 is the TOCTOU race — two concurrent deletes of the SAME row
 * both pass the existence pre-check, one wins, and the LOSER's delete matches
 * zero rows → P2025 → used to surface as a raw 500. Only `bom.service` mapped it
 * ad-hoc (→ 404); everyone else rethrew it raw.
 *
 * The optimistic-lock handlers catch a version-conflict P2025 IN-SERVICE (→ 409
 * `OPTIMISTIC_LOCK`), an HttpException that never reaches the filter — so the
 * global net does NOT downgrade a lock conflict to 404. This smoke proves that
 * layering on ONE entity (counterparty): a DELETE race → 404 (global filter) vs.
 * an UPDATE race → 409 (the lock, untouched).
 *
 * Live checks (full path: HTTP → controller → service → Prisma → HTTP boundary):
 *   A) sequential double-delete   → 200 then 404 via the PRE-CHECK (entity-specific
 *                                   message, NOT the filter) — the naive path baseline
 *   B) PARALLEL delete ×10        → exactly 1×200 + 9×404, ZERO 5xx; ≥1 loser carries
 *                                   the FILTER message (P2025→404 wiring under the race;
 *                                   each loser was a 500 before this fix)
 *   C) PARALLEL stale-version PATCH ×4 → exactly 1×200 + 3×409 OPTIMISTIC_LOCK, ZERO
 *                                   5xx (the lock's in-service P2025→409 is preserved;
 *                                   the global net did NOT steal it)
 *
 * Run: pnpm --filter @moysklad/db exec tsx ../../scripts/verify-prisma-not-found-conflict-smoke.mts
 *   env: API_BASE (default http://localhost:4000/api/v1), LOGIN_EMAIL, LOGIN_PASSWORD
 * Requires: dev stack up (pnpm dev). Creates + cleans up its own rows.
 */
import { prisma } from '../packages/db/src/index.ts';

const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';
const EMAIL = process.env.LOGIN_EMAIL ?? 'admin@demo.local';
const PASSWORD = process.env.LOGIN_PASSWORD ?? 'admin123';

// Must match PrismaExceptionFilter.NOT_FOUND_MESSAGE — asserting on it proves a
// 404 came from the global FILTER (an unhandled, raced P2025), not from a
// per-entity findById pre-check (which throws "Counterparty <id> not found").
const NOT_FOUND_MESSAGE = "So'ralgan yozuv topilmadi";
// OptimisticLockException carries this machine-readable code (optimistic-lock.ts).
const OPTIMISTIC_LOCK_CODE = 'OPTIMISTIC_LOCK';

let TOKEN = '';

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

const results: boolean[] = [];
const pass = (m: string) => {
  results.push(true);
  console.log('  ✓ ' + m);
};
const fail = (m: string) => {
  results.push(false);
  console.log('  ✗ ' + m);
};

const tag = Date.now();
const PFX = `SMOKE-NF-${tag}`;

async function createCp(name: string): Promise<{ id: string; version: number }> {
  const r = await api('POST', '/counterparties', { name });
  if (r.status !== 201) throw new Error(`counterparty create ${name}: ${r.status} ${JSON.stringify(r.json)}`);
  return { id: r.json.id, version: r.json.version };
}

async function main() {
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  TOKEN = login.json?.accessToken;
  if (!TOKEN) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.json)}`);
  console.log('logged in\n');

  try {
    // ── A) sequential double-delete → 200, then 404 via the PRE-CHECK.
    //    Establishes the baseline: the naive "delete a gone record" path returns
    //    404 from findById (entity-specific wording), NOT the filter. The filter
    //    only ever sees what a pre-check misses (the race in B).
    const a = await createCp(`${PFX}-A`);
    const aDel1 = await api('DELETE', `/counterparties/${a.id}`);
    if (aDel1.status === 200) pass('sequential delete #1 → 200 (clean delete)');
    else fail(`sequential delete #1 → ${aDel1.status} ${JSON.stringify(aDel1.json)} (expected 200)`);
    const aDel2 = await api('DELETE', `/counterparties/${a.id}`);
    if (aDel2.status === 404 && aDel2.json?.message !== NOT_FOUND_MESSAGE)
      pass('sequential delete #2 (gone) → 404 via PRE-CHECK (entity-specific message, not the filter)');
    else if (aDel2.status === 404)
      fail('sequential delete #2 → 404 but with the FILTER message — pre-check was bypassed?');
    else fail(`sequential delete #2 → ${aDel2.status} ${JSON.stringify(aDel2.json)} (expected 404 pre-check)`);

    // ── B) PARALLEL delete ×10 → exactly 1×200 + 9×404, ZERO 5xx.
    //    All 10 read existence first (fast, concurrent), then the 10 deletes
    //    serialise: 1 wins (200), 9 match zero rows → P2025. Before this fix the
    //    losers that raced past their pre-check were raw 500s. Now every loser is
    //    a 404, and ≥1 carries the FILTER message (proving the global P2025→404
    //    wiring fires under the real trigger).
    const b = await createCp(`${PFX}-B`);
    const N = 10;
    const dels = await Promise.all(
      Array.from({ length: N }, () => api('DELETE', `/counterparties/${b.id}`)),
    );
    const ok200 = dels.filter((r) => r.status === 200).length;
    const nf404 = dels.filter((r) => r.status === 404).length;
    const serv5xx = dels.filter((r) => r.status >= 500).length;
    const filterHits = dels.filter((r) => r.status === 404 && r.json?.message === NOT_FOUND_MESSAGE).length;

    if (ok200 === 1 && serv5xx === 0 && nf404 === N - 1)
      pass(`PARALLEL delete ×${N} → exactly 1×200 + ${N - 1}×404, ZERO 5xx (TOCTOU loser was 500)`);
    else
      fail(
        `PARALLEL delete → ${ok200}×200 / ${nf404}×404 / ${serv5xx}×5xx ` +
          `(expected 1/${N - 1}/0); statuses=${dels.map((r) => r.status).join(',')}`,
      );
    if (serv5xx === 0) pass('  …explicitly ZERO 5xx (no loser raw-500s — the bug is fixed)');
    else fail(`  …${serv5xx} loser(s) still 5xx — filter not active / API not reloaded`);
    if (filterHits >= 1)
      pass(`  …${filterHits}/${N - 1} loser(s) routed through the global FILTER (P2025→404 message)`);
    else
      fail('  …no loser carried the filter message — the race never reached the P2025 branch');

    // ── C) PARALLEL stale-version PATCH ×4 → exactly 1×200 + 3×409 OPTIMISTIC_LOCK.
    //    Same entity as B, but an UPDATE race. The lock filters update by version;
    //    losers hit P2025, which the SERVICE catches as OptimisticLockException
    //    (409 + code) BEFORE it escapes — so the global net never sees it. This is
    //    the layering proof: DELETE race → 404 (filter) vs UPDATE race → 409 (lock).
    const c = await createCp(`${PFX}-C`);
    const M = 4;
    const patches = await Promise.all(
      Array.from({ length: M }, (_, i) =>
        api('PATCH', `/counterparties/${c.id}`, { name: `${PFX}-C-edit-${i}`, version: c.version }),
      ),
    );
    const pOk = patches.filter((r) => r.status === 200).length;
    const p409 = patches.filter((r) => r.status === 409).length;
    const pServ5xx = patches.filter((r) => r.status >= 500).length;
    const lockHits = patches.filter((r) => r.status === 409 && r.json?.code === OPTIMISTIC_LOCK_CODE).length;

    if (pOk === 1 && p409 === M - 1 && pServ5xx === 0 && lockHits === M - 1)
      pass(
        `PARALLEL stale-version PATCH ×${M} → exactly 1×200 + ${M - 1}×409 OPTIMISTIC_LOCK, ZERO 5xx ` +
          `(lock's in-service P2025→409 preserved; global net did NOT downgrade to 404)`,
      );
    else
      fail(
        `PARALLEL PATCH → ${pOk}×200 / ${p409}×409 (lock ${lockHits}) / ${pServ5xx}×5xx ` +
          `(expected 1/${M - 1}/0, lock ${M - 1}); statuses=${patches.map((r) => r.status).join(',')}`,
      );
  } finally {
    await prisma.counterparty.deleteMany({ where: { name: { startsWith: PFX } } }).catch(() => {});
    await prisma.$disconnect();
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (passed !== results.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
