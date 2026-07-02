#!/usr/bin/env node
/**
 * Runtime verification (2026-06-14): demand COGS on UNCOVERED (negative-stock)
 * units is now the weighted-average cost, not 0 (matches moysklad's
 * средневзвешенная — negative-stock write-offs cost at the moving average).
 *
 * Before: when a Demand was posted into a store with allowNegativeStock=true
 * and shipped MORE than FIFO depth, the uncovered units contributed 0 to COGS,
 * so costSumMinor was understated and «Прибыль» (sumMinor − costSumMinor) was
 * inflated on every oversell. Now consumeFifo costs the uncovered portion at the
 * weighted-average of the lots the line drew (or, with 0 on hand, the most
 * recent posted supply lot's unit cost) and records it as a 0-qty consumption
 * row so unpost/cancel reverse it symmetrically (stock-value cycle zero-sum).
 *
 * NON-VACUOUS: the asserted costSumMinor values were 0n / partial under the old
 * code; the post↔unpost stock-qty round-trip proves no drift was introduced.
 *
 * Flows (isolated + self-cleaning; references existing org/counterparty):
 *   A. Partial cover — supply 6 @ 100000, demand 10 → COGS 1 000 000
 *      (6×100000 covered + 4×100000 uncovered-weighted-avg), was 600 000.
 *   B. Zero cover — drain to 0, then demand 3 from empty → COGS 600 000
 *      (3 × last-lot 200000), was 0.
 *   C. unpost A → costSumMinor 0, stock back to 6 (zero-sum).
 *
 * Usage: node scripts/verify-demand-cogs-uncovered-smoke.mjs   (dev stack up)
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

const created = { store: null, p1: null, p2: null, dA: null, dB: null, drain: null };
let ORG;
let CP;
let S;

async function supply(pid, qty, priceMinor) {
  const r = await api('POST', '/supplies', {
    agentId: CP,
    organizationId: ORG,
    storeId: S,
    positions: [{ assortmentId: pid, quantity: qty, priceMinor }],
  });
  const id = r.json?.id;
  if (!id) throw new Error(`supply create failed: ${r.status} ${JSON.stringify(r.json)}`);
  await api('POST', `/supplies/${id}/transitions/post`);
  return id;
}

async function demand(pid, qty) {
  const r = await api('POST', '/demands', {
    agentId: CP,
    organizationId: ORG,
    storeId: S,
    vatEnabled: false,
    positions: [{ assortmentId: pid, quantity: qty, priceMinor: '50000' }],
  });
  const id = r.json?.id;
  if (!id) throw new Error(`demand create failed: ${r.status} ${JSON.stringify(r.json)}`);
  const post = await api('POST', `/demands/${id}/transitions/post`);
  if (post.status !== 200 && post.status !== 201)
    throw new Error(`demand post failed: ${post.status} ${JSON.stringify(post.json)}`);
  return id;
}

async function costSum(id) {
  return BigInt((await api('GET', `/demands/${id}`)).json?.costSumMinor ?? '-1');
}
async function stockQty(pid) {
  const r = await api('GET', `/stocks?storeId=${S}&assortmentIds=${pid}`);
  return Number(r.json?.items?.[0]?.qty ?? 'NaN');
}

async function cleanup() {
  for (const id of [created.dA, created.dB, created.drain]) {
    if (id) {
      await api('POST', `/demands/${id}/transitions/unpost`);
      await api('DELETE', `/demands/${id}`);
    }
  }
}

async function main() {
  TOKEN = (await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD })).json?.accessToken;
  if (!TOKEN) throw new Error('login failed');
  console.log('logged in');

  ORG = (await api('GET', '/organizations?limit=5')).json?.items?.[0]?.id;
  CP = (await api('GET', '/counterparties?limit=5')).json?.items?.[0]?.id;
  if (!ORG || !CP) throw new Error('missing anchors');

  const tag = Date.now();
  // allowNegativeStock=true so oversell is permitted (otherwise rejected upstream).
  S = (
    await api('POST', '/admin/stores', { name: `SMOKE-COGS-${tag}`, allowNegativeStock: true })
  ).json?.id;
  created.store = S;
  created.p1 = (await api('POST', '/products', { name: `SMOKE-COGS-A-${tag}` })).json?.id;
  created.p2 = (await api('POST', '/products', { name: `SMOKE-COGS-B-${tag}` })).json?.id;
  if (!S || !created.p1 || !created.p2) throw new Error('store/product create failed');

  // ── A. Partial cover: supply 6 @ 100000, demand 10 ───────────────────────
  await supply(created.p1, '6', '100000');
  created.dA = await demand(created.p1, '10');
  const cogsA = await costSum(created.dA);
  if (cogsA === 1_000_000n)
    pass(`A partial cover: COGS = 1 000 000 (6×100000 covered + 4×100000 weighted-avg uncovered)`);
  else fail(`A: expected COGS 1000000, got ${cogsA} — uncovered units NOT costed (was 600000)`);
  const stockA = await stockQty(created.p1);
  if (stockA === -4) pass(`A: stock 6 → -4 (oversold 10, negative allowed)`);
  else fail(`A: expected stock -4, got ${stockA}`);

  // ── B. Zero cover: drain p2 to 0, then demand 3 from empty ────────────────
  await supply(created.p2, '5', '200000');
  created.drain = await demand(created.p2, '5'); // covered, drains to 0
  created.dB = await demand(created.p2, '3'); // 0 on hand → fully uncovered
  const cogsB = await costSum(created.dB);
  if (cogsB === 600_000n)
    pass(`B zero cover: COGS = 600 000 (3 × last-lot 200000), was 0 pre-fix`);
  else fail(`B: expected COGS 600000, got ${cogsB} — empty-stock COGS not basis'd`);

  // ── C. unpost A → zero-sum (costSumMinor 0, stock back to 6) ──────────────
  await api('POST', `/demands/${created.dA}/transitions/unpost`);
  const cogsAafter = await costSum(created.dA);
  const stockAafter = await stockQty(created.p1);
  if (cogsAafter === 0n) pass(`C unpost: costSumMinor 1000000 → 0`);
  else fail(`C: expected costSumMinor 0 after unpost, got ${cogsAafter}`);
  if (stockAafter === 6) pass(`C unpost: stock -4 → 6 — uncovered cost reversed symmetrically`);
  else fail(`C: expected stock 6 after unpost, got ${stockAafter} — DRIFT`);
  // re-post so cleanup's unpost is valid, then cleanup unposts+deletes
  await api('POST', `/demands/${created.dA}/transitions/post`);

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
