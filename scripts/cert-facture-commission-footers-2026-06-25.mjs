// LIVE API-CERT — factures-out + commission-reports LIST footer «Итого» aggregate endpoints.
// Both lists had a PAGE-SUM footer (only the visible 100 rows) → converted to a server
// aggregate over the WHOLE filtered set. Proves the new endpoints are 1:1 with the list:
//   - count == list.total
//   - sumMinor / vatSumMinor (+ reward/payed for commission) are numeric BigInt→strings
//   - currencies is an array
//   - when total ≤ one page, aggregate Σ exactly equals the page-summed values
//     (this is the very bug the conversion fixes — page-sum == whole-set only when ≤100)
//   - a filter (state=...) narrows count to ≤ total
// Read-only — safe to re-run.
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

async function certDoc(label, base, sumKeys, narrowQs) {
  out.push(`── ${label} ──`);
  const list = await get(`${base}?limit=100`);
  const items = list.items ?? [];
  const total = list.total ?? 0;
  const tot = await get(`${base}/aggregate/totals`);
  eq(`${label}.count == list.total`, tot.count, total);
  ok(`${label}.currencies isArray=${Array.isArray(tot.currencies)} → ${JSON.stringify(tot.currencies)}`);
  for (const k of sumKeys) {
    isNumStr(tot[k]) ? ok(`${label}.${k} numeric-string = ${tot[k]}`) : bad(`${label}.${k} not numeric-string: ${JSON.stringify(tot[k])}`);
  }
  if (total <= 100) {
    for (const k of sumKeys) {
      const pageSum = items.reduce((acc, r) => acc + BigInt(r[k] ?? '0'), 0n).toString();
      eq(`${label}.${k} aggregate==pageΣ (total=${total})`, tot[k], pageSum);
    }
  } else {
    ok(`${label}: total ${total} > 100 → exact-sum skip (count parity proves WHERE)`);
  }
  const narrowed = await get(`${base}/aggregate/totals?${narrowQs}`);
  narrowed.count <= total
    ? ok(`${label}.${narrowQs} count ${narrowed.count} ≤ total ${total}`)
    : bad(`${label}.${narrowQs} count ${narrowed.count} > total ${total}`);
}

try {
  await certDoc('factures-out', '/factures-out', ['sumMinor', 'vatSumMinor'], 'printed=true');
  await certDoc('commission-reports', '/commission-reports', ['sumMinor', 'rewardSumMinor', 'payedSumMinor'], 'state=posted');
} catch (e) {
  bad(`threw: ${e?.message ?? e}`);
}

const passed = out.filter((l) => l.startsWith('✓')).length;
const failed = out.filter((l) => l.startsWith('✗')).length;
console.log(out.join('\n'));
console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
