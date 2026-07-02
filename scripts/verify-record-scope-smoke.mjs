#!/usr/bin/env node
/**
 * Runtime verification (2026-06-14): H4 record-scope ENFORCEMENT (RFC W4) on the
 * demand read-path, behind the per-account `recordScopeEnforced` flag.
 *
 * This is the RFC §4 manager-visibility test — the gate that proves enforcement is
 * NOT a regression:
 *   - flag OFF  → a manager sees ALL demands (today's behaviour, unchanged).
 *   - flag ON   → an OWN_GROUP manager sees ONLY their group's demands (+ shared);
 *                 a foreign-group demand is hidden from the list AND findById → 404.
 *   - flag ON   → an ALL-scope admin still sees everything (scope bypass intact).
 *
 * Setup is hybrid DB+API: employees/roles/groups + the flag flip go through Prisma
 * (no API sets them); demands are created via the running API so the real path runs.
 * The manager logs in with the SAME password hash as admin (argon2 verify uses the
 * salt embedded in the hash) so we don't need argon2 in this script.
 *
 * Usage: node scripts/verify-record-scope-smoke.mjs   (dev stack up)
 */

import { readFileSync } from 'node:fs';

const envText = readFileSync(new URL('../apps/api/.env', import.meta.url), 'utf8').replace(/^﻿/, '');
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
  if (m) {
    process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, '');
    break;
  }
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not found in apps/api/.env');

const { PrismaClient } = await import(
  new URL('../packages/db/src/generated/index.js', import.meta.url).href
);
const prisma = new PrismaClient();

const BASE = process.env.API_BASE ?? 'http://localhost:4000/api/v1';
const EMAIL = process.env.LOGIN_EMAIL ?? 'admin@demo.local';
const PASSWORD = process.env.LOGIN_PASSWORD ?? 'admin123';

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined
      ? { body: JSON.stringify(body) }
      : method !== 'GET'
        ? { body: '{}' }
        : {}),
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
const jwtSub = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8')).sub;

const made = {
  gA: null,
  gH: null,
  mgr: null,
  role: null,
  store: null,
  product: null,
  dG: null,
  dH: null,
};
let accountId = null;

async function cleanup() {
  if (accountId) {
    await prisma.account
      .update({ where: { id: accountId }, data: { recordScopeEnforced: false } })
      .catch(() => {});
  }
  for (const id of [made.dG, made.dH])
    if (id) await prisma.demand.delete({ where: { id } }).catch(() => {});
  if (made.mgr) await prisma.employee.delete({ where: { id: made.mgr } }).catch(() => {}); // cascades employeeRole
  if (made.role) await prisma.role.delete({ where: { id: made.role } }).catch(() => {}); // cascades rolePermission
  for (const id of [made.gA, made.gH])
    if (id) await prisma.group.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
}

