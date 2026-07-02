#!/usr/bin/env node
/**
 * Runtime verification (2026-06-13): the position line-total money-integrity
 * fix. Every `minorPerUnit × qty` site (billing gross + cost lines) was routed
 * through the shared `scaleMinorByQty` primitive (6-dp qty, round-half-up tiyin)
 * instead of the legacy `(minor * BigInt(Math.round(qty*1000)))/1000n` (3-dp
 * truncate). This proves the LIVE api now bills the full 6-dp quantity — the
 * billed total no longer diverges from the quantity the stock ledger / FIFO use.
 *
 * NON-VACUOUS: under the pre-fix code the same draft would store the legacy
 * 3-dp total, so the strict equality below would FAIL (the script prints both
 * the new and the legacy total for each case).
 *
 * Isolated + self-cleaning: a throwaway store + product + ONE draft demand.
 * Posts nothing, mutates ZERO stock (draft only — computeTotals runs on create).
 *
 * Case 1 (sub-milli): qty 0.0004 × 2500.00 sum (250000 tiyin) = 1.00 sum = 100
 *   tiyin. Legacy billed 0 (round(0.0004×1000)=0).
 * Case 2 (4th–6th decimal): qty 3.333333 × 1000.00 sum (100000 tiyin) =
 *   3333.333 sum = 333333 tiyin (round-half-up). Legacy billed 333300
 *   (qty truncated to 3.333).
 * Total expected sumMinor = 100 + 333333 = 333433 ; legacy would be 333300.
 *
 * Usage: node scripts/verify-money-line-scale-smoke.mjs
 *   env: API_BASE (default http://localhost:4000/api/v1), LOGIN_EMAIL, LOGIN_PASSWORD
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
  console.log('  ✓ ' + m);
};
const fail = (m) => {
  results.push(false);
  console.log('  ✗ ' + m);
};

const created = { store: null, product: null, demand: null, internalOrder: null };

// expected 6-dp totals (what scaleMinorByQty produces) and the legacy 3-dp totals
const CASE1_NEW = 100n;
const CASE1_LEGACY = 0n;
const CASE2_NEW = 333333n;
const CASE2_LEGACY = 333300n;
const TOTAL_NEW = CASE1_NEW + CASE2_NEW; // 333433
const TOTAL_LEGACY = CASE1_LEGACY + CASE2_LEGACY; // 333300

async function main() {
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  TOKEN = login.json?.accessToken;
  if (!TOKEN) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.json)}`);
  console.log('logged in');

  const orgs = await api('GET', '/organizations?limit=5');
  const ORG = (orgs.json?.items ?? orgs.json ?? [])[0]?.id;
  const cps = await api('GET', '/counterparties?limit=5');
  const CP = (cps.json?.items ?? cps.json ?? [])[0]?.id;
  if (!ORG || !CP) throw new Error('missing anchors (org/counterparty)');

  const tag = Date.now();
  const NAME = `SMOKE-MONEY-SCALE-${tag}`;
  const st = await api('POST', '/admin/stores', { name: `${NAME}-STORE` });
  created.store = st.json?.id;
  if (!created.store) throw new Error(`store create failed: ${st.status} ${JSON.stringify(st.json)}`);
  const p1 = await api('POST', '/products', { name: `${NAME}-P1` });
  const p2 = await api('POST', '/products', { name: `${NAME}-P2` });
  created.product = p1.json?.id;
  created.product2 = p2.json?.id;
  if (!created.product || !created.product2)
    throw new Error(`product create failed: ${p1.status}/${p2.status}`);

  // Draft demand, vatEnabled=false so sumMinor == sum of line grosses (no VAT noise).
  const body = {
    agentId: CP,
    organizationId: ORG,
    storeId: created.store,
    vatEnabled: false,
    positions: [
      { assortmentId: created.product, quantity: '0.0004', priceMinor: '250000', discount: '0' },
      { assortmentId: created.product2, quantity: '3.333333', priceMinor: '100000', discount: '0' },
    ],
  };
  const d = await api('POST', '/demands', body);
  created.demand = d.json?.id;
  if (!created.demand)
    throw new Error(`demand create failed: ${d.status} ${JSON.stringify(d.json)}`);

  const g = await api('GET', `/demands/${created.demand}`);
  if (g.status !== 200) throw new Error(`GET demand failed: ${g.status}`);
  const sum = BigInt(g.json?.sumMinor ?? -1);
  console.log(
    `\n  sumMinor(live)=${sum}  | 6-dp expected=${TOTAL_NEW}  | legacy 3-dp would be=${TOTAL_LEGACY}\n`,
  );

  // A: the grand total equals the 6-dp computation (and is NOT the legacy total).
  if (sum === TOTAL_NEW) pass(`A: live sumMinor == 6-dp total ${TOTAL_NEW} (legacy would be ${TOTAL_LEGACY})`);
  else fail(`A: live sumMinor ${sum} != expected 6-dp ${TOTAL_NEW} (legacy=${TOTAL_LEGACY})`);

  if (sum !== TOTAL_LEGACY)
    pass(`B: live sumMinor != legacy 3-dp total ${TOTAL_LEGACY} (proves the bug is fixed, non-vacuous)`);
  else fail(`B: live sumMinor STILL equals legacy 3-dp ${TOTAL_LEGACY} — api running stale code?`);

  // C: per-position line totals carried in the detail payload (if exposed).
  const positions = g.json?.positions ?? [];
  const lines = positions
    .map((p) => (p.sumMinor != null ? BigInt(p.sumMinor) : null))
    .filter((x) => x != null);
  if (lines.length === 2) {
    const set = new Set(lines.map(String));
    if (set.has(String(CASE1_NEW)) && set.has(String(CASE2_NEW)))
      pass(`C: per-line sumMinor = {${CASE1_NEW}, ${CASE2_NEW}} (sub-milli line billed ${CASE1_NEW}, not 0)`);
    else fail(`C: per-line sumMinor mismatch — got ${[...set].join(',')} expected ${CASE1_NEW},${CASE2_NEW}`);
  } else {
    console.log('  ⚠ C: per-position sumMinor not exposed in detail payload — grand-total check (A/B) stands');
  }

  // ── D: InternalOrder BE computeTotals (the site the adversarial workflow caught) ──
  // Its /new preview was migrated to scaleMinorByQty; this proves the BE that
  // STORES the total now agrees (was the legacy 3-dp truncation, billing 333300).
  const io = await api('POST', '/internal-orders', {
    organizationId: ORG,
    storeId: created.store,
    vatEnabled: false,
    positions: [
      { assortmentId: created.product, quantity: '0.0004', priceMinor: '250000' },
      { assortmentId: created.product2, quantity: '3.333333', priceMinor: '100000' },
    ],
  });
  created.internalOrder = io.json?.id;
  if (!created.internalOrder) {
    fail(`D: internal-order create failed ${io.status} ${JSON.stringify(io.json)}`);
  } else {
    const gio = await api('GET', `/internal-orders/${created.internalOrder}`);
    const ioSum = BigInt(gio.json?.sumMinor ?? -1);
    if (ioSum === TOTAL_NEW)
      pass(`D: internal-order sumMinor == 6-dp ${TOTAL_NEW} (legacy 3-dp would be ${TOTAL_LEGACY}) — FE preview now matches BE`);
    else fail(`D: internal-order sumMinor ${ioSum} != 6-dp ${TOTAL_NEW} (legacy=${TOTAL_LEGACY})`);
  }

  // ── E: H3 — a >100% discount is REJECTED (was silently persisted as negative) ──
  const bad = await api('POST', '/demands', {
    agentId: CP,
    organizationId: ORG,
    storeId: created.store,
    positions: [{ assortmentId: created.product, quantity: '1', priceMinor: '100000', discount: '150' }],
  });
  if (bad.status >= 400 && bad.status < 500) {
    pass(`E: discount 150% rejected (HTTP ${bad.status}) — no negative line total persists`);
    if (bad.json?.id) {
      fail('E2: a demand was actually created with discount 150% (should not happen)');
      await api('DELETE', `/demands/${bad.json.id}`).catch(() => {});
    }
  } else {
    fail(`E: discount 150% NOT rejected — HTTP ${bad.status} ${JSON.stringify(bad.json)?.slice(0, 120)}`);
    if (bad.json?.id) await api('DELETE', `/demands/${bad.json.id}`).catch(() => {});
  }

  // ── F: H2 — a non-UZS document carries its real currency to the detail (so the
  // totals sidebar renders it instead of hardcoding «сум») ──
  const usd = await api('POST', '/demands', {
    agentId: CP,
    organizationId: ORG,
    storeId: created.store,
    currency: 'USD',
    positions: [{ assortmentId: created.product, quantity: '1', priceMinor: '100000' }],
  });
  created.usdDemand = usd.json?.id;
  if (!created.usdDemand) {
    fail(`F: USD demand create failed ${usd.status} ${JSON.stringify(usd.json)?.slice(0, 120)}`);
  } else {
    const gu = await api('GET', `/demands/${created.usdDemand}`);
    if (gu.json?.currency === 'USD')
      pass('F: USD demand detail returns currency=USD (sidebar renders USD, not «сум»)');
    else fail(`F: detail currency != USD — got ${JSON.stringify(gu.json?.currency)}`);
  }

  // ── G: double-round — a discounted sub-tiyin line is single-rounded ──
  // qty 3 × 33.34 tiyin = 100.02 gross; 10% off = 90.018 tiyin -> single-round 9002.
  // The legacy double-round (round gross THEN truncate the discount divide) stored 9001.
  const dr = await api('POST', '/demands', {
    agentId: CP,
    organizationId: ORG,
    storeId: created.store,
    vatEnabled: false,
    positions: [{ assortmentId: created.product, quantity: '3', priceMinor: '3334', discount: '10' }],
  });
  created.drDemand = dr.json?.id;
  if (!created.drDemand) {
    fail(`G: discounted demand create failed ${dr.status} ${JSON.stringify(dr.json)?.slice(0, 120)}`);
  } else {
    const gd = await api('GET', `/demands/${created.drDemand}`);
    const s = BigInt(gd.json?.sumMinor ?? -1);
    if (s === 9002n) pass('G: discounted line sumMinor == 9002 (single-round; legacy double-round was 9001)');
    else fail(`G: sumMinor ${s} != 9002 single-round (legacy double-round = 9001)`);
  }

  // ── H: zero-qty position is rejected by the BE (was only the /new form guarding) ──
  const zq = await api('POST', '/demands', {
    agentId: CP,
    organizationId: ORG,
    storeId: created.store,
    positions: [{ assortmentId: created.product, quantity: '0', priceMinor: '100000' }],
  });
  if (zq.status >= 400 && zq.status < 500) {
    pass(`H: zero-qty position rejected (HTTP ${zq.status}) — a position must move stock`);
  } else {
    fail(`H: zero-qty NOT rejected — HTTP ${zq.status}`);
    if (zq.json?.id) await api('DELETE', `/demands/${zq.json.id}`).catch(() => {});
  }

  console.log('');
  const ok = results.filter(Boolean).length;
  console.log(`RESULT: ${ok}/${results.length} passed`);
  if (ok !== results.length) process.exitCode = 1;
}

async function cleanup() {
  console.log('\ncleanup (best-effort)…');
  if (created.demand) await api('DELETE', `/demands/${created.demand}`).catch(() => {});
  if (created.internalOrder)
    await api('DELETE', `/internal-orders/${created.internalOrder}`).catch(() => {});
  if (created.usdDemand) await api('DELETE', `/demands/${created.usdDemand}`).catch(() => {});
  if (created.drDemand) await api('DELETE', `/demands/${created.drDemand}`).catch(() => {});
  if (created.product) await api('DELETE', `/products/${created.product}`).catch(() => {});
  if (created.product2) await api('DELETE', `/products/${created.product2}`).catch(() => {});
  if (created.store) await api('POST', `/admin/stores/${created.store}/archive`).catch(() => {});
  console.log('cleanup done');
}

main()
  .catch((err) => {
    console.error('FATAL', err);
    process.exitCode = 1;
  })
  .finally(cleanup);
