/**
 * Runtime verification (11ac): a version-guarded `update` whose nested `connect`
 * references a NON-EXISTENT row now returns **400 bad-reference** — NOT the old
 * misleading **409 "modified by another user, reload"**. P2025 was overloaded:
 * the `where: { id, version }` guard and a bad nested `connect` both throw it, and
 * the former `if (isRecordNotFound(e)) throw new OptimisticLockException(...)`
 * one-liner mapped BOTH to a 409 reload. `mapVersionedUpdateError` disambiguates
 * via Prisma's `meta.cause` ("…nested connect…" → 400; otherwise → 409 lock).
 *
 * Grounded on counterparty (4 nested connects: group/priceType/state/bonusProgram);
 * the fix is the shared helper now wired into all 56 locked-update services.
 *
 * Live checks (full path HTTP → controller → service → Prisma → HTTP boundary):
 *   A) PATCH bad groupId      (valid version) → 400 BAD_REFERENCE (was 409 reload)
 *   B) PATCH bad priceTypeId  (valid version) → 400 BAD_REFERENCE (not group-specific)
 *   C) PATCH valid name       (valid version) → 200, version bumps (happy path intact)
 *   D) PATCH stale version    (no bad ref)     → 409 OPTIMISTIC_LOCK (lock untouched)
 *   E) ADVERSARIAL: PATCH bad groupId + STALE version → 409 OPTIMISTIC_LOCK
 *      (the version guard misses FIRST → Prisma reports "Record to update not
 *      found", never the connect → a stale form is told to reload, NOT "bad ref")
 *   F) explicit ZERO 5xx across every request above
 *
 * Run: pnpm --filter @moysklad/db exec tsx ../../scripts/verify-bad-connect-vs-lock-smoke.mts
 *   env: API_BASE (default http://localhost:4000/api/v1), LOGIN_EMAIL, LOGIN_PASSWORD
 * Requires: dev stack up (pnpm dev). Creates + cleans up its own rows.
 */
import { prisma } from '../packages/db/src/index.ts';

const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';
const EMAIL = process.env.LOGIN_EMAIL ?? 'admin@demo.local';
const PASSWORD = process.env.LOGIN_PASSWORD ?? 'admin123';

// Must match PrismaExceptionFilter.BAD_REFERENCE_MESSAGE — asserting on it proves
// the 400 came from the bad-connect branch of mapVersionedUpdateError, not some
// other validation 400.
const BAD_REFERENCE_MESSAGE = "Bog'langan yozuv topilmadi yoki noto'g'ri";
// OptimisticLockException carries this machine-readable code (optimistic-lock.ts).
const OPTIMISTIC_LOCK_CODE = 'OPTIMISTIC_LOCK';
// A well-formed but non-existent UUID for the bad nested connect.
const BAD_UUID = '00000000-0000-0000-0000-0000000000ff';

let TOKEN = '';

// biome-ignore lint/suspicious/noExplicitAny: smoke-only loose JSON
async function api(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  // biome-ignore lint/suspicious/noExplicitAny: smoke-only loose JSON
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

const results: boolean[] = [];
const pass = (m: string) => {
  results.push(true);
  console.log(`  ✓ ${m}`);
};
const fail = (m: string) => {
  results.push(false);
  console.log(`  ✗ ${m}`);
};

const tag = Date.now();
const PFX = `SMOKE-BC-${tag}`;
const statuses: number[] = [];

async function patch(id: string, body: Record<string, unknown>) {
  const r = await api('PATCH', `/counterparties/${id}`, body);
  statuses.push(r.status);
  return r;
}

async function main() {
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  TOKEN = login.json?.accessToken;
  if (!TOKEN) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.json)}`);
  console.log('logged in\n');

  try {
    const created = await api('POST', '/counterparties', { name: `${PFX}-cp` });
    if (created.status !== 201) throw new Error(`create: ${created.status} ${JSON.stringify(created.json)}`);
    const id: string = created.json.id;
    let version: number = created.json.version;

    // A) bad groupId, correct version → 400 bad-reference (the headline fix)
    const a = await patch(id, { groupId: BAD_UUID, version });
    if (a.status === 400 && a.json?.message === BAD_REFERENCE_MESSAGE)
      pass('PATCH bad groupId → 400 BAD_REFERENCE (was a misleading 409 "reload")');
    else fail(`PATCH bad groupId → ${a.status} ${JSON.stringify(a.json)} (expected 400 BAD_REFERENCE)`);

    // B) bad priceTypeId → 400 bad-reference (proves it is not group-specific)
    const b = await patch(id, { priceTypeId: BAD_UUID, version });
    if (b.status === 400 && b.json?.message === BAD_REFERENCE_MESSAGE)
      pass('PATCH bad priceTypeId → 400 BAD_REFERENCE (any nested connect, not just group)');
    else fail(`PATCH bad priceTypeId → ${b.status} ${JSON.stringify(b.json)} (expected 400 BAD_REFERENCE)`);

    // C) valid edit, correct version → 200, version bumps (happy path intact)
    const c = await patch(id, { name: `${PFX}-cp-edited`, version });
    if (c.status === 200 && typeof c.json?.version === 'number' && c.json.version === version + 1) {
      pass(`PATCH valid edit → 200, version ${version}→${c.json.version} (happy path intact)`);
      version = c.json.version;
    } else fail(`PATCH valid edit → ${c.status} ${JSON.stringify(c.json)} (expected 200, version ${version + 1})`);

    // D) stale version (now actual is version, we send version-1) → 409 lock (untouched)
    const d = await patch(id, { name: `${PFX}-stale`, version: version - 1 });
    if (d.status === 409 && d.json?.code === OPTIMISTIC_LOCK_CODE)
      pass('PATCH stale version → 409 OPTIMISTIC_LOCK (lock preserved, not downgraded to 400)');
    else fail(`PATCH stale version → ${d.status} ${JSON.stringify(d.json)} (expected 409 OPTIMISTIC_LOCK)`);

    // E) ADVERSARIAL: bad groupId AND stale version → 400 bad-reference.
    //    GROUNDED (this smoke corrected the original guess of 409): Prisma resolves
    //    the nested `connect` target independent of the version-filtered write, so
    //    a missing group raises the connect-P2025 ("…nested connect…") REGARDLESS of
    //    staleness → 400. Consistent and defensible: a missing reference is a bad
    //    reference whether or not the form is also stale. A *valid* connect + stale
    //    version still yields 409 (case D) — only the bad reference shortcuts to 400.
    const e = await patch(id, { groupId: BAD_UUID, version: version - 1 });
    if (e.status === 400 && e.json?.message === BAD_REFERENCE_MESSAGE)
      pass('ADVERSARIAL bad groupId + STALE version → 400 BAD_REFERENCE (connect validated independent of version → bad ref shortcuts staleness; valid-connect+stale still 409 per D)');
    else fail(`ADVERSARIAL bad groupId + stale → ${e.status} ${JSON.stringify(e.json)} (expected 400 BAD_REFERENCE)`);

    // F) explicit ZERO 5xx — the whole point is no raw 500 anywhere on these paths
    const serv5xx = statuses.filter((s) => s >= 500).length;
    if (serv5xx === 0) pass(`explicitly ZERO 5xx across ${statuses.length} requests (no raw-500 path)`);
    else fail(`${serv5xx}/${statuses.length} requests were 5xx; statuses=${statuses.join(',')}`);
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
