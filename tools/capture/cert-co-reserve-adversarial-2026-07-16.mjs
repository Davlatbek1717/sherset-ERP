// LIVE CERT #2 — adversarial-review scenarios for CO auto-reservation:
//   A. OVER-RESERVED order (hold > physical stock) still ships its own goods
//      partially (own hold must not block own shipment — §2c patch).
//   B. Manual «Очистить резерв» on a posted order SURVIVES a later shipment
//      (consume-only rule: shipping never grows a hold).
//   C. Duplicate customerOrderPositionId demand lines stay consistent
//      (aggregated math: position hold == stock hold sum).
// Local dev DB only; all docs deleted at the end.
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
const prod = (await req('GET', '/products?search=iPhone%2015%20Pro')).json.items[0];
const productId = prod.id;
const clusterOf = async () => {
  const r = await req('GET', '/products?search=iPhone%2015%20Pro');
  const p = r.json.items.find((x) => x.id === productId);
  return { onHand: Number(p.stock.onHand), reserved: Number(p.stock.reserved) };
};
const orderOf = async (id) => (await req('GET', `/customer-orders/${id}`)).json;
const base = await clusterOf();
console.log(`baseline: onHand=${base.onHand} reserved=${base.reserved}`);
if (base.reserved !== 0) die('baseline reserved != 0 — clean the DB first');

// ============ A. over-reserved order ships partially =========================
const OVER_QTY = base.onHand + 5; // hold exceeds physical stock
const coA = (await req('POST', '/customer-orders', {
  organizationId: orgId, agentId, storeId, applicable: true,
  positions: [{ assortmentKind: 'product', assortmentId: productId, quantity: OVER_QTY, priceMinor: '1000000', discount: 0, vatEnabled: false }],
})).json;
{
  const c = await clusterOf();
  check('A1. over-reserve allowed on post', c.reserved === OVER_QTY, `reserved=${c.reserved} (qty ${OVER_QTY} > stock ${base.onHand})`);
}
const posA = (await orderOf(coA.id)).positions[0];
const dmA = (await req('POST', '/demands', {
  organizationId: orgId, agentId, storeId, customerOrderId: coA.id, applicable: false,
  positions: [{ assortmentKind: 'product', assortmentId: productId, quantity: 4, priceMinor: '1000000', discount: 0, vatEnabled: false, customerOrderPositionId: posA.id }],
})).json;
const shipA = await req('POST', `/demands/${dmA.id}/transitions/post`, {});
check('A2. own over-hold does NOT block own partial shipment', shipA.status < 300, `status=${shipA.status} ${shipA.status >= 300 ? shipA.text.slice(0, 120) : ''}`);
{
  const o = await orderOf(coA.id);
  const c = await clusterOf();
  check('A3. hold consumed by shipped qty', Number(o.positions[0].reservedQty) === OVER_QTY - 4, `hold=${o.positions[0].reservedQty}`);
  check('A4. stock moved −4', c.onHand === base.onHand - 4, `onHand=${c.onHand}`);
}
// cleanup A
await req('POST', `/demands/${dmA.id}/transitions/unpost`, {});
await req('DELETE', `/demands/${dmA.id}`);
await req('POST', `/customer-orders/${coA.id}/transitions/draft`, {});
await req('DELETE', `/customer-orders/${coA.id}`);

// ============ B. Очистить резерв survives a later shipment ====================
const coB = (await req('POST', '/customer-orders', {
  organizationId: orgId, agentId, storeId, applicable: true,
  positions: [{ assortmentKind: 'product', assortmentId: productId, quantity: 5, priceMinor: '1000000', discount: 0, vatEnabled: false }],
})).json;
await req('POST', '/customer-orders/bulk-clear-reserve', { ids: [coB.id] });
{
  const c = await clusterOf();
  check('B1. Очистить резерв zeroes the hold on a POSTED order', c.reserved === 0, `reserved=${c.reserved}`);
}
const posB = (await orderOf(coB.id)).positions[0];
const dmB = (await req('POST', '/demands', {
  organizationId: orgId, agentId, storeId, customerOrderId: coB.id, applicable: false,
  positions: [{ assortmentKind: 'product', assortmentId: productId, quantity: 2, priceMinor: '1000000', discount: 0, vatEnabled: false, customerOrderPositionId: posB.id }],
})).json;
await req('POST', `/demands/${dmB.id}/transitions/post`, {});
{
  const o = await orderOf(coB.id);
  const c = await clusterOf();
  check('B2. shipping does NOT grow the cleared hold', Number(o.positions[0].reservedQty) === 0 && c.reserved === 0, `hold=${o.positions[0].reservedQty}, stockReserved=${c.reserved}`);
}
await req('POST', `/demands/${dmB.id}/transitions/unpost`, {});
await req('DELETE', `/demands/${dmB.id}`);
await req('POST', `/customer-orders/${coB.id}/transitions/draft`, {});
await req('DELETE', `/customer-orders/${coB.id}`);

// ============ C. duplicate customerOrderPositionId lines ======================
const coC = (await req('POST', '/customer-orders', {
  organizationId: orgId, agentId, storeId, applicable: true,
  positions: [{ assortmentKind: 'product', assortmentId: productId, quantity: 10, priceMinor: '1000000', discount: 0, vatEnabled: false }],
})).json;
const posC = (await orderOf(coC.id)).positions[0];
const dmC = (await req('POST', '/demands', {
  organizationId: orgId, agentId, storeId, customerOrderId: coC.id, applicable: false,
  positions: [
    { assortmentKind: 'product', assortmentId: productId, quantity: 3, priceMinor: '1000000', discount: 0, vatEnabled: false, customerOrderPositionId: posC.id },
    { assortmentKind: 'product', assortmentId: productId, quantity: 4, priceMinor: '1000000', discount: 0, vatEnabled: false, customerOrderPositionId: posC.id },
  ],
})).json;
const shipC = await req('POST', `/demands/${dmC.id}/transitions/post`, {});
check('C1. duplicate-linked demand posts', shipC.status < 300, `status=${shipC.status}`);
{
  const o = await orderOf(coC.id);
  const c = await clusterOf();
  const hold = Number(o.positions[0].reservedQty);
  const shipped = Number(o.positions[0].shippedQty);
  check('C2. shippedQty aggregated = 7', shipped === 7, `shipped=${shipped}`);
  check('C3. position hold == qty − shipped (3)', hold === 3, `hold=${hold}`);
  check('C4. stock hold == position hold (no desync)', c.reserved === hold, `stockReserved=${c.reserved}, posHold=${hold}`);
}
await req('POST', `/demands/${dmC.id}/transitions/unpost`, {});
{
  const o = await orderOf(coC.id);
  const c = await clusterOf();
  check('C5. unpost restores hold to 10, no drift', Number(o.positions[0].reservedQty) === 10 && c.reserved === 10, `hold=${o.positions[0].reservedQty}, stockReserved=${c.reserved}`);
}
await req('DELETE', `/demands/${dmC.id}`);
await req('POST', `/customer-orders/${coC.id}/transitions/draft`, {});
await req('DELETE', `/customer-orders/${coC.id}`);

{
  const c = await clusterOf();
  check('Z. cleanup: stock byte-identical to baseline', c.onHand === base.onHand && c.reserved === base.reserved, `onHand=${c.onHand}, reserved=${c.reserved}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS${failed.length ? ` — ${failed.length} FAIL` : ''}`);
process.exit(failed.length ? 1 : 0);
