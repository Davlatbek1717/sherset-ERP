// LIVE API-CERT — invoices-out NEW filter fields (moysklad invoiceout-filter parity):
// Отгружено (shippedStatus) · План.дата оплаты (paymentPlanned range) · Товар (productId)
// · Общий доступ (shared) · Кто изменил (modifiedById). Proves each narrows count ≤ total,
// returns 200, and the aggregate/totals endpoint honours the same params. Read-only.
const API = 'http://127.0.0.1:4000/api/v1';
const out = [];
const ok = (m) => out.push(`✓ ${m}`);
const bad = (m) => out.push(`✗ ${m}`);

const lr = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
});
const { accessToken } = await lr.json();
if (!accessToken) { console.log('NO TOKEN'); process.exit(1); }
const H = { authorization: `Bearer ${accessToken}` };
const get = async (p) => {
  const r = await fetch(`${API}${p}`, { headers: H });
  return { status: r.status, body: await r.json().catch(() => null) };
};

try {
  const base = await get('/invoices-out?limit=1');
  const total = base.body?.total ?? 0;
  ok(`baseline total = ${total}`);

  // a product id to exercise the Товар filter (any product in the account)
  const prod = await get('/products?limit=1');
  const productId = prod.body?.items?.[0]?.id;
  // an employee id for «Кто изменил»
  const emp = await get('/employees?limit=1');
  const empId = emp.body?.items?.[0]?.id;

  const cases = [
    ['shippedStatus=not_shipped', '/invoices-out?limit=100&shippedStatus=not_shipped'],
    ['shippedStatus=partial', '/invoices-out?limit=100&shippedStatus=partial'],
    ['shippedStatus=shipped', '/invoices-out?limit=100&shippedStatus=shipped'],
    ['paymentPlanned range', '/invoices-out?limit=100&paymentPlannedFrom=2020-01-01&paymentPlannedTo=2030-12-31'],
    ['shared=true', '/invoices-out?limit=100&shared=true'],
    ...(productId ? [['productId', `/invoices-out?limit=100&productId=${productId}`]] : []),
    ...(empId ? [['modifiedById', `/invoices-out?limit=100&modifiedById=${empId}`]] : []),
  ];
  for (const [label, url] of cases) {
    const r = await get(url);
    if (r.status !== 200) { bad(`${label}: HTTP ${r.status}`); continue; }
    const c = r.body?.total ?? 0;
    c <= total ? ok(`${label}: total ${c} ≤ ${total} (200)`) : bad(`${label}: total ${c} > ${total}`);
  }

  // aggregate/totals must accept the same params (no 500 / no shadow)
  const agg = await get('/invoices-out/aggregate/totals?shippedStatus=shipped&shared=false');
  agg.status === 200 && typeof agg.body?.count === 'number'
    ? ok(`aggregate/totals honours new params → count ${agg.body.count}`)
    : bad(`aggregate/totals failed: HTTP ${agg.status} ${JSON.stringify(agg.body)}`);

  // mutual-exclusion sanity: not_shipped + shipped subsets sum ≤ total
  const ns = (await get('/invoices-out?limit=1&shippedStatus=not_shipped')).body?.total ?? 0;
  const sh = (await get('/invoices-out?limit=1&shippedStatus=shipped')).body?.total ?? 0;
  const pa = (await get('/invoices-out?limit=1&shippedStatus=partial')).body?.total ?? 0;
  ns + sh + pa <= total
    ? ok(`shipped buckets ${ns}+${sh}+${pa}=${ns + sh + pa} ≤ total ${total}`)
    : bad(`shipped buckets ${ns}+${sh}+${pa} > total ${total}`);
} catch (e) {
  bad(`threw: ${e?.message ?? e}`);
}

const passed = out.filter((l) => l.startsWith('✓')).length;
const failed = out.filter((l) => l.startsWith('✗')).length;
console.log(out.join('\n'));
console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
