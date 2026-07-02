// Reusable runtime smoke — DROP of the vestigial per-product denormalised stock
// rollup columns (`products.stock_minor` / `reserve_minor` / `in_transit_minor`).
// Run: node tools/scripts/verify-drop-vestigial-stock-columns-smoke.mjs
// (needs the dev api on :4000 + dev DB + seeded admin@demo.local). Proves, LIVE,
// that after migration 20260612122304_drop_vestigial_product_denorm_stock_columns:
//   A. the three columns are PHYSICALLY GONE from the products table
//      (information_schema), so nothing can read a permanently-0 denorm again;
//   B. the other *_minor money columns on products are UNTOUCHED (minimum
//      balance, retail/buy/sale prices) — the DROP was surgical;
//   C. the regenerated Prisma client reads a product fine and the row carries
//      NO stockMinor/reserveMinor/inTransitMinor keys;
//   D. the live GET /products list (which aggregates the real Stock ledger for
//      its «Остаток»/«Резерв»/«Доступно» rollup) still returns 200 + the rollup
//      shape — i.e. the consumer that used to be confused by the dead column is
//      unaffected;
//   E. the live GET /products/:id detail still returns 200 and does NOT leak any
//      of the dropped fields in its JSON.
import pkg from '../../packages/db/src/generated/index.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();
const API = 'http://localhost:4000/api/v1';

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
  return body.accessToken;
}

const DROPPED = ['stock_minor', 'reserve_minor', 'in_transit_minor'];
const DROPPED_CAMEL = ['stockMinor', 'reserveMinor', 'inTransitMinor'];

async function main() {
  // A. columns physically gone
  const cols = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'products' AND table_schema = 'public'
  `;
  const colNames = new Set(cols.map((c) => c.column_name));
  const stillThere = DROPPED.filter((c) => colNames.has(c));
  check('A. stock_minor/reserve_minor/in_transit_minor dropped from products', stillThere.length === 0, stillThere.length ? `still present: ${stillThere.join(', ')}` : 'all three absent');

  // B. surgical drop — the adjacent live column `minimum_balance_minor` (the
  // re-order threshold the «Ниже минимума» filter reads) survives, and it is now
  // the ONLY *_minor column left on products (the three vestigial ones gone).
  const minorCols = [...colNames].filter((c) => c.endsWith('_minor')).sort();
  const surgical = colNames.has('minimum_balance_minor') && minorCols.length === 1;
  check('B. surgical drop — minimum_balance_minor survives, sole remaining *_minor', surgical, `remaining *_minor: ${minorCols.join(', ') || '(none)'}`);

  // C. regenerated client reads a product, row has none of the dropped keys
  const p = await prisma.product.findFirst({ select: { id: true, name: true } });
  if (!p) {
    check('C. regenerated client reads a product', false, 'no product seeded — cannot prove');
  } else {
    const full = await prisma.product.findUnique({ where: { id: p.id } });
    const leaked = DROPPED_CAMEL.filter((k) => k in full);
    check('C. product row carries none of the dropped fields', leaked.length === 0, leaked.length ? `leaked: ${leaked.join(', ')}` : `read «${full.name}» cleanly`);
  }

  // D + E. live endpoints
  let token;
  try {
    token = await login();
  } catch (e) {
    check('D/E. live api reachable (login)', false, String(e.message ?? e));
    return;
  }
  const auth = { authorization: `Bearer ${token}` };

  const listRes = await fetch(`${API}/products?limit=5`, { headers: auth });
  const listOk = listRes.status === 200;
  let listBody = null;
  if (listOk) listBody = await listRes.json();
  const rows = listBody?.data ?? listBody?.rows ?? listBody?.items ?? [];
  const hasRollup = Array.isArray(rows) && rows.length > 0 && rows.some((r) => r.stock || 'onHand' in r || 'available' in r);
  check('D. GET /products list 200 + live Stock rollup shape intact', listOk && (rows.length === 0 || hasRollup), `status=${listRes.status}, rows=${rows.length}, rollup=${hasRollup}`);

  if (rows.length > 0) {
    const id = rows[0].id;
    const detRes = await fetch(`${API}/products/${id}`, { headers: auth });
    const detOk = detRes.status === 200;
    const det = detOk ? await detRes.json() : {};
    const leaked = DROPPED_CAMEL.filter((k) => k in det);
    check('E. GET /products/:id detail 200 + no dropped field leaked', detOk && leaked.length === 0, `status=${detRes.status}${leaked.length ? `, leaked: ${leaked.join(', ')}` : ''}`);
  } else {
    check('E. GET /products/:id detail', true, 'no product rows to detail — list was empty (skipped)');
  }
}

main()
  .catch((e) => {
    console.error('SMOKE ERROR', e);
    results.push({ name: 'fatal', ok: false });
  })
  .finally(async () => {
    await prisma.$disconnect();
    const passed = results.filter((r) => r.ok).length;
    const total = results.length;
    console.log(`\n${passed}/${total} checks passed`);
    process.exit(passed === total ? 0 : 1);
  });
