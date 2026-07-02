#!/usr/bin/env node
/**
 * Runtime verification (11x): the vestigial `in_transit_qty` columns
 * (`stocks.in_transit_qty` + `purchase_order_positions.in_transit_qty`) are
 * DROPPED, and NOTHING that read/wrote them at runtime broke.
 *
 * The dangerous path is `StockService.lockBalances`, whose `SELECT … FROM stocks
 * FOR UPDATE` was RAW SQL — NOT typechecked. A leftover `in_transit_qty` there
 * would throw "column does not exist" on EVERY posting once the column is gone.
 * Posting a Demand that succeeds (200) AND one that is correctly blocked (400)
 * both traverse lockBalances → assertAvailable → applyDeltas, so they prove the
 * raw-SQL select + the upsert (which used to create `inTransitQty: 0`) work
 * against the dropped column.
 *
 * Isolated + self-cleaning: throwaway product + fresh store + Enter. Mutates
 * ZERO real product stock. Cleans up best-effort.
 *
 * Claims proven (HTTP, live api against real Postgres):
 *   A. Enter(5) posts (200) → applyDeltas upsert works without inTransitQty.
 *   A2. GET /stocks → 200, item has {qty,reservedQty} and NO `inTransitQty` key
 *       (the always-0 field is gone from the UI endpoint).
 *   B. confirm PO(100) → report «Ожидание»=100, «Доступно»=105 — the query-time
 *      in-transit (a different, surviving field) still computes after the
 *      report's always-0 Stock.inTransitQty reads were removed.
 *   C. Demand(15 > physical 5) post → 400 InsufficientStock — lockBalances raw
 *      SQL works AND the physical block is intact (a 500 = broken raw SQL).
 *   D. Demand(3 ≤ physical 5) post → 200 (lockBalances success path), qty→2;
 *      unpost restores qty=5.
 *
 * Usage: node scripts/verify-drop-in-transit-qty-columns-smoke.mjs
 *   env: API_BASE (default http://localhost:4000/api/v1), LOGIN_EMAIL, LOGIN_PASSWORD
 * Requires: dev stack up (pnpm dev) + migration applied (column dropped).
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

async function row({ productId, storeId, grouped }) {
  const qs = new URLSearchParams({ productId, limit: '20' });
  if (storeId) qs.set('storeId', storeId);
  if (grouped) qs.set('groupBy', 'product');
  const r = await api('GET', `/reports/stock-balance?${qs.toString()}`);
  if (r.status !== 200) throw new Error(`stock-balance ${r.status} ${JSON.stringify(r.json)}`);
  return (r.json?.items ?? [])[0] ?? null;
}

const created = { store: null, product: null, enter: null, pos: [], demands: [] };

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

  // Fresh throwaway store (allowNegativeStock=false default → §6 block engages).
  const st = await api('POST', '/admin/stores', { name: `SMOKE-DROPIT-STORE-${tag}` });
  created.store = st.json?.id;
  if (!created.store)
    throw new Error(`store create failed: ${st.status} ${JSON.stringify(st.json)}`);
  const S1 = created.store;

  const p = await api('POST', '/products', { name: `SMOKE-DROPIT-${tag}` });
  created.product = p.json?.id;
  if (!created.product)
    throw new Error(`product create failed: ${p.status} ${JSON.stringify(p.json)}`);
  const PID = created.product;
  console.log(`anchors: S1(new,noNeg)=${S1.slice(0, 8)} PID=${PID.slice(0, 8)}`);

  // ── A. Enter(5) @ S1 → applyDeltas upsert (used to create inTransitQty:0) ──
  const e = await api('POST', '/enters', {
    organizationId: ORG,
    storeId: S1,
    positions: [{ assortmentId: PID, quantity: '5', costMinor: '100000' }],
  });
  created.enter = e.json?.id;
  if (!created.enter) throw new Error(`enter create failed: ${e.status} ${JSON.stringify(e.json)}`);
  const ep = await api('POST', `/enters/${created.enter}/transitions/post`);
  if (ep.status === 200 || ep.status === 201)
    pass(`A: Enter(5) posts → ${ep.status} (applyDeltas upsert works without in_transit_qty)`);
  else fail(`A: enter post expected 200/201, got ${ep.status} ${JSON.stringify(ep.json)}`);

  // ── A2. /stocks UI endpoint: 200, shape has NO inTransitQty key ──
  const sres = await api('GET', `/stocks?storeId=${S1}&assortmentIds=${PID}`);
  const item = (sres.json?.items ?? [])[0];
  if (
    sres.status === 200 &&
    item &&
    item.qty === '5' &&
    item.reservedQty === '0' &&
    !('inTransitQty' in item)
  )
    pass(`A2: GET /stocks → 200, item {qty:5,reservedQty:0}, NO inTransitQty key (drop honoured)`);
  else
    fail(
      `A2: expected 200 + {qty:5,reservedQty:0,no inTransitQty}, got ${sres.status} ${JSON.stringify(item)}`,
    );

  // ── B. confirm PO(100) → report query-time «Ожидание»=100, «Доступно»=105 ──
  const po = await api('POST', '/purchase-orders', {
    agentId: CP,
    organizationId: ORG,
    storeId: S1,
    positions: [{ assortmentId: PID, quantity: '100', priceMinor: '100000' }],
  });
  if (!po.json?.id) throw new Error(`PO create failed: ${po.status} ${JSON.stringify(po.json)}`);
  created.pos.push(po.json.id);
  const cf = await api('POST', `/purchase-orders/${po.json.id}/transitions/confirm`);
  if (cf.status !== 200 && cf.status !== 201)
    throw new Error(`PO confirm failed: ${cf.status} ${JSON.stringify(cf.json)}`);
  const rB = await row({ productId: PID, storeId: S1 });
  if (rB && Number(rB.inTransitQty) === 100 && Number(rB.available) === 105)
    pass(`B: report «Ожидание»=100, «Доступно»=105 (query-time field survives the column drop)`);
  else fail(`B: expected report it=100/avail=105, got ${JSON.stringify(rB)}`);

  // ── C. §6: Demand(15 > physical 5) post → 400 (lockBalances raw SQL works) ──
  const dBlock = await api('POST', '/demands', {
    agentId: CP,
    organizationId: ORG,
    storeId: S1,
    positions: [{ assortmentId: PID, quantity: '15', priceMinor: '100000' }],
  });
  if (dBlock.json?.id) created.demands.push(dBlock.json.id);
  const dBlockPost = dBlock.json?.id
    ? await api('POST', `/demands/${dBlock.json.id}/transitions/post`)
    : { status: 0, json: null };
  const body = JSON.stringify(dBlockPost.json ?? {});
  if (dBlockPost.status === 400 && (body.includes('InsufficientStock') || body.includes('yetarli')))
    pass(`C: Demand(15) → 400 InsufficientStock (lockBalances raw SQL OK; physical block intact)`);
  else fail(`C: expected 400 InsufficientStock (NOT 500=broken raw SQL), got ${dBlockPost.status} ${body}`);

  // ── D. Demand(3 ≤ 5) post → 200 (lockBalances success path), qty→2, unpost→5 ──
  const dOk = await api('POST', '/demands', {
    agentId: CP,
    organizationId: ORG,
    storeId: S1,
    positions: [{ assortmentId: PID, quantity: '3', priceMinor: '100000' }],
  });
  if (dOk.json?.id) created.demands.push(dOk.json.id);
  const dOkPost = dOk.json?.id
    ? await api('POST', `/demands/${dOk.json.id}/transitions/post`)
    : { status: 0 };
  if (dOkPost.status === 200 || dOkPost.status === 201) {
    const rD = await row({ productId: PID, storeId: S1 });
    if (rD && Number(rD.qty) === 2 && Number(rD.inTransitQty) === 100)
      pass(`D: Demand(3) posts → ${dOkPost.status}, qty=2, Ожидание steady=100 (success path OK)`);
    else fail(`D: expected qty=2/it=100 after ship, got ${JSON.stringify(rD)}`);
    await api('POST', `/demands/${dOk.json.id}/transitions/unpost`);
    const rD3 = await row({ productId: PID, storeId: S1 });
    if (rD3 && Number(rD3.qty) === 5) pass(`D2: unpost restored physical qty=5`);
    else fail(`D2: expected qty=5 after unpost, got ${rD3?.qty}`);
  } else fail(`D: expected Demand(3) to post (NOT 500), got ${dOkPost.status}`);

  console.log('');
  const ok = results.filter(Boolean).length;
  console.log(`RESULT: ${ok}/${results.length} passed`);
  if (ok !== results.length) process.exitCode = 1;
}

async function cleanup() {
  console.log('\ncleanup (best-effort)…');
  for (const id of created.demands) {
    await api('POST', `/demands/${id}/transitions/unpost`).catch(() => {});
    await api('DELETE', `/demands/${id}`).catch(() => {});
  }
  for (const id of created.pos) {
    await api('POST', `/purchase-orders/${id}/transitions/cancel`).catch(() => {});
    await api('DELETE', `/purchase-orders/${id}`).catch(() => {});
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
