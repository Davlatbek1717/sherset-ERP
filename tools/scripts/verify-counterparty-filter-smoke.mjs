// Reusable runtime smoke — counterparties list moysklad «Фильтр» parity fields.
// Run: node tools/scripts/verify-counterparty-filter-smoke.mjs
// (needs the dev api on :4000 + dev DB + seeded admin@demo.local). Proves, LIVE,
// that each newly-wired discrete filter actually NARROWS GET /counterparties —
// i.e. is not a dead «accepted-but-unapplied» param (the 11h dead-column class).
// For every field we create a counterparty that should match and (where the
// field is a toggle) a control that should NOT, then assert both directions:
//    1. Группа контрагента → ?groupId=<id>        (Group equality)
//    2. Цены               → ?priceTypeId=<id>     (PriceType equality)
//    3. Код                → ?code=<token>         (contains, insensitive)
//    4. ИНН                → ?inn=<digits>         (uzRequisites.inn JSON contains)
//    5. Адрес              → ?address=<token>      (actualAddress contains, insensitive)
//    6. Дисконтная карта   → ?discountCard=<token> (discountCardNumber contains)
//    7. Общий доступ       → ?shared=true/false    (tri-state both branches)
//    8. Создан / Когда изм → ?createdFrom/To, updatedFrom/To (half-open day range)
//    9. Показывать         → ?archived=false/true/all (tri-state)
// Everything is created under a unique name prefix and deleted at the end.
import pkg from '../../packages/db/src/generated/index.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();
const API = 'http://localhost:4000/api/v1';
const PREFIX = 'ZZ_CPFILTER_SMOKE';

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

