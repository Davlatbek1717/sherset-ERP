/**
 * Runtime verification: a Prisma unique-constraint violation (`P2002`) that
 * reaches the controller boundary now returns a friendly HTTP 409 Conflict, NOT
 * a raw 500. Natural follow-up to 11y (P2003/P2014 → 409/400) and 11u (employee
 * P2002 per-site) — closes the *general* unique-violation gap with the SAME
 * global `PrismaExceptionFilter` chokepoint.
 *
 * Bug class measured: ~28 services already map P2002 per-site with a
 * field-specific 409, but reference creates WITHOUT a pre-check surfaced a raw
 * 500 on a duplicate:
 *   • pipeline / price-list / document-state — no pre-check → SEQUENTIAL dup → 500
 *   • store / employee — pre-checked → 500 only on a TOCTOU race past the check
 * Only `ZodExceptionFilter` + the 11y P2003/P2014 branch were global; an
 * unmapped P2002 fell through to 500.
 *
 * Five live checks (full path: HTTP → controller → service → Prisma index →
 * mapped at the HTTP boundary):
 *   A) pipeline SEQUENTIAL dup name      → 409 generic (was raw 500)
 *   B) pipeline PARALLEL  dup name (×6)  → exactly 1×201 + 5×409, 0×5xx
 *                                          (no pre-check → deterministic filter path)
 *   C) store    SEQUENTIAL dup code      → 400 via pre-check (specific msg preserved)
 *   D) store    PARALLEL  dup code (×6)  → exactly 1×201, 0×5xx (pre-check TOCTOU
 *                                          window no longer yields a 500)
 *   E) roles    SEQUENTIAL dup name      → 409 with the per-site SPECIFIC message
 *                                          (proves the global filter does NOT
 *                                          override per-site handlers — they throw
 *                                          an HttpException before the error escapes)
 *
 * Run: pnpm --filter @moysklad/db exec tsx ../../scripts/verify-prisma-unique-conflict-smoke.mts
 *   env: API_BASE (default http://localhost:4000/api/v1), LOGIN_EMAIL, LOGIN_PASSWORD
 * Requires: dev stack up (pnpm dev). Creates + cleans up its own rows.
 */
import { prisma } from '../packages/db/src/index.ts';

const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';
const EMAIL = process.env.LOGIN_EMAIL ?? 'admin@demo.local';
const PASSWORD = process.env.LOGIN_PASSWORD ?? 'admin123';

// Must match PrismaExceptionFilter.DUPLICATE_VALUE_MESSAGE — asserting on it
// proves the 409 came from the global FILTER (a generic, unhandled P2002), not
// from a per-site handler (which carries its own entity-specific wording).
const DUPLICATE_VALUE_MESSAGE = 'Bunday qiymatli yozuv allaqachon mavjud';
// Per-site roles handler (permissions/roles.service.ts) — a SPECIFIC message,
// distinct from the generic filter one above.
const ROLE_DUP_MESSAGE = 'Bu nomdagi rol allaqachon mavjud';

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
const PFX = `SMOKE-UNIQ-${tag}`;

