// LIVE API cert — Supply (Приёмка) per-cell stock (Адресное хранение Phase 5).
// Posts a Supply into a cell (+qty), asserts StockByCell drives «Занята» +
// productQty, then cancels (zero-sum) and SQL-cleans. Demo creds are PUBLIC.
const BASE = process.env.API_BASE || 'http://localhost:4000/api/v1';
let token = '';
let pass = 0;
let fail = 0;
const ok = (n, c, e = '') => {
  c ? pass++ : fail++;
  console.log(`  ${c ? '✓' : '✗'} ${n}${e ? ` — ${e}` : ''}`);
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
  if (expect !== undefined && res.status !== expect) console.log(`    ! ${method} ${path} → ${res.status}: ${JSON.stringify(json)?.slice(0, 180)}`);
  return { status: res.status, json };
}
const cellOf = (s, id) => s?.cells?.find((c) => c.id === id);
let storeId = '';
let supplyId = '';
try {
  token = (await api('POST', '/auth/login', { email: 'admin@demo.local', password: 'admin123' })).json?.accessToken;
  ok('login', !!token);
  const orgId = (await api('GET', '/organizations?limit=1')).json?.items?.[0]?.id;
  const productId = (await api('GET', '/products?limit=1')).json?.items?.[0]?.id;
  const agentId = (await api('GET', '/counterparties?limit=1')).json?.items?.[0]?.id;
  ok('org + product + agent', !!orgId && !!productId && !!agentId);

  storeId = (await api('POST', '/admin/stores', { name: `ЦЕРТ-supplycell ${Date.now()}` }, 201)).json?.id;
  const zoneId = (await api('POST', `/admin/stores/${storeId}/zones`, { name: 'Зона S' }, 201)).json?.id;
  const cellId = (await api('POST', `/admin/stores/${storeId}/cells`, { name: 'S-1', zoneId }, 201)).json?.id;
  ok('store + zone + cell', !!cellId);

  supplyId = (await api('POST', '/supplies', {
    agentId,
    organizationId: orgId,
    storeId,
    positions: [{ assortmentKind: 'product', assortmentId: productId, quantity: '5', priceMinor: '40000', cellId, cell: 'Зона S / S-1' }],
  }, 201)).json?.id;
  ok('supply created (draft)', !!supplyId);
  const posted = await api('POST', `/supplies/${supplyId}/transitions/post`, {}, 201);
  ok('supply posted', posted.status === 201);

  const after = await api('GET', `/admin/stores/${storeId}/address-storage?assortmentKind=product&assortmentId=${productId}`, undefined, 200);
  const c = cellOf(after.json, cellId);
  ok('after supply: cell Занята', c?.occupied === true);
  ok('after supply: cell productQty = 5', Number(c?.productQty) === 5, `got ${c?.productQty}`);
  ok('«С этим товаром» = 1 cell', (after.json?.cells ?? []).filter((x) => Number(x.productQty) > 0).length === 1);

  await api('POST', `/supplies/${supplyId}/transitions/cancel`, {}, 201);
  const zeroed = await api('GET', `/admin/stores/${storeId}/address-storage?assortmentKind=product&assortmentId=${productId}`, undefined, 200);
  ok('after cancel: cell empty (zero-sum)', cellOf(zeroed.json, cellId)?.occupied === false);
  console.log(`  (throwaway store ${storeId} left for SQL cleanup)`);
  storeId = '';
} catch (e) {
  ok('EXCEPTION', false, e.message);
} finally {
  if (token && storeId && supplyId) await api('POST', `/supplies/${supplyId}/transitions/cancel`, {}).catch(() => {});
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
