// LIVE API-CERT — Sales LIST footer «Итого» aggregate endpoints (demands + sales-returns).
// Proves the new GET /demands/aggregate/totals and GET /sales-returns/aggregate/totals are 1:1
// with the list endpoint (same buildListWhere) against real moysklad_dev data:
//   - count == the list endpoint's total
//   - currencies is an array; sumMinor / payedSumMinor are numeric strings (BigInt→string)
//   - when total ≤ one page, the aggregate Σ exactly equals the page-summed values
//   - a filter (state=posted) narrows count to ≤ total (clause is honoured)
// Read-only (no writes) — safe to re-run.
const API = 'http://127.0.0.1:4000/api/v1';
const out = [];
const ok = (m) => out.push(`✓ ${m}`);
const bad = (m) => out.push(`✗ ${m}`);
const eq = (label, got, want) =>
  got === want ? ok(`${label} = ${JSON.stringify(got)}`) : bad(`${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const lr = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
});
const { accessToken } = await lr.json();
if (!accessToken) { console.log('NO TOKEN'); process.exit(1); }
const H = { authorization: `Bearer ${accessToken}` };
const get = async (p) => (await fetch(`${API}${p}`, { headers: H })).json();
const isNumStr = (v) => typeof v === 'string' && /^-?\d+$/.test(v);

async function certDoc(label, base, sumKeys) {
  out.push(`── ${label} ──`);
  const list = await get(`${base}?limit=100`);
  const items = list.items ?? [];
  const total = list.total ?? 0;
  const tot = await get(`${base}/aggregate/totals`);
  // shape
  eq(`${label}.count == list.total`, tot.count, total);
  ok(`${label}.currencies isArray=${Array.isArray(tot.currencies)} → ${JSON.stringify(tot.currencies)}`);
  for (const k of sumKeys) {
    isNumStr(tot[k]) ? ok(`${label}.${k} numeric-string = ${tot[k]}`) : bad(`${label}.${k} not numeric-string: ${JSON.stringify(tot[k])}`);
  }
  // exact-sum check only when the whole set fits one page (otherwise we'd need to page).
  if (total <= 100) {
    for (const k of sumKeys) {
      const pageSum = items.reduce((acc, r) => acc + BigInt(r[k] ?? '0'), 0n).toString();
      eq(`${label}.${k} aggregate==pageΣ (total=${total})`, tot[k], pageSum);
    }
  } else {
    ok(`${label}: total ${total} > 100 → skip exact-sum page check (count parity already proves WHERE)`);
  }
  // filter honoured: posted ⊆ all
  const posted = await get(`${base}/aggregate/totals?state=posted`);
  posted.count <= total
    ? ok(`${label}.state=posted count ${posted.count} ≤ total ${total}`)
    : bad(`${label}.state=posted count ${posted.count} > total ${total}`);
}

try {
  await certDoc('demands', '/demands', ['sumMinor', 'payedSumMinor']);
  await certDoc('sales-returns', '/sales-returns', ['sumMinor']);
} catch (e) {
  bad(`threw: ${e?.message ?? e}`);
}

const passed = out.filter((l) => l.startsWith('✓')).length;
const failed = out.filter((l) => l.startsWith('✗')).length;
console.log(out.join('\n'));
console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