async function main() {
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  TOKEN = login.json?.accessToken;
  if (!TOKEN) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.json)}`);
  console.log('logged in\n');

  try {
    // ── A) pipeline SEQUENTIAL dup name → 409 generic (was raw 500).
    //    Pipeline has NO duplicate pre-check, so the duplicate hits the DB unique
    //    index directly — the cleanest demonstration of a sequential 500→409.
    const plName = `${PFX}-PL-A`;
    const pl1 = await api('POST', '/pipelines', { name: plName, stages: [{ name: 'S1' }] });
    if (pl1.status !== 201) throw new Error(`pipeline create A: ${pl1.status} ${JSON.stringify(pl1.json)}`);
    const plDup = await api('POST', '/pipelines', { name: plName, stages: [{ name: 'S1' }] });
    if (plDup.status === 409) pass('pipeline SEQUENTIAL dup name → 409 (was raw 500)');
    else fail(`pipeline dup name → ${plDup.status} ${JSON.stringify(plDup.json)} (expected 409)`);
    if (plDup.status !== 500) pass('  …explicitly NOT 500 (the bug is fixed)');
    else fail('  …still 500 — filter not active / API not reloaded');
    if (plDup.json?.message === DUPLICATE_VALUE_MESSAGE)
      pass('  …409 came from the global FILTER (generic duplicate message)');
    else fail(`  …unexpected message: ${JSON.stringify(plDup.json?.message)}`);

    // ── B) pipeline PARALLEL dup name (×6) → exactly 1×201 + 5×409, 0×5xx.
    //    No pre-check window → every loser deterministically routes through the
    //    global filter. This is the concurrency headline for the filter path.
    const plParName = `${PFX}-PL-B`;
    const plPar = await Promise.all(
      Array.from({ length: 6 }, () =>
        api('POST', '/pipelines', { name: plParName, stages: [{ name: 'S1' }] }),
      ),
    );
    const plCreated = plPar.filter((r) => r.status === 201).length;
    const plConflict = plPar.filter((r) => r.status === 409).length;
    const plServerErr = plPar.filter((r) => r.status >= 500).length;
    if (plCreated === 1 && plConflict === 5 && plServerErr === 0)
      pass('pipeline PARALLEL ×6 dup name → exactly 1×201 + 5×409, ZERO 5xx (TOCTOU-safe via filter)');
    else
      fail(
        `pipeline PARALLEL → ${plCreated}×201 / ${plConflict}×409 / ${plServerErr}×5xx ` +
          `(expected 1/5/0); statuses=${plPar.map((r) => r.status).join(',')}`,
      );

    // ── C) store SEQUENTIAL dup code → 400 via pre-check (specific msg preserved).
    //    Proves the pre-check still owns the sequential case; the filter only
    //    handles what a pre-check misses (it didn't grab this 400).
    const stCode = `${PFX}-C`;
    const st1 = await api('POST', '/admin/stores', { name: `${PFX}-ST-C`, code: stCode });
    if (st1.status !== 201) throw new Error(`store create C: ${st1.status} ${JSON.stringify(st1.json)}`);
    const stDup = await api('POST', '/admin/stores', { name: `${PFX}-ST-C2`, code: stCode });
    if (
      stDup.status === 400 &&
      typeof stDup.json?.message === 'string' &&
      stDup.json.message.includes('ishlatilgan')
    )
      pass('store SEQUENTIAL dup code → 400 via pre-check (specific message preserved, not the filter)');
    else fail(`store dup code → ${stDup.status} ${JSON.stringify(stDup.json)} (expected 400 pre-check)`);

    // ── D) store PARALLEL dup code (×6) → exactly 1×201, 0×5xx. Two creates can
    //    both pass the findFirst pre-check then race into the unique index; that
    //    P2002 used to be a raw 500. Now every loser is a 4xx (400 if the
    //    pre-check caught it, 409 if it raced past into the filter) — never 5xx.
    const stParCode = `${PFX}-D`;
    const stPar = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        api('POST', '/admin/stores', { name: `${PFX}-ST-D-${i}`, code: stParCode }),
      ),
    );
    const stCreated = stPar.filter((r) => r.status === 201).length;
    const st4xx = stPar.filter((r) => r.status >= 400 && r.status < 500).length;
    const st5xx = stPar.filter((r) => r.status >= 500).length;
    const st409 = stPar.filter((r) => r.status === 409).length;
    const st400 = stPar.filter((r) => r.status === 400).length;
    if (stCreated === 1 && st5xx === 0 && st4xx === 5)
      pass(
        `store PARALLEL ×6 dup code → exactly 1×201, ZERO 5xx, 5×4xx ` +
          `(pre-check ${st400} / filter-race ${st409}) — TOCTOU no longer 500`,
      );
    else
      fail(
        `store PARALLEL → ${stCreated}×201 / ${st4xx}×4xx / ${st5xx}×5xx ` +
          `(expected 1/5/0); statuses=${stPar.map((r) => r.status).join(',')}`,
      );

    // ── E) roles SEQUENTIAL dup name → 409 with the per-site SPECIFIC message.
    //    Roles has no pre-check but DOES map P2002 in-service (handlePrisma). The
    //    duplicate must surface its specific wording, proving the per-site
    //    ConflictException (an HttpException, ≠ PrismaClientKnownRequestError)
    //    short-circuits BEFORE the global filter ever sees the error.
    const roleName = `${PFX}-RL`;
    const r1 = await api('POST', '/roles', { name: roleName });
    if (r1.status !== 201) throw new Error(`role create E: ${r1.status} ${JSON.stringify(r1.json)}`);
    const rDup = await api('POST', '/roles', { name: roleName });
    if (rDup.status === 409 && rDup.json?.message === ROLE_DUP_MESSAGE)
      pass('roles SEQUENTIAL dup name → 409 with PER-SITE specific message (filter did NOT override)');
    else if (rDup.status === 409 && rDup.json?.message === DUPLICATE_VALUE_MESSAGE)
      fail('roles dup → 409 but with the GENERIC filter message — per-site handler was bypassed!');
    else fail(`roles dup name → ${rDup.status} ${JSON.stringify(rDup.json)} (expected 409 specific)`);
  } finally {
    // ── cleanup (Prisma). PipelineStage cascades on pipeline delete.
    await prisma.pipeline.deleteMany({ where: { name: { startsWith: PFX } } }).catch(() => {});
    await prisma.store.deleteMany({ where: { name: { startsWith: PFX } } }).catch(() => {});
    await prisma.role.deleteMany({ where: { name: { startsWith: PFX } } }).catch(() => {});
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
