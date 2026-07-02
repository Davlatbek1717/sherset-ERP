#!/usr/bin/env node
/**
 * Runtime verification (2026-06-14): H4 P1 create-stamp — a document created by
 * an employee who belongs to a department GROUP persists that group on the new
 * row's `groupId` (the column the future OWN_GROUP visibility check will read).
 *
 * READ-ONLY-SAFE: nothing enforces scope yet, so this stamp changes no
 * behaviour — the cert only proves the column is now populated (it was always
 * NULL before P1).
 *
 * NON-VACUOUS: we put the acting employee in a fresh group, create + clone a
 * demand via the live API, and assert the persisted `groupId` equals that group
 * (before P1 it would be NULL). Hybrid DB+API: the group/employee setup + the
 * row read go through Prisma (no API exists to set an employee's group); the
 * create + clone go through the running API so the real create path runs.
 *
 * Usage: node scripts/verify-group-stamp-smoke.mjs   (dev stack up)
 */

import { readFileSync } from 'node:fs';

// ── load DATABASE_URL from apps/api/.env (strip BOM — known gotcha here) ──────
const envText = readFileSync(new URL('../apps/api/.env', import.meta.url), 'utf8').replace(/^﻿/, '');
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
  if (m) {
    process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, '');
    break;
  }
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not found in apps/api/.env');

// Import the generated Prisma client directly — the @moysklad/db wrapper is TS
// source (consumed via tsx by the app) and doesn't resolve from scripts/.
const { PrismaClient } = await import(
  new URL('../packages/db/src/generated/index.js', import.meta.url).href
);
const prisma = new PrismaClient();

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

function jwtSub(token) {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  return payload.sub;
}

const created = {
  group: null,
  store: null,
  product: null,
  demand: null,
  clone: null,
  project: null,
};
let employeeId = null;
let originalGroupId;

async function cleanup() {
  for (const id of [created.demand, created.clone]) {
    if (id) await api('DELETE', `/demands/${id}`);
  }
  if (created.project) await api('DELETE', `/projects/${created.project}`);
  if (employeeId !== null && originalGroupId !== undefined) {
    await prisma.employee.update({ where: { id: employeeId }, data: { groupId: originalGroupId } });
  }
  if (created.group) await prisma.group.delete({ where: { id: created.group } }).catch(() => {});
  await prisma.$disconnect();
}

