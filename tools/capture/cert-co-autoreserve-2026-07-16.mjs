// LIVE CERT — customer-order auto-reservation invariant (2026-07-16).
// Owner-confirmed moysklad behaviour: «Проведено» auto-fills «Зарезерв.»
// (hold = quantity − shippedQty while posted); shipping consumes the hold
// BEFORE the sufficiency check; unpost/cancel/delete release it.
// Runs against an isolated api (API env: default http://127.0.0.1:4177).
// Creates docs in the LOCAL dev DB only and deletes them all at the end.
const API = process.env.API || 'http://127.0.0.1:4177/api/v1';
let token = '';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const req = async (method, path, body) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* raw */ }
  return { status: r.status, json, text };
};
const die = (msg) => { console.error(`ABORT: ${msg}`); process.exit(2); };

// --- login + refs ---------------------------------------------------------
{
  const r = await req('POST', '/auth/login', { email: 'admin@demo.local', password: 'admin123' });
  token = r.json?.accessToken || r.json?.token || r.json?.access_token;
  if (!token) die(`login failed ${r.status} ${r.text.slice(0, 120)}`);
}
const orgs = await req('GET', '/organizations');
const orgId = orgs.json?.items?.[0]?.id || die('no org');
const stores = await req('GET', '/stores?search=Asosiy');
const storeId = stores.json?.items?.[0]?.id || die('no store');
const agents = await req('GET', '/counterparties?search=ABC');
const agentId = agents.json?.items?.[0]?.id || die('no counterparty');
const prods = await req('GET', '/products?search=iPhone%2015%20Pro');
const prod = prods.json?.items?.[0] || die('no product');
const productId = prod.id;

const clusterOf = async () => {
  const r = await req('GET', '/products?search=iPhone%2015%20Pro');
  const p = r.json?.items?.find((x) => x.id === productId);
  return {
    onHand: Number(p?.stock?.onHand ?? 0),
    reserved: Number(p?.stock?.reserved ?? 0),
    available: Number(p?.stock?.available ?? 0),
  };
};
const orderOf = async (id) => (await req('GET', `/customer-orders/${id}`)).json;

const base = await clusterOf();
console.log(`baseline iPhone: onHand=${base.onHand} reserved=${base.reserved} available=${base.available}`);

// --- 1. draft order (no manual reserve) ⇒ no hold --------------------------
const co = await req('POST', '/customer-orders', {
  organizationId: orgId, agentId, storeId, applicable: false,
  positions: [{ assortmentKind: 'product', assortmentId: productId, quantity: 2, priceMinor: '1000000', discount: 0, vatEnabled: false }],
});
const coId = co.json?.id || die(`CO create failed ${co.status} ${co.text.slice(0, 200)}`);
{
  const c = await clusterOf();
  check('1. draft order holds nothing', c.reserved === base.reserved, `reserved ${c.reserved}`);
}

// --- 2. post (Проведено) ⇒ auto-reserve full remaining ----------------------
await req('POST', `/customer-orders/${coId}/transitions/confirmed`, {});
{
  const o = await orderOf(coId);
  const pos = o.positions[0];
  const c = await clusterOf();
  check('2a. posted ⇒ position reservedQty == qty', Number(pos.reservedQty) === 2, `reservedQty=${pos.reservedQty}`);
  check('2b. posted ⇒ stock reserved +2', c.reserved === base.reserved + 2, `reserved ${base.reserved}→${c.reserved}`);
  check('2c. header reservedSumMinor > 0', BigInt(o.reservedSumMinor || '0') > 0n, `${o.reservedSumMinor}`);
}

