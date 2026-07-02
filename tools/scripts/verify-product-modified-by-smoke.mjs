// Runtime smoke — «Кто изменил» (Product.modifiedById) last-modifier filter
// parity (2026-06-13). Run: node tools/scripts/verify-product-modified-by-smoke.mjs
// (needs the dev api on :4000 + dev DB + seeded admin@demo.local). Proves, LIVE:
//   A. the migration shipped — products.modified_by_id column + FK to employees;
//   B. CREATE stamps the actor — a product POSTed by admin carries
//      modifiedById = admin's employee id in the DB;
//   C. the «Кто изменил» filter is APPLIED (positive) — GET /products?
//      modifiedById=<admin> returns the just-created product;
//   D. the filter is NON-VACUOUS (adversarial) — GET /products?modifiedById=
//      <a uuid that is no product's modifier> EXCLUDES it, while the unfiltered
//      list INCLUDES it → the param is really filtering, not silently ignored;
//   E. UPDATE stamps the actor (isolated) — a product seeded directly with
//      modifiedById = NULL becomes modifiedById = admin after an api PATCH, and
//      its version bumps (so the modifier really came from the request actor,
//      not a leftover create value);
//   F. ZERO 5xx across every HTTP call (a stale Prisma client would 500 on the
//      unknown `modifiedById` arg — this proves the running api knows the column).
import pkg from '../../packages/db/src/generated/index.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();
const API = 'http://localhost:4000/api/v1';

const results = [];
let serv5xx = 0;
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

function jwtClaims(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

async function api(method, path, token, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (r.status >= 500) serv5xx += 1;
  const text = await r.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: r.status, json };
}

async function login() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@demo.local', password: 'admin123' }),
  });
  if (!r.ok) throw new Error(`login ${r.status}`);
  return (await r.json()).accessToken;
}

const STRAY_UUID = '00000000-0000-0000-0000-000000000000';
const created = [];

async function main() {
  const token = await login();
  const adminId = jwtClaims(token).sub;
  const accountId = jwtClaims(token).accountId;

  // A. migration shipped — column + FK present.
  const cols = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'products' AND table_schema = 'public' AND column_name = 'modified_by_id'`;
  const fk = await prisma.$queryRaw`
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'products' AND constraint_name = 'products_modified_by_id_fkey'`;
  check(
    'A. products.modified_by_id column + FK to employees present',
    cols.length === 1 && fk.length === 1,
    `col=${cols.length} fk=${fk.length}`,
  );

  // B. CREATE stamps the actor.
  const c = await api('POST', '/products', token, { name: `SMOKE modby ${STRAY_UUID}` });
  const createdId = c.json?.id;
  if (createdId) created.push(createdId);
  const row = createdId ? await prisma.product.findUnique({ where: { id: createdId } }) : null;
  check(
    'B. create stamps modifiedById = actor (admin)',
    c.status === 201 && row?.modifiedById === adminId,
    `status=${c.status} modifiedById=${row?.modifiedById} (admin=${adminId})`,
  );

  // C. filter POSITIVE — GET ?modifiedById=admin includes it.
  const pos = await api('GET', `/products?modifiedById=${adminId}&limit=250`, token);
  const inPos = (pos.json?.items ?? []).some((p) => p.id === createdId);
  check(
    'C. filter modifiedById=admin INCLUDES the created product',
    pos.status === 200 && inPos,
    `status=${pos.status} matched=${inPos} count=${pos.json?.items?.length}`,
  );

  // D. filter NON-VACUOUS (adversarial) — a stray modifier uuid excludes it,
  // while the unfiltered list includes it.
  const neg = await api('GET', `/products?modifiedById=${STRAY_UUID}&limit=250`, token);
  const inNeg = (neg.json?.items ?? []).some((p) => p.id === createdId);
  const unfiltered = await api('GET', '/products?limit=250', token);
  const inUnfiltered = (unfiltered.json?.items ?? []).some((p) => p.id === createdId);
  check(
    'D. filter is non-vacuous — stray modifier EXCLUDES, unfiltered INCLUDES',
    neg.status === 200 && !inNeg && inUnfiltered,
    `excludedByStray=${!inNeg} includedUnfiltered=${inUnfiltered}`,
  );

  // E. UPDATE stamps the actor (isolated from create): seed a row with
  // modifiedById = NULL directly, then api-PATCH it as admin.
  const seeded = await prisma.product.create({
    data: { accountId, name: `SMOKE modby-null ${STRAY_UUID}`, ownerId: adminId, modifiedById: null },
  });
  created.push(seeded.id);
  const beforeNull = seeded.modifiedById === null && seeded.version === 1;
  const patch = await api('PATCH', `/products/${seeded.id}`, token, {
    name: `SMOKE modby-patched ${STRAY_UUID}`,
    version: seeded.version,
  });
  const after = await prisma.product.findUnique({ where: { id: seeded.id } });
  check(
    'E. update stamps modifiedById = actor (was NULL → admin) + version bump',
    beforeNull && patch.status === 200 && after?.modifiedById === adminId && after?.version === 2,
    `beforeNull=${beforeNull} status=${patch.status} after.modifiedById=${after?.modifiedById} v=${after?.version}`,
  );

  // F. explicit: zero server errors anywhere.
  check('F. ZERO 5xx across all HTTP calls', serv5xx === 0, `serv5xx=${serv5xx}`);
}

main()
  .catch((e) => {
    console.error('SMOKE ERROR', e);
    results.push({ name: 'run', ok: false });
  })
  .finally(async () => {
    // hard-delete the test products so the dataset stays clean.
    if (created.length) {
      await prisma.product.deleteMany({ where: { id: { in: created } } }).catch(() => {});
    }
    await prisma.$disconnect();
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n${passed}/${results.length} checks passed`);
    process.exit(passed === results.length && results.length > 0 ? 0 : 1);
  });
