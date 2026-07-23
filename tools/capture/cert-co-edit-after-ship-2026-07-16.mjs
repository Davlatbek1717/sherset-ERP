// LIVE CERT — CO position DIFF-UPSERT (edit-after-partial-ship, 2026-07-16).
// Pre-existing CRIT class: update() used wholesale delete+recreate, so editing
// a partially-shipped order reset shippedQty to 0 and dangled
// DemandPosition.customerOrderPositionId (demand unpost then 400'd forever).
// Now payload lines carry `id` → in-place update; shipped lines are guarded.
// Local dev DB only; everything deleted at the end.
const API = process.env.API || 'http://127.0.0.1:4179/api/v1';
let token = '';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const req = async (method, path, body) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* raw */ }
  return { status: r.status, json, text };
};
const die = (msg) => { console.error(`ABORT: ${msg}`); process.exit(2); };

{
  const r = await req('POST', '/auth/login', { email: 'admin@demo.local', password: 'admin123' });
  token = r.json?.accessToken || r.json?.token;
  if (!token) die('login failed');
}
const orgId = (await req('GET', '/organizations')).json.items[0].id;
const storeId = (await req('GET', '/stores?search=Asosiy')).json.items[0].id;
const agentId = (await req('GET', '/counterparties?search=ABC')).json.items[0].id;
const iphone = (await req('GET', '/products?search=iPhone%2015%20Pro')).json.items[0];
const samsung = (await req('GET', '/products?search=Samsung%20Galaxy')).json.items[0];
const clusterOf = async () => {
  const r = await req('GET', '/products?search=iPhone%2015%20Pro');
  const p = r.json.items.find((x) => x.id === iphone.id);
  return { onHand: Number(p.stock.onHand), reserved: Number(p.stock.reserved) };
};
const orderOf = async (id) => (await req('GET', `/customer-orders/${id}`)).json;
const base = await clusterOf();
console.log(`baseline iPhone: onHand=${base.onHand} reserved=${base.reserved}`);
if (base.reserved !== 0) die('baseline reserved != 0');

// 1. create + post (qty 5) → hold 5
const co = (await req('POST', '/customer-orders', {
  organizationId: orgId, agentId, storeId, applicable: true,
  positions: [{ assortmentKind: 'product', assortmentId: iphone.id, quantity: 5, priceMinor: '10000000', discount: 0, vatEnabled: false }],
})).json;
let o = await orderOf(co.id);
const posId = o.positions[0].id;
check('1. posted qty=5 ⇒ hold 5', Number(o.positions[0].reservedQty) === 5, `hold=${o.positions[0].reservedQty}`);

// 2. ship 2 via linked demand
const dm = (await req('POST', '/demands', {
  organizationId: orgId, agentId, storeId, customerOrderId: co.id, applicable: false,
  positions: [{ assortmentKind: 'product', assortmentId: iphone.id, quantity: 2, priceMinor: '10000000', discount: 0, vatEnabled: false, customerOrderPositionId: posId }],
})).json;
await req('POST', `/demands/${dm.id}/transitions/post`, {});
o = await orderOf(co.id);
check('2. ship 2 ⇒ shipped=2, hold=3', Number(o.positions[0].shippedQty) === 2 && Number(o.positions[0].reservedQty) === 3, `shipped=${o.positions[0].shippedQty}, hold=${o.positions[0].reservedQty}`);

// 3. EDIT the order (id-carrying diff-upsert): price change + NEW second line
const edit1 = await req('PATCH', `/customer-orders/${co.id}`, {
  version: o.version,
  positions: [
    { id: posId, assortmentKind: 'product', assortmentId: iphone.id, quantity: 5, priceMinor: '12000000', discount: 0, vatEnabled: false, reservedQty: 3 },
    { assortmentKind: 'product', assortmentId: samsung.id, quantity: 1, priceMinor: '9000000', discount: 0, vatEnabled: false },
  ],
});
check('3a. edit accepted', edit1.status < 300, `status=${edit1.status} ${edit1.status >= 300 ? edit1.text.slice(0, 140) : ''}`);
o = await orderOf(co.id);
const line1 = o.positions.find((p) => p.id === posId);
check('3b. position IDENTITY survives the edit', !!line1, line1 ? 'same id' : `ids=${o.positions.map((p) => p.id.slice(0, 8))}`);
check('3c. shippedQty INTACT after edit (=2)', Number(line1?.shippedQty) === 2, `shipped=${line1?.shippedQty}`);
check('3d. hold preserved via resent reservedQty (=3)', Number(line1?.reservedQty) === 3, `hold=${line1?.reservedQty}`);
check('3e. price updated in place', String(line1?.priceMinor) === '12000000', `price=${line1?.priceMinor}`);
check('3f. new line appended (2 lines)', o.positions.length === 2, `count=${o.positions.length}`);
check('3g. «Отгружено» money resynced to new price (2×12M)', String(o.shippedSumMinor) === '24000000', `shippedSum=${o.shippedSumMinor}`);

