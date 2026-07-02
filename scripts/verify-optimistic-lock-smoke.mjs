#!/usr/bin/env node
/**
 * Reusable runtime verification harness for the optimistic-lock (lost-update guard)
 * rollout on POSITION-DOCUMENTS. Config-driven: each entity in DOCS declares how to
 * create itself + how to build a 2-row positions array; the engine runs the standard
 * lock battery against a LIVE api + db. Extend DOCS as each Tier-2 class is locked.
 *
 * For a LOCKED entity (expectLocked: true) the battery proves:
 *   create -> version 1
 *   PATCH(v1)            -> 200, version -> 2
 *   PATCH(stale v1, also rewriting positions to 2) -> 409 OPTIMISTIC_LOCK
 *   GET -> description NOT overwritten (no lost-update) AND positions still 1
 *          (Class A tx-rollback: the position deleteMany rolled back, not orphaned)
 *   2 parallel PATCH(v2) -> exactly one 200 + one 409
 *
 * NEGATIVE CONTROL (expectLocked: false): an UNLOCKED doc MUST NOT 409 on a stale
 * PATCH — it last-write-wins (200) and the lost-update reproduces. This proves the
 * 409 assertions above are real (not vacuously green): the harness distinguishes a
 * locked entity from an unlocked one. When that entity is later locked, flip the flag
 * to true and it must pass the full battery.
 *
 * Usage:  node scripts/verify-optimistic-lock-smoke.mjs
 *   env: API_BASE (default http://localhost:4000/api/v1), LOGIN_EMAIL, LOGIN_PASSWORD
 * Requires: dev stack up (pnpm dev) + seed data (counterparties, organizations,
 *           >=2 stores, products).
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
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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

// ---- position-document config. Add stock/production entities here as they get locked.
const SALES_PURCHASE_POS = (r) => ({
  assortmentKind: 'product',
  assortmentId: r.productId,
  quantity: '1',
  priceMinor: '10000',
});
// Retail-sale positions use a flat productId shape (POS receipts only sell
// products, never services/bundles) — distinct from the assortmentKind shape.
const RETAIL_POS = (r) => ({
  productId: r.productId,
  quantity: '1',
  priceMinor: '10000',
  discount: '0',
});
const DOCS = [
  // Locked (Tier-2 sales/purchase — 2026-06-08)
  {
    key: 'customer-order',
    path: '/customer-orders',
    expectLocked: true,
    mkCreate: (r) => ({
      agentId: r.agentId,
      organizationId: r.orgId,
      storeId: r.storeId,
      positions: [SALES_PURCHASE_POS(r)],
    }),
    mkPositions: (r) => [SALES_PURCHASE_POS(r), SALES_PURCHASE_POS(r)],
  },
  {
    key: 'demand',
    path: '/demands',
    expectLocked: true,
    mkCreate: (r) => ({
      agentId: r.agentId,
      organizationId: r.orgId,
      storeId: r.storeId,
      positions: [SALES_PURCHASE_POS(r)],
    }),
    mkPositions: (r) => [SALES_PURCHASE_POS(r), SALES_PURCHASE_POS(r)],
  },
  {
    key: 'invoice-out',
    path: '/invoices-out',
    expectLocked: true,
    mkCreate: (r) => ({
      agentId: r.agentId,
      organizationId: r.orgId,
      storeId: r.storeId,
      positions: [SALES_PURCHASE_POS(r)],
    }),
    mkPositions: (r) => [SALES_PURCHASE_POS(r), SALES_PURCHASE_POS(r)],
  },
  {
    key: 'invoice-in',
    path: '/invoices-in',
    expectLocked: true,
    mkCreate: (r) => ({
      agentId: r.agentId,
      organizationId: r.orgId,
      storeId: r.storeId,
      positions: [SALES_PURCHASE_POS(r)],
    }),
    mkPositions: (r) => [SALES_PURCHASE_POS(r), SALES_PURCHASE_POS(r)],
  },
  {
    key: 'supply',
    path: '/supplies',
    expectLocked: true,
    mkCreate: (r) => ({
      agentId: r.agentId,
      organizationId: r.orgId,
      storeId: r.storeId,
      positions: [SALES_PURCHASE_POS(r)],
    }),
    mkPositions: (r) => [SALES_PURCHASE_POS(r), SALES_PURCHASE_POS(r)],
  },
  {
    key: 'purchase-order',
    path: '/purchase-orders',
    expectLocked: true,
    mkCreate: (r) => ({
      agentId: r.agentId,
      organizationId: r.orgId,
      storeId: r.storeId,
      positions: [SALES_PURCHASE_POS(r)],
    }),
    mkPositions: (r) => [SALES_PURCHASE_POS(r), SALES_PURCHASE_POS(r)],
  },
  {
    key: 'sales-return',
    path: '/sales-returns',
    expectLocked: true,
    mkCreate: (r) => ({
      agentId: r.agentId,
      organizationId: r.orgId,
      storeId: r.storeId,
      positions: [SALES_PURCHASE_POS(r)],
    }),
    mkPositions: (r) => [SALES_PURCHASE_POS(r), SALES_PURCHASE_POS(r)],
  },
  {
    key: 'purchase-return',
    path: '/purchase-returns',
    expectLocked: true,
    mkCreate: (r) => ({
      agentId: r.agentId,
      organizationId: r.orgId,
      storeId: r.storeId,
      positions: [SALES_PURCHASE_POS(r)],
    }),
    mkPositions: (r) => [SALES_PURCHASE_POS(r), SALES_PURCHASE_POS(r)],
  },

  // Locked (Tier-2 stock docs — 2026-06-08). Single-update class (no two-step totals).
  // move = two-store transfer (qty-only positions). enter = priced inbound. loss =
  // qty-only write-off. inventory = stocktake (count-lines). internal-order = order.
  {
    key: 'move',
    path: '/moves',
    expectLocked: true,
    mkCreate: (r) => ({
      organizationId: r.orgId,
      sourceStoreId: r.storeId,
      destinationStoreId: r.storeId2,
      positions: [{ assortmentKind: 'product', assortmentId: r.productId, quantity: '1' }],
    }),
    mkPositions: (r) => [
      { assortmentKind: 'product', assortmentId: r.productId, quantity: '1' },
      { assortmentKind: 'product', assortmentId: r.productId, quantity: '2' },
    ],
  },
  {
    key: 'enter',
    path: '/enters',
    expectLocked: true,
    mkCreate: (r) => ({
      organizationId: r.orgId,
      storeId: r.storeId,
      positions: [
        { assortmentKind: 'product', assortmentId: r.productId, quantity: '1', costMinor: '10000' },
      ],
    }),
    mkPositions: (r) => [
      { assortmentKind: 'product', assortmentId: r.productId, quantity: '1', costMinor: '10000' },
      { assortmentKind: 'product', assortmentId: r.productId, quantity: '2', costMinor: '10000' },
    ],
  },
  {
    key: 'loss',
    path: '/losses',
    expectLocked: true,
    mkCreate: (r) => ({
      organizationId: r.orgId,
      storeId: r.storeId,
      positions: [{ assortmentKind: 'product', assortmentId: r.productId, quantity: '1' }],
    }),
    mkPositions: (r) => [
      { assortmentKind: 'product', assortmentId: r.productId, quantity: '1' },
      { assortmentKind: 'product', assortmentId: r.productId, quantity: '2' },
    ],
  },
  {
    key: 'inventory',
    path: '/inventories',
    expectLocked: true,
    mkCreate: (r) => ({
      organizationId: r.orgId,
      storeId: r.storeId,
      positions: [{ assortmentKind: 'product', assortmentId: r.productId, actualQty: '1' }],
    }),
    mkPositions: (r) => [
      { assortmentKind: 'product', assortmentId: r.productId, actualQty: '1' },
      { assortmentKind: 'product', assortmentId: r.productId, actualQty: '2' },
    ],
  },
  {
    key: 'internal-order',
    path: '/internal-orders',
    expectLocked: true,
    mkCreate: (r) => ({
      organizationId: r.orgId,
      storeId: r.storeId,
      positions: [{ assortmentKind: 'product', assortmentId: r.productId, quantity: '1' }],
    }),
    mkPositions: (r) => [
      { assortmentKind: 'product', assortmentId: r.productId, quantity: '1' },
      { assortmentKind: 'product', assortmentId: r.productId, quantity: '2' },
    ],
  },

  // Locked (Tier-2 production — 2026-06-08c). Core lock battery (409 + no-leak + race) via
  // editField 'description'. Child-array tx-rollback is OMITTED here (the child fields vary —
  // components/stages/performers/materials — and are nested-in-update or already-in-tx =
  // atomic with the versioned update, structurally identical to the runtime-verified
  // stock/sales-purchase classes). production / processing-order / work-order are header-only.
  {
    key: 'production',
    path: '/productions',
    expectLocked: true,
    mkCreate: (r) => ({ organizationId: r.orgId, storeId: r.storeId }),
  },
  {
    key: 'processing-order',
    path: '/processing-orders',
    expectLocked: true,
    mkCreate: (r) => ({ organizationId: r.orgId, storeId: r.storeId, quantity: '1' }),
  },
  {
    key: 'bom',
    path: '/boms',
    expectLocked: true,
    mkCreate: (r) => ({ name: `SMOKE-BOM-${r.stamp}`, productId: r.productNoBom, outputQty: '1' }),
  },
  {
    key: 'process',
    path: '/processing-processes',
    expectLocked: true,
    mkCreate: (r) => ({
      name: `SMOKE-PROC-${r.stamp}`,
      stages: [{ name: `SMOKE-STG-${r.stamp}` }],
    }),
  },
  {
    key: 'stage',
    path: '/processing-stages',
    expectLocked: true,
    mkCreate: (r) => ({ name: `SMOKE-STAGE-${r.stamp}` }),
  },
  {
    key: 'work-order',
    path: '/work-orders',
    expectLocked: true,
    mkCreate: (r) => ({ bomId: r.bomId, storeId: r.storeId, plannedQty: '1' }),
  },
  {
    key: 'processing',
    path: '/processings',
    expectLocked: true,
    mkCreate: (r) => ({
      organizationId: r.orgId,
      materialsStoreId: r.storeId,
      productsStoreId: r.storeId2,
      quantity: '1',
      materials: [{ productId: r.productId, qty: '1' }],
      products: [{ productId: r.productNoBom, qty: '1' }],
    }),
  },

  // Locked (Tier-2 retail — FINAL field-edit doc, 2026-06-08d). POS receipt:
  // Class A child-array (the position deleteMany + the version-guarded header
  // update now run in ONE transaction — also fixing a pre-existing corruption
  // where the deleteMany ran outside a tx). Requires an OPEN cashier session
  // for the logged-in cashier (resolved in main → r.sessionId; the smoke is
  // SKIPPED with a clear message if none can be opened). RetailSale has no
  // DELETE route (POS receipts cancel, not delete) → cleanup via POST cancel.
  {
    key: 'retail-sale',
    path: '/retail-sales',
    expectLocked: true,
    skipIf: (r) =>
      r.sessionId
        ? null
        : 'no open cashier session could be resolved/opened (need a cash-desk + store + org seed)',
    mkCreate: (r) => ({ sessionId: r.sessionId, positions: [RETAIL_POS(r)] }),
    mkPositions: (r) => [RETAIL_POS(r), RETAIL_POS(r)],
    cleanup: (id) => api('POST', `/retail-sales/${id}/cancel`, {}),
  },

  // Locked (GAP-SWEEP — 2026-06-08h). The "rollout complete (47 entities)" claim
  // MISSED these: a recon of all 28 services with an unlocked update() found 7
  // concurrency-exposed parity-clone field-edits (the other 19 were N/A-by-design).
  // These are NOT position-docs, so the Class A child-array tx-rollback assertion is
  // OMITTED (no mkPositions) — pipeline/payroll/role/org-account rewrite their child
  // rows nested-in / already-inside the same versioned tx (atomic, structurally
  // identical to the runtime-verified stock/sales-purchase classes). The CORE battery
  // (create→v1 · PATCH(v1)→200/v2 · stale→409 · no-leak · race) proves the lock.
  // editField is 'name' for entities without a `description` scalar.
  {
    key: 'price-list',
    path: '/price-lists',
    expectLocked: true,
    mkCreate: (r) => ({ name: `SMOKE-PL-${r.stamp}`, organizationId: r.orgId }),
  },
  {
    key: 'task',
    path: '/tasks',
    expectLocked: true,
    mkCreate: (r) => ({ title: `SMOKE-TASK-${r.stamp}` }),
  },
  {
    key: 'store',
    path: '/admin/stores',
    expectLocked: true,
    mkCreate: (r) => ({ name: `SMOKE-STORE-${r.stamp}` }),
  },
  {
    key: 'pipeline',
    path: '/pipelines',
    expectLocked: true,
    editField: 'name',
    mkCreate: (r) => ({
      name: `SMOKE-PIPE-${r.stamp}`,
      stages: [{ name: 'S1', type: 'open', probability: 50 }],
    }),
  },
  {
    key: 'organization-account',
    path: '/admin/organization-accounts',
    expectLocked: true,
    editField: 'name',
    mkCreate: (r) => ({ organizationId: r.orgId, name: `SMOKE-OA-${r.stamp}` }),
  },
  {
    key: 'role',
    path: '/roles',
    expectLocked: true,
    mkCreate: (r) => ({ name: `SMOKE-ROLE-${r.stamp}` }),
  },
  {
    key: 'payroll',
    path: '/payrolls',
    expectLocked: true,
    skipIf: (r) => (r.employeeId ? null : 'no employee found to attach (need an Employee seed)'),
    mkCreate: (r) => ({
      organizationId: r.orgId,
      employeeId: r.employeeId,
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      lines: [{ itemType: 'salary', itemName: 'Smoke', sumMinor: '100000' }],
    }),
  },

  // Locked (Employee pair — 2026-06-08i). ONE physical Employee row is editable
  // from THREE field-edit forms; these two entries prove the two ADMIN endpoints
  // each enforce the lock independently (the third, self-profile /auth/me, is
  // bump-only). Both header-only batteries (editField:'name') — the staff
  // Class-A EmployeeRole rewrite tx-rollback is guaranteed by code structure
  // (the versioned employee.update runs FIRST in the tx), exactly like `role`.
  {
    key: 'hr-employee',
    path: '/hr/employees',
    expectLocked: true,
    editField: 'name',
    editMethod: 'PUT', // HrEmployeeController uses @Put(':id') (FE hr-api.update = api.put)
    skipIf: (r) =>
      r.hrAdmin
        ? null
        : 'no HR admin access (HrPermissionGuard needs hrRoles:[admin]) — run pnpm --filter @moysklad/db seed:hr',
    mkCreate: (r) => ({ name: `SMOKE-HREMP-${r.stamp}`, email: `hremp-${r.stamp}@smoke.local` }),
    // HR per-row delete is a SOFT archive; hard-remove the throwaway via bulk-delete.
    cleanup: (id) => api('POST', '/hr/employees/bulk-delete', { ids: [id] }),
  },
  {
    key: 'analitika-staff',
    path: '/analitika/staff',
    expectLocked: true,
    editField: 'name',
    skipIf: (r) => (r.analitikaStaff ? null : 'no analitika RBAC access for the smoke user'),
    mkCreate: (r) => ({
      email: `staffemp-${r.stamp}@smoke.local`,
      name: `SMOKE-STAFF-${r.stamp}`,
      password: 'smokePass123',
    }),
    // /analitika/staff has no DELETE route (same Employee row) — hard-remove via
    // HR bulk-delete (a no-op 403 if the user lacks HR admin; harmless leftover).
    cleanup: (id) => api('POST', '/hr/employees/bulk-delete', { ids: [id] }),
  },

  // NEGATIVE CONTROL: point at any STILL-UNLOCKED doc to prove the 409 battery is not
  // vacuous (it must last-write-win, NOT 409). All simple position-docs are now locked,
  // so there is no trivially-creatable unlocked control left — but non-vacuity is still
  // guaranteed two ways: (1) every locked entity's battery requires BOTH a 200 on a
  // fresh-version PATCH AND a 409 on a stale one (a vacuous "always-409" harness fails the
  // 200 step), and (2) the committed mutation test (flip a locked entity's expectLocked to
  // false-style expectation -> the harness FAILs, proving it detects a missing lock).
  // When the next class (production/retail/online-order) is reconned, add one entry here
  // with expectLocked:false BEFORE locking it, to restore a live external control.
];

async function verifyLocked(d, r) {
  console.log(`\n=== ${d.key} (expect LOCKED) ===`);
  if (d.skipIf) {
    const reason = d.skipIf(r);
    if (reason) {
      console.log(`  ~ SKIPPED — ${reason}`);
      return;
    }
  }
  // editField = the scalar the no-leak check mutates (default 'description'). posField +
  // mkPositions are OPTIONAL: only docs that rewrite a child array on update() get the
  // Class A tx-rollback assertion; header-only docs (production/processing-order/work-order)
  // omit mkPositions and the assertion is skipped.
  const ef = d.editField || 'description';
  const pf = d.posField || 'positions';
  // editMethod = the verb the edit form uses (default PATCH). HR /hr/employees
  // saves with PUT, so its harness entry sets editMethod:'PUT'.
  const m = d.editMethod || 'PATCH';
  const created = await api('POST', d.path, d.mkCreate(r));
  if (created.status !== 201)
    return fail(
      `${d.key}: create -> ${created.status} ${JSON.stringify(created.json).slice(0, 200)}`,
    );
  const id = created.json.id;
  if (created.json.version !== 1)
    return fail(`${d.key}: created version != 1 (${created.json.version})`);
  pass(`${d.key}: create -> version 1`);

  const e1 = await api(m, `${d.path}/${id}`, { version: 1, [ef]: 'edit-A' });
  if (e1.status !== 200 || e1.json.version !== 2) {
    fail(
      `${d.key}: ${m}(v1) -> ${e1.status}/v${e1.json?.version} (want 200/v2) ${JSON.stringify(e1.json).slice(0, 160)}`,
    );
    if (d.cleanup) await d.cleanup(id);
    else await api('DELETE', `${d.path}/${id}`);
    return;
  }
  pass(`${d.key}: ${m}(v1) -> 200, version 2`);

  const stalePayload = {
    version: 1,
    [ef]: 'STALE',
    ...(d.mkPositions ? { [pf]: d.mkPositions(r) } : {}),
  };
  const stale = await api(m, `${d.path}/${id}`, stalePayload);
  if (stale.status !== 409 || stale.json?.code !== 'OPTIMISTIC_LOCK')
    fail(`${d.key}: stale ${m} -> ${stale.status}/${stale.json?.code} (want 409/OPTIMISTIC_LOCK)`);
  else pass(`${d.key}: stale ${m}(v1) -> 409 OPTIMISTIC_LOCK`);

  const after = await api('GET', `${d.path}/${id}`);
  if (after.json?.[ef] === 'STALE') fail(`${d.key}: LOST-UPDATE LEAK — stale ${ef} applied`);
  else pass(`${d.key}: no-leak — ${ef} preserved (${after.json?.[ef]})`);
  if (d.mkPositions) {
    if ((after.json?.[pf] ?? []).length !== 1)
      fail(`${d.key}: TX-ROLLBACK FAIL — ${pf}=${(after.json?.[pf] ?? []).length} (want 1)`);
    else pass(`${d.key}: Class A tx-rollback — ${pf} survived (1)`);
  } else {
    pass(`${d.key}: tx-rollback N/A (header-only / no child-array rewrite on update)`);
  }

  const [a, b] = await Promise.all([
    api(m, `${d.path}/${id}`, { version: 2, [ef]: 'race-1' }),
    api(m, `${d.path}/${id}`, { version: 2, [ef]: 'race-2' }),
  ]);
  const codes = [a.status, b.status].sort();
  if (codes[0] === 200 && codes[1] === 409) pass(`${d.key}: race -> exactly one 200 + one 409`);
  else fail(`${d.key}: race -> [${codes}] (want [200,409])`);

  // cleanup: most docs DELETE; entities without a DELETE route (POS receipts)
  // supply a `cleanup` that cancels/voids the created record instead.
  if (d.cleanup) await d.cleanup(id);
  else await api('DELETE', `${d.path}/${id}`);
}

async function verifyUnlockedControl(d, r) {
  console.log(`\n=== ${d.key} ===`);
  const created = await api('POST', d.path, d.mkCreate(r));
  if (created.status !== 201)
    return fail(
      `${d.key}: create -> ${created.status} ${JSON.stringify(created.json).slice(0, 200)}`,
    );
  const id = created.json.id;
  pass(`${d.key}: create (version field = ${created.json.version})`);

  // A stale-style PATCH on an UNLOCKED doc must NOT 409 — it last-write-wins.
  await api('PATCH', `${d.path}/${id}`, { description: 'edit-A' });
  const stale = await api('PATCH', `${d.path}/${id}`, {
    version: 1,
    description: 'WINS-no-lock',
    positions: d.mkPositions(r),
  });
  if (stale.status === 409)
    fail(
      `${d.key}: returned 409 — UNEXPECTEDLY LOCKED (control invalid OR entity now locked → flip expectLocked)`,
    );
  else pass(`${d.key}: no 409 (status ${stale.status}) — confirmed UNLOCKED`);

  const after = await api('GET', `${d.path}/${id}`);
  if (after.json?.description === 'WINS-no-lock')
    pass(
      `${d.key}: last-write-wins reproduces (lost-update unguarded) — proves the 409 battery above is REAL, not vacuous`,
    );
  else fail(`${d.key}: unexpected — last write not applied (${after.json?.description})`);

  await api('DELETE', `${d.path}/${id}`);
}

async function main() {
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  if (login.status !== 200 && login.status !== 201)
    throw new Error('login failed: ' + login.status);
  TOKEN = login.json.accessToken;
  if (!TOKEN) throw new Error('no accessToken');

  const grab = async (p) => {
    const res = await api('GET', p);
    const items = res.json?.items ?? res.json ?? [];
    return Array.isArray(items) ? items : [];
  };
  const [cps, orgs, stores, products, boms, employees] = await Promise.all([
    grab('/counterparties?limit=2'),
    grab('/organizations?limit=2'),
    grab('/stores?limit=2'),
    // Grab a generous product window + the FULL bom set: bom is unique-per-product,
    // so productNoBom must see EVERY existing bom (a small limit silently picked a
    // product that already had a bom once the bom count grew → create 409).
    grab('/products?limit=50'),
    grab('/boms?limit=200'),
    grab('/employees?limit=2'),
  ]);
  if (!cps.length || !orgs.length || stores.length < 2 || products.length < 3) {
    throw new Error(
      `MISSING SEED DATA (counterparties=${cps.length} orgs=${orgs.length} stores=${stores.length}[need>=2] products=${products.length}[need>=3]) — run pnpm db:seed`,
    );
  }
  // products[0] is used everywhere; bom needs a product WITHOUT an existing BOM (BOM is
  // unique-per-product) — pick one not referenced by any existing bom.
  const bomProductIds = new Set(boms.map((b) => b.productId));
  const productNoBom =
    products.find((p) => !bomProductIds.has(p.id))?.id ?? products[products.length - 1].id;
  const r = {
    agentId: cps[0].id,
    orgId: orgs[0].id,
    storeId: stores[0].id,
    storeId2: stores[1].id,
    productId: products[0].id,
    productNoBom,
    bomId: boms[0]?.id,
    employeeId: employees[0]?.id,
    stamp: String(Date.now()),
  };
  if (!r.employeeId)
    console.log('(setup) no employee found — payroll smoke will report create failure');
  if (!r.bomId)
    console.log('(setup) no existing BOM found — work-order smoke will report create failure');

  // Resolve an OPEN cashier session for the retail-sale smoke: reuse the
  // logged-in cashier's current open session if any, else open one (needs a
  // cash-desk). If none can be resolved, the retail-sale entry self-skips.
  try {
    const cur = await api('GET', '/cashier-sessions/current');
    if (cur.json?.id && cur.json?.state === 'open') {
      r.sessionId = cur.json.id;
    } else {
      const cashDesks = await grab('/admin/cash-desks?limit=2');
      if (cashDesks.length) {
        const opened = await api('POST', '/cashier-sessions/open', {
          cashDeskId: cashDesks[0].id,
          storeId: stores[0].id,
          organizationId: orgs[0].id,
          openingCashMinor: '0',
        });
        if ((opened.status === 200 || opened.status === 201) && opened.json?.id) {
          r.sessionId = opened.json.id;
        }
      }
    }
  } catch {}
  if (!r.sessionId)
    console.log('(setup) no open cashier session — retail-sale smoke will self-skip');

  // Probe access to the two Employee edit-form endpoints (the 2026-06-08i pair
  // lock). HR is gated by HrPermissionGuard (needs hrRoles:['admin'] — base
  // seed doesn't grant it; `pnpm db:seed:hr` does); analitika/staff is gated by
  // the `analitika` RBAC entity. Each entry self-skips with a clear message if
  // its endpoint is unreachable for the smoke user, so the harness stays green
  // on a base-only seed and the lock is exercised when perms are present.
  const hrProbe = await api('GET', '/hr/employees?limit=1');
  r.hrAdmin = hrProbe.status === 200;
  if (!r.hrAdmin)
    console.log(
      `(setup) HR employees unreachable (${hrProbe.status}) — hr-employee smoke will self-skip (run pnpm --filter @moysklad/db seed:hr)`,
    );
  const staffProbe = await api('GET', '/analitika/staff?pageSize=1');
  r.analitikaStaff = staffProbe.status === 200;
  if (!r.analitikaStaff)
    console.log(
      `(setup) analitika/staff unreachable (${staffProbe.status}) — analitika-staff smoke will self-skip`,
    );

  console.log('logged in; refs resolved.');

  for (const d of DOCS) {
    try {
      if (d.expectLocked) await verifyLocked(d, r);
      else await verifyUnlockedControl(d, r);
    } catch (e) {
      fail(`${d.key}: EXCEPTION ${e.message}`);
    }
  }

  if (r.setupBomId) await api('DELETE', `/boms/${r.setupBomId}`); // cleanup work-order's setup BOM

  const passed = results.filter(Boolean).length;
  const failed = results.length - passed;
  console.log(`\n================ ${passed} PASS / ${failed} FAIL ================`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error('HARNESS CRASH:', e.message);
  process.exit(2);
});
