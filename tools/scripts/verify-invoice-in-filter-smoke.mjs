// Reusable runtime smoke — invoices-in list moysklad «Счета поставщиков» Фильтр
// parity field wired in 2026-06-12 (purchase-side sibling of the supplies /
// cash-in / cash-out conveyor).
// Run: node tools/scripts/verify-invoice-in-filter-smoke.mjs
// (needs the dev api on :4000 + dev DB + seeded admin@demo.local). Proves, LIVE,
// that the newly-wired filter actually NARROWS GET /invoices-in — i.e. is not a
// dead «accepted-but-unapplied» param (the 11h dead-column class):
//   - «Владелец контрагента» → ?agentOwnerId=<empId>   (agent.ownerId nested),
//     distinct from «Владелец-сотрудник» (the invoice's OWN ownerId).
// PLUS the buildListWhere MERGE proof: «Группа контрагента» + «Владелец
// контрагента» both narrow the same `agent` relation, so they must AND together
// (two separate `agent:{}` keys would overwrite — only the last would apply).
//
// DELIBERATE ABSENCES (locked by apps/web/.../invoices-in-filter-fields.test.ts):
//   - «Кто изменил» — InvoiceIn has no `updatedById` column.
//   - «Общий доступ» — `InvoiceIn.shared` exists but is never written.
// All fixtures are created under a unique token and deleted at the end.
import pkg from '../../packages/db/src/generated/index.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();
const API = 'http://localhost:4000/api/v1';
const TOKEN = 'ZZINVINFILT_'; // appears ONLY in description (search-narrowed)
const NAME = 'ZZDOC-INVINFILTER'; // doc name prefix (distinct from TOKEN + CP names)

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
const docIds = {}; // role -> invoiceIn.id
const idToRole = new Map();

/** GET /invoices-in?<query> → Set of role-suffixes of our test rows returned. */
async function query(qs) {
  const r = await fetch(`${API}/invoices-in?search=${TOKEN}&limit=200&${qs}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`GET /invoices-in?${qs} → ${r.status}`);
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

  // Counterparties — vary (groupId, ownerId) to exercise the merged agent clause.
  const mkCp = (role, data) =>
    prisma.counterparty
      .create({ data: { accountId, name: `ZZCPINVIN_${role}`, ...data } })
      .then((c) => {
        cpIds[role] = c.id;
        return c;
      });
  await mkCp('ga', { groupId, ownerId: empA }); // group G + owner A
  await mkCp('gb', { groupId, ownerId: empB }); // group G + owner B
  await mkCp('oa', { ownerId: empA }); //            owner A, NO group
  await mkCp('plain', {}); //                        neither

  // Invoices for the agent/group filters — created directly via prisma (the
  // filter only cares about the persisted FK identity; storeId is optional on
  // InvoiceIn). NOTE: the doc's OWN ownerId is left null on purpose so «Владелец
  // контрагента» (agentOwnerId) is provably the AGENT's owner, not the
  // document's owner («Владелец-сотрудник»). The TOKEN lives in `description` (a
  // search-OR field) so `search=TOKEN` narrows to exactly our rows.
  let seq = 0;
  const mkDoc = (role, agentRole) =>
    prisma.invoiceIn
      .create({
        data: {
          accountId,
          name: `${NAME}-${Date.now()}-${seq++}`,
          agentId: cpIds[agentRole],
          organizationId: org.id,
          description: `${TOKEN}${role}`,
          currency: 'UZS',
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

  const TOTAL = Object.keys(docIds).length; // 4
  const baseline = await query('');
  check(
    `setup: default view shows all ${TOTAL} test invoices`,
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
  const mergedA = await query(`agentGroupId=${groupId}&agentOwnerId=${empA}`);
  check(
    '3: agentGroupId=G & agentOwnerId=A → only ga (merged AND, not overwrite)',
    mergedA.size === 1 && mergedA.has('ga'),
    `got {${[...mergedA]}} (size 2 incl. gb/oa ⇒ overwrite bug regressed)`,
  );

  // 4. MERGE proof, second intersection — only 'gb' is (G AND B). Confirms the
  //    AND is a real intersection, not the last key silently winning.
  const mergedB = await query(`agentGroupId=${groupId}&agentOwnerId=${empB}`);
  check(
    '4: agentGroupId=G & agentOwnerId=B → only gb (different intersection)',
    mergedB.size === 1 && mergedB.has('gb'),
    `got {${[...mergedB]}}`,
  );

  // 5. AND with a top-level scalar clause → none. All test docs are draft, so
  //    owner-A's agents (ga, oa) are excluded by state=posted — proves the new
  //    agent clause ANDs with the existing state filter (doesn't widen it).
  const ownerAposted = await query(`agentOwnerId=${empA}&state=posted`);
  check(
    '5: agentOwnerId=A & state=posted → none (test docs are draft)',
    ownerAposted.size === 0,
    `got {${[...ownerAposted]}}`,
  );
}

async function cleanup() {
  const ids = Object.values(docIds);
  if (ids.length) await prisma.invoiceIn.deleteMany({ where: { id: { in: ids } } });
  const cids = Object.values(cpIds);
  if (cids.length) await prisma.counterparty.deleteMany({ where: { id: { in: cids } } });
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
