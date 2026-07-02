#!/usr/bin/env node
/**
 * Runtime verification (2026-06-14): the stock-transition TOCTOU guard for the
 * sibling stock-mutating doc services — follow-up to supply 0b525f80.
 *
 * move / enter / production / processing each had post()/unpost()/cancel() read
 * the doc state OUTSIDE their $transaction then a blind `tx.<model>.update` to
 * flip it (processing did a non-atomic SELECT-then-check), so two concurrent
 * transitions could BOTH run the full stock mutation. Each now atomically
 * CLAIMS its state change as the first op inside the tx (`updateMany WHERE
 * state=<expected>`), taking the row write lock — exactly one wins, the loser
 * sees count 0 → clean 409 (or P2034 → 409). delete()/softDelete() fold their
 * state check into one conditional updateMany too.
 *
 * This script live-races the two applyDeltas-class services (ENTER inbound +
 * MOVE transfer). production (reservation ledger) + processing (BOM cascade)
 * are a DIFFERENT mechanism and stay source-locked by
 * transition-toctou-class.test.ts (same atomic-claim primitive) — flagged for a
 * dedicated reservation/BOM live race.
 *
 * NON-VACUOUS: under the pre-fix blind update, the loser's tx ran its full
 * stock mutation, so N parallel posts would apply the delta N times. Here we
 * assert EXACTLY one success and a single +qty / transfer.
 *
 * Flows (isolated + self-cleaning; reference an existing org):
 *   ENTER A. draft Enter qty 10 → 6 PARALLEL posts → 1×2xx, 5×4xx, 0×5xx, stock 0→10 (once)
 *   ENTER B. 6 PARALLEL unposts → 1×2xx, stock 10→0 (once)
 *   ENTER C. fresh draft Enter → 6 PARALLEL deletes → 1×2xx, 5×4xx, 0×5xx
 *   MOVE  D. seed SRC=20 (posted enter); draft Move 10 SRC→DST → 6 PARALLEL posts
 *            → 1×2xx, SRC 20→10 + DST 0→10 (moved ONCE)
 *   MOVE  E. 6 PARALLEL unposts → SRC→20, DST→0 (reversed once)
 *
 * Usage: node scripts/verify-stock-toctou-smoke.mjs   (dev stack up)
 */

const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';
const EMAIL = process.env.LOGIN_EMAIL ?? 'admin@demo.local';
const PASSWORD = process.env.LOGIN_PASSWORD ?? 'admin123';
let TOKEN = '';

