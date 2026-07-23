// LIVE API cert — per-cell stock (Адресное хранение Phase 3+4) end-to-end.
// Creates a throwaway store + zone + cell, posts an Enter into the cell (+qty),
// asserts StockByCell drives «Занята» + productQty + «С этим товаром», posts a
// Loss from the cell (-qty), asserts the per-cell balance dropped, then cancels
// both (zeroes the cell) and deletes the store. Demo creds are PUBLIC.
const BASE = process.env.API_BASE || 'http://localhost:4000/api/v1';
let token = '';
let pass = 0;
let fail = 0;
const ok = (n, c, e = '') => {
  if (c) {
    pass++;
    console.log(`  ✓ ${n}${e ? ` — ${e}` : ''}`);
  } else {
    fail++;
    console.log(`  ✗ ${n}${e ? ` — ${e}` : ''}`);
  }
};
async function api(method, path, body, expect) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  if (expect !== undefined && res.status !== expect) {
    console.log(`    ! ${method} ${path} → ${res.status} (want ${expect}): ${JSON.stringify(json)?.slice(0, 200)}`);
  }
  return { status: res.status, json };
}
const cellOf = (snap, id) => snap?.cells?.find((c) => c.id === id);

let storeId = '';
let enterId = '';
let lossId = '';
try {
  const login = await api('POST', '/auth/login', { email: 'admin@demo.local', password: 'admin123' });
  token = login.json?.accessToken || login.json?.token || '';
  ok('login', !!token);
  if (!token) throw new Error('no token');

  // org + product
  let org = await api('GET', '/organizations?limit=1');
  if (org.status === 404) org = await api('GET', '/admin/organizations?limit=1');
  const orgId = org.json?.items?.[0]?.id;
  const prod = await api('GET', '/products?limit=1');
  const productId = prod.json?.items?.[0]?.id;
  ok('have org + product', !!orgId && !!productId, `org=${orgId?.slice(0, 8)} prod=${productId?.slice(0, 8)}`);
  if (!orgId || !productId) throw new Error('no org/product');

  // throwaway store + zone + cell
  storeId = (await api('POST', '/admin/stores', { name: `ЦЕРТ-cellstock ${Date.now()}` }, 201)).json?.id;
  const zoneId = (await api('POST', `/admin/stores/${storeId}/zones`, { name: 'Зона A' }, 201)).json?.id;
  const cell = (await api('POST', `/admin/stores/${storeId}/cells`, { name: 'A-1', zoneId }, 201)).json;
  const cellId = cell?.id;
  const cellLabel = 'Зона A / A-1';
  ok('store + zone + cell created', !!storeId && !!zoneId && !!cellId, cellId?.slice(0, 8));

  // baseline: cell empty
  const base = await api('GET', `/admin/stores/${storeId}/address-storage?assortmentKind=product&assortmentId=${productId}`, undefined, 200);
  ok('baseline: cell Свободна, productQty null', cellOf(base.json, cellId)?.occupied === false && cellOf(base.json, cellId)?.productQty === null);

  // ENTER +10 into the cell
  enterId = (await api('POST', '/enters', {
    organizationId: orgId,
    storeId,
    positions: [{ assortmentKind: 'product', assortmentId: productId, quantity: '10', costMinor: '50000', cellId, cell: cellLabel }],
  }, 201).then((r) => r.json))?.id;
  ok('enter created (draft)', !!enterId);
  const post1 = await api('POST', `/enters/${enterId}/transitions/post`, {}, 201);
  ok('enter posted', post1.status === 201);

  const afterEnter = await api('GET', `/admin/stores/${storeId}/address-storage?assortmentKind=product&assortmentId=${productId}`, undefined, 200);
  const c1 = cellOf(afterEnter.json, cellId);
  ok('after enter: cell Занята (occupied)', c1?.occupied === true);
  ok('after enter: cell productQty = 10', Number(c1?.productQty) === 10, `got ${c1?.productQty}`);
  const z1 = afterEnter.json?.zones?.find((z) => z.id === zoneId);
  ok('after enter: zone Занято=1, Свободно=0', z1?.occupiedCount === 1 && z1?.freeCount === 0, `occ=${z1?.occupiedCount} free=${z1?.freeCount}`);
  // «С этим товаром» = cells with productQty>0
  const withProduct = (afterEnter.json?.cells ?? []).filter((c) => c.productQty && Number(c.productQty) > 0);
  ok('«С этим товаром» shows the cell (1)', withProduct.length === 1 && withProduct[0].id === cellId);

  // deleting a stocked cell is blocked
  const delBlocked = await api('DELETE', `/admin/stores/${storeId}/cells/${cellId}`, undefined, 400);
  ok('delete stocked cell → 400 (нельзя удалить непустую ячейку)', delBlocked.status === 400);

  // LOSS -3 from the cell
  lossId = (await api('POST', '/losses', {
    organizationId: orgId,
    storeId,
    positions: [{ assortmentKind: 'product', assortmentId: productId, quantity: '3', cellId, cell: cellLabel, costMinor: '50000' }],
  }, 201).then((r) => r.json))?.id;
  ok('loss created (draft)', !!lossId);
  const post2 = await api('POST', `/losses/${lossId}/transitions/post`, {}, 201);
  ok('loss posted', post2.status === 201);

  const afterLoss = await api('GET', `/admin/stores/${storeId}/address-storage?assortmentKind=product&assortmentId=${productId}`, undefined, 200);
  ok('after loss: cell productQty = 7 (10 − 3)', Number(cellOf(afterLoss.json, cellId)?.productQty) === 7, `got ${cellOf(afterLoss.json, cellId)?.productQty}`);

  // foreign cellId on a different store's doc → 400 (cross-store guard)
  const otherStore = (await api('POST', '/admin/stores', { name: `ЦЕРТ-other ${Date.now()}` }, 201)).json?.id;
  const foreign = await api('POST', '/losses', {
    organizationId: orgId,
    storeId: otherStore,
    positions: [{ assortmentKind: 'product', assortmentId: productId, quantity: '1', cellId, cell: cellLabel }],
  }, 400);
  ok('foreign cellId (other store) → 400 (cross-store guard)', foreign.status === 400);
  await api('DELETE', `/admin/stores/${otherStore}`);

  // cancel both → per-cell stock returns to 0 (zero-sum reversal)
  await api('POST', `/losses/${lossId}/transitions/cancel`, {}, 201);
  await api('POST', `/enters/${enterId}/transitions/cancel`, {}, 201);
  const zeroed = await api('GET', `/admin/stores/${storeId}/address-storage?assortmentKind=product&assortmentId=${productId}`, undefined, 200);
  ok('after cancel both: cell empty again (Свободна, qty 0)', cellOf(zeroed.json, cellId)?.occupied === false);
  // NB: the throwaway store keeps its (cancelled) docs + ledger rows, so the store
  // can't be API-deleted (FK Restrict). A separate SQL sweep removes ЦЕРТ-* stores.
  console.log(`  (throwaway store ${storeId} left for SQL cleanup — has cancelled docs)`);
  storeId = '';
} catch (e) {
  ok('EXCEPTION', false, e.message);
} finally {
  // best-effort cleanup if we bailed mid-run
  if (token && storeId) {
    if (lossId) await api('POST', `/losses/${lossId}/transitions/cancel`, {}).catch(() => {});
    if (enterId) await api('POST', `/enters/${enterId}/transitions/cancel`, {}).catch(() => {});
    await api('DELETE', `/admin/stores/${storeId}`).catch(() => {});
  }
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
