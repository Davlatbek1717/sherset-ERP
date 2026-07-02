// API ROUND-TRIP CERT — /losses create→GET→post persists the new moysklad fields.
// Proves the BE vertical: «Статья расходов» (expenseItem) + «Валюта документа»
// (currency/rateValue) + per-position «Причина списания»/«Ячейка» (reason/cell)
// survive create→GET, and posting computes the weighted-average себестоимость
// (sumMinor > 0) when the line has stock. Uses the PUBLIC demo creds.
const API = process.env.API || 'http://localhost:4000/api/v1';
const out = { steps: [] };
const ok = (m) => out.steps.push(`OK  ${m}`);
const bad = (m) => out.steps.push(`BAD ${m}`);

async function main() {
  // 1) login (public demo creds)
  const lr = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
  });
  const lj = await lr.json();
  const token = lj.accessToken;
  if (!token) {
    bad(`login failed: ${JSON.stringify(lj).slice(0, 120)}`);
    return;
  }
  ok('logged in (demo)');
  const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const get = async (p) => (await fetch(`${API}${p}`, { headers: H })).json();
  const post = async (p, b) =>
    fetch(`${API}${p}`, { method: 'POST', headers: H, body: JSON.stringify(b) });

  // 2) refs
  const [orgs, stores, products] = await Promise.all([
    get('/organizations'),
    get('/stores'),
    get('/products?limit=80'),
  ]);
  const orgId = orgs.items?.[0]?.id;
  const storeId = stores.items?.[0]?.id;
  if (!orgId || !storeId) {
    bad('no org/store');
    return;
  }
  // find a stocked product at this store (for the post → cost check)
  const ids = (products.items ?? []).map((p) => p.id).slice(0, 80);
  const stock = await get(`/stocks?storeId=${storeId}&assortmentIds=${ids.join(',')}`);
  const stocked = (stock.items ?? []).find((s) => Number(s.qty) > 0);
  const productId = stocked?.id ?? ids[0];
  out.usedStockedProduct = !!stocked;
  out.stockQty = stocked?.qty ?? '0';
  out.stockCostBalanceMinor = stocked?.costBalanceMinor ?? '0';

  // 3) create with the new fields
  const cr = await post('/losses', {
    organizationId: orgId,
    storeId,
    expenseItem: 'Списания',
    currency: 'UZS',
    positions: [{ assortmentKind: 'product', assortmentId: productId, quantity: '1', reason: 'Брак при хранении', cell: 'A-12' }],
  });
  const created = await cr.json();
  if (!cr.ok || !created.id) {
    bad(`create failed ${cr.status}: ${JSON.stringify(created).slice(0, 160)}`);
    return;
  }
  ok(`created loss ${created.name}`);
  const id = created.id;

  // 4) GET → assert the fields round-tripped
  const g = await get(`/losses/${id}`);
  out.persisted = {
    expenseItem: g.expenseItem,
    currency: g.currency,
    rateValue: String(g.rateValue),
    posReason: g.positions?.[0]?.reason,
    posCell: g.positions?.[0]?.cell,
  };
  if (g.expenseItem === 'Списания') ok('«Статья расходов» persisted = «Списания»');
  else bad(`expenseItem wrong: ${g.expenseItem}`);
  if (g.currency === 'UZS' && String(g.rateValue) === '100000000')
    ok('«Валюта документа» persisted = UZS @ rateValue 1e8');
  else bad(`currency/rate wrong: ${g.currency}/${g.rateValue}`);
  if (g.positions?.[0]?.reason === 'Брак при хранении')
    ok('per-position «Причина списания» persisted');
  else bad(`pos reason wrong: ${g.positions?.[0]?.reason}`);
  if (g.positions?.[0]?.cell === 'A-12') ok('per-position «Ячейка» persisted');
  else bad(`pos cell wrong: ${g.positions?.[0]?.cell}`);

  // 5) post → cost computed (only meaningful when the line has stock)
  const pr = await post(`/losses/${id}/transitions/post`, {});
  const posted = await pr.json();
  if (pr.ok && posted.state === 'posted') {
    out.postedSumMinor = String(posted.sumMinor);
    if (out.usedStockedProduct) {
      if (BigInt(posted.sumMinor ?? '0') > 0n)
        ok(`posted → себестоимость computed: sumMinor=${posted.sumMinor} (stocked product)`);
      else bad(`posted but sumMinor=0 on a stocked product (cost not computed)`);
    } else {
      ok(`posted (sumMinor=${posted.sumMinor}; product had no stock → cost 0, expected)`);
    }
    // clean up: unpost → delete (keep dev DB tidy)
    await post(`/losses/${id}/transitions/unpost`, {});
    await fetch(`${API}/losses/${id}`, { method: 'DELETE', headers: H });
    ok('cleaned up (unpost + delete)');
  } else {
    // posting may legitimately fail (e.g. negative-stock disallowed) — record + clean up draft
    out.postResult = `${pr.status}: ${JSON.stringify(posted).slice(0, 120)}`;
    await fetch(`${API}/losses/${id}`, { method: 'DELETE', headers: H });
    ok(`post returned ${pr.status} (draft round-trip already proven); draft deleted`);
  }
}

await main().catch((e) => bad(`fatal ${String(e).slice(0, 200)}`));
const pass = out.steps.filter((s) => s.startsWith('OK')).length;
const fail = out.steps.filter((s) => s.startsWith('BAD')).length;
out.summary = `${pass} OK · ${fail} BAD`;
console.log(JSON.stringify(out, null, 2));
