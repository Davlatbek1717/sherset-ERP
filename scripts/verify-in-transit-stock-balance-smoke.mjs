#!/usr/bin/env node
/**
 * Runtime verification (11w): «Ожидание» / in-transit on the stock-balance
 * report is now computed QUERY-TIME from active supplier-order positions, and
 * the *displayed* «Доступно» = Остаток − Резерв + Ожидание (moysklad formula)
 * — WITHOUT relaxing the physical posting-sufficiency block (design §6).
 *
 * Exercises the FULL live path against real Postgres: HTTP → report service →
 * the relation-filtered PurchaseOrderPosition⋈PurchaseOrder join (a unit stub
 * cannot prove this join), across PO state transitions.
 *
 * Isolated + self-cleaning: creates a throwaway product, gives it physical
 * stock via an Enter, and only references existing store/org/counterparty rows.
 * Mutates ZERO real product stock. Cleans up (best-effort) at the end.
 *
 * Claims proven:
 *   A. Enter post → product row appears, qty=5, Ожидание=0, Доступно=5.
 *   B. confirm PO(100) → Ожидание=100, Доступно=105 (query-time join works).
 *   C. §6 HEADLINE: Demand(15 > physical 5, < displayed 105) post → 400
 *      InsufficientStock (displayed «Доступно» did NOT relax the block).
 *   D. negative control: Demand(3 ≤ physical 5) posts (200) → not blocking
 *      everything; unpost restores.
 *   E. draft PO(50) → Ожидание unchanged (draft excluded by state filter).
 *   F. confirm PO2 → Ожидание=150 (multi-PO sum).
 *   G. cancel PO1 → Ожидание=50 (cancelled excluded).
 *   H. multi-store PO3(7 @ store2) → flat per-store isolated; grouped sums
 *      across stores (50 + 7 = 57).
 *
 * Usage: node scripts/verify-in-transit-stock-balance-smoke.mjs
 *   env: API_BASE (default http://localhost:4000/api/v1), LOGIN_EMAIL, LOGIN_PASSWORD
 * Requires: dev stack up (pnpm dev).
 */

const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';
const EMAIL = process.env.LOGIN_EMAIL ?? 'admin@demo.local';
const PASSWORD = process.env.LOGIN_PASSWORD ?? 'admin123';
let TOKEN = '';

