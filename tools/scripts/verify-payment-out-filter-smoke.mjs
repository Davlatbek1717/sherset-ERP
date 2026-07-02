// Reusable runtime smoke — payments-out list moysklad «Исходящие платежи»
// Фильтр parity fields wired in 2026-06-11m (sibling of payments-in 11l).
// Run: node tools/scripts/verify-payment-out-filter-smoke.mjs
// (needs the dev api on :4000 + dev DB + seeded admin@demo.local). Proves, LIVE,
// that each newly-wired filter actually NARROWS GET /payments-out — i.e. is not a
// dead «accepted-but-unapplied» param (the 11h dead-column class):
//   - «Владелец контрагента» → ?agentOwnerId=<empId>   (agent.ownerId nested)
//   - «Счёт организации»     → ?organizationAccountId=<id>
//   - «Статья расходов»      → ?expenseItem=<text>  — the DISTINGUISHING fix:
//     this column was NEVER written, so the (pre-existing) list filter was dead.
//     We create a row through the REAL API (POST /payments-out) carrying an
//     expenseItem, prove it persists (write-path live), and prove the filter
//     narrows to it (the dead control is now honest).
// PLUS the buildListWhere MERGE proof: «Группа контрагента» + «Владелец
// контрагента» both narrow the same `agent` relation, so they must AND together
// (two separate `agent:{}` keys would overwrite — only the last would apply).
// All fixtures are created under a unique token and deleted at the end.
import pkg from '../../packages/db/src/generated/index.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();
const API = 'http://localhost:4000/api/v1';
const TOKEN = 'ZZPAYOUT_'; // appears ONLY in paymentPurpose (search-narrowed)
const NAME = 'ZZDOC-PAYOUTFILTER'; // doc name prefix (distinct from TOKEN)
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
const payIds = {}; // role -> paymentOut.id
const idToRole = new Map();

/** GET /payments-out?<query> → Set of role-suffixes of our test rows returned. */
async function query(qs) {
  const r = await fetch(`${API}/payments-out?search=${TOKEN}&limit=200&${qs}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`GET /payments-out?${qs} → ${r.status}`);
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
let orgAccountId = null;

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
  const acct = await prisma.organizationAccount.create({
    data: {
      accountId,
      organizationId: org.id,
      name: `${NAME} acct`,
      accountNumber: '20208000900000002002',
    },
  });
  orgAccountId = acct.id;

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

  // Payments-out for the agent/group/account filters — created directly via
  // prisma (the filter only cares about the persisted FK identity).
  let seq = 0;
  const mkPay = (role, agentRole, extra = {}) =>
    prisma.paymentOut
      .create({
        data: {
          accountId,
          name: `${NAME}-${Date.now()}-${seq++}`,
          agentId: cpIds[agentRole],
          organizationId: org.id,
          paymentPurpose: `${TOKEN}${role}`,
          sumMinor: 1000n,
          ...extra,
        },
      })
      .then((p) => {
        payIds[role] = p.id;
        idToRole.set(p.id, role);
        return p;
      });
  await mkPay('ga', 'ga');
  await mkPay('gb', 'gb');
  await mkPay('oa', 'oa');
  await mkPay('acct', 'plain', { organizationAccountId: orgAccountId });
  await mkPay('plain', 'plain');

  // The «Статья расходов» row — created through the REAL API so this exercises
  // CreatePaymentOutSchema + the service create write (the formerly-missing
  // write-path). If the column were still dropped, check 6/7 would fail.
  const postRes = await fetch(`${API}/payments-out`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      agentId: cpIds.plain,
      organizationId: org.id,
      sumMinor: '1000',
      paymentPurpose: `${TOKEN}exp`,
      expenseItem: EXPENSE,
    }),
  });
  check(
    'setup: POST /payments-out with expenseItem → 201',
    postRes.status === 201,
    `status=${postRes.status}`,
  );
  const created = postRes.ok ? await postRes.json() : null;
  if (created?.id) {
    payIds.exp = created.id;
    idToRole.set(created.id, 'exp');
  }

  const TOTAL = Object.keys(payIds).length; // 6
  const baseline = await query('');
  check(
    `setup: default view shows all ${TOTAL} test payments`,
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

  // 4. Счёт организации — PaymentOut.organizationAccountId equality. Only 'acct'.
  const acctQ = await query(`organizationAccountId=${orgAccountId}`);
  check(
    '4: organizationAccountId → only the row carrying that account (acct)',
    acctQ.size === 1 && acctQ.has('acct'),
    `got {${[...acctQ]}}`,
  );

  // 5. Статья расходов — write-path: re-GET the API-created row, the column must
  //    actually carry EXPENSE (proves create persisted it, not silently dropped).
  if (created?.id) {
    const r = await fetch(`${API}/payments-out/${created.id}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const detail = r.ok ? await r.json() : {};
    check(
      '5: API-created row persisted expenseItem (column is LIVE, was dead)',
      detail.expenseItem === EXPENSE,
      `expenseItem=${JSON.stringify(detail.expenseItem)}`,
    );
  } else {
    check('5: API-created row persisted expenseItem', false, 'no created row');
  }

  // 6. Статья расходов filter — contains-match narrows to only the 'exp' row.
  const expQ = await query('expenseItem=arenda');
  check(
    '6: expenseItem=arenda → only the row carrying that expense item (exp)',
    expQ.size === 1 && expQ.has('exp'),
    `got {${[...expQ]}}`,
  );

  // 7. AND across two NEW filters → none (the acct row's agent is unowned).
  const both = await query(`organizationAccountId=${orgAccountId}&agentOwnerId=${empA}`);
  check(
    '7: orgAccount & agentOwnerId=A → none (the acct row is agent-unowned)',
    both.size === 0,
    `got {${[...both]}}`,
  );
}

async function cleanup() {
  const pids = Object.values(payIds);
  if (pids.length) {
    await prisma.paymentOutOperation.deleteMany({ where: { paymentOutId: { in: pids } } });
    await prisma.paymentOut.deleteMany({ where: { id: { in: pids } } });
  }
  const cids = Object.values(cpIds);
  if (cids.length) await prisma.counterparty.deleteMany({ where: { id: { in: cids } } });
  if (orgAccountId)
    await prisma.organizationAccount.delete({ where: { id: orgAccountId } }).catch(() => {});
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
