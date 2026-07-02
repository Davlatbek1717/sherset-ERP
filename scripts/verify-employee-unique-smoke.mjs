#!/usr/bin/env node
/**
 * Runtime verification (11u): duplicate Employee email/username — sequential AND
 * concurrent — now returns HTTP 409 (ConflictException), NOT a raw 500.
 *
 * Before this fix:
 *   - hr/employees create had NO app pre-check → a duplicate email hit the DB
 *     unique index → raw Prisma P2002 → 500.
 *   - staff create / hr set-password pre-check, but the check→write gap is a
 *     TOCTOU window → a concurrent duplicate slips past → P2002 → 500.
 * No global Prisma exception filter is registered (only ZodExceptionFilter), so
 * the P2002 was unmapped. `throwIfEmployeeUniqueViolation` now maps it to 409.
 *
 * Exercises the FULL live path: HTTP → controller → service → Prisma → the live
 * partial(username)/plain(email) unique indexes → mapped back to 409.
 *
 * Usage: node scripts/verify-employee-unique-smoke.mjs
 *   env: API_BASE (default http://localhost:4000/api/v1), LOGIN_EMAIL, LOGIN_PASSWORD
 * Requires: dev stack up (pnpm dev). Creates + hard-deletes its own employees.
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

const tag = Date.now();
const createdIds = new Set();
const remember = (r) => {
  const id = r?.json?.id;
  if (id) createdIds.add(id);
  return id;
};

async function main() {
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  if (login.status !== 200 && login.status !== 201) {
    throw new Error(`login failed: ${login.status} ${JSON.stringify(login.json)}`);
  }
  TOKEN = login.json.accessToken;
  if (!TOKEN) throw new Error('no accessToken');
  console.log('logged in');

  // ── 1) Baseline / negative control: a UNIQUE email creates fine (not 409-everything)
  const e0 = `uniq-${tag}-a@smoke.local`;
  const c0 = await api('POST', '/hr/employees', { name: 'Smoke A', email: e0 });
  if (c0.status === 201 && remember(c0)) pass(`HR create unique email → 201 (id ${c0.json.id.slice(0, 8)})`);
  else fail(`HR create unique email → ${c0.status} ${JSON.stringify(c0.json)}`);

  // ── 2) HR sequential duplicate email (NO pre-check → was raw 500) → 409
  const c0dup = await api('POST', '/hr/employees', { name: 'Smoke A dup', email: e0 });
  if (c0dup.status === 409) pass('HR create DUPLICATE email (no pre-check) → 409 (was 500)');
  else fail(`HR create duplicate email → ${c0dup.status} ${JSON.stringify(c0dup.json)} (expected 409)`);

  // ── 3) Staff sequential duplicate email (pre-check path) → 409
  const e1 = `uniq-${tag}-b@smoke.local`;
  const s1 = await api('POST', '/analitika/staff', {
    email: e1,
    name: 'Smoke B',
    password: 'password123',
    roleIds: [],
  });
  if (s1.status === 201 && remember(s1)) pass(`Staff create unique email → 201`);
  else fail(`Staff create unique email → ${s1.status} ${JSON.stringify(s1.json)}`);
  const s1dup = await api('POST', '/analitika/staff', {
    email: e1,
    name: 'Smoke B dup',
    password: 'password123',
    roleIds: [],
  });
  if (s1dup.status === 409) pass('Staff create DUPLICATE email (pre-check) → 409');
  else fail(`Staff create duplicate email → ${s1dup.status} ${JSON.stringify(s1dup.json)}`);

  // ── 4) Staff sequential duplicate username (pre-check path) → 409
  const u1 = `smoke_${tag}`;
  const s2 = await api('POST', '/analitika/staff', {
    email: `uniq-${tag}-c@smoke.local`,
    name: 'Smoke C',
    username: u1,
    password: 'password123',
    roleIds: [],
  });
  if (s2.status === 201 && remember(s2)) pass(`Staff create with username → 201`);
  else fail(`Staff create with username → ${s2.status} ${JSON.stringify(s2.json)}`);
  const s2dup = await api('POST', '/analitika/staff', {
    email: `uniq-${tag}-d@smoke.local`,
    name: 'Smoke C dup',
    username: u1,
    password: 'password123',
    roleIds: [],
  });
  if (s2dup.status === 409) pass('Staff create DUPLICATE username (pre-check) → 409');
  else fail(`Staff create duplicate username → ${s2dup.status} ${JSON.stringify(s2dup.json)}`);

  // ── 5) HEADLINE: concurrent email race (HR create has NO pre-check, so EVERY
  //       parallel request hits the DB index → exactly one wins, the rest MUST
  //       map P2002 → 409, NONE may 500). This is the TOCTOU proof.
  const eRace = `uniq-${tag}-race@smoke.local`;
  const N = 6;
  const burst = await Promise.all(
    Array.from({ length: N }, () => api('POST', '/hr/employees', { name: 'Race', email: eRace })),
  );
  for (const r of burst) remember(r);
  const created = burst.filter((r) => r.status === 201).length;
  const conflicts = burst.filter((r) => r.status === 409).length;
  const fivexx = burst.filter((r) => r.status >= 500).length;
  const other = burst.filter((r) => ![201, 409].includes(r.status)).length;
  if (created === 1 && conflicts === N - 1 && fivexx === 0 && other === 0) {
    pass(`Concurrent ${N}× same-email burst → exactly 1×201 + ${N - 1}×409, ZERO 5xx (TOCTOU mapped)`);
  } else {
    fail(
      `Concurrent burst → ${created}×201 / ${conflicts}×409 / ${fivexx}×5xx / ${other}×other ` +
        `(expected 1 / ${N - 1} / 0 / 0) :: ${JSON.stringify(burst.map((r) => r.status))}`,
    );
  }

  // ── 6) set-password duplicate username (pre-check) → 409 (claim u1 already taken by s2)
  if (c0.json?.id) {
    const sp = await api('POST', `/hr/employees/${c0.json.id}/set-password`, {
      username: u1,
      password: 'password123',
    });
    if (sp.status === 409) pass('set-password DUPLICATE username → 409');
    else fail(`set-password duplicate username → ${sp.status} ${JSON.stringify(sp.json)}`);
  }

  // ── 7) Explicit anti-500: not one duplicate path produced a 5xx
  const all = [c0dup, s1dup, s2dup, ...burst];
  const anwith500 = all.filter((r) => r.status >= 500).length;
  if (anwith500 === 0) pass('No duplicate path returned a 5xx (all friendly 409s)');
  else fail(`${anwith500} duplicate path(s) returned 5xx`);

  // ── cleanup ──
  if (createdIds.size > 0) {
    const del = await api('POST', '/hr/employees/bulk-delete', { ids: [...createdIds] });
    console.log(`cleanup: bulk-delete ${createdIds.size} → ${del.status}`);
  }

  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} checks passed`);
  if (ok !== results.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
