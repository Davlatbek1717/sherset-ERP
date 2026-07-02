// Reusable runtime smoke — «Ниже минимума» re-order filter (live Stock source).
// Run: node tools/scripts/verify-below-minimum-smoke.mjs
// (needs the dev api on :4000 + dev DB + seeded admin@demo.local). Proves, LIVE,
// that GET /products?belowMinimum=... filters on REAL aggregated stock — not the
// permanently-0 denormalised Product.stock_minor column the bug compared:
//   A. belowMinimum=true  → only products whose summed on-hand stock < minimum
//   B. belowMinimum=false → only products whose summed on-hand stock ≥ minimum
//   C. a product with NO stock rows surfaces as "below" (COALESCE 0)
//   D. a no-minimum product (min=0, disabled) appears under NEITHER branch
//   E. cross-store: a product stocked 3+3 across two stores is summed to 6 and
//      counts as sufficient (would wrongly read "below" if only one store ran)
//   F. no filter → all test products present (sanity)
// Everything is created under a unique name prefix and deleted at the end.
import pkg from '../../packages/db/src/generated/index.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();
const API = 'http://localhost:4000/api/v1';
const PREFIX = 'ZZ_BELOWMIN_SMOKE';

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

/** Decode the (unverified) JWT payload — we only need the tenant claims. */
function jwtClaims(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

async function login() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@demo.local', password: 'admin123' }),
  });
  if (!r.ok) throw new Error(`login ${r.status}`);
  const body = await r.json();
  const claims = jwtClaims(body.accessToken);
  return { token: body.accessToken, accountId: claims.accountId, employeeId: claims.sub };
}

/** GET /products with a filter → the set of returned product ids (name-prefixed). */
async function listIds(token, query) {
  const r = await fetch(`${API}/products?${query}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`GET /products?${query} → ${r.status}`);
  const body = await r.json();
  return new Set(body.items.filter((p) => p.name?.startsWith(PREFIX)).map((p) => p.id));
}

let createdStoreId = null;
const productIds = {};

async function main() {
  const { token, accountId } = await login();
  check('setup: logged in, account resolved', !!accountId, `account=${accountId?.slice(0, 8)}`);

  // Two stores for the cross-store sum case. Reuse existing; create a 2nd only
  // if the account has fewer than two.
  const stores = await prisma.store.findMany({
    where: { accountId },
    take: 2,
    orderBy: { createdAt: 'asc' },
  });
  let store1 = stores[0]?.id;
  let store2 = stores[1]?.id;
  if (!store1) {
    const s = await prisma.store.create({ data: { accountId, name: `${PREFIX} store1` } });
    store1 = s.id;
    createdStoreId = s.id;
  }
  if (!store2) {
    const s = await prisma.store.create({ data: { accountId, name: `${PREFIX} store2` } });
    store2 = s.id;
    createdStoreId = s.id; // (only one ever needs creating in practice)
  }

  // Test products (min in ×1000 milliunits; 5000 = 5 units).
  const mk = async (role, minMinor) => {
    const p = await prisma.product.create({
      data: {
        accountId,
        name: `${PREFIX} ${role}`,
        kind: 'product',
        minimumBalanceMinor: minMinor,
      },
    });
    productIds[role] = p.id;
    return p.id;
  };
  const below = await mk('below', 5000n); // stock 2 → 2000 < 5000  → below
  const suff = await mk('suff', 5000n); //  stock 10 → 10000 ≥ 5000 → sufficient
  const nomin = await mk('nomin', 0n); //   min disabled → neither
  const split = await mk('split', 5000n); // 3+3 across stores → 6000 ≥ 5000 → sufficient
  const zerostock = await mk('zerostock', 5000n); // no Stock rows → 0 → below

  // Stock rows (qty in whole units). zerostock gets none.
  const stock = (storeId, assortmentId, qty) =>
    prisma.stock.create({
      data: { accountId, storeId, assortmentKind: 'product', assortmentId, qty },
    });
  await stock(store1, below, '2');
  await stock(store1, suff, '10');
  await stock(store1, nomin, '1');
  await stock(store1, split, '3');
  await stock(store2, split, '3'); // second store → proves cross-store SUM

  // ---- A/C/D/E: belowMinimum=true
  const belowSet = await listIds(token, `search=${PREFIX}&belowMinimum=true&limit=200`);
  check('A: below-stock product is in belowMinimum=true', belowSet.has(below));
  check('C: zero-stock product (no rows) is in belowMinimum=true', belowSet.has(zerostock));
  check('A: sufficiently-stocked product is NOT in belowMinimum=true', !belowSet.has(suff));
  check('D: no-minimum product (min=0) is NOT in belowMinimum=true', !belowSet.has(nomin));
  check(
    'E: cross-store-summed (3+3=6) product is NOT "below" 5',
    !belowSet.has(split),
    'one-store logic would have wrongly flagged it',
  );

  // ---- B/D/E: belowMinimum=false
  const suffSet = await listIds(token, `search=${PREFIX}&belowMinimum=false&limit=200`);
  check('B: sufficiently-stocked product is in belowMinimum=false', suffSet.has(suff));
  check(
    'E: cross-store-summed product is in belowMinimum=false (summed ≥ min)',
    suffSet.has(split),
  );
  check('B: below-stock product is NOT in belowMinimum=false', !suffSet.has(below));
  check('B: zero-stock product is NOT in belowMinimum=false', !suffSet.has(zerostock));
  check('D: no-minimum product (min=0) is NOT in belowMinimum=false', !suffSet.has(nomin));

  // ---- F: no filter → all five present (sanity that the test set is visible)
  const allSet = await listIds(token, `search=${PREFIX}&limit=200`);
  check('F: no filter returns all 5 test products', allSet.size === 5, `got ${allSet.size}`);

  // The two branches partition (no overlap, and together they exclude nomin).
  const overlap = [...belowSet].filter((id) => suffSet.has(id));
  check('true/false branches are disjoint', overlap.length === 0, `overlap=${overlap.length}`);
}

async function cleanup() {
  const ids = Object.values(productIds);
  if (ids.length) {
    await prisma.stock.deleteMany({ where: { assortmentId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
  }
  if (createdStoreId) await prisma.store.delete({ where: { id: createdStoreId } }).catch(() => {});
}

try {
  await main();
} catch (e) {
  check('battery ran to completion', false, e.message);
} finally {
  await cleanup();
  await prisma.$disconnect();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length === 0 ? 0 : 1);
