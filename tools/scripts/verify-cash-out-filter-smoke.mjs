// Reusable runtime smoke — cash-out list moysklad «Расходный ордер» Фильтр
// parity fields wired in 2026-06-11n (sibling of payments-out 11m, but a CASH
// document — РКО). Run: node tools/scripts/verify-cash-out-filter-smoke.mjs
// (needs the dev api on :4000 + dev DB + seeded admin@demo.local). Proves, LIVE,
// that each newly-wired filter actually NARROWS GET /cash-out — i.e. is not a
// dead «accepted-but-unapplied» param (the 11h dead-column class):
//   - «Владелец контрагента» → ?agentOwnerId=<empId>   (agent.ownerId nested)
//   - «Статья расходов»      → ?expenseItem=<text>  — the DISTINGUISHING fix:
//     this column was NEVER written, so the (pre-existing) list filter was dead.
//     We create a row through the REAL API (POST /cash-out) carrying an
//     expenseItem, prove it persists (write-path live), and prove the filter
//     narrows to it (the dead control is now honest).
// PLUS the buildListWhere MERGE proof: «Группа контрагента» + «Владелец
// контрагента» both narrow the same `agent` relation, so they must AND together
// (two separate `agent:{}` keys would overwrite — only the last would apply).
//
// DIVERGENCE vs payments-out: cash-out has NO «Счёт организации» filter — a cash
// order uses a cash desk, not a bank account (no organizationAccountId column),
// so that field is deliberately absent (would be a dead filter). Not tested here.
// All fixtures are created under a unique token and deleted at the end.
import pkg from '../../packages/db/src/generated/index.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();
const API = 'http://localhost:4000/api/v1';
const TOKEN = 'ZZCASHOUT_'; // appears ONLY in paymentPurpose (search-narrowed)
const NAME = 'ZZDOC-CASHOUTFILTER'; // doc name prefix (distinct from TOKEN)
const EXPENSE = 'ZZEXP-arenda'; // expenseItem value on the API-created row

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
const docIds = {}; // role -> cashOut.id
const idToRole = new Map();

