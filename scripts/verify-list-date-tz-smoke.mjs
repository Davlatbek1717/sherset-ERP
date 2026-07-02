#!/usr/bin/env node
/**
 * Runtime verification (2026-06-13): the list-filter date-tz CLASS sweep — 31
 * API list/findAll services migrated from the day-dropping UTC idiom
 *   { gte: new Date(from), lte: new Date(`${to}T23:59:59.999Z`) }
 * to the shared half-open Asia/Tashkent window `tashkentRangeBounds(from, to)`.
 *
 * NON-VACUOUS BY CONSTRUCTION (time-independent): we create a document whose
 * `moment` is `<D>T21:00:00Z`. Asia/Tashkent is UTC+5, so that instant is
 * **D+1 02:00 Tashkent** — i.e. it belongs to Tashkent calendar day D+1.
 *
 *   Query momentTo = D   (the prior Tashkent day):
 *     OLD `lte: D T23:59:59.999Z`  → D 21:00Z <= D 23:59Z → WRONGLY INCLUDED (leak)
 *     NEW `lt:  D 19:00Z`          → D 21:00Z >= D 19:00Z → correctly EXCLUDED
 *   Query momentFrom = D+1 (its real Tashkent day):
 *     OLD `gte: (D+1) 00:00Z`      → D 21:00Z <  (D+1) 00:00Z → WRONGLY EXCLUDED (drop)
 *     NEW `gte: D 19:00Z`          → D 21:00Z >= D 19:00Z → correctly INCLUDED
 *
 * So under the PRE-sweep code every assertion below would invert. We pick D in
 * the past (now − 2 days) so the moment is never "in the future".
 *
 * Modules under test (2 of the 31, representative of the uniform transform):
 * enters · invoices-out. Isolated + self-cleaning (throwaway store/product +
 * the two docs; references existing org/counterparty; mutates zero real data).
 *
 * Usage: node scripts/verify-list-date-tz-smoke.mjs
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

const utcDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const listHas = (res, id) => {
  const items = Array.isArray(res.json?.items) ? res.json.items : [];
  return items.some((r) => r.id === id);
};

const created = { store: null, product: null, enter: null, invoiceOut: null };

async function cleanup() {
  // soft-delete the throwaway docs; best-effort.
  if (created.invoiceOut) await api('DELETE', `/invoices-out/${created.invoiceOut}`);
  if (created.enter) await api('DELETE', `/enters/${created.enter}`);
}

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
  const D_ms = now - 2 * 86400000; // 2 days ago (UTC) — keeps the moment in the past
  const D = utcDate(D_ms); // the prior Tashkent day
  const D1 = utcDate(D_ms + 86400000); // its real Tashkent day (D+1)
  const MOMENT = `${D}T21:00:00.000Z`; // = D+1 02:00 Asia/Tashkent
  console.log(
    `boundary: moment=${MOMENT} (Tashkent ${D1} 02:00) · momentTo=${D} · momentFrom=${D1}`,
  );

  const tag = now;
  const st = await api('POST', '/admin/stores', { name: `SMOKE-LISTTZ-${tag}-STORE` });
  created.store = st.json?.id;
  if (!created.store)
    throw new Error(`store create failed: ${st.status} ${JSON.stringify(st.json)}`);
  const p = await api('POST', '/products', { name: `SMOKE-LISTTZ-${tag}` });
  created.product = p.json?.id;
  if (!created.product)
    throw new Error(`product create failed: ${p.status} ${JSON.stringify(p.json)}`);

  // ── enters ──────────────────────────────────────────────────────────────
  const e = await api('POST', '/enters', {
    organizationId: ORG,
    storeId: created.store,
    moment: MOMENT,
    positions: [{ assortmentId: created.product, quantity: '1', costMinor: '100000' }],
  });
  created.enter = e.json?.id;
  if (!created.enter) throw new Error(`enter create failed: ${e.status} ${JSON.stringify(e.json)}`);
  const eBack = await api('GET', `/enters/${created.enter}`);
  const eMoment = eBack.json?.moment;
  if (eMoment && new Date(eMoment).toISOString() === new Date(MOMENT).toISOString())
    pass(`enter persisted moment=${eMoment} (non-vacuous anchor)`);
  else fail(`enter moment mismatch: expected ${MOMENT}, got ${eMoment}`);

  const eTo = await api('GET', `/enters?storeId=${created.store}&momentTo=${D}&limit=500`);
  if (eTo.status === 200 && !listHas(eTo, created.enter))
    pass(
      `enter momentTo=${D} → EXCLUDED (new correctly drops the next-Tashkent-day doc; old leaked it)`,
    );
  else
    fail(
      `enter momentTo=${D} should EXCLUDE doc, status=${eTo.status} has=${listHas(eTo, created.enter)}`,
    );

  const eFrom = await api('GET', `/enters?storeId=${created.store}&momentFrom=${D1}&limit=500`);
  if (eFrom.status === 200 && listHas(eFrom, created.enter))
    pass(`enter momentFrom=${D1} → INCLUDED (new correctly keeps it; old dropped the first 5h)`);
  else
    fail(
      `enter momentFrom=${D1} should INCLUDE doc, status=${eFrom.status} has=${listHas(eFrom, created.enter)}`,
    );

  // ── invoices-out ─────────────────────────────────────────────────────────
  const io = await api('POST', '/invoices-out', {
    organizationId: ORG,
    agentId: CP,
    storeId: created.store,
    moment: MOMENT,
    vatEnabled: false,
    positions: [{ assortmentId: created.product, quantity: '1', priceMinor: '500000' }],
  });
  created.invoiceOut = io.json?.id;
  if (!created.invoiceOut)
    throw new Error(`invoice-out create failed: ${io.status} ${JSON.stringify(io.json)}`);

  const ioTo = await api('GET', `/invoices-out?storeId=${created.store}&momentTo=${D}&limit=500`);
  if (ioTo.status === 200 && !listHas(ioTo, created.invoiceOut))
    pass(`invoice-out momentTo=${D} → EXCLUDED (new correct; old leaked next day)`);
  else
    fail(
      `invoice-out momentTo=${D} should EXCLUDE, status=${ioTo.status} has=${listHas(ioTo, created.invoiceOut)}`,
    );

  const ioFrom = await api(
    'GET',
    `/invoices-out?storeId=${created.store}&momentFrom=${D1}&limit=500`,
  );
  if (ioFrom.status === 200 && listHas(ioFrom, created.invoiceOut))
    pass(`invoice-out momentFrom=${D1} → INCLUDED (new correct; old dropped first 5h)`);
  else
    fail(
      `invoice-out momentFrom=${D1} should INCLUDE, status=${ioFrom.status} has=${listHas(ioFrom, created.invoiceOut)}`,
    );

  await cleanup();
  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} passed`);
  if (ok !== results.length) process.exit(1);
}

main().catch(async (e) => {
  console.error('FATAL', e);
  try {
    await cleanup();
  } catch {}
  process.exit(1);
});