// 4. guards on the shipped line
const v = (await orderOf(co.id)).version;
const gRemove = await req('PATCH', `/customer-orders/${co.id}`, {
  version: v,
  positions: [{ assortmentKind: 'product', assortmentId: samsung.id, quantity: 1, priceMinor: '9000000', discount: 0, vatEnabled: false }],
});
check('4a. removing the shipped line ⇒ 400', gRemove.status === 400, `status=${gRemove.status}`);
const gQty = await req('PATCH', `/customer-orders/${co.id}`, {
  version: (await orderOf(co.id)).version,
  positions: [{ id: posId, assortmentKind: 'product', assortmentId: iphone.id, quantity: 1, priceMinor: '12000000', discount: 0, vatEnabled: false }],
});
check('4b. qty below shipped ⇒ 400', gQty.status === 400, `status=${gQty.status}`);
const gSwap = await req('PATCH', `/customer-orders/${co.id}`, {
  version: (await orderOf(co.id)).version,
  positions: [{ id: posId, assortmentKind: 'product', assortmentId: samsung.id, quantity: 5, priceMinor: '12000000', discount: 0, vatEnabled: false }],
});
check('4c. swapping product of the shipped line ⇒ 400', gSwap.status === 400, `status=${gSwap.status}`);
const gLegacy = await req('PATCH', `/customer-orders/${co.id}`, {
  version: (await orderOf(co.id)).version,
  positions: [{ assortmentKind: 'product', assortmentId: iphone.id, quantity: 5, priceMinor: '12000000', discount: 0, vatEnabled: false }],
});
check('4d. LEGACY id-less payload on shipped order ⇒ 400 (fail-safe, not corrupt)', gLegacy.status === 400, `status=${gLegacy.status}`);
const gForeign = await req('PATCH', `/customer-orders/${co.id}`, {
  version: (await orderOf(co.id)).version,
  positions: [{ id: dm.id, assortmentKind: 'product', assortmentId: iphone.id, quantity: 5, priceMinor: '12000000', discount: 0, vatEnabled: false }],
});
check('4e. foreign/unknown position id ⇒ 400', gForeign.status === 400, `status=${gForeign.status}`);

// 5. demand UNPOST after the edit — the exact op that 400'd before the fix
const unpost = await req('POST', `/demands/${dm.id}/transitions/unpost`, {});
check('5a. demand unpost WORKS after order edit', unpost.status < 300, `status=${unpost.status} ${unpost.status >= 300 ? unpost.text.slice(0, 140) : ''}`);
o = await orderOf(co.id);
const line1b = o.positions.find((p) => p.id === posId);
check('5b. un-ship ⇒ shipped=0, hold restored to 5', Number(line1b?.shippedQty) === 0 && Number(line1b?.reservedQty) === 5, `shipped=${line1b?.shippedQty}, hold=${line1b?.reservedQty}`);

// cleanup
await req('DELETE', `/demands/${dm.id}`);
await req('POST', `/customer-orders/${co.id}/transitions/draft`, {});
await req('DELETE', `/customer-orders/${co.id}`);
{
  const c = await clusterOf();
  check('Z. cleanup: stock byte-identical to baseline', c.onHand === base.onHand && c.reserved === base.reserved, `onHand=${c.onHand}, reserved=${c.reserved}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS${failed.length ? ` — ${failed.length} FAIL` : ''}`);
process.exit(failed.length ? 1 : 0);