// --- 3. ship 1 of 2 via linked demand — MUST NOT be blocked by own hold -----
const o1 = await orderOf(coId);
const coPosId = o1.positions[0].id;
const dm = await req('POST', '/demands', {
  organizationId: orgId, agentId, storeId, customerOrderId: coId, applicable: false,
  positions: [{ assortmentKind: 'product', assortmentId: productId, quantity: 1, priceMinor: '1000000', discount: 0, vatEnabled: false, customerOrderPositionId: coPosId }],
});
const dmId = dm.json?.id || die(`demand create failed ${dm.status} ${dm.text.slice(0, 200)}`);
const post1 = await req('POST', `/demands/${dmId}/transitions/post`, {});
check('3a. demand posts THROUGH the order\'s own full hold', post1.status < 300, `status=${post1.status} ${post1.status >= 300 ? post1.text.slice(0, 140) : ''}`);
{
  const o = await orderOf(coId);
  const pos = o.positions[0];
  const c = await clusterOf();
  check('3b. ship 1 ⇒ hold consumed to remaining 1', Number(pos.reservedQty) === 1, `reservedQty=${pos.reservedQty}`);
  check('3c. shippedQty == 1', Number(pos.shippedQty) === 1, `shippedQty=${pos.shippedQty}`);
  check('3d. stock: onHand −1, reserved +1 vs baseline', c.onHand === base.onHand - 1 && c.reserved === base.reserved + 1, `onHand ${c.onHand}, reserved ${c.reserved}`);
}

// --- 4. unpost demand ⇒ hold restored ---------------------------------------
await req('POST', `/demands/${dmId}/transitions/unpost`, {});
{
  const o = await orderOf(coId);
  const pos = o.positions[0];
  const c = await clusterOf();
  check('4a. un-ship ⇒ hold restored to 2', Number(pos.reservedQty) === 2, `reservedQty=${pos.reservedQty}`);
  check('4b. stock back to baseline+hold', c.onHand === base.onHand && c.reserved === base.reserved + 2, `onHand ${c.onHand}, reserved ${c.reserved}`);
}

// --- 5. unpost order ⇒ full release ------------------------------------------
await req('POST', `/customer-orders/${coId}/transitions/draft`, {});
{
  const o = await orderOf(coId);
  const c = await clusterOf();
  check('5a. unpost ⇒ position hold 0', Number(o.positions[0].reservedQty) === 0, `reservedQty=${o.positions[0].reservedQty}`);
  check('5b. unpost ⇒ stock reserved back to baseline', c.reserved === base.reserved, `reserved ${c.reserved}`);
  check('5c. reservedSumMinor back to 0', (o.reservedSumMinor ?? '0') === '0', `${o.reservedSumMinor}`);
}

// --- 6. repost ⇒ re-holds ----------------------------------------------------
await req('POST', `/customer-orders/${coId}/transitions/confirmed`, {});
{
  const c = await clusterOf();
  check('6. repost ⇒ holds again (+2)', c.reserved === base.reserved + 2, `reserved ${c.reserved}`);
}
await req('POST', `/customer-orders/${coId}/transitions/draft`, {});

// --- 7. delete of a draft with MANUAL reserve releases the hold --------------
const co2 = await req('POST', '/customer-orders', {
  organizationId: orgId, agentId, storeId, applicable: false,
  positions: [{ assortmentKind: 'product', assortmentId: productId, quantity: 3, priceMinor: '1000000', discount: 0, vatEnabled: false, reservedQty: 3 }],
});
const co2Id = co2.json?.id || die('CO2 create failed');
{
  const c = await clusterOf();
  check('7a. manual draft reserve holds +3', c.reserved === base.reserved + 3, `reserved ${c.reserved}`);
}
await req('DELETE', `/customer-orders/${co2Id}`);
{
  const c = await clusterOf();
  check('7b. delete releases the manual hold', c.reserved === base.reserved, `reserved ${c.reserved}`);
}

// --- cleanup -----------------------------------------------------------------
await req('DELETE', `/demands/${dmId}`);
await req('DELETE', `/customer-orders/${coId}`);
{
  const c = await clusterOf();
  check('8. cleanup: stock byte-identical to baseline', c.onHand === base.onHand && c.reserved === base.reserved && c.available === base.available, `onHand ${c.onHand}, reserved ${c.reserved}, available ${c.available}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS${failed.length ? ` — ${failed.length} FAIL` : ''}`);
process.exit(failed.length ? 1 : 0);
