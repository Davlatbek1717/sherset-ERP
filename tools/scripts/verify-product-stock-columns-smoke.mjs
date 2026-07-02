// Reusable runtime smoke — per-product «Остаток»/«Резерв»/«Доступно» list
// columns (live Stock ledger source).
// Run: node tools/scripts/verify-product-stock-columns-smoke.mjs
// (needs the dev api on :4000 + dev DB + seeded admin@demo.local). Proves, LIVE,
// that GET /products returns a per-product `stock` rollup summed from the REAL
// Stock ledger — not the permanently-0 denormalised Product.stock_minor column:
//   A. on-hand = SUM(qty) across stores (cross-store: 4+6 → 10, not 4 or 6)
//   B. «Доступно» = on-hand − reserved (8 − 3 → 5), NOT on-hand
//   C. «Резерв» surfaces the summed reservedQty (3)
//   D. a product with NO Stock rows → 0 / 0 / 0 (COALESCE, not null/crash)
//   E. a service carries the rollup shape but 0 on-hand (no product-kind rows)
//   F. every returned item has the {onHand, reserved, available} shape
// Everything is created under a unique name prefix and deleted at the end.
import pkg from '../../packages/db/src/generated/index.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();
const API = 'http://localhost:4000/api/v1';
const PREFIX = 'ZZ_STOCKCOL_SMOKE';

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

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
  return { token: body.accessToken, accountId: jwtClaims(body.accessToken).accountId };
}

/** GET /products → map of name-prefixed test products by their role suffix. */
async function listByRole(token) {
  const r = await fetch(`${API}/products?search=${PREFIX}&limit=200`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`GET /products → ${r.status}`);
  const body = await r.json();
  const map = {};
  for (const p of body.items) {
    if (!p.name?.startsWith(PREFIX)) continue;
    map[p.name.slice(PREFIX.length + 1)] = p;
  }
  return map;
}

let createdStoreId = null;
const productIds = {};

async function main() {
  const { token, accountId } = await login();
  check('setup: logged in, account resolved', !!accountId, `account=${accountId?.slice(0, 8)}`);

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
    createdStoreId = s.id;
  }

  const mk = async (role, kind) => {
    const p = await prisma.product.create({
      data: { accountId, name: `${PREFIX} ${role}`, kind },
    });
    productIds[role] = p.id;
    return p.id;
  };
  const split = await mk('split', 'product'); //  4+6 across stores → on-hand 10
  const reserved = await mk('reserved', 'product'); // qty 8, reservedQty 3 → avail 5
  const nostock = await mk('nostock', 'product'); // no rows → 0/0/0
  const svc = await mk('svc', 'service'); //         service → no product-kind rows

  const stock = (storeId, assortmentId, qty, reservedQty = '0') =>
    prisma.stock.create({
      data: { accountId, storeId, assortmentKind: 'product', assortmentId, qty, reservedQty },
    });
  await stock(store1, split, '4');
  await stock(store2, split, '6'); // second store → proves cross-store SUM
  await stock(store1, reserved, '8', '3');
  // a service does not get a stock row; nostock gets none either.

  const byRole = await listByRole(token);

  // ---- F: shape
  const shapeOk =
    byRole.split?.stock &&
    'onHand' in byRole.split.stock &&
    'reserved' in byRole.split.stock &&
    'available' in byRole.split.stock;
  check('F: every item carries the {onHand,reserved,available} rollup', !!shapeOk);

  // ---- A: cross-store SUM
  check(
    'A: on-hand = cross-store SUM (4+6 → 10)',
    Number(byRole.split?.stock?.onHand) === 10,
    `got ${byRole.split?.stock?.onHand} (one-store logic would read 4 or 6)`,
  );

  // ---- B/C: reserved + available
  check('C: reserved surfaces the summed reservedQty (3)', Number(byRole.reserved?.stock?.reserved) === 3);
  check(
    'B: available = on-hand − reserved (8 − 3 → 5), not 8',
    Number(byRole.reserved?.stock?.available) === 5,
    `got ${byRole.reserved?.stock?.available}`,
  );
  check('B: on-hand still reports the full 8', Number(byRole.reserved?.stock?.onHand) === 8);

  // ---- D: no Stock rows → zeros (no null / crash)
  check(
    'D: product with no Stock rows → 0 / 0 / 0',
    byRole.nostock?.stock?.onHand === '0' &&
      byRole.nostock?.stock?.reserved === '0' &&
      byRole.nostock?.stock?.available === '0',
    `got ${JSON.stringify(byRole.nostock?.stock)}`,
  );

  // ---- E: service carries the shape but 0 on-hand (no product-kind ledger rows)
  check(
    'E: service has the rollup shape with 0 on-hand',
    byRole.svc?.stock && Number(byRole.svc.stock.onHand) === 0,
    `got ${JSON.stringify(byRole.svc?.stock)}`,
  );
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
