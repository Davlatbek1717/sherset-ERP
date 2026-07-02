// MONEY-CORRECTNESS CERT — editing a POSTED «Счёт поставщика» (moysklad parity).
// Proves the update() reverse/re-apply keeps the agent BALANCE + linked PO.invoicedSumMinor
// + payment-derived STATE exact when a posted invoice's positions change. API-level
// (bypasses the overloaded web dev server). 0 deps beyond fetch.
const API = process.env.API_BASE || 'http://localhost:4000/api/v1';
const out = { steps: [], ok: 0, bad: 0 };
const ok = (m) => { out.steps.push(`OK  ${m}`); out.ok++; };
const bad = (m) => { out.steps.push(`BAD ${m}`); out.bad++; };
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return { _raw: t.slice(0, 200), _status: r.status }; } };

const login = await fetch(`${API}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
}).then(j);
const TOKEN = login.accessToken || login.token;
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const get = (p) => fetch(`${API}${p}`, { headers: H }).then(j);
const post = (p, b) => fetch(`${API}${p}`, { method: 'POST', headers: H, body: JSON.stringify(b ?? {}) }).then(j);
const patch = (p, b) => fetch(`${API}${p}`, { method: 'PATCH', headers: H, body: JSON.stringify(b) }).then(j);

const balOf = async (agentId, cur = 'UZS') => {
  const d = await get(`/counterparty-balances/${agentId}`);
  const row = (d.items || []).find((x) => x.currency === cur);
  return BigInt(row?.balanceMinor ?? '0');
};

try {
  if (!TOKEN) throw new Error('no token');
  const ag = (await get('/counterparties?limit=1')).items?.[0];
  const org = (await get('/organizations?limit=1')).items?.[0];
  const prod = (await get('/products?limit=1')).items?.[0];
  if (!ag || !org || !prod) throw new Error('missing seed refs');
  ok(`refs: agent=${ag.name} org=${org.name} product=${prod.code || prod.name}`);

  // ---------- A) BALANCE round-trip (no PO) ----------
  const balBefore = await balOf(ag.id);
  // create draft: qty 2 × 10000, no VAT (vatEnabled:false → sum = 20000)
  const inv = await post('/invoices-in', {
    agentId: ag.id, organizationId: org.id, currency: 'UZS', vatEnabled: false,
    positions: [{ assortmentKind: 'product', assortmentId: prod.id, quantity: '2', priceMinor: '10000', vatEnabled: false }],
  });
  if (!inv.id) throw new Error('create failed: ' + JSON.stringify(inv).slice(0, 150));
  ok(`created draft ${inv.name} sum=${inv.sumMinor}`);

  await post(`/invoices-in/${inv.id}/transitions/post`, {});
  const posted = await get(`/invoices-in/${inv.id}`);
  const oldSum = BigInt(posted.sumMinor);
  const balPosted = await balOf(ag.id);
  if (posted.applicable && posted.state === 'posted') ok(`posted (state=${posted.state}, applicable)`);
  else bad(`post failed (state=${posted.state})`);
  if (balPosted === balBefore - oldSum) ok(`balance after post = before - sum (${balBefore} - ${oldSum} = ${balPosted})`);
  else bad(`balance after post wrong: ${balPosted} != ${balBefore - oldSum}`);

  // EDIT the POSTED invoice — qty 2 → 5 (sum 20000 → 50000). The core fix: must be ACCEPTED.
  const edit = await patch(`/invoices-in/${inv.id}`, {
    version: posted.version,
    agentId: ag.id, organizationId: org.id, currency: 'UZS', vatEnabled: false, vatIncluded: false,
    positions: [{ assortmentKind: 'product', assortmentId: prod.id, quantity: '5', priceMinor: '10000', vatEnabled: false }],
  });
  if (edit.id || edit.version !== undefined) ok('POSTED invoice edit ACCEPTED (no posted-lock)');
  else bad(`edit REJECTED: ${JSON.stringify(edit).slice(0, 160)}`);

  const afterEdit = await get(`/invoices-in/${inv.id}`);
  const newSum = BigInt(afterEdit.sumMinor);
  if (newSum === 50000n) ok(`new sum recomputed = ${newSum} (qty5×10000)`);
  else bad(`new sum wrong: ${newSum} (expected 50000)`);
  if (afterEdit.applicable && afterEdit.state === 'posted') ok(`still posted after edit (state=${afterEdit.state})`);
  else bad(`state wrong after edit: ${afterEdit.state}`);

  const balAfterEdit = await balOf(ag.id);
  if (balAfterEdit === balBefore - newSum) ok(`balance re-derived = before - NEWsum (${balBefore} - ${newSum} = ${balAfterEdit})`);
  else bad(`balance NOT re-derived: ${balAfterEdit} != ${balBefore - newSum} (old-effect not reversed?)`);

  // ---------- B) PO.invoicedSumMinor coupling ----------
  // build a PO, confirm it, create an invoice FROM it, post, edit → PO.invoicedSumMinor tracks.
  const po = await post('/purchase-orders', {
    agentId: ag.id, organizationId: org.id, storeId: (await get('/stores?limit=1')).items?.[0]?.id,
    currency: 'UZS', vatEnabled: false,
    positions: [{ assortmentKind: 'product', assortmentId: prod.id, quantity: '10', priceMinor: '10000', vatEnabled: false }],
  });
  if (po.id) {
    await post(`/purchase-orders/${po.id}/transitions/confirm`, {});
    const invFromPo = await post(`/invoices-in/from-purchase-order/${po.id}`, {});
    if (invFromPo.id) {
      await post(`/invoices-in/${invFromPo.id}/transitions/post`, {});
      const poAfterPost = await get(`/purchase-orders/${po.id}`);
      const invPosted = await get(`/invoices-in/${invFromPo.id}`);
      const invSum1 = BigInt(invPosted.sumMinor);
      const poInv1 = BigInt(poAfterPost.invoicedSumMinor);
      if (poInv1 === invSum1) ok(`PO.invoicedSumMinor = invoice sum after post (${poInv1})`);
      else bad(`PO.invoicedSum mismatch after post: ${poInv1} != ${invSum1}`);

      // edit the posted invoice-from-PO: halve the first position qty
      const firstPos = invPosted.positions[0];
      const edit2 = await patch(`/invoices-in/${invFromPo.id}`, {
        version: invPosted.version,
        agentId: invPosted.agent.id, organizationId: invPosted.organization.id, currency: 'UZS',
        vatEnabled: false, vatIncluded: false,
        positions: [{ assortmentKind: 'product', assortmentId: firstPos.assortmentId, quantity: '3', priceMinor: String(firstPos.priceMinor), vatEnabled: false }],
      });
      if (edit2.id || edit2.version !== undefined) ok('POSTED invoice-from-PO edit ACCEPTED');
      else bad(`edit2 rejected: ${JSON.stringify(edit2).slice(0, 140)}`);
      const poAfterEdit = await get(`/purchase-orders/${po.id}`);
      const invAfterEdit = await get(`/invoices-in/${invFromPo.id}`);
      const invSum2 = BigInt(invAfterEdit.sumMinor);
      const poInv2 = BigInt(poAfterEdit.invoicedSumMinor);
      if (poInv2 === invSum2) ok(`PO.invoicedSumMinor RE-DERIVED to new invoice sum (${poInv2} = ${invSum2})`);
      else bad(`PO.invoicedSum NOT re-derived: ${poInv2} != ${invSum2}`);
    } else bad(`from-purchase-order failed: ${JSON.stringify(invFromPo).slice(0, 140)}`);
  } else bad(`PO create failed: ${JSON.stringify(po).slice(0, 140)}`);
} catch (e) {
  out.fatal = String(e).slice(0, 250);
}
console.log(JSON.stringify(out, null, 2));
