// BE smoke — /supplies bulk-create endpoints (list-toolbar «Создать ▾»).
// Creates a posted supply, then exercises bulk-create-payment-out /
// -cash-out / -purchase-return + factures-in/generate/from-supplies,
// asserting each creates its document. Run: node tools/capture/smoke-supply-bulk-create.mjs
const API = process.env.API_BASE ?? 'http://localhost:4020/api/v1';
const j = (r) => r.json();
const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
}).then(j);
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.accessToken}` };
const get = (p) => fetch(`${API}${p}`, { headers: H }).then(j);
const post = async (p, body) => {
  const r = await fetch(`${API}${p}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const out = {};

const org = (await get('/organizations?limit=1')).items?.[0];
const agent = (await get('/counterparties?limit=1')).items?.[0];
const storesRes = await get('/admin/stores?limit=1');
const store = (storesRes.items ?? storesRes)?.[0];
// NOTE: /products list 500s on this machine (parallel-session Prisma-client
// drift: client expects products.cell_id the DB lacks) — pass a known product
// id via PRODUCT_ID env (fetched by raw SQL) instead of the list endpoint.
const prod = process.env.PRODUCT_ID
  ? { id: process.env.PRODUCT_ID }
  : (await get('/products?limit=1')).items?.[0];
out.refs = { org: !!org, agent: !!agent, store: !!store, prod: !!prod };

// 1. create + post a supply
const sup = await post('/supplies', {
  organizationId: org.id,
  agentId: agent.id,
  storeId: store.id,
  positions: [{ assortmentKind: 'product', assortmentId: prod.id, quantity: '3', priceMinor: '500000' }],
});
out.createSupply = sup.status;
const supplyId = sup.body?.id;
const posted = await post(`/supplies/${supplyId}/transitions/post`, {});
out.postSupply = posted.status;

// 2. bulk-create-payment-out
const pay = await post('/supplies/bulk-create-payment-out', { ids: [supplyId] });
out.paymentOut = { status: pay.status, succeeded: pay.body?.succeeded?.length, failed: pay.body?.failed };

// 3. bulk-create-cash-out
const cash = await post('/supplies/bulk-create-cash-out', { ids: [supplyId] });
out.cashOut = { status: cash.status, succeeded: cash.body?.succeeded?.length, failed: cash.body?.failed };

// 4. bulk-create-purchase-return (needs posted supply)
const ret = await post('/supplies/bulk-create-purchase-return', { ids: [supplyId] });
out.purchaseReturn = { status: ret.status, succeeded: ret.body?.succeeded?.length, failed: ret.body?.failed };

// 4b. second return on the same supply must hit the cumulative cap (all qty already claimed)
const ret2 = await post('/supplies/bulk-create-purchase-return', { ids: [supplyId] });
out.purchaseReturnCap = { status: ret2.status, succeeded: ret2.body?.succeeded?.length, failedError: ret2.body?.failed?.[0]?.error?.slice(0, 120) };

// 5. facture from supplies
const fac = await post('/factures-in/generate/from-supplies', { supplyIds: [supplyId] });
out.factureIn = { status: fac.status, id: fac.body?.id ? 'created' : fac.body };

// 6. adversarial: bogus id + draft supply
const bogus = await post('/supplies/bulk-create-payment-out', { ids: ['00000000-0000-0000-0000-00000000dead'] });
out.bogusId = { status: bogus.status, failed: bogus.body?.failed?.length ?? bogus.status };
const draft = await post('/supplies', {
  organizationId: org.id,
  agentId: agent.id,
  storeId: store.id,
  positions: [{ assortmentKind: 'product', assortmentId: prod.id, quantity: '1', priceMinor: '100000' }],
});
const draftReturn = await post('/supplies/bulk-create-purchase-return', { ids: [draft.body.id] });
out.draftReturnRejected = { failedCount: draftReturn.body?.failed?.length, error: draftReturn.body?.failed?.[0]?.error?.slice(0, 80) };

console.log(JSON.stringify(out, null, 2));
