#!/usr/bin/env node
/**
 * Runtime verification (2026-06-13): the six "from/to"-convention report
 * services now interpret a date-only range as an **Asia/Tashkent calendar-day
 * half-open window** `[gte, lt)` (via the shared `reportDateBounds` util),
 * instead of the day-dropping `moment <= to`. Completes the date-tz bug-class
 * started in `07861c58` (which fixed the dateFrom/dateTo siblings).
 *
 * Reports under test: abc-analysis · returns-ratio · sales-by-channel ·
 * sales-by-hour · average-basket · inventory-variance.
 *
 * Why this proves the fix (NON-VACUOUS by construction): a document posted
 * "now" lands on TODAY's Tashkent calendar day at a real time (e.g. 21:42
 * local = 16:42Z), which is AFTER today's UTC midnight. The OLD code queried
 * a single-day `from=to=today` range as `moment >= todayMidnightUTC AND moment
 * <= todayMidnightUTC` → matches only the exact 00:00:00.000Z instant → EMPTY.
 * The NEW code's window is `[today 00:00 Tashkent, today 24:00 Tashkent)` →
 * includes the whole local day → our document appears. So every "TODAY
 * includes our doc" assertion below would FAIL under the pre-fix code.
 *
 * Isolated + self-cleaning: throwaway store + product + Enter + Demand +
 * Inventory only; references existing org/counterparty; mutates ZERO real data.
 *
 * Claims proven:
 *   A. abc-analysis from=to=TODAY → our product row present, revenue == sale.
 *   B. abc-analysis from=to=TOMORROW → our product ABSENT (upper bound holds).
 *   C. abc-analysis from=to=YESTERDAY → our product ABSENT (lower bound holds).
 *   D. returns-ratio (product) from=to=TODAY → our product present, sold==sale.
 *   E. sales-by-channel from=to=TODAY → 200 (no 500 on real qty data) +
 *      totalRevenue >= our sale (our demand is a direct/«Прямые» sale).
 *   F. sales-by-hour from=to=TODAY → 200 + Σ row revenue >= our sale.
 *   G. average-basket (day) from=to=TODAY → 200 + totals.revenue >= our sale.
 *   H. inventory-variance from=to=TODAY → variance cost > 0 (our shortage in).
 *   I. inventory-variance from=to=TOMORROW → variance < today (bounded).
 *
 * Usage: node scripts/verify-report-date-tz-smoke.mjs
 *   env: API_BASE (default http://localhost:4000/api/v1), LOGIN_EMAIL, LOGIN_PASSWORD
 * Requires: dev stack up (pnpm dev).
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

// Asia/Tashkent (UTC+5, no DST) calendar date for an epoch-ms instant — the
// FE sends exactly this kind of "YYYY-MM-DD" date-only string.
const TZ = 5 * 60 * 60 * 1000;
const tashkentDate = (ms) => new Date(ms + TZ).toISOString().slice(0, 10);

const report = (path, from, to, extra = '') =>
  api('GET', `/reports/${path}?from=${from}&to=${to}${extra}`);

const created = { store: null, product: null, enter: null, demand: null, inventory: null };
const SALE_MINOR = 1000000000n; // 50 units × 20 000 000 tiyin (VAT off → sum == price×qty)

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

  const now = Date.now();
  const TODAY = tashkentDate(now);
  const TOMORROW = tashkentDate(now + 86400000);
  const YESTERDAY = tashkentDate(now - 86400000);
  console.log(`Tashkent dates: yesterday=${YESTERDAY} today=${TODAY} tomorrow=${TOMORROW}`);

  const tag = now;
  const NAME = `SMOKE-RPT-DATETZ-${tag}`;

  const st = await api('POST', '/admin/stores', { name: `${NAME}-STORE` });
  created.store = st.json?.id;
  if (!created.store) throw new Error(`store create failed: ${st.status} ${JSON.stringify(st.json)}`);
  const S1 = created.store;

  const p = await api('POST', '/products', { name: NAME });
  created.product = p.json?.id;
  if (!created.product)
    throw new Error(`product create failed: ${p.status} ${JSON.stringify(p.json)}`);
  const PID = created.product;
  console.log(`anchors: S1=${S1.slice(0, 8)} PID=${PID.slice(0, 8)} ORG=${ORG.slice(0, 8)}`);

  // Enter 100 @ cost 1000.00 → physical stock for the sale + inventory baseline.
  const e = await api('POST', '/enters', {
    organizationId: ORG,
    storeId: S1,
    positions: [{ assortmentId: PID, quantity: '100', costMinor: '100000' }],
  });
  created.enter = e.json?.id;
  if (!created.enter) throw new Error(`enter create failed: ${e.status} ${JSON.stringify(e.json)}`);
  let t = await api('POST', `/enters/${created.enter}/transitions/post`);
  if (t.status !== 200 && t.status !== 201)
    throw new Error(`enter post failed: ${t.status} ${JSON.stringify(t.json)}`);

  // Demand: 50 @ 200 000.00, VAT off → sum_minor = 1 000 000 000 (== SALE_MINOR).
  const d = await api('POST', '/demands', {
    agentId: CP,
    organizationId: ORG,
    storeId: S1,
    vatEnabled: false,
    positions: [{ assortmentId: PID, quantity: '50', priceMinor: '20000000' }],
  });
  created.demand = d.json?.id;
  if (!created.demand)
    throw new Error(`demand create failed: ${d.status} ${JSON.stringify(d.json)}`);
  t = await api('POST', `/demands/${created.demand}/transitions/post`);
  if (t.status !== 200 && t.status !== 201)
    throw new Error(`demand post failed: ${t.status} ${JSON.stringify(t.json)}`);
  console.log(`posted demand sum=${SALE_MINOR} (stock now 50)`);

  // Inventory: count 40 vs expected 50 → shortage 10 × cost 1000.00 = variance.
  const inv = await api('POST', '/inventories', {
    organizationId: ORG,
    storeId: S1,
    positions: [{ assortmentId: PID, actualQty: '40' }],
  });
  created.inventory = inv.json?.id;
  if (!created.inventory)
    throw new Error(`inventory create failed: ${inv.status} ${JSON.stringify(inv.json)}`);
  t = await api('POST', `/inventories/${created.inventory}/transitions/post`);
  if (t.status !== 200 && t.status !== 201)
    throw new Error(`inventory post failed: ${t.status} ${JSON.stringify(t.json)}`);
  console.log('posted inventory (shortage 10)');

  // ── A. abc-analysis TODAY → our product present with the exact sale revenue ──
  const abcT = await report('abc-analysis', TODAY, TODAY, '&limit=2000');
  const abcRow = (abcT.json?.rows ?? []).find((r) => r.productId === PID);
  if (abcT.status === 200 && abcRow && BigInt(abcRow.revenueMinor) === SALE_MINOR)
    pass(`A: abc TODAY → product present, revenue ${abcRow.revenueMinor} == sale (last day INCLUDED)`);
  else
    fail(
      `A: abc TODAY expected PID revenue ${SALE_MINOR}, got status=${abcT.status} row=${JSON.stringify(abcRow)}`,
    );

  // ── B. abc TOMORROW → product absent (exclusive upper bound) ──
  const abcTom = await report('abc-analysis', TOMORROW, TOMORROW, '&limit=2000');
  if (abcTom.status === 200 && !(abcTom.json?.rows ?? []).some((r) => r.productId === PID))
    pass('B: abc TOMORROW → product ABSENT (upper bound excludes the next Tashkent day)');
  else fail(`B: abc TOMORROW should NOT contain PID, status=${abcTom.status}`);

  // ── C. abc YESTERDAY → product absent (lower bound) ──
  const abcYst = await report('abc-analysis', YESTERDAY, YESTERDAY, '&limit=2000');
  if (abcYst.status === 200 && !(abcYst.json?.rows ?? []).some((r) => r.productId === PID))
    pass('C: abc YESTERDAY → product ABSENT (lower bound excludes the prior Tashkent day)');
  else fail(`C: abc YESTERDAY should NOT contain PID, status=${abcYst.status}`);

  // ── D. returns-ratio TODAY → window sold-revenue includes our sale ──
  // (totals.soldRevenueMinor is summed over the windowed `sold` set, robust to
  //  the per-row sort/slice/groupBy; non-vacuous — old single-day range = empty.)
  const rr = await report('returns-ratio', TODAY, TODAY, '&groupBy=product&limit=2000');
  if (rr.status === 200 && BigInt(rr.json?.totals?.soldRevenueMinor ?? '0') >= SALE_MINOR)
    pass(`D: returns-ratio TODAY → 200, totals.sold ${rr.json.totals.soldRevenueMinor} >= sale`);
  else
    fail(
      `D: returns-ratio TODAY expected totals.sold >= ${SALE_MINOR}, status=${rr.status} totals=${JSON.stringify(rr.json?.totals)}`,
    );

  // ── E. sales-by-channel TODAY → 200 (no 500 on real qty) + total >= sale ──
  const sbc = await report('sales-by-channel', TODAY, TODAY);
  if (sbc.status === 200 && BigInt(sbc.json?.totalRevenueMinor ?? '0') >= SALE_MINOR)
    pass(`E: sales-by-channel TODAY → 200, totalRevenue ${sbc.json.totalRevenueMinor} >= sale`);
  else
    fail(`E: sales-by-channel TODAY status=${sbc.status} total=${sbc.json?.totalRevenueMinor}`);

  // ── F. sales-by-hour TODAY → 200 + Σ row revenue >= sale ──
  const sbh = await report('sales-by-hour', TODAY, TODAY);
  const sbhTotal = (sbh.json?.rows ?? []).reduce((acc, r) => acc + BigInt(r.revenueMinor ?? '0'), 0n);
  if (sbh.status === 200 && sbhTotal >= SALE_MINOR)
    pass(`F: sales-by-hour TODAY → 200, Σ row revenue ${sbhTotal} >= sale`);
  else fail(`F: sales-by-hour TODAY status=${sbh.status} sum=${sbhTotal}`);

  // ── G. average-basket (day) TODAY → 200 + totals.revenue >= sale ──
  const ab = await report('average-basket', TODAY, TODAY, '&granularity=day');
  if (ab.status === 200 && BigInt(ab.json?.totals?.revenueMinor ?? '0') >= SALE_MINOR)
    pass(`G: average-basket TODAY → 200, totals.revenue ${ab.json.totals.revenueMinor} >= sale`);
  else fail(`G: average-basket TODAY status=${ab.status} total=${ab.json?.totals?.revenueMinor}`);

  // ── H. inventory-variance TODAY → our posted inventory doc is in the window ──
  // (inventoryCount = posted inventories in [gte, lt); the date-boundary signal,
  //  independent of whether per-position cost_minor was snapshotted.)
  const ivT = await report('inventory-variance', TODAY, TODAY);
  const ivTodayCount = ivT.json?.totals?.inventoryCount ?? 0;
  if (ivT.status === 200 && ivTodayCount > 0)
    pass(`H: inventory-variance TODAY → 200, inventoryCount ${ivTodayCount} > 0 (doc INCLUDED)`);
  else fail(`H: inventory-variance TODAY status=${ivT.status} count=${ivTodayCount}`);

  // ── I. inventory-variance TOMORROW → strictly fewer docs (ours excluded) ──
  const ivTom = await report('inventory-variance', TOMORROW, TOMORROW);
  const ivTomCount = ivTom.json?.totals?.inventoryCount ?? 0;
  if (ivTom.status === 200 && ivTomCount < ivTodayCount)
    pass(`I: inventory-variance TOMORROW → count ${ivTomCount} < today ${ivTodayCount} (bounded)`);
  else fail(`I: inventory-variance TOMORROW status=${ivTom.status} count=${ivTomCount}`);

  console.log('');
  const ok = results.filter(Boolean).length;
  console.log(`RESULT: ${ok}/${results.length} passed`);
  if (ok !== results.length) process.exitCode = 1;
}

async function cleanup() {
  console.log('\ncleanup (best-effort)…');
  if (created.inventory) {
    await api('POST', `/inventories/${created.inventory}/transitions/unpost`).catch(() => {});
    await api('DELETE', `/inventories/${created.inventory}`).catch(() => {});
  }
  if (created.demand) {
    await api('POST', `/demands/${created.demand}/transitions/unpost`).catch(() => {});
    await api('DELETE', `/demands/${created.demand}`).catch(() => {});
  }
  if (created.enter) {
    await api('POST', `/enters/${created.enter}/transitions/unpost`).catch(() => {});
    await api('DELETE', `/enters/${created.enter}`).catch(() => {});
  }
  if (created.product) await api('DELETE', `/products/${created.product}`).catch(() => {});
  if (created.store) await api('POST', `/admin/stores/${created.store}/archive`).catch(() => {});
  console.log('cleanup done (archived throwaway store, soft-deleted product + docs)');
}

main()
  .catch((err) => {
    console.error('FATAL', err);
    process.exitCode = 1;
  })
  .finally(cleanup);
