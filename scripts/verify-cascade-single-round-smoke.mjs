#!/usr/bin/env node
/**
 * Runtime verification (2026-06-13): PurchaseOrder.receivedSumMinor and
 * CustomerOrder.shippedSumMinor cascades now single-round through the shared
 * `computePositionTotal` (follow-up to b1eae7be), so a FULLY received PO / fully
 * shipped CO has receivedSum / shippedSum EXACTLY equal to the header sumMinor.
 *
 * NON-VACUOUS line: qty 3 × priceMinor 3334, discount 10%, VAT off.
 *   header sumMinor (computePositionTotal, single round-half-up) = 9002
 *   legacy cascade double-round = scaleMinorByQty→10002, ×9000/10000 = 9001
 * So under the PRE-fix cascade a fully-received PO shows receivedSum 9001 while
 * sumMinor is 9002 (off by 1 tiyin); the assertions `=== sumMinor` would FAIL.
 *
 * Flows (isolated + self-cleaning; references existing org/counterparty):
 *   A. CO (3×3334 disc 10) → confirm → generate Demand from CO → post Demand
 *      → CO.shippedSumMinor === CO.sumMinor === 9002.
 *   B. PO (3×3334 disc 10) → confirm → generate Supply from PO → post Supply
 *      → PO.receivedSumMinor === PO.sumMinor === 9002.
 *
 * Usage: node scripts/verify-cascade-single-round-smoke.mjs
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
  console.log(`  ok ${m}`);
};
const fail = (m) => {
  results.push(false);
  console.log(`  XX ${m}`);
};

const EXPECTED = '9002';
const LINE = { quantity: '3', priceMinor: '3334', discount: '10' };
const created = {
  store: null,
  product: null,
  enter: null,
  co: null,
  po: null,
  demand: null,
  supply: null,
};

async function cleanup() {
  // unpost then soft-delete, best-effort.
  for (const [kind, id] of [
    ['demands', created.demand],
    ['supplies', created.supply],
  ]) {
    if (id) {
      await api('POST', `/${kind}/${id}/transitions/${kind === 'demands' ? 'unpost' : 'unpost'}`);
      await api('DELETE', `/${kind}/${id}`);
    }
  }
  if (created.co) await api('DELETE', `/customer-orders/${created.co}`);
  if (created.po) await api('DELETE', `/purchase-orders/${created.po}`);
  if (created.enter) await api('DELETE', `/enters/${created.enter}`);
}

async function main() {
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  TOKEN = login.json?.accessToken;
  if (!TOKEN) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.json)}`);
  console.log('logged in');

  const orgs = await api('GET', '/organizations?limit=5');
  const ORG = (orgs.json?.items ?? [])[0]?.id;
  const cps = await api('GET', '/counterparties?limit=5');
  const CP = (cps.json?.items ?? [])[0]?.id;
  if (!ORG || !CP) throw new Error('missing anchors (org/counterparty)');

  const tag = Date.now();
  const st = await api('POST', '/admin/stores', { name: `SMOKE-CASCADE-${tag}-STORE` });
  created.store = st.json?.id;
  const S = created.store;
  const p = await api('POST', '/products', { name: `SMOKE-CASCADE-${tag}` });
  created.product = p.json?.id;
  const PID = created.product;
  if (!S || !PID) throw new Error('store/product create failed');

  // Stock so the demand can ship (assertAvailable reads the Stock balance).
  const e = await api('POST', '/enters', {
    organizationId: ORG,
    storeId: S,
    positions: [{ assortmentId: PID, quantity: '100', costMinor: '100000' }],
  });
  created.enter = e.json?.id;
  await api('POST', `/enters/${created.enter}/transitions/post`);

  const pos = [{ assortmentId: PID, ...LINE }];

  // ── A. CustomerOrder.shippedSumMinor ──────────────────────────────────────
  const co = await api('POST', '/customer-orders', {
    agentId: CP,
    organizationId: ORG,
    storeId: S,
    vatEnabled: false,
    positions: pos,
  });
  created.co = co.json?.id;
  if (!created.co) throw new Error(`CO create failed: ${co.status} ${JSON.stringify(co.json)}`);
  const coSum = String(co.json.sumMinor);
  if (coSum === EXPECTED)
    pass(`CO header sumMinor == ${EXPECTED} (single-round, non-vacuous: legacy would be 9001)`);
  else fail(`CO sumMinor expected ${EXPECTED}, got ${coSum}`);

  await api('POST', `/customer-orders/${created.co}/transitions/confirmed`);
  const dem = await api('POST', `/demands/from-customer-order/${created.co}`, {});
  created.demand = dem.json?.id;
  if (!created.demand)
    throw new Error(`demand-from-CO failed: ${dem.status} ${JSON.stringify(dem.json)}`);
  const dpost = await api('POST', `/demands/${created.demand}/transitions/post`);
  if (dpost.status !== 200 && dpost.status !== 201)
    throw new Error(`demand post failed: ${dpost.status} ${JSON.stringify(dpost.json)}`);

  const coAfter = await api('GET', `/customer-orders/${created.co}`);
  const shipped = String(coAfter.json?.shippedSumMinor);
  if (shipped === coSum && shipped === EXPECTED)
    pass(
      `CO fully shipped → shippedSumMinor ${shipped} === sumMinor ${coSum} (single-round consistent)`,
    );
  else
    fail(
      `CO shippedSumMinor=${shipped} should === sumMinor=${coSum} (=${EXPECTED}); legacy gave 9001`,
    );

  // ── B. PurchaseOrder.receivedSumMinor ─────────────────────────────────────
  const po = await api('POST', '/purchase-orders', {
    agentId: CP,
    organizationId: ORG,
    storeId: S,
    vatEnabled: false,
    positions: pos,
  });
  created.po = po.json?.id;
  if (!created.po) throw new Error(`PO create failed: ${po.status} ${JSON.stringify(po.json)}`);
  const poSum = String(po.json.sumMinor);
  if (poSum === EXPECTED) pass(`PO header sumMinor == ${EXPECTED} (single-round)`);
  else fail(`PO sumMinor expected ${EXPECTED}, got ${poSum}`);

  await api('POST', `/purchase-orders/${created.po}/transitions/confirm`);
  const sup = await api('POST', `/supplies/from-purchase-order/${created.po}`, {});
  created.supply = sup.json?.id;
  if (!created.supply)
    throw new Error(`supply-from-PO failed: ${sup.status} ${JSON.stringify(sup.json)}`);
  const spost = await api('POST', `/supplies/${created.supply}/transitions/post`);
  if (spost.status !== 200 && spost.status !== 201)
    throw new Error(`supply post failed: ${spost.status} ${JSON.stringify(spost.json)}`);

  const poAfter = await api('GET', `/purchase-orders/${created.po}`);
  const received = String(poAfter.json?.receivedSumMinor);
  if (received === poSum && received === EXPECTED)
    pass(
      `PO fully received → receivedSumMinor ${received} === sumMinor ${poSum} (single-round consistent)`,
    );
  else
    fail(
      `PO receivedSumMinor=${received} should === sumMinor=${poSum} (=${EXPECTED}); legacy gave 9001`,
    );

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