/** GET /cash-out?<query> → Set of role-suffixes of our test rows returned. */
async function query(qs) {
  const r = await fetch(`${API}/cash-out?search=${TOKEN}&limit=200&${qs}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`GET /cash-out?${qs} → ${r.status}`);
  const body = await r.json();
  const roles = new Set();
  for (const p of body.items) {
    const role = idToRole.get(p.id);
    if (role) roles.add(role);
  }
  return roles;
}

const cpIds = {};
let groupId = null;
let cashDeskId = null;
let cashDeskCreated = false;

async function main() {
  const auth = await login();
  token = auth.token;
  const accountId = auth.accountId;
  check('setup: logged in, account resolved', !!accountId, `account=${accountId?.slice(0, 8)}`);

  const org = await prisma.organization.findFirst({ where: { accountId }, select: { id: true } });
  const emps = await prisma.employee.findMany({
    where: { accountId },
    take: 2,
    select: { id: true },
  });
  check('setup: an organization exists', !!org, org?.id?.slice(0, 8));
  check(
    'setup: ≥2 distinct employees exist (owner-A vs owner-B)',
    emps.length === 2,
    `n=${emps.length}`,
  );
  if (!org || emps.length < 2) throw new Error('missing org/employees fixture');
  const [empA, empB] = emps.map((e) => e.id);

  const grp = await prisma.group.create({ data: { accountId, name: `${NAME} dept` } });
  groupId = grp.id;

  // A cash desk is REQUIRED to create a cash-out (and its currency must match
  // the doc currency). Reuse a seeded UZS desk if one exists, else create one.
  const existingDesk = await prisma.cashDesk.findFirst({
    where: { accountId, currency: 'UZS' },
    select: { id: true },
  });
  if (existingDesk) {
    cashDeskId = existingDesk.id;
  } else {
    const desk = await prisma.cashDesk.create({
      data: { accountId, name: `${NAME} desk`, currency: 'UZS' },
    });
    cashDeskId = desk.id;
    cashDeskCreated = true;
  }
  check('setup: a UZS cash desk is available', !!cashDeskId, cashDeskId?.slice(0, 8));

  // Counterparties — vary (groupId, ownerId) to exercise the merged agent clause.
  const mkCp = (role, data) =>
    prisma.counterparty.create({ data: { accountId, name: `ZZCP_${role}`, ...data } }).then((c) => {
      cpIds[role] = c.id;
      return c;
    });
  await mkCp('ga', { groupId, ownerId: empA }); // group G + owner A
  await mkCp('gb', { groupId, ownerId: empB }); // group G + owner B
  await mkCp('oa', { ownerId: empA }); //            owner A, NO group
  await mkCp('plain', {}); //                        neither

  // Cash-outs for the agent/group filters — created directly via prisma (the
  // filter only cares about the persisted FK identity).
  let seq = 0;
  const mkDoc = (role, agentRole, extra = {}) =>
    prisma.cashOut
      .create({
        data: {
          accountId,
          name: `${NAME}-${Date.now()}-${seq++}`,
          agentId: cpIds[agentRole],
          organizationId: org.id,
          cashDeskId,
          paymentPurpose: `${TOKEN}${role}`,
          currency: 'UZS',
          sumMinor: 1000n,
          ...extra,
        },
      })
      .then((p) => {
        docIds[role] = p.id;
        idToRole.set(p.id, role);
        return p;
      });
  await mkDoc('ga', 'ga');
  await mkDoc('gb', 'gb');
  await mkDoc('oa', 'oa');
  await mkDoc('plain', 'plain');

  // The «Статья расходов» row — created through the REAL API so this exercises
  // CreateCashOutSchema + the service create write (the formerly-missing
  // write-path). If the column were still dropped, check 4 would fail. Its
  // agent is 'plain' (unowned) so the AND check at the end is meaningful.
  const postRes = await fetch(`${API}/cash-out`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      agentId: cpIds.plain,
      organizationId: org.id,
      cashDeskId,
      currency: 'UZS',
      sumMinor: '1000',
      paymentPurpose: `${TOKEN}exp`,
      expenseItem: EXPENSE,
    }),
  });
  check(
    'setup: POST /cash-out with expenseItem → 201',
    postRes.status === 201,
    `status=${postRes.status}`,
  );
  const created = postRes.ok ? await postRes.json() : null;
  if (created?.id) {
    docIds.exp = created.id;
    idToRole.set(created.id, 'exp');
  }

  const TOTAL = Object.keys(docIds).length; // 5
  const baseline = await query('');
  check(
    `setup: default view shows all ${TOTAL} test cash-outs`,
    baseline.size === TOTAL,
    `got ${baseline.size} {${[...baseline]}}`,
  );

  // 1. Владелец контрагента — agent.ownerId nested filter. Owner A owns ga + oa.
  const ownerA = await query(`agentOwnerId=${empA}`);
  check(
    '1: agentOwnerId=A → only the rows whose agent is owned by A (ga, oa)',
    ownerA.size === 2 && ownerA.has('ga') && ownerA.has('oa') && !ownerA.has('gb'),
    `got {${[...ownerA]}}`,
  );

  // 2. Группа контрагента — agent.groupId (pre-existing). Group G holds ga + gb.
  const grpG = await query(`agentGroupId=${groupId}`);
  check(
    '2: agentGroupId=G → only the rows whose agent is in group G (ga, gb)',
    grpG.size === 2 && grpG.has('ga') && grpG.has('gb') && !grpG.has('oa'),
    `got {${[...grpG]}}`,
  );

  // 3. MERGE proof — both narrow the SAME agent relation. Only 'ga' is (G AND A).
  const merged = await query(`agentGroupId=${groupId}&agentOwnerId=${empA}`);
  check(
    '3: agentGroupId=G & agentOwnerId=A → only ga (merged AND, not overwrite)',
    merged.size === 1 && merged.has('ga'),
    `got {${[...merged]}} (size 2 incl. oa ⇒ overwrite bug regressed)`,
  );

  // 4. Статья расходов — write-path: re-GET the API-created row, the column must
  //    actually carry EXPENSE (proves create persisted it, not silently dropped).
  if (created?.id) {
    const r = await fetch(`${API}/cash-out/${created.id}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const detail = r.ok ? await r.json() : {};
    check(
      '4: API-created row persisted expenseItem (column is LIVE, was dead)',
      detail.expenseItem === EXPENSE,
      `expenseItem=${JSON.stringify(detail.expenseItem)}`,
    );
  } else {
    check('4: API-created row persisted expenseItem', false, 'no created row');
  }

  // 5. Статья расходов filter — contains-match narrows to only the 'exp' row.
  const expQ = await query('expenseItem=arenda');
  check(
    '5: expenseItem=arenda → only the row carrying that expense item (exp)',
    expQ.size === 1 && expQ.has('exp'),
    `got {${[...expQ]}}`,
  );

  // 6. AND across the two NEW filters → none (the exp row's agent is unowned).
  const both = await query(`expenseItem=arenda&agentOwnerId=${empA}`);
  check(
    '6: expenseItem=arenda & agentOwnerId=A → none (the exp row is agent-unowned)',
    both.size === 0,
    `got {${[...both]}}`,
  );
}

async function cleanup() {
  const ids = Object.values(docIds);
  if (ids.length) {
    await prisma.cashOutOperation.deleteMany({ where: { cashOutId: { in: ids } } });
    await prisma.cashOut.deleteMany({ where: { id: { in: ids } } });
  }
  const cids = Object.values(cpIds);
  if (cids.length) await prisma.counterparty.deleteMany({ where: { id: { in: cids } } });
  if (groupId) await prisma.group.delete({ where: { id: groupId } }).catch(() => {});
  if (cashDeskCreated && cashDeskId)
    await prisma.cashDesk.delete({ where: { id: cashDeskId } }).catch(() => {});
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
