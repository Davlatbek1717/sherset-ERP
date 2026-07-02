// LIVE CERT — customer-order detail «N из ВСЕГО ‹ ›» record navigator (server mode).
// Proves the new GET /customer-orders/:id/position is 1:1 with the LIST ordering
// (default moment desc, id desc) against the real moysklad_dev data (~20k orders):
//   - total == the list endpoint's total
//   - for the first page, each item's {current, prevId, nextId} matches its index
//   - the chain is consistent (item[k].nextId === item[k+1].id, item[k+1].prevId === item[k].id)
//   - the FIRST record: current=1, prevId=null; the LAST record: current=total, nextId=null
// Read-only (no writes) — safe to re-run.
const API = 'http://127.0.0.1:4000/api/v1';
const out = { steps: [], };
const ok = (m) => out.steps.push(`✓ ${m}`);
const bad = (m) => out.steps.push(`✗ ${m}`);
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
const pos = (id) => get(`/customer-orders/${id}/position`);

try {
  // 1. first page in the DEFAULT order (moment desc) — same as the list shows.
  const list = await get('/customer-orders?limit=10');
  const items = list.items ?? [];
  const total = list.total;
  out.listTotal = total;
  if (items.length < 3) { bad('need ≥3 orders to cert'); throw new Error('too few'); }
  ok(`list returned ${items.length} items, total=${total}`);

  // 2. per-index position parity for the first 5 items
  for (let k = 0; k < Math.min(5, items.length); k++) {
    const p = await pos(items[k].id);
    const wantPrev = k === 0 ? null : items[k - 1].id;
    const wantNext = items[k + 1] ? items[k + 1].id : p.nextId; // last-of-page: trust server
    eq(`item[${k}].total`, p.total, total);
    eq(`item[${k}].current`, p.current, k + 1);
    eq(`item[${k}].prevId`, p.prevId, wantPrev);
    if (items[k + 1]) eq(`item[${k}].nextId`, p.nextId, wantNext);
  }

  // 3. chain consistency: item[1] should point back to item[0] and on to item[2]
  const p1 = await pos(items[1].id);
  eq('chain item[1].prevId→item[0]', p1.prevId, items[0].id);
  eq('chain item[1].nextId→item[2]', p1.nextId, items[2].id);

  // 4. FIRST record (newest): current=1, prevId=null
  const first = await pos(items[0].id);
  eq('first.current', first.current, 1);
  eq('first.prevId', first.prevId, null);

  // 5. LAST record: fetch via sortDir=asc limit=1 → that's the bottom of the desc list.
  const ascFirst = await get('/customer-orders?limit=1&sortDir=asc');
  const lastId = ascFirst.items?.[0]?.id;
  if (lastId) {
    const last = await pos(lastId);
    eq('last.current', last.current, total);
    eq('last.nextId', last.nextId, null);
  } else {
    bad('could not fetch last record (sortDir=asc)');
  }

  // 6. tenant/scope guard: a bogus id → 404 (not a leak)
  const r = await fetch(`${API}/customer-orders/00000000-0000-0000-0000-000000000000/position`, { headers: H });
  eq('bogus id → 404', r.status, 404);
} catch (e) {
  out.error = String(e).slice(0, 300);
}
out.PASS = out.steps.every((s) => s.startsWith('✓')) && !out.error;
console.log(JSON.stringify(out, null, 2));
process.exit(out.PASS ? 0 : 1);
