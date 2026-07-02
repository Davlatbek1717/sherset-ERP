#!/usr/bin/env node
/**
 * Runtime verification (2026-06-13, demands Phase-2 QA): the /demands/new form
 * POSTed `organizationAccountId` («Счёт организации») and `deliveryPlannedMoment`
 * («План. дата отгрузки»), but both were ABSENT from CreateDemandSchema, so Zod
 * stripped them and the service never persisted them — the user's picked bank
 * account / planned shipment date vanished silently. This proves the create AND
 * update paths now persist (and clear) both fields.
 *
 * NON-VACUOUS: under the pre-fix code, GET after create returned
 * organizationAccountId=null / deliveryPlannedMoment=null regardless of input,
 * so every "== input" assertion below would have failed.
 *
 * Isolated + self-cleaning: throwaway store + product + draft demand only;
 * references existing org/counterparty/bank-account; posts nothing, mutates
 * ZERO stock.
 *
 * Claims:
 *   A. create draft with deliveryPlannedMoment → GET returns the same date.
 *   B. create draft with organizationAccountId → GET returns the same id
 *      (skipped with a loud note only if the org has no bank account seeded).
 *   C. PATCH (update) changes deliveryPlannedMoment → GET returns the new date.
 *   D. PATCH clears organizationAccountId to null (disconnect) → GET returns null.
 *
 * Usage: node scripts/verify-demand-account-planned-smoke.mjs
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
const dayOf = (iso) => (iso ? String(iso).slice(0, 10) : null);

const created = { store: null, product: null, demand: null };

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

  // org bank account for «Счёт организации» (same endpoint the /new picker uses)
  const accs = await api('GET', `/bank-accounts?organizationId=${ORG}`);
  const ACC = (accs.json?.items ?? accs.json ?? [])[0]?.id ?? null;

  const tag = Date.now();
  const NAME = `SMOKE-DMD-ACCPLAN-${tag}`;
  const st = await api('POST', '/admin/stores', { name: `${NAME}-STORE` });
  created.store = st.json?.id;
  if (!created.store) throw new Error(`store create failed: ${st.status} ${JSON.stringify(st.json)}`);
  const p = await api('POST', '/products', { name: NAME });
  created.product = p.json?.id;
  if (!created.product)
    throw new Error(`product create failed: ${p.status} ${JSON.stringify(p.json)}`);
  console.log(`anchors: ORG=${ORG.slice(0, 8)} CP=${CP.slice(0, 8)} ACC=${ACC ? ACC.slice(0, 8) : 'NONE'}`);

  const PLANNED = '2026-06-20';
  const body = {
    agentId: CP,
    organizationId: ORG,
    storeId: created.store,
    deliveryPlannedMoment: PLANNED,
    ...(ACC ? { organizationAccountId: ACC } : {}),
    positions: [{ assortmentId: created.product, quantity: '1', priceMinor: '100000' }],
  };
  const d = await api('POST', '/demands', body);
  created.demand = d.json?.id;
  if (!created.demand)
    throw new Error(`demand create failed: ${d.status} ${JSON.stringify(d.json)}`);

  // ── A + B: GET after create → fields persisted ──
  const g1 = await api('GET', `/demands/${created.demand}`);
  if (g1.status === 200 && dayOf(g1.json?.deliveryPlannedMoment) === PLANNED)
    pass(`A: create persists deliveryPlannedMoment → GET ${dayOf(g1.json?.deliveryPlannedMoment)} == ${PLANNED}`);
  else
    fail(`A: deliveryPlannedMoment not persisted — GET ${g1.status} got ${JSON.stringify(g1.json?.deliveryPlannedMoment)}`);

  if (ACC) {
    if (g1.json?.organizationAccountId === ACC)
      pass(`B: create persists organizationAccountId → GET == picked account`);
    else fail(`B: organizationAccountId not persisted — got ${JSON.stringify(g1.json?.organizationAccountId)}`);
  } else {
    console.log('  ⚠ B: SKIPPED — org has no seeded bank account (organizationAccountId untestable here)');
  }

  // ── C + D: PATCH (update) changes date + clears account (disconnect) ──
  const NEW_PLANNED = '2026-07-15';
  const ver = g1.json?.version ?? 1;
  const patch = await api('PATCH', `/demands/${created.demand}`, {
    version: ver,
    deliveryPlannedMoment: NEW_PLANNED,
    organizationAccountId: null,
  });
  if (patch.status !== 200)
    fail(`C/D: PATCH failed ${patch.status} ${JSON.stringify(patch.json)}`);
  else {
    const g2 = await api('GET', `/demands/${created.demand}`);
    if (dayOf(g2.json?.deliveryPlannedMoment) === NEW_PLANNED)
      pass(`C: update persists new deliveryPlannedMoment → GET ${dayOf(g2.json?.deliveryPlannedMoment)} == ${NEW_PLANNED}`);
    else fail(`C: update date not persisted — got ${JSON.stringify(g2.json?.deliveryPlannedMoment)}`);
    if (g2.json?.organizationAccountId === null || g2.json?.organizationAccountId === undefined)
      pass(`D: update clears organizationAccountId to null (disconnect path)`);
    else fail(`D: organizationAccountId not cleared — got ${JSON.stringify(g2.json?.organizationAccountId)}`);
  }

  console.log('');
  const ok = results.filter(Boolean).length;
  console.log(`RESULT: ${ok}/${results.length} passed`);
  if (ok !== results.length) process.exitCode = 1;
}

async function cleanup() {
  console.log('\ncleanup (best-effort)…');
  if (created.demand) await api('DELETE', `/demands/${created.demand}`).catch(() => {});
  if (created.product) await api('DELETE', `/products/${created.product}`).catch(() => {});
  if (created.store) await api('POST', `/admin/stores/${created.store}/archive`).catch(() => {});
  console.log('cleanup done');
}

main()
  .catch((err) => {
    console.error('FATAL', err);
    process.exitCode = 1;
  })
  .finally(cleanup);
