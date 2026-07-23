// BE smoke (safe + self-cleaning): verify the «Статус» custom-status + «Проведено»
// posting on /commission-reports create.
//   1. create a commissionreportout status (State row)
//   2. create a report WITH that statusId + applicable=true  → state=posted, statusId persisted
//   3. create a report with applicable=false                 → state=draft
//   4. adversarial: random-uuid status / a supply-status id   → 400 (cross-entityType guard)
//   5. cleanup: delete the test reports + statuses (demo data stays clean)
const API = 'http://localhost:4100/api/v1';
const j = async (res) => {
  const t = await res.text();
  try {
    return { status: res.status, body: JSON.parse(t) };
  } catch {
    return { status: res.status, body: t.slice(0, 200) };
  }
};

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
});
const lb = (await j(login)).body;
const token = lb?.accessToken || lb?.token || lb?.access_token;
const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
console.log('login', token ? 'token-ok' : JSON.stringify(lb));

const pick = async (path) => (await j(await fetch(`${API}/${path}`, { headers: auth }))).body?.items?.[0] ?? null;
const org = await pick('organizations');
const agent = await pick('counterparties?limit=1');
const product = await pick('products?limit=1');

const out = {};
const createdReportIds = [];
const createdStateIds = [];

// 1) create a commissionreportout custom status.
const mkState = await fetch(`${API}/states`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ entityType: 'commissionreportout', name: 'SMOKE-Готов', color: '#008739', position: 0 }),
});
const stateBody = (await j(mkState)).body;
const statusId = stateBody?.id;
if (statusId) createdStateIds.push(statusId);
out.createStatus = { status: mkState.status, id: statusId?.slice(0, 8) };

const basePositions = [
  { assortmentId: product.id, quantity: '2', priceMinor: '5000', vat: null, vatEnabled: false, commissionMinor: '1500' },
];

// 2) create WITH status + applicable=true → expect posted + statusId persisted.
const r1 = await fetch(`${API}/commission-reports`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    organizationId: org.id, agentId: agent.id, currency: 'UZS', vatEnabled: false, vatIncluded: false,
    statusId, applicable: true, description: 'SMOKE status+posted (delete me)', positions: basePositions,
  }),
});
const r1b = (await j(r1)).body;
if (r1b?.id) createdReportIds.push(r1b.id);
const r1detail = r1b?.id ? (await j(await fetch(`${API}/commission-reports/${r1b.id}`, { headers: auth }))).body : null;
out.postedWithStatus = {
  create: r1.status,
  state: r1detail?.state,
  applicable: r1detail?.applicable,
  statusId_persisted: r1detail?.statusId === statusId,
  status_name: r1detail?.status?.name,
};

// 3) create with applicable=false → expect draft.
const r2 = await fetch(`${API}/commission-reports`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    organizationId: org.id, agentId: agent.id, currency: 'UZS', vatEnabled: false, vatIncluded: false,
    applicable: false, description: 'SMOKE draft (delete me)', positions: basePositions,
  }),
});
const r2b = (await j(r2)).body;
if (r2b?.id) createdReportIds.push(r2b.id);
const r2detail = r2b?.id ? (await j(await fetch(`${API}/commission-reports/${r2b.id}`, { headers: auth }))).body : null;
out.draftNoStatus = { create: r2.status, state: r2detail?.state, statusId: r2detail?.statusId };

// 4a) adversarial: random uuid status → 400.
const badRandom = await fetch(`${API}/commission-reports`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    organizationId: org.id, agentId: agent.id, statusId: '00000000-0000-4000-8000-000000000000', positions: basePositions,
  }),
});
out.randomStatus_expect400 = badRandom.status;

// 4b) adversarial: a SUPPLY status id (wrong entityType) → 400 (cross-entityType guard).
const mkSupplyState = await fetch(`${API}/states`, {
  method: 'POST', headers: auth,
  body: JSON.stringify({ entityType: 'supply', name: 'SMOKE-WrongType', color: '#E92919', position: 0 }),
});
const supplyStateId = (await j(mkSupplyState)).body?.id;
if (supplyStateId) createdStateIds.push(supplyStateId);
const badType = await fetch(`${API}/commission-reports`, {
  method: 'POST', headers: auth,
  body: JSON.stringify({ organizationId: org.id, agentId: agent.id, statusId: supplyStateId, positions: basePositions }),
});
out.wrongEntityTypeStatus_expect400 = badType.status;

// 5) cleanup — delete the test reports + the test statuses.
if (createdReportIds.length) {
  await fetch(`${API}/commission-reports/bulk-delete`, {
    method: 'POST', headers: auth, body: JSON.stringify({ ids: createdReportIds }),
  });
}
for (const sid of createdStateIds) {
  await fetch(`${API}/states/${sid}`, { method: 'DELETE', headers: auth });
}
out.cleanup = { reportsDeleted: createdReportIds.length, statesDeleted: createdStateIds.length };

console.log(JSON.stringify(out, null, 2));
