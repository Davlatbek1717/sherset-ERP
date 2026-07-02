#!/usr/bin/env node
/**
 * Runtime verification (2026-06-13): demand detail-page fields #4/#5.
 *
 * #4 (display): the demand detail findById now returns `organizationAccount`
 * {id,name,accountNumber} + the `deliveryPlannedMoment` scalar, so the detail
 * page can SHOW/EDIT the account + planned-ship date whose WRITE path landed in
 * bb86188f (it previously only persisted via /new, invisible on detail).
 * #5 (new field): `paymentPlannedMoment` («План. дата оплаты») — migration
 * 20260614000000 + schema + create/update, mirroring InvoiceOut.
 *
 * Proves the exact data path the FE reads (formFromData) and writes (save):
 *   A. create with all three → GET detail returns organizationAccount.name +
 *      both planned dates (non-vacuous: pre-fix findById omitted the account
 *      relation and paymentPlannedMoment had no column).
 *   B. PATCH changing paymentPlannedMoment + clearing organizationAccountId
 *      (disconnect) → GET reflects the change + organizationAccount === null.
 *
 * Usage: node scripts/verify-demand-detail-fields-smoke.mjs   (dev stack up)
 */

const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';
const EMAIL = process.env.LOGIN_EMAIL ?? 'admin@demo.local';
const PASSWORD = process.env.LOGIN_PASSWORD ?? 'admin123';
let TOKEN = '';

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    ...(body !== undefined || method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
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
const day = (iso) => (iso ? String(iso).slice(0, 10) : null);

const created = { store: null, product: null, demand: null };
async function cleanup() {
  if (created.demand) await api('DELETE', `/demands/${created.demand}`);
}

async function main() {
  TOKEN = (await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD })).json
    ?.accessToken;
  if (!TOKEN) throw new Error('login failed');
  console.log('logged in');

  const ORG = (await api('GET', '/organizations?limit=3')).json?.items?.[0]?.id;
  const CP = (await api('GET', '/counterparties?limit=3')).json?.items?.[0]?.id;
  const acct = (await api('GET', `/organization-accounts?organizationId=${ORG}&limit=5`)).json
    ?.items?.[0];
  if (!ORG || !CP) throw new Error('missing org/counterparty');
  if (!acct) throw new Error('no organization account for org — seed one to run this smoke');

  const tag = Date.now();
  created.store = (await api('POST', '/admin/stores', { name: `SMOKE-DETF-${tag}` })).json?.id;
  created.product = (await api('POST', '/products', { name: `SMOKE-DETF-${tag}` })).json?.id;

  const DELIVERY = '2026-07-15';
  const PAYMENT = '2026-07-20';

  // ── A. create with all three fields, read them back on the detail GET ──────
  const c = await api('POST', '/demands', {
    agentId: CP,
    organizationId: ORG,
    storeId: created.store,
    organizationAccountId: acct.id,
    deliveryPlannedMoment: DELIVERY,
    paymentPlannedMoment: PAYMENT,
    vatEnabled: false,
    positions: [{ assortmentId: created.product, quantity: '1', priceMinor: '1000' }],
  });
  created.demand = c.json?.id;
  if (!created.demand) throw new Error(`create failed: ${c.status} ${JSON.stringify(c.json)}`);

  const g1 = await api('GET', `/demands/${created.demand}`);
  if (g1.json?.organizationAccount?.id === acct.id && g1.json?.organizationAccount?.name != null)
    pass(
      `detail returns organizationAccount {id,name=${g1.json.organizationAccount.name}} (#4 display)`,
    );
  else
    fail(
      `detail organizationAccount missing/mismatch: ${JSON.stringify(g1.json?.organizationAccount)}`,
    );
  if (day(g1.json?.deliveryPlannedMoment) === DELIVERY)
    pass(`detail returns deliveryPlannedMoment ${DELIVERY} (#4 display)`);
  else
    fail(`deliveryPlannedMoment expected ${DELIVERY}, got ${day(g1.json?.deliveryPlannedMoment)}`);
  if (day(g1.json?.paymentPlannedMoment) === PAYMENT)
    pass(`detail returns paymentPlannedMoment ${PAYMENT} (#5 new field persisted)`);
  else fail(`paymentPlannedMoment expected ${PAYMENT}, got ${day(g1.json?.paymentPlannedMoment)}`);

  // ── B. edit: change payment date + clear the account (disconnect) ──────────
  const NEWPAY = '2026-08-01';
  const u = await api('PATCH', `/demands/${created.demand}`, {
    version: g1.json.version,
    paymentPlannedMoment: NEWPAY,
    organizationAccountId: null,
  });
  if (u.status !== 200) throw new Error(`update failed: ${u.status} ${JSON.stringify(u.json)}`);
  const g2 = await api('GET', `/demands/${created.demand}`);
  if (day(g2.json?.paymentPlannedMoment) === NEWPAY)
    pass(`edit persisted new paymentPlannedMoment ${NEWPAY}`);
  else
    fail(
      `paymentPlannedMoment after edit expected ${NEWPAY}, got ${day(g2.json?.paymentPlannedMoment)}`,
    );
  if (g2.json?.organizationAccount == null)
    pass(`edit cleared organizationAccount → null (disconnect)`);
  else
    fail(
      `organizationAccount should be null after clear, got ${JSON.stringify(g2.json?.organizationAccount)}`,
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