async function api(method, path, body) {
  const effectiveBody = body === undefined && method !== 'GET' ? {} : body;
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    ...(effectiveBody !== undefined ? { body: JSON.stringify(effectiveBody) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

const results = [];
const pass = (m) => {
  results.push(true);
  console.log(`  ok ${m}`);
};
const fail = (m) => {
  results.push(false);
  console.log(`  XX ${m}`);
};

const N = 6;
const created = {
  s1: null,
  src: null,
  dst: null,
  p1: null,
  p2: null,
  enterA: null,
  enterC: null,
  enterSeed: null,
  move: null,
};

async function stockQty(storeId, pid) {
  const r = await api('GET', `/stocks?storeId=${storeId}&assortmentIds=${pid}`);
  return Number(r.json?.items?.[0]?.qty ?? '0');
}

async function newDraftEnter(ORG, S, PID, qty) {
  const r = await api('POST', '/enters', {
    organizationId: ORG,
    storeId: S,
    positions: [{ assortmentId: PID, quantity: String(qty), costMinor: '100000' }],
  });
  if (!r.json?.id) throw new Error(`enter create failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.id;
}

function classify(arr, label) {
  const codes = arr.map((r) => r.status);
  const ok = arr.filter((r) => r.status === 200 || r.status === 201).length;
  const serverErr = arr.filter((r) => r.status >= 500).length;
  const losers4xx = arr.filter((r) => r.status >= 400 && r.status < 500).length;
  if (ok === 1) pass(`${label}: exactly 1 succeeded (statuses ${codes.join(',')})`);
  else fail(`${label}: expected 1 success, got ${ok} (statuses ${codes.join(',')})`);
  if (serverErr === 0) pass(`${label}: ZERO raw 5xx — every loser a clean 4xx (P2034→409)`);
  else fail(`${label}: expected 0 server errors, got ${serverErr} (${codes.join(',')})`);
  if (losers4xx === N - 1) pass(`${label}: the other ${N - 1} → clean 4xx (${losers4xx})`);
  else fail(`${label}: expected ${N - 1} × 4xx, got ${losers4xx} (${codes.join(',')})`);
}

async function cleanup() {
  for (const id of [created.enterA, created.enterC, created.enterSeed]) {
    if (!id) continue;
    await api('POST', `/enters/${id}/transitions/unpost`);
    await api('DELETE', `/enters/${id}`);
  }
  if (created.move) {
    await api('POST', `/moves/${created.move}/transitions/unpost`);
    await api('DELETE', `/moves/${created.move}`);
  }
}

async function main() {
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  TOKEN = login.json?.accessToken;
  if (!TOKEN) throw new Error(`login failed: ${login.status}`);
  console.log('logged in');

  const ORG = (await api('GET', '/organizations?limit=5')).json?.items?.[0]?.id;
  if (!ORG) throw new Error('missing org anchor');

  const tag = Date.now();
  created.s1 = (await api('POST', '/admin/stores', { name: `SMOKE-TOCTOU-S1-${tag}` })).json?.id;
  created.src = (await api('POST', '/admin/stores', { name: `SMOKE-TOCTOU-SRC-${tag}` })).json?.id;
  created.dst = (await api('POST', '/admin/stores', { name: `SMOKE-TOCTOU-DST-${tag}` })).json?.id;
  created.p1 = (await api('POST', '/products', { name: `SMOKE-TOCTOU-P1-${tag}` })).json?.id;
  created.p2 = (await api('POST', '/products', { name: `SMOKE-TOCTOU-P2-${tag}` })).json?.id;
  if (!created.s1 || !created.src || !created.dst || !created.p1 || !created.p2)
    throw new Error('store/product create failed');

  // ════════════════ ENTER (Оприходование — inbound) ════════════════
  console.log('\n— ENTER —');
  created.enterA = await newDraftEnter(ORG, created.s1, created.p1, 10);

  // A. N parallel posts (inbound +10)
  const posts = await Promise.all(
    Array.from({ length: N }, () => api('POST', `/enters/${created.enterA}/transitions/post`)),
  );
  classify(posts, `enter ${N} parallel posts`);
  const stateA = (await api('GET', `/enters/${created.enterA}`)).json?.state;
  if (stateA === 'posted') pass('enter state = posted (single transition)');
  else fail(`enter expected posted, got ${stateA}`);
  const afterPost = await stockQty(created.s1, created.p1);
  if (afterPost === 10) pass(`enter stock 0→10 — added ONCE despite ${N} parallel posts`);
  else fail(`enter expected stock 10 (single add), got ${afterPost} — DOUBLE ADD`);

  // B. N parallel unposts (−10)
  const unposts = await Promise.all(
    Array.from({ length: N }, () => api('POST', `/enters/${created.enterA}/transitions/unpost`)),
  );
  classify(unposts, `enter ${N} parallel unposts`);
  const afterUnpost = await stockQty(created.s1, created.p1);
  if (afterUnpost === 0) pass(`enter stock 10→0 — reversed ONCE despite ${N} parallel unposts`);
  else fail(`enter expected stock 0 (single reversal), got ${afterUnpost}`);

  // C. N parallel deletes on a fresh draft
  created.enterC = await newDraftEnter(ORG, created.s1, created.p1, 5);
  const deletes = await Promise.all(
    Array.from({ length: N }, () => api('DELETE', `/enters/${created.enterC}`)),
  );
  classify(deletes, `enter ${N} parallel deletes`);
  created.enterC = null; // gone

  // ════════════════ MOVE (Перемещение — transfer) ════════════════
  console.log('\n— MOVE —');
  // seed SRC=20 via a posted enter
  created.enterSeed = await newDraftEnter(ORG, created.src, created.p2, 20);
  const seedPost = await api('POST', `/enters/${created.enterSeed}/transitions/post`);
  if (seedPost.status >= 400) throw new Error(`seed enter post failed: ${seedPost.status}`);
  const srcSeed = await stockQty(created.src, created.p2);
  if (srcSeed === 20) pass('move seed: SRC stocked to 20');
  else fail(`move seed expected SRC 20, got ${srcSeed}`);

  const mv = await api('POST', '/moves', {
    organizationId: ORG,
    sourceStoreId: created.src,
    destinationStoreId: created.dst,
    positions: [{ assortmentId: created.p2, quantity: '10' }],
  });
  created.move = mv.json?.id;
  if (!created.move) throw new Error(`move create failed: ${mv.status} ${JSON.stringify(mv.json)}`);

  // D. N parallel posts (transfer 10 SRC→DST)
  const mPosts = await Promise.all(
    Array.from({ length: N }, () => api('POST', `/moves/${created.move}/transitions/post`)),
  );
  classify(mPosts, `move ${N} parallel posts`);
  const srcAfter = await stockQty(created.src, created.p2);
  const dstAfter = await stockQty(created.dst, created.p2);
  if (srcAfter === 10) pass(`move SRC 20→10 — moved out ONCE despite ${N} parallel posts`);
  else fail(`move expected SRC 10, got ${srcAfter} — DOUBLE MOVE`);
  if (dstAfter === 10) pass(`move DST 0→10 — moved in ONCE`);
  else fail(`move expected DST 10, got ${dstAfter} — DOUBLE MOVE`);

  // E. N parallel unposts (reverse)
  const mUnposts = await Promise.all(
    Array.from({ length: N }, () => api('POST', `/moves/${created.move}/transitions/unpost`)),
  );
  classify(mUnposts, `move ${N} parallel unposts`);
  const srcBack = await stockQty(created.src, created.p2);
  const dstBack = await stockQty(created.dst, created.p2);
  if (srcBack === 20 && dstBack === 0) pass('move reversed ONCE — SRC→20, DST→0');
  else fail(`move expected SRC 20 / DST 0, got SRC ${srcBack} / DST ${dstBack}`);

  await cleanup();
  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} passed`);
  if (ok !== results.length) process.exit(1);
}

main().catch(async (err) => {
  console.error('FATAL', err);
  try {
    await cleanup();
  } catch {}
  process.exit(1);
});
