// BE smoke (safe): log in to the dev api :4100, create a «Выданный отчёт
// комиссионера» with 2 positions, and verify the server-computed totals
// (Сумма / Комиссия / Сумма комитента) + that the draft shows in the union list.
// Read-ish: it DOES create one real draft (that's the point); nothing destructive.
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
const { status: ls, body: lb } = await j(login);
const token = lb?.accessToken || lb?.token || lb?.access_token;
const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
console.log('login', ls, token ? 'token-ok' : JSON.stringify(lb));

const pick = async (path) => {
  const r = await fetch(`${API}/${path}`, { headers: auth });
  const { body } = await j(r);
  return body?.items?.[0] ?? null;
};
const org = await pick('organizations');
const agent = await pick('counterparties?limit=1');
const product = await pick('products?limit=1');
console.log('refs', { org: org?.id?.slice(0, 8), agent: agent?.id?.slice(0, 8), product: product?.id?.slice(0, 8) });

// 2 lines: qty2 × 5000 tiyin = 10000 + commission 1500 ; qty1 × 3000 = 3000 + commission 600.
// VAT off (vatEnabled:false) to keep the arithmetic crisp: Сумма = 13000,
// Комиссия = 2100, Сумма комитента = 13000 − 2100 = 10900.
const payload = {
  organizationId: org.id,
  agentId: agent.id,
  currency: 'UZS',
  vatEnabled: false,
  vatIncluded: false,
  description: 'SMOKE commission out (delete me)',
  positions: [
    { assortmentId: product.id, quantity: '2', priceMinor: '5000', vat: null, vatEnabled: false, commissionMinor: '1500' },
    { assortmentId: product.id, quantity: '1', priceMinor: '3000', vat: null, vatEnabled: false, commissionMinor: '600' },
  ],
};
const create = await fetch(`${API}/commission-reports`, { method: 'POST', headers: auth, body: JSON.stringify(payload) });
const { status: cs, body: cb } = await j(create);
console.log('CREATE', cs, JSON.stringify(cb));

// Read it back from the union list (it stores sums; find by name).
const list = await fetch(`${API}/commission-reports?pageSize=5&sortBy=moment&sortDir=desc`, { headers: auth });
const { body: lib } = await j(list);
const mine = (lib?.items || []).find((x) => x.id === cb?.id);
console.log('LIST_ROW', mine ? JSON.stringify({
  name: mine.name, kind: mine.kind,
  sumMinor: mine.sumMinor, rewardSumMinor: mine.rewardSumMinor, commitentSumMinor: mine.commitentSumMinor,
}) : 'NOT FOUND');
console.log('EXPECT  ', JSON.stringify({ sumMinor: '13000', rewardSumMinor: '2100', commitentSumMinor: '10900' }));

// Adversarial: commission > sum must 400.
const bad = await fetch(`${API}/commission-reports`, {
  method: 'POST', headers: auth,
  body: JSON.stringify({ ...payload, positions: [{ assortmentId: product.id, quantity: '1', priceMinor: '1000', vatEnabled: false, commissionMinor: '999999' }] }),
});
console.log('OVER_COMMISSION (expect 400)', (await j(bad)).status);

// Adversarial: missing org must 400.
const noOrg = await fetch(`${API}/commission-reports`, { method: 'POST', headers: auth, body: JSON.stringify({ agentId: agent.id, positions: [] }) });
console.log('NO_ORG (expect 400)', (await j(noOrg)).status);

// Adversarial: empty positions allowed? (header-only draft) — totals 0.
const empty = await fetch(`${API}/commission-reports`, { method: 'POST', headers: auth, body: JSON.stringify({ organizationId: org.id, agentId: agent.id, positions: [] }) });
console.log('EMPTY_POSITIONS', (await j(empty)).status);
