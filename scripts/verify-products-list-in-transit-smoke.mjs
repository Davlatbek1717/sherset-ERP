#!/usr/bin/env node
/**
 * Runtime verification (11z): the products list (`GET /products`) now surfaces
 * «Ожидание» / in-transit and computes the *displayed* «Доступно» = Остаток −
 * Резерв + Ожидание (moysklad formula) — completing the 11w/11v design at the
 * products-list site (design §6/§211) so the list and the stock-balance report
 * AGREE for the same product.
 *
 * Exercises the FULL live path against real Postgres: HTTP → ProductService →
 * ProductRepository.attachStock → the shared StockInTransitService's
 * relation-filtered PurchaseOrderPosition⋈PurchaseOrder join (a unit stub cannot
 * prove this join nor the cross-service wiring through Nest DI).
 *
 * Isolated + self-cleaning: throwaway store + product + Enter + POs only;
 * references existing org/counterparty rows; mutates ZERO real product stock.
 *
 * Claims proven:
 *   A. fresh product, no PO → onHand=0, reserved=0, inTransit=0, available=0
 *      (zero-regress: available unchanged when no in-transit).
 *   B. Enter(5), no PO → onHand=5, inTransit=0, available=5 (still Остаток−Резерв).
 *   C. HEADLINE: confirm PO(100) → inTransit=100, available=105
 *      (Остаток − Резерв + Ожидание = 5 − 0 + 100; the products list now folds
 *      in-transit into «Доступно», which it did NOT before this slice).
 *   D. CROSS-PAGE CONSISTENCY: products-list stock.{inTransit,available} EQUALS
 *      the stock-balance report (grouped) inTransitQty/available for the same
 *      product — the inconsistency this slice fixes is gone.
 *   E. draft PO(50) excluded → inTransit still 100 (state filter shared with report).
 *   F. partial receipt 20/50 via Supply → onHand=25, inTransit=30 (remainder),
 *      available=55 (Остаток follows receipt, Ожидание follows remainder).
 *
 * Usage: node scripts/verify-products-list-in-transit-smoke.mjs
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

// Read our product's row from the live products LIST endpoint (the surface
// under test), located by id within the search results.
async function listStock(productId, search) {
  const qs = new URLSearchParams({ search, limit: '20' });
  const r = await api('GET', `/products?${qs.toString()}`);
  if (r.status !== 200) throw new Error(`/products ${r.status} ${JSON.stringify(r.json)}`);
  const items = r.json?.items ?? r.json ?? [];
  const me = items.find((p) => p.id === productId);
  return me?.stock ?? null;
}

// Read the same product's row from the stock-balance report (grouped) — the
// page we must now AGREE with.
async function reportRow(productId) {
  const qs = new URLSearchParams({ productId, groupBy: 'product', limit: '20' });
  const r = await api('GET', `/reports/stock-balance?${qs.toString()}`);
  if (r.status !== 200) throw new Error(`stock-balance ${r.status} ${JSON.stringify(r.json)}`);
  return (r.json?.items ?? [])[0] ?? null;
}

const created = { store: null, product: null, enter: null, pos: [], supplies: [] };

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
  const NAME = `SMOKE-PLIST-INTRANSIT-${tag}`;

  const st = await api('POST', '/admin/stores', { name: `${NAME}-STORE` });
  created.store = st.json?.id;
  if (!created.store)
    throw new Error(`store create failed: ${st.status} ${JSON.stringify(st.json)}`);
  const S1 = created.store;

  const p = await api('POST', '/products', { name: NAME });
  created.product = p.json?.id;
  if (!created.product)
    throw new Error(`product create failed: ${p.status} ${JSON.stringify(p.json)}`);
  const PID = created.product;
  console.log(`anchors: S1=${S1.slice(0, 8)} PID=${PID.slice(0, 8)} ORG=${ORG.slice(0, 8)}`);

  // ── A. fresh product, no stock, no PO → all zero ──
  const sA = await listStock(PID, NAME);
  if (
    sA &&
    Number(sA.onHand) === 0 &&
    Number(sA.reserved) === 0 &&
    Number(sA.inTransit) === 0 &&
    Number(sA.available) === 0
  )
    pass(`A: fresh product → onHand=0, Резерв=0, Ожидание=0, Доступно=0`);
  else fail(`A: expected all-zero stock, got ${JSON.stringify(sA)}`);

  // give it physical stock: Enter 5 @ S1, post it
  const e = await api('POST', '/enters', {
    organizationId: ORG,
    storeId: S1,
    positions: [{ assortmentId: PID, quantity: '5', costMinor: '100000' }],
  });
  created.enter = e.json?.id;
  if (!created.enter) throw new Error(`enter create failed: ${e.status} ${JSON.stringify(e.json)}`);
  const ep = await api('POST', `/enters/${created.enter}/transitions/post`);
  if (ep.status !== 200 && ep.status !== 201)
    throw new Error(`enter post failed: ${ep.status} ${JSON.stringify(ep.json)}`);

  // ── B. Enter(5), no PO → onHand=5, Ожидание=0, Доступно=5 (zero-regress) ──
  const sB = await listStock(PID, NAME);
  if (sB && Number(sB.onHand) === 5 && Number(sB.inTransit) === 0 && Number(sB.available) === 5)
    pass(`B: Enter(5), no PO → Остаток=5, Ожидание=0, Доступно=5 (= Остаток − Резерв, unchanged)`);
  else fail(`B: expected onHand5/it0/avail5, got ${JSON.stringify(sB)}`);

  async function makePO(qty, storeId) {
    const po = await api('POST', '/purchase-orders', {
      agentId: CP,
      organizationId: ORG,
      storeId,
      positions: [{ assortmentId: PID, quantity: String(qty), priceMinor: '100000' }],
    });
    if (!po.json?.id) throw new Error(`PO create failed: ${po.status} ${JSON.stringify(po.json)}`);
    created.pos.push(po.json.id);
    return po.json.id;
  }
  async function confirmPO(id) {
    const t = await api('POST', `/purchase-orders/${id}/transitions/confirm`);
    if (t.status !== 200 && t.status !== 201)
      throw new Error(`PO confirm failed: ${t.status} ${JSON.stringify(t.json)}`);
  }

  // ── C. HEADLINE: confirm PO(100) → Ожидание=100, Доступно=105 ──
  const PO1 = await makePO(100, S1);
  await confirmPO(PO1);
  const sC = await listStock(PID, NAME);
  if (sC && Number(sC.inTransit) === 100 && Number(sC.available) === 105 && Number(sC.onHand) === 5)
    pass(`C: confirm PO(100) → products-list Ожидание=100, Доступно=105 (5 − 0 + 100)`);
  else fail(`C: expected it100/avail105/onHand5, got ${JSON.stringify(sC)}`);

  // ── D. CROSS-PAGE CONSISTENCY: list == report for the same product ──
  const rep = await reportRow(PID);
  if (
    rep &&
    sC &&
    Number(rep.inTransitQty) === Number(sC.inTransit) &&
    Number(rep.available) === Number(sC.available) &&
    Number(rep.qty) === Number(sC.onHand)
  )
    pass(
      `D: products-list AGREES with stock-balance report — Ожидание ${sC.inTransit}=${rep.inTransitQty}, Доступно ${sC.available}=${rep.available} (the inconsistency is fixed)`,
    );
  else fail(`D: list/report mismatch — list=${JSON.stringify(sC)} report=${JSON.stringify(rep)}`);

  // ── E. draft PO(50) — NOT confirmed → Ожидание unchanged ──
  const PO2 = await makePO(50, S1);
  const sE = await listStock(PID, NAME);
  if (sE && Number(sE.inTransit) === 100)
    pass(`E: draft PO(50) excluded → Ожидание still 100 (state filter shared with report)`);
  else fail(`E: expected it=100 (draft excluded), got ${sE?.inTransit}`);

  // ── F. partial receipt 20/50 of PO2 via Supply → confirm PO2, receive 20 ──
  await confirmPO(PO2); // now Ожидание = 100 + 50 = 150
  const sFmid = await listStock(PID, NAME);
  if (sFmid && Number(sFmid.inTransit) === 150)
    pass(`F0: confirm PO2 → Ожидание=150 (multi-PO sum 100 + 50)`);
  else fail(`F0: expected it=150, got ${sFmid?.inTransit}`);
  const po2detail = await api('GET', `/purchase-orders/${PO2}`);
  const pos2Id = (po2detail.json?.positions ?? [])[0]?.id;
  if (!pos2Id) fail(`F-setup: could not read PO2 position id`);
  else {
    const sup = await api('POST', `/supplies/from-purchase-order/${PO2}`, {
      quantities: { [pos2Id]: '20' },
    });
    if (sup.json?.id) created.supplies.push(sup.json.id);
    const supPost = sup.json?.id
      ? await api('POST', `/supplies/${sup.json.id}/transitions/post`)
      : { status: 0, json: null };
    if (supPost.status === 200 || supPost.status === 201) {
      // PO2 remainder 30; received 20 lands as physical stock → onHand 5+20=25.
      // PO1 still contributes 100 → Ожидание = 100 + 30 = 130; Доступно = 25 − 0 + 130 = 155.
      const sF = await listStock(PID, NAME);
      if (
        sF &&
        Number(sF.onHand) === 25 &&
        Number(sF.inTransit) === 130 &&
        Number(sF.available) === 155
      )
        pass(
          `F: partial receipt 20/50 → Остаток=25, Ожидание=130 (100 + remainder 30), Доступно=155`,
        );
      else fail(`F: expected onHand25/it130/avail155, got ${JSON.stringify(sF)}`);
    } else fail(`F: supply post failed ${supPost.status} ${JSON.stringify(supPost.json)}`);
  }

  console.log('');
  const ok = results.filter(Boolean).length;
  console.log(`RESULT: ${ok}/${results.length} passed`);
  if (ok !== results.length) process.exitCode = 1;
}

async function cleanup() {
  console.log('\ncleanup (best-effort)…');
  for (const id of created.supplies) {
    await api('POST', `/supplies/${id}/transitions/unpost`).catch(() => {});
    await api('DELETE', `/supplies/${id}`).catch(() => {});
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
  console.log(
    'cleanup done (archived throwaway store, soft-deleted product + docs; real stock untouched)',
  );
}

main()
  .catch((err) => {
    console.error('FATAL', err);
    process.exitCode = 1;
  })
  .finally(cleanup);
