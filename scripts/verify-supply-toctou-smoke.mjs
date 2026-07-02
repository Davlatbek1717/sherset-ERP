#!/usr/bin/env node
/**
 * Runtime verification (2026-06-14): the supply transition TOCTOU guard —
 * representative live cert for the sibling-doc class follow-up to demand
 * dd33fac5 (supply / sales-return / purchase-return all share the identical
 * atomic-claim primitive; sales-return + purchase-return are source-locked by
 * transition-toctou-class.test.ts and ride the same updateMany claim).
 *
 * post()/unpost()/cancel() now atomically CLAIM the state transition as the
 * first op inside their $transaction (`updateMany WHERE state=<expected>`),
 * taking a write lock on the supply row. A second concurrent transition blocks
 * on that lock, then sees count 0 → clean 409 (or its serializable tx aborts
 * with P2034 → 409) — never a second inbound stock write. delete() folds its
 * draft-state check into one conditional updateMany too.
 *
 * NON-VACUOUS: under the pre-fix code (blind `tx.supply.update`) the loser's tx
 * would run its full stock mutation, so N parallel posts would ADD the inbound
 * qty N times and several would "succeed". Here we assert EXACTLY one success
 * and a single +qty / -qty.
 *
 * Flows (isolated + self-cleaning; references existing org/counterparty):
 *   A. draft Supply qty 10 → fire 6 PARALLEL posts
 *      → exactly 1 × 2xx, 5 × clean 4xx, 0 × 5xx, stock 0→10 (added ONCE).
 *   B. fire 6 PARALLEL unposts → 1 × 2xx, 5 × clean 4xx, stock 10→0 (once).
 *   C. fresh draft Supply → fire 6 PARALLEL deletes
 *      → exactly 1 × 2xx, 5 × clean 4xx, 0 × 5xx (atomic delete claim).
 *
 * Usage: node scripts/verify-supply-toctou-smoke.mjs   (dev stack up)
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
const created = { store: null, product: null, supply: null, supply2: null };

async function stockQty(storeId, pid) {
  const r = await api('GET', `/stocks?storeId=${storeId}&assortmentIds=${pid}`);
  return Number(r.json?.items?.[0]?.qty ?? '0');
}

async function newDraftSupply(ORG, CP, S, PID) {
  const r = await api('POST', '/supplies', {
    agentId: CP,
    organizationId: ORG,
    storeId: S,
    positions: [{ assortmentId: PID, quantity: '10', priceMinor: '100000' }],
  });
  if (!r.json?.id) throw new Error(`supply create failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.id;
}

async function cleanup() {
  for (const id of [created.supply, created.supply2]) {
    if (!id) continue;
    await api('POST', `/supplies/${id}/transitions/unpost`);
    await api('DELETE', `/supplies/${id}`);
  }
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

async function main() {
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  TOKEN = login.json?.accessToken;
  if (!TOKEN) throw new Error(`login failed: ${login.status}`);
  console.log('logged in');

  const ORG = (await api('GET', '/organizations?limit=5')).json?.items?.[0]?.id;
  const CP = (await api('GET', '/counterparties?limit=5')).json?.items?.[0]?.id;
  if (!ORG || !CP) throw new Error('missing anchors');

  const tag = Date.now();
  created.store = (await api('POST', '/admin/stores', { name: `SMOKE-SUPPLY-${tag}` })).json?.id;
  created.product = (await api('POST', '/products', { name: `SMOKE-SUPPLY-${tag}` })).json?.id;
  const S = created.store;
  const PID = created.product;
  if (!S || !PID) throw new Error('store/product create failed');

  created.supply = await newDraftSupply(ORG, CP, S, PID);

  // ── A. N parallel posts (inbound stock +10) ──────────────────────────────
  const posts = await Promise.all(
    Array.from({ length: N }, () => api('POST', `/supplies/${created.supply}/transitions/post`)),
  );
  classify(posts, `${N} parallel posts`);
  const state = (await api('GET', `/supplies/${created.supply}`)).json?.state;
  if (state === 'posted') pass(`supply state = posted (single transition)`);
  else fail(`expected state posted, got ${state}`);
  const afterPost = await stockQty(S, PID);
  if (afterPost === 10)
    pass(`stock 0 → 10 — added ONCE despite ${N} parallel posts (no double-add)`);
  else fail(`expected stock 10 (single add), got ${afterPost} — DOUBLE ADD`);

  // ── B. N parallel unposts (reverse −10) ──────────────────────────────────
  const unposts = await Promise.all(
    Array.from({ length: N }, () => api('POST', `/supplies/${created.supply}/transitions/unpost`)),
  );
  classify(unposts, `${N} parallel unposts`);
  const afterUnpost = await stockQty(S, PID);
  if (afterUnpost === 0) pass(`stock 10 → 0 — reversed ONCE despite ${N} parallel unposts`);
  else fail(`expected stock 0 (single reversal), got ${afterUnpost}`);

  // ── C. N parallel deletes on a fresh draft (atomic delete claim) ──────────
  created.supply2 = await newDraftSupply(ORG, CP, S, PID);
  const deletes = await Promise.all(
    Array.from({ length: N }, () => api('DELETE', `/supplies/${created.supply2}`)),
  );
  classify(deletes, `${N} parallel deletes`);
  // it's gone — null out so cleanup doesn't double-handle it
  created.supply2 = null;

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