async function api(method, path, body) {
  // Body-less POST/DELETE still need a non-empty JSON body — the API rejects
  // an application/json request with an empty body (the 06c Content-Type class).
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

// Read one stock-balance row for our product (flat by store, or grouped).
async function row({ productId, storeId, grouped }) {
  const qs = new URLSearchParams({ productId, limit: '20' });
  if (storeId) qs.set('storeId', storeId);
  if (grouped) qs.set('groupBy', 'product');
  const r = await api('GET', `/reports/stock-balance?${qs.toString()}`);
  if (r.status !== 200) throw new Error(`stock-balance ${r.status} ${JSON.stringify(r.json)}`);
  const items = r.json?.items ?? [];
  // flat-by-store: exactly the row for this store; grouped: the single product row.
  return items[0] ?? null;
}

const created = { store: null, product: null, enter: null, pos: [], demands: [], supplies: [] };

async function main() {
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  TOKEN = login.json?.accessToken;
  if (!TOKEN) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.json)}`);
  console.log('logged in');

  // ── anchors: org + counterparty (read-only refs); S2 = any existing store ──
  const stores = await api('GET', '/stores?limit=50');
  const storeList = stores.json?.items ?? stores.json ?? [];
  const S2 = storeList[0]?.id;
  const orgs = await api('GET', '/organizations?limit=5');
  const ORG = (orgs.json?.items ?? orgs.json ?? [])[0]?.id;
  const cps = await api('GET', '/counterparties?limit=5');
  const CP = (cps.json?.items ?? cps.json ?? [])[0]?.id;
  if (!S2 || !ORG || !CP) throw new Error('missing anchors (store/org/counterparty)');

  const tag = Date.now();

  // S1 = a FRESH throwaway store with allowNegativeStock=false (default) — the
  // §6 physical posting-block only engages when negative stock is disallowed.
  const st = await api('POST', '/admin/stores', { name: `SMOKE-INTRANSIT-STORE-${tag}` });
  created.store = st.json?.id;
  if (!created.store)
    throw new Error(`store create failed: ${st.status} ${JSON.stringify(st.json)}`);
  const S1 = created.store;
  console.log(
    `anchors: S1(new,noNeg)=${S1.slice(0, 8)} S2=${S2.slice(0, 8)} ORG=${ORG.slice(0, 8)} CP=${CP.slice(0, 8)}`,
  );

  // ── setup: throwaway product ──
  const p = await api('POST', '/products', { name: `SMOKE-INTRANSIT-${tag}` });
  created.product = p.json?.id;
  if (!created.product)
    throw new Error(`product create failed: ${p.status} ${JSON.stringify(p.json)}`);
  const PID = created.product;

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

  // helper to create + confirm a PO; returns id
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

  // ── A. Enter posted: qty=5, Ожидание=0, Доступно=5 ──
  const rA = await row({ productId: PID, storeId: S1 });
  if (rA && Number(rA.qty) === 5 && Number(rA.inTransitQty) === 0 && Number(rA.available) === 5)
    pass(`A: Enter posted → qty=5, Ожидание=0, Доступно=5`);
  else fail(`A: expected qty5/it0/avail5, got ${JSON.stringify(rA)}`);

  // ── B. confirm PO1(100) → Ожидание=100, Доступно=105 ──
  const PO1 = await makePO(100, S1);
  await confirmPO(PO1);
  const rB = await row({ productId: PID, storeId: S1 });
  if (rB && Number(rB.inTransitQty) === 100 && Number(rB.available) === 105)
    pass(`B: confirm PO(100) → Ожидание=100, Доступно=105 (qty − reserved + inTransit)`);
  else fail(`B: expected it100/avail105, got ${JSON.stringify(rB)}`);

  // ── C. §6 HEADLINE: Demand(15) > physical 5 but < displayed 105 → BLOCKED ──
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
  const blockedBody = JSON.stringify(dBlockPost.json ?? {});
  if (
    dBlockPost.status === 400 &&
    (blockedBody.includes('InsufficientStock') || blockedBody.includes('yetarli'))
  )
    pass(
      `C §6: Demand(15) post → 400 InsufficientStock (displayed Доступно=105 did NOT relax physical block)`,
    );
  else fail(`C §6: expected 400 InsufficientStock, got ${dBlockPost.status} ${blockedBody}`);

  // verify physical stock untouched by the blocked attempt
  const rC = await row({ productId: PID, storeId: S1 });
  if (rC && Number(rC.qty) === 5)
    pass(`C2: blocked Demand left physical qty=5 (no partial deduction)`);
  else fail(`C2: expected qty=5 after blocked demand, got ${rC?.qty}`);

  // ── D. negative control: Demand(3) ≤ physical 5 → posts (200) ──
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
    pass(`D: Demand(3 ≤ physical 5) posts → ${dOkPost.status} (not blocking valid shipments)`);
    const rD = await row({ productId: PID, storeId: S1 });
    if (
      rD &&
      Number(rD.qty) === 2 &&
      Number(rD.inTransitQty) === 100 &&
      Number(rD.available) === 102
    )
      pass(`D2: after ship 3 → qty=2, Ожидание=100, Доступно=102 (Остаток down, Ожидание steady)`);
    else fail(`D2: expected qty2/it100/avail102, got ${JSON.stringify(rD)}`);
    // restore: unpost
    if (dOk.json?.id) await api('POST', `/demands/${dOk.json.id}/transitions/unpost`);
    const rD3 = await row({ productId: PID, storeId: S1 });
    if (rD3 && Number(rD3.qty) === 5) pass(`D3: unpost restored physical qty=5`);
    else fail(`D3: expected qty=5 after unpost, got ${rD3?.qty}`);
  } else fail(`D: expected Demand(3) to post, got ${dOkPost.status}`);

  // ── E. draft PO2(50) — NOT confirmed → Ожидание unchanged ──
  const PO2 = await makePO(50, S1);
  const rE = await row({ productId: PID, storeId: S1 });
  if (rE && Number(rE.inTransitQty) === 100) pass(`E: draft PO(50) excluded → Ожидание still 100`);
  else fail(`E: expected it=100 (draft excluded), got ${rE?.inTransitQty}`);

  // ── F. confirm PO2 → Ожидание=150 (multi-PO sum) ──
  await confirmPO(PO2);
  const rF = await row({ productId: PID, storeId: S1 });
  if (rF && Number(rF.inTransitQty) === 150)
    pass(`F: confirm PO2 → Ожидание=150 (100 + 50 multi-PO sum)`);
  else fail(`F: expected it=150, got ${rF?.inTransitQty}`);

  // ── G. cancel PO1 → Ожидание=50 (cancelled excluded) ──
  await api('POST', `/purchase-orders/${PO1}/transitions/cancel`);
  const rG = await row({ productId: PID, storeId: S1 });
  if (rG && Number(rG.inTransitQty) === 50)
    pass(`G: cancel PO1 → Ожидание=50 (only confirmed PO2 remains)`);
  else fail(`G: expected it=50 after cancel, got ${rG?.inTransitQty}`);

  // ── H. multi-store PO3(7 @ S2). S2 has NO Stock row for this product ──
  const PO3 = await makePO(7, S2);
  await confirmPO(PO3);
  const rH1 = await row({ productId: PID, storeId: S1 });
  if (rH1 && Number(rH1.inTransitQty) === 50)
    pass(`H: flat S1 isolated → Ожидание=50 (S1 PO only)`);
  else fail(`H: expected S1 it=50, got ${rH1?.inTransitQty}`);
  // S2 flat: product has in-transit 7 there but NO Stock row → not surfaced in
  // flat-by-store (documented bounded limitation: in-transit-only product, no
  // physical Stock row, is not synthesised into the report). Honest assertion.
  const rH2 = await row({ productId: PID, storeId: S2 });
  if (rH2 === null)
    pass(`H2: S2 flat row ABSENT (documented limitation — in-transit-only, no Stock row)`);
  else fail(`H2: expected no S2 flat row (in-transit-only), got ${JSON.stringify(rH2)}`);
  // grouped is product-centric (S1 Stock row exists) and sums in-transit across
  // ALL stores via PO positions → 50 + 7 = 57, Доступно = 5 − 0 + 57 = 62.
  const rHg = await row({ productId: PID, grouped: true });
  if (
    rHg &&
    Number(rHg.inTransitQty) === 57 &&
    Number(rHg.qty) === 5 &&
    Number(rHg.available) === 62
  )
    pass(`H3: grouped sums across stores → Ожидание=57 (50+7), Доступно=62 (5 − 0 + 57)`);
  else fail(`H3: expected grouped it=57/avail=62, got ${JSON.stringify(rHg)}`);

  // ── I. partial receipt of PO2(50 @ S1): receive 20 via Supply → PO2 becomes
  //       partially_received; report shows remainder 30 + Остаток += 20. ──
  const po2detail = await api('GET', `/purchase-orders/${PO2}`);
  const pos2Id = (po2detail.json?.positions ?? [])[0]?.id;
  if (!pos2Id) fail(`I-setup: could not read PO2 position id`);
  else {
    const sup = await api('POST', `/supplies/from-purchase-order/${PO2}`, {
      quantities: { [pos2Id]: '20' },
    });
    if (sup.json?.id) created.supplies.push(sup.json.id);
    const supPost = sup.json?.id
      ? await api('POST', `/supplies/${sup.json.id}/transitions/post`)
      : { status: 0, json: null };
    if (supPost.status === 200 || supPost.status === 201) {
      // PO2 should now be partially_received (still in the in-transit state set)
      const po2after = await api('GET', `/purchase-orders/${PO2}`);
      const st2 = po2after.json?.state;
      const rI = await row({ productId: PID, storeId: S1 });
      if (
        rI &&
        st2 === 'partially_received' &&
        Number(rI.inTransitQty) === 30 &&
        Number(rI.qty) === 25 &&
        Number(rI.available) === 55
      )
        pass(
          `I: partial receipt 20/50 → PO2 partially_received, Ожидание=30 (remainder), Остаток=25, Доступно=55`,
        );
      else
        fail(
          `I: expected partially_received/it30/qty25/avail55, got state=${st2} ${JSON.stringify(rI)}`,
        );
    } else fail(`I: supply post failed ${supPost.status} ${JSON.stringify(supPost.json)}`);
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
  // The store now holds stock → hard delete is refused; archive hides it from
  // the default list (the moysklad-parity way to retire a store with history).
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