/** GET /counterparties?<query> → Set of role-suffixes of our test rows returned. */
async function query(qs) {
  const r = await fetch(`${API}/counterparties?search=${PREFIX}&limit=200&${qs}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`GET /counterparties?${qs} → ${r.status}`);
  const body = await r.json();
  const roles = new Set();
  for (const c of body.items) {
    if (c.name?.startsWith(PREFIX)) roles.add(c.name.slice(PREFIX.length + 1));
  }
  return roles;
}

const cpIds = {};
let groupId = null;
let priceTypeId = null;

async function main() {
  const auth = await login();
  token = auth.token;
  const accountId = auth.accountId;
  check('setup: logged in, account resolved', !!accountId, `account=${accountId?.slice(0, 8)}`);

  const grp = await prisma.group.create({ data: { accountId, name: `${PREFIX} dept` } });
  groupId = grp.id;
  const pt = await prisma.priceType.create({ data: { accountId, name: `${PREFIX} pt` } });
  priceTypeId = pt.id;

  const mk = (role, data) =>
    prisma.counterparty
      .create({ data: { accountId, name: `${PREFIX} ${role}`, ...data } })
      .then((c) => {
        cpIds[role] = c.id;
        return c;
      });

  await mk('grouped', { groupId });
  await mk('priced', { priceTypeId });
  await mk('coded', { code: 'ZZCODE777' });
  await mk('inned', { uzRequisites: { inn: '301234567' } });
  await mk('addressed', { actualAddress: 'г. Ташкент, ZZUNIQ-проспект' });
  await mk('carded', { discountCardNumber: 'DCARD-ZZ-999' });
  await mk('sharedyes', { shared: true });
  await mk('sharedno', { shared: false });
  await mk('plain', {}); // general control — matches none of the discrete filters
  await mk('arch', { archived: true }); // «Показывать» tri-state: archived row

  const TOTAL = Object.keys(cpIds).length; // 10 (incl. 1 archived)
  const NON_ARCHIVED = TOTAL - 1; // 9 — the default «Показывать: Только обычные» view
  const baseline = await query('');
  check(
    `setup: default view shows the ${NON_ARCHIVED} non-archived test rows (archived hidden)`,
    baseline.size === NON_ARCHIVED && !baseline.has('arch'),
    `got ${baseline.size}, arch visible? ${baseline.has('arch')}`,
  );

  // 1. Группа контрагента — Group equality.
  const grpQ = await query(`groupId=${groupId}`);
  check('1: groupId returns only the row in that group', grpQ.has('grouped') && grpQ.size === 1, `got ${[...grpQ]}`);

  // 2. Цены — PriceType equality.
  const ptQ = await query(`priceTypeId=${priceTypeId}`);
  check('2: priceTypeId returns only the row with that price type', ptQ.has('priced') && ptQ.size === 1, `got ${[...ptQ]}`);

  // 3. Код — contains, insensitive (lowercased query must still match).
  const codeQ = await query('code=zzcode');
  check('3: Код contains (insensitive) returns only the match', codeQ.has('coded') && codeQ.size === 1, `got ${[...codeQ]}`);

  // 4. ИНН — uzRequisites.inn JSON-path string_contains.
  const innQ = await query('inn=30123');
  check('4: ИНН JSON-path contains returns only the match', innQ.has('inned') && innQ.size === 1, `got ${[...innQ]}`);
  const innMiss = await query('inn=999999999');
  check('4b: a non-existent inn returns none', innMiss.size === 0, `got ${[...innMiss]}`);

  // 5. Адрес — actualAddress contains, insensitive.
  const addrQ = await query('address=zzuniq');
  check('5: Адрес contains (insensitive) returns only the match', addrQ.has('addressed') && addrQ.size === 1, `got ${[...addrQ]}`);

  // 6. Дисконтная карта — discountCardNumber contains.
  const cardQ = await query('discountCard=DCARD-ZZ');
  check('6: Дисконтная карта contains returns only the match', cardQ.has('carded') && cardQ.size === 1, `got ${[...cardQ]}`);

  // 7. Общий доступ — tri-state, BOTH branches. (Counterparty.shared defaults to
  //    false, so EVERY non-shared test row is in the shared=false set — assert the
  //    shared one is excluded, not a size of 1.)
  const sYes = await query('shared=true');
  check('7: shared=true returns the shared one, not the unshared', sYes.has('sharedyes') && !sYes.has('sharedno') && sYes.size === 1, `got ${[...sYes]}`);
  const sNo = await query('shared=false');
  check('7b: shared=false excludes the shared one (keeps the rest)', !sNo.has('sharedyes') && sNo.has('sharedno'), `sharedyes in false-set? ${sNo.has('sharedyes')}`);

  // 8. Создан / Когда изменен — half-open day ranges (all rows are "now").
  const futureC = await query('createdFrom=2999-01-01');
  check('8: createdFrom in the future excludes all (range applied)', futureC.size === 0, `got ${futureC.size}`);
  const pastC = await query('createdTo=2000-01-01');
  check('8b: createdTo in the past excludes all (end-of-day bound applied)', pastC.size === 0, `got ${pastC.size}`);
  const spanU = await query('updatedFrom=2020-01-01&updatedTo=2999-12-31');
  check('8c: updated window spanning today returns all non-archived test rows', spanU.size === NON_ARCHIVED, `got ${spanU.size}/${NON_ARCHIVED}`);

  // 9. Показывать — moysklad tri-state visibility.
  const showFalse = await query('archived=false');
  check('9: archived=false → only the non-archived rows', showFalse.size === NON_ARCHIVED && !showFalse.has('arch'), `got ${showFalse.size}, arch? ${showFalse.has('arch')}`);
  const showTrue = await query('archived=true');
  check('9b: archived=true → only the archived row', showTrue.has('arch') && showTrue.size === 1, `got ${[...showTrue]}`);
  const showAll = await query('archived=all');
  check('9c: archived=all → BOTH archived and non-archived (the «Все» 3-state)', showAll.size === TOTAL && showAll.has('arch'), `got ${showAll.size}/${TOTAL}, arch? ${showAll.has('arch')}`);

  // AND-semantics: filters narrow together, not OR — code AND inn → none here
  // (no row has both).
  const both = await query('code=zzcode&inn=30123');
  check('AND-semantics: code & inn → none (no row is both)', both.size === 0, `got ${[...both]}`);
}

async function cleanup() {
  const ids = Object.values(cpIds);
  if (ids.length) await prisma.counterparty.deleteMany({ where: { id: { in: ids } } });
  if (priceTypeId) await prisma.priceType.delete({ where: { id: priceTypeId } }).catch(() => {});
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