async function main() {
  const login = await api('POST', '/auth/login', { identifier: EMAIL, password: PASSWORD });
  const adminToken = login.json?.accessToken;
  if (!adminToken)
    throw new Error(`admin login failed: ${login.status} ${JSON.stringify(login.json)}`);
  const adminId = jwtSub(adminToken);
  const admin = await prisma.employee.findUnique({
    where: { id: adminId },
    select: { accountId: true, passwordHash: true },
  });
  if (!admin?.passwordHash) throw new Error('admin passwordHash not found');
  accountId = admin.accountId;
  const tag = Date.now();

  // ── groups + an OWN_GROUP manager (login via the admin password hash) ────────
  const gA = await prisma.group.create({ data: { accountId, name: `RS-GA-${tag}` } });
  const gH = await prisma.group.create({ data: { accountId, name: `RS-GH-${tag}` } });
  made.gA = gA.id;
  made.gH = gH.id;
  const mgr = await prisma.employee.create({
    data: {
      accountId,
      email: `mgr-rs-${tag}@demo.local`,
      passwordHash: admin.passwordHash,
      name: `RS Manager ${tag}`,
      groupId: gA.id,
    },
  });
  made.mgr = mgr.id;
  const role = await prisma.role.create({ data: { accountId, name: `RS-ROLE-${tag}` } });
  made.role = role.id;
  await prisma.rolePermission.create({
    data: { roleId: role.id, entity: 'demand', action: 'view', scope: 'OWN_GROUP' },
  });
  await prisma.employeeRole.create({ data: { employeeId: mgr.id, roleId: role.id } });
  pass('setup: manager in group A (OWN_GROUP view), group H exists');

  const mgrLogin = await api('POST', '/auth/login', {
    identifier: `mgr-rs-${tag}@demo.local`,
    password: PASSWORD,
  });
  const mgrToken = mgrLogin.json?.accessToken;
  if (!mgrToken)
    throw new Error(`manager login failed: ${mgrLogin.status} ${JSON.stringify(mgrLogin.json)}`);
  pass('manager logs in (password-hash copy works)');

  // ── two demands, one per group (created via API, then group set via Prisma) ──
  const ORG = (await api('GET', '/organizations?limit=5', undefined, adminToken)).json?.items?.[0]
    ?.id;
  const CP = (await api('GET', '/counterparties?limit=5', undefined, adminToken)).json?.items?.[0]
    ?.id;
  made.store = (await api('POST', '/admin/stores', { name: `RS-${tag}` }, adminToken)).json?.id;
  made.product = (await api('POST', '/products', { name: `RS-${tag}` }, adminToken)).json?.id;
  if (!ORG || !CP || !made.store || !made.product) throw new Error('missing demand anchors');
  const mkDemand = async () =>
    (
      await api(
        'POST',
        '/demands',
        {
          agentId: CP,
          organizationId: ORG,
          storeId: made.store,
          positions: [{ assortmentId: made.product, quantity: '1', priceMinor: '1000' }],
        },
        adminToken,
      )
    ).json?.id;
  made.dG = await mkDemand();
  made.dH = await mkDemand();
  if (!made.dG || !made.dH) throw new Error('demand create failed');
  await prisma.demand.update({ where: { id: made.dG }, data: { groupId: gA.id, shared: false } });
  await prisma.demand.update({ where: { id: made.dH }, data: { groupId: gH.id, shared: false } });
  pass('setup: demand-G (group A) + demand-H (group H) created');

  const listIds = async (token) => {
    const r = await api('GET', '/demands?limit=200', undefined, token);
    return new Set((r.json?.items ?? []).map((d) => d.id));
  };

  // ── flag OFF → manager sees BOTH (no regression) ────────────────────────────
  await prisma.account.update({ where: { id: accountId }, data: { recordScopeEnforced: false } });
  const off = await listIds(mgrToken);
  if (off.has(made.dG) && off.has(made.dH))
    pass('flag OFF: manager sees BOTH demands (no regression)');
  else fail(`flag OFF: expected both visible, got G=${off.has(made.dG)} H=${off.has(made.dH)}`);

  // ── flag ON → manager sees only own group; foreign hidden + 404 ─────────────
  await prisma.account.update({ where: { id: accountId }, data: { recordScopeEnforced: true } });
  const on = await listIds(mgrToken);
  if (on.has(made.dG)) pass('flag ON: manager sees own-group demand (G)');
  else fail('flag ON: own-group demand G missing from manager list');
  if (!on.has(made.dH)) pass('flag ON: foreign-group demand (H) hidden from manager list');
  else fail('flag ON: foreign demand H leaked into manager list');

  const getH = await api('GET', `/demands/${made.dH}`, undefined, mgrToken);
  if (getH.status === 404) pass('flag ON: manager findById(foreign H) → 404 (no existence leak)');
  else fail(`flag ON: findById(H) expected 404, got ${getH.status}`);
  const getG = await api('GET', `/demands/${made.dG}`, undefined, mgrToken);
  if (getG.status === 200) pass('flag ON: manager findById(own G) → 200');
  else fail(`flag ON: findById(G) expected 200, got ${getG.status}`);

  // ── flag ON → ALL-scope admin still sees everything (bypass intact) ─────────
  const adminOn = await listIds(adminToken);
  if (adminOn.has(made.dG) && adminOn.has(made.dH))
    pass('flag ON: ALL-scope admin still sees both (scope bypass intact)');
  else
    fail(`flag ON: admin expected both, got G=${adminOn.has(made.dG)} H=${adminOn.has(made.dH)}`);

  await prisma.account.update({ where: { id: accountId }, data: { recordScopeEnforced: false } });

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
