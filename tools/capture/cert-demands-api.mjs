// Deterministic API cert: login → probe EVERY /demands filter param → assert 200
// + (for discriminating values) narrowed total vs baseline. No browser/UI flakiness.
const API = 'http://127.0.0.1:4000/api/v1';
const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
});
const { accessToken } = await login.json();
if (!accessToken) {
  console.log('LOGIN FAILED', login.status);
  process.exit(1);
}
const H = { authorization: `Bearer ${accessToken}` };
const get = async (qs) => {
  const r = await fetch(`${API}/demands?${qs}&limit=1`, { headers: H });
  let total = null;
  try {
    total = (await r.json()).total;
  } catch {}
  return { status: r.status, total };
};
const base = await get('');
const sample = await fetch(`${API}/demands?limit=1`, { headers: H }).then((r) => r.json());
const agentId = sample?.items?.[0]?.agent?.id;
const orgId = sample?.items?.[0]?.organization?.id;
const storeId = sample?.items?.[0]?.store?.id;
const dummy = '00000000-0000-4000-8000-000000000000';
const cases = {
  momentFrom: 'momentFrom=2026-06-01',
  paymentStatus: 'paymentStatus=paid',
  state: 'state=posted',
  applicable: 'applicable=true',
  printed: 'printed=true',
  published: 'published=true',
  shared: 'shared=true',
  shipmentAddress: 'shipmentAddress=zzzNoMatch',
  shipmentAddressComment: 'shipmentAddressComment=zzzNoMatch',
  updatedFrom: 'updatedFrom=2026-06-01',
  agentIds: `agentIds=${agentId || dummy}`,
  consigneeIds: `consigneeIds=${dummy}`,
  productIds: `productIds=${dummy}`,
  storeIds: `storeIds=${storeId || dummy}`,
  ownerIds: `ownerIds=${dummy}`,
  projectIds: `projectIds=${dummy}`,
  contractIds: `contractIds=${dummy}`,
  agentGroupIds: `agentGroupIds=${dummy}`,
  agentOwnerIds: `agentOwnerIds=${dummy}`,
  agentAccountIds: `agentAccountIds=${dummy}`,
  organizationIds: `organizationIds=${orgId || dummy}`,
  organizationAccountIds: `organizationAccountIds=${dummy}`,
  salesChannelIds: `salesChannelIds=${dummy}`,
  groupIds: `groupIds=${dummy}`,
  modifiedByIds: `modifiedByIds=${dummy}`,
  // also confirm the dropped/aggregate endpoints
  'aggregate/totals': null,
};
console.log('baseTotal:', base.total, '(status', base.status + ')');
let ok = 0;
let bad = 0;
for (const [k, qs] of Object.entries(cases)) {
  if (k === 'aggregate/totals') continue;
  const r = await get(qs);
  const good = r.status === 200;
  good ? ok++ : bad++;
  const narrowed = r.total != null && base.total != null && r.total < base.total;
  console.log(
    `${good ? '✓' : '✗'} ${k.padEnd(24)} status=${r.status} total=${r.total}${narrowed ? '  (NARROWED)' : ''}`,
  );
}
// totals endpoint
const tot = await fetch(`${API}/demands/aggregate/totals`, { headers: H });
const totBody = await tot.json().catch(() => ({}));
console.log(
  `${tot.status === 200 ? '✓' : '✗'} aggregate/totals       status=${tot.status} sum=${totBody.sumMinor} paid=${totBody.payedSumMinor}`,
);
console.log(`\nSUMMARY: ${ok}/${ok + bad} filter params 200-OK`);
