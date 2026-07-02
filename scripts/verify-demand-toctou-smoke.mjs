#!/usr/bin/env node
/**
 * Runtime verification (2026-06-13): the demand transition TOCTOU guard.
 *
 * post()/unpost()/cancel() now atomically CLAIM the state transition as the
 * first op inside their $transaction (`updateMany WHERE state=<expected>`),
 * which takes a write lock on the demand row. A second concurrent transition
 * blocks on that lock, then sees count 0 and gets a clean 409 — never a second
 * FIFO consumption + stock deduction (post) or refund + re-add (unpost/cancel).
 * delete() likewise folds its draft-state check into one conditional updateMany.
 *
 * NON-VACUOUS: under the pre-fix code (blind `tx.demand.update`) the loser's
 * transaction would run its full stock mutation too, so N parallel posts would
 * deduct the stock N times and several would "succeed". Here we assert EXACTLY
 * one success and a single deduction.
 *
 * Flows (isolated + self-cleaning; references existing org/counterparty):
 *   A. Enter 100 → draft Demand qty 10 → fire 6 PARALLEL posts
 *      → exactly 1 × 2xx, 5 × 409, demand state=posted, stock 100→90 (once).
 *   B. fire 6 PARALLEL unposts on the now-posted demand
 *      → exactly 1 × 2xx, 5 × 409, stock 90→100 (re-added once).
 *
 * Usage: node scripts/verify-demand-toctou-smoke.mjs   (dev stack up)
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
const created = { store: null, product: null, enter: null, demand: null };

async function stockQty(storeId, pid) {
  const r = await api('GET', `/stocks?storeId=${storeId}&assortmentIds=${pid}`);
  return Number(r.json?.items?.[0]?.qty ?? 'NaN');
}

async function cleanup() {
  if (created.demand) {
    await api('POST', `/demands/${created.demand}/transitions/unpost`);
    await api('DELETE', `/demands/${created.demand}`);
  }
  if (created.enter) await api('DELETE', `/enters/${created.enter}`);
}

async function main() {
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  TOKEN = login.json?.accessToken;
  if (!TOKEN) throw new Error(`login failed: ${login.status}`);
  console.log('logged in');

  const ORG = (await api('GET', '/organizations?limit=5')).json?.items?.[0]?.id;
  const CP = (await api('GET', '/counterparties?limit=5')).json?.items?.[0]?.id;
  if (!ORG || !CP) throw new Error('missing anchors');

  const tag = Date.now();
  created.store = (await api('POST', '/admin/stores', { name: `SMOKE-TOCTOU-${tag}` })).json?.id;
  created.product = (await api('POST', '/products', { name: `SMOKE-TOCTOU-${tag}` })).json?.id;
  const S = created.store;
  const PID = created.product;
  if (!S || !PID) throw new Error('store/product create failed');

  const e = await api('POST', '/enters', {
    organizationId: ORG,
    storeId: S,
    positions: [{ assortmentId: PID, quantity: '100', costMinor: '100000' }],
  });
  created.enter = e.json?.id;
  await api('POST', `/enters/${created.enter}/transitions/post`);
  const before = await stockQty(S, PID);
  if (before === 100) pass(`stock seeded = 100`);
  else fail(`expected stock 100, got ${before}`);

  const d = await api('POST', '/demands', {
    agentId: CP,
    organizationId: ORG,
    storeId: S,
    vatEnabled: false,
    positions: [{ assortmentId: PID, quantity: '10', priceMinor: '50000' }],
  });
  created.demand = d.json?.id;
  if (!created.demand)
    throw new Error(`demand create failed: ${d.status} ${JSON.stringify(d.json)}`);

  // ── A. N parallel posts ──────────────────────────────────────────────────
  const posts = await Promise.all(
    Array.from({ length: N }, () => api('POST', `/demands/${created.demand}/transitions/post`)),
  );
  // The honest TOCTOU contract: exactly ONE wins; every loser is a CLEAN 4xx —
  // 409 (P2034 write-conflict OR the atomic-claim count-0) or 400 (its findById
  // already saw state=posted) — and crucially ZERO 5xx (no raw serialization
  // 500). Which 4xx a given loser gets is timing-dependent; both are correct.
  const codes = posts.map((r) => r.status);
  const okPosts = posts.filter((r) => r.status === 200 || r.status === 201).length;
  const serverErr = posts.filter((r) => r.status >= 500).length;
  const losers4xx = posts.filter((r) => r.status >= 400 && r.status < 500).length;
  if (okPosts === 1)
    pass(`${N} parallel posts → exactly 1 succeeded (statuses ${codes.join(',')})`);
  else fail(`expected exactly 1 successful post, got ${okPosts} (statuses ${codes.join(',')})`);
  if (serverErr === 0) pass(`no raw 5xx — every loser is a clean 4xx (P2034→409 mapped)`);
  else fail(`expected 0 server errors, got ${serverErr} (statuses ${codes.join(',')})`);
  if (losers4xx === N - 1) pass(`the other ${N - 1} posts → clean 4xx rejections (${losers4xx})`);
  else fail(`expected ${N - 1} × 4xx, got ${losers4xx} (statuses ${codes.join(',')})`);

  const state = (await api('GET', `/demands/${created.demand}`)).json?.state;
  if (state === 'posted') pass(`demand state = posted (single transition)`);
  else fail(`expected demand state posted, got ${state}`);

  const afterPost = await stockQty(S, PID);
  if (afterPost === 90)
    pass(`stock 100 → 90 — deducted ONCE despite ${N} parallel posts (no double-deduction)`);
  else fail(`expected stock 90 (single deduction), got ${afterPost} — DOUBLE DEDUCTION`);

  // ── B. N parallel unposts ────────────────────────────────────────────────
  const unposts = await Promise.all(
    Array.from({ length: N }, () => api('POST', `/demands/${created.demand}/transitions/unpost`)),
  );
  const unCodes = unposts.map((r) => r.status);
  const okUn = unposts.filter((r) => r.status === 200 || r.status === 201).length;
  const unServerErr = unposts.filter((r) => r.status >= 500).length;
  const unLosers4xx = unposts.filter((r) => r.status >= 400 && r.status < 500).length;
  if (okUn === 1)
    pass(`${N} parallel unposts → exactly 1 succeeded (statuses ${unCodes.join(',')})`);
  else fail(`expected exactly 1 successful unpost, got ${okUn} (statuses ${unCodes.join(',')})`);
  if (unServerErr === 0 && unLosers4xx === N - 1)
    pass(`the other ${N - 1} unposts → clean 4xx, no 5xx (${unLosers4xx})`);
  else fail(`expected ${N - 1} × clean 4xx unpost, got ${unLosers4xx} 4xx / ${unServerErr} 5xx`);

  const afterUnpost = await stockQty(S, PID);
  if (afterUnpost === 100) pass(`stock 90 → 100 — re-added ONCE despite ${N} parallel unposts`);
  else fail(`expected stock 100 (single re-add), got ${afterUnpost}`);

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
