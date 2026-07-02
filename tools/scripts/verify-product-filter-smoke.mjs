// Reusable runtime smoke — products list moysklad «Фильтр» parity fields.
// Run: node tools/scripts/verify-product-filter-smoke.mjs
// (needs the dev api on :4000 + dev DB + seeded admin@demo.local). Proves, LIVE,
// that each newly-wired discrete filter actually NARROWS GET /products — i.e.
// is not a dead «accepted-but-unapplied» param. For every field we create a
// product that should match and (where the field is a toggle) a control that
// should NOT, then assert both directions of the filter:
//   1. Описание   → ?description=<token>   (contains, insensitive)
//   2. ИКПУ(MXIK) → ?mxikCode=<prefix>     (contains)
//   3. Штрихкод   → ?barcode=<exact>       (barcodes[] has)
//   4. Весовой    → ?weighed=true/false    (tri-state both branches)
//   5. Общий доступ→ ?shared=true/false    (tri-state both branches)
//   6. Влад.-отдел → ?groupId=<id>          (Group equality)
//   7. Когда изм. → ?updatedFrom/To        (half-open day range, both bounds)
// Everything is created under a unique name prefix and deleted at the end.
import pkg from '../../packages/db/src/generated/index.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();
const API = 'http://localhost:4000/api/v1';
const PREFIX = 'ZZ_PFILTER_SMOKE';

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

let token = null;