async function main() {
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  TOKEN = login.json?.accessToken;
  if (!TOKEN) throw new Error(`login failed: ${login.status}`);
  employeeId = jwtSub(TOKEN);
  console.log(`logged in (employee ${employeeId})`);

  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { accountId: true, groupId: true },
  });
  if (!emp) throw new Error('admin employee not found via prisma');
  originalGroupId = emp.groupId;
  const accountId = emp.accountId;

  // put the acting employee in a fresh group
  const grp = await prisma.group.create({
    data: { accountId, name: `SMOKE-GROUP-${Date.now()}` },
  });
  created.group = grp.id;
  await prisma.employee.update({ where: { id: employeeId }, data: { groupId: grp.id } });
  pass(`set acting employee group → ${grp.id}`);

  // anchors + a fresh store/product (mirrors the supply smoke)
  const ORG = (await api('GET', '/organizations?limit=5')).json?.items?.[0]?.id;
  const CP = (await api('GET', '/counterparties?limit=5')).json?.items?.[0]?.id;
  if (!ORG || !CP) throw new Error('missing org/counterparty anchors');
  const tag = Date.now();
  created.store = (await api('POST', '/admin/stores', { name: `SMOKE-GRP-${tag}` })).json?.id;
  created.product = (await api('POST', '/products', { name: `SMOKE-GRP-${tag}` })).json?.id;
  if (!created.store || !created.product) throw new Error('store/product create failed');

  // ── batch-3 catalog stamp: a product created without an explicit «Отдел»
  //    falls back to the creator's group (NULL-only coalesce, never overwrites
  //    a user-picked product group) ───────────────────────────────────────────
  const pRow = await prisma.product.findUnique({
    where: { id: created.product },
    select: { groupId: true },
  });
  if (pRow?.groupId === grp.id)
    pass('product.groupId === creator group (batch-3 catalog fallback stamp)');
  else fail(`product.groupId expected ${grp.id}, got ${pRow?.groupId}`);

  // ── batch-3 doc stamp (ownerId actor): a project created via the live API
  //    persists the creator's group ─────────────────────────────────────────
  const prjRes = await api('POST', '/projects', { name: `SMOKE-GRP-PRJ-${tag}` });
  created.project = prjRes.json?.id;
  if (created.project) {
    const prjRow = await prisma.project.findUnique({
      where: { id: created.project },
      select: { groupId: true },
    });
    if (prjRow?.groupId === grp.id) pass('project.groupId === creator group (batch-3 doc stamp)');
    else fail(`project.groupId expected ${grp.id}, got ${prjRow?.groupId}`);
  } else {
    fail(`project create failed: ${prjRes.status} ${JSON.stringify(prjRes.json)}`);
  }

  // ── create a demand via the live API ─────────────────────────────────────
  const dRes = await api('POST', '/demands', {
    agentId: CP,
    organizationId: ORG,
    storeId: created.store,
    positions: [{ assortmentId: created.product, quantity: '1', priceMinor: '100000' }],
  });
  created.demand = dRes.json?.id;
  if (!created.demand)
    throw new Error(`demand create failed: ${dRes.status} ${JSON.stringify(dRes.json)}`);
  if (dRes.status === 201 || dRes.status === 200)
    pass('demand created (create path runs with the stamp, no error)');
  else fail(`demand create status ${dRes.status}`);

  const dRow = await prisma.demand.findUnique({
    where: { id: created.demand },
    select: { groupId: true },
  });
  if (dRow?.groupId === grp.id) pass('demand.groupId === creator group (stamped, was NULL pre-P1)');
  else fail(`demand.groupId expected ${grp.id}, got ${dRow?.groupId}`);

  // ── clone path also stamps ───────────────────────────────────────────────
  const cRes = await api('POST', `/demands/${created.demand}/clone`);
  created.clone = cRes.json?.id;
  if (created.clone) {
    const cRow = await prisma.demand.findUnique({
      where: { id: created.clone },
      select: { groupId: true },
    });
    if (cRow?.groupId === grp.id)
      pass('cloned demand.groupId === creator group (clone stamps too)');
    else fail(`clone groupId expected ${grp.id}, got ${cRow?.groupId}`);
  } else {
    fail(`clone failed: ${cRes.status} ${JSON.stringify(cRes.json)}`);
  }

  // ── P2 backfill: a pre-P1 historical row (group_id NULL) refills from the
  //    owner's group (non-vacuous: we null it, run the backfill SQL, re-check) ─
  await prisma.demand.update({ where: { id: created.demand }, data: { groupId: null } });
  const nulled = await prisma.demand.findUnique({
    where: { id: created.demand },
    select: { groupId: true },
  });
  if (nulled?.groupId === null)
    pass('backfill setup: demand group_id forced NULL (simulated pre-P1 row)');
  else fail(`backfill setup: expected NULL, got ${nulled?.groupId}`);
  await prisma.$executeRawUnsafe(
    'UPDATE "demands" d SET "group_id" = e."group_id" FROM "employees" e WHERE d."owner_id" = e."id" AND d."group_id" IS NULL AND e."group_id" IS NOT NULL',
  );
  const refilled = await prisma.demand.findUnique({
    where: { id: created.demand },
    select: { groupId: true },
  });
  if (refilled?.groupId === grp.id) pass('P2 backfill: NULL demand refilled from owner group');
  else fail(`P2 backfill: expected ${grp.id}, got ${refilled?.groupId}`);

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