/** GET /products?<query> → Set of role-suffixes of our test products returned. */
async function query(qs) {
  const r = await fetch(`${API}/products?search=${PREFIX}&limit=200&${qs}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`GET /products?${qs} → ${r.status}`);
  const body = await r.json();
  const roles = new Set();
  for (const p of body.items) {
    if (p.name?.startsWith(PREFIX)) roles.add(p.name.slice(PREFIX.length + 1));
  }
  return roles;
}

const productIds = {};
let groupId = null;

async function main() {
  const auth = await login();
  token = auth.token;
  const accountId = auth.accountId;
  check('setup: logged in, account resolved', !!accountId, `account=${accountId?.slice(0, 8)}`);

  const grp = await prisma.group.create({
    data: { accountId, name: `${PREFIX} dept` },
  });
  groupId = grp.id;

  const mk = (role, data) =>
    prisma.product
      .create({ data: { accountId, name: `${PREFIX} ${role}`, kind: 'product', ...data } })
      .then((p) => {
        productIds[role] = p.id;
        return p;
      });

  await mk('desc', { description: 'насос центробежный ZZUNIQ' });
  await mk('mxik', { mxikCode: '02121999000000001' });
  await mk('barcode', { barcodes: ['4780000099999'] });
  await mk('weighedyes', { weighed: true });
  await mk('weighedno', { weighed: false });
  await mk('sharedyes', { shared: true });
  await mk('sharedno', { shared: false });
  await mk('grouped', { groupId });
  await mk('plain', {}); // general control: matches none of the discrete filters
  await mk('arch', { archived: true }); // «Показывать» tri-state: archived row

  const TOTAL = Object.keys(productIds).length; // 10 (incl. 1 archived)
  const NON_ARCHIVED = TOTAL - 1; // 9 — the default «Показывать: Только обычные» view
  const baseline = await query('');
  check(
    `setup: default view shows the ${NON_ARCHIVED} non-archived test products (archived hidden)`,
    baseline.size === NON_ARCHIVED && !baseline.has('arch'),
    `got ${baseline.size}, arch visible? ${baseline.has('arch')}`,
  );

  // 1. Описание — contains, insensitive (uppercased query must still match).
  const desc = await query('description=ЦЕНТРОБЕЖНЫЙ');
  check('1: Описание contains (insensitive) returns only the match', desc.has('desc') && desc.size === 1, `got ${[...desc]}`);

  // 2. ИКПУ (MXIK) — partial prefix lookup.
  const mxik = await query('mxikCode=0212');
  check('2: ИКПУ (MXIK) prefix contains returns only the match', mxik.has('mxik') && mxik.size === 1, `got ${[...mxik]}`);

  // 3. Штрихкод — exact token in barcodes[].
  const bc = await query('barcode=4780000099999');
  check('3: Штрихкод exact token returns only the match', bc.has('barcode') && bc.size === 1, `got ${[...bc]}`);
  const bcMiss = await query('barcode=0000000000000');
  check('3b: a non-existent barcode returns none', bcMiss.size === 0, `got ${[...bcMiss]}`);

  // 4. Весовой товар — tri-state, BOTH branches.
  const wYes = await query('weighed=true');
  check('4: weighed=true returns the weighed one, not the non-weighed', wYes.has('weighedyes') && !wYes.has('weighedno'), `got ${[...wYes]}`);
  const wNo = await query('weighed=false');
  check('4b: weighed=false excludes the weighed one', !wNo.has('weighedyes') && wNo.has('weighedno'), `weighedyes in false-set? ${wNo.has('weighedyes')}`);

  // 5. Общий доступ — tri-state, BOTH branches.
  const sYes = await query('shared=true');
  check('5: shared=true returns the shared one, not the unshared', sYes.has('sharedyes') && !sYes.has('sharedno'), `got ${[...sYes]}`);
  const sNo = await query('shared=false');
  check('5b: shared=false excludes the shared one', !sNo.has('sharedyes') && sNo.has('sharedno'), `sharedyes in false-set? ${sNo.has('sharedyes')}`);

  // 6. Владелец-отдел — Group equality.
  const grpQ = await query(`groupId=${groupId}`);
  check('6: groupId returns only the product in that отдел', grpQ.has('grouped') && grpQ.size === 1, `got ${[...grpQ]}`);

  // 7. Когда изменен — half-open day range over updatedAt (all test rows are
  //    "now"). A future-only window excludes everything; a past window that
  //    ends yesterday excludes everything; a window that spans today includes.
  const future = await query('updatedFrom=2999-01-01');
  check('7: updatedFrom in the future excludes all (range applied)', future.size === 0, `got ${future.size}`);
  const past = await query('updatedTo=2000-01-01');
  check('7b: updatedTo in the past excludes all (end-of-day bound applied)', past.size === 0, `got ${past.size}`);
  const span = await query('updatedFrom=2020-01-01&updatedTo=2999-12-31');
  check('7c: a window spanning today returns all non-archived test rows', span.size === NON_ARCHIVED, `got ${span.size}/${NON_ARCHIVED}`);

  // 8. Показывать — moysklad tri-state visibility. false = only non-archived,
  //    true = only archived, all = both (no archive predicate).
  const showFalse = await query('archived=false');
  check('8: archived=false → only the non-archived rows', showFalse.size === NON_ARCHIVED && !showFalse.has('arch'), `got ${showFalse.size}, arch? ${showFalse.has('arch')}`);
  const showTrue = await query('archived=true');
  check('8b: archived=true → only the archived row', showTrue.has('arch') && showTrue.size === 1, `got ${[...showTrue]}`);
  const showAll = await query('archived=all');
  check('8c: archived=all → BOTH archived and non-archived (the «Все» 3-state)', showAll.size === TOTAL && showAll.has('arch'), `got ${showAll.size}/${TOTAL}, arch? ${showAll.has('arch')}`);

  // Cross-check: the filters AND with each other (not OR) — weighed AND shared
  // should be empty here (no product is both).
  const both = await query('weighed=true&shared=true');
  check('AND-semantics: weighed=true & shared=true → none (no row is both)', both.size === 0, `got ${[...both]}`);
}

async function cleanup() {
  const ids = Object.values(productIds);
  if (ids.length) await prisma.product.deleteMany({ where: { id: { in: ids } } });
  if (groupId) await prisma.group.delete({ where: { id: groupId } }).catch(() => {});
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
