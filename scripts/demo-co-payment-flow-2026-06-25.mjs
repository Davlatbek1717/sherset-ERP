// LIVE DEMO — prove «Не оплачено» → «Оплачено» on a customer order.
// Real moysklad chain: CustomerOrder → InvoiceOut → PaymentIn(posted) cascades the
// paid sum back onto the order. Picks an UNPAID order, creates an invoice + a full
// payment, shows the pill flip, then CLEANS UP (unpost+delete) to restore the order.
const API = 'http://127.0.0.1:4000/api/v1';
const out = { steps: [] };
const ok = (m) => out.steps.push(`✓ ${m}`);
const bad = (m) => out.steps.push(`✗ ${m}`);

const lr = await fetch(`${API}/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
});
const { accessToken } = await lr.json();
if (!accessToken) { console.log('NO TOKEN'); process.exit(1); }
const H = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
const get = async (p) => (await fetch(`${API}${p}`, { headers: H })).json();
const post = async (p, b) => {
  const r = await fetch(`${API}${p}`, { method: 'POST', headers: H, body: JSON.stringify(b ?? {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const del = (p) => fetch(`${API}${p}`, { method: 'DELETE', headers: H }).then((r) => r.status);

// payment pill, same rule as the UI (page.tsx): paid>=sum→Оплачено · 0<paid<sum→Частично · else→Не оплачено
const pill = (sumMinor, payedSumMinor) => {
  const s = BigInt(sumMinor || '0'), p = BigInt(payedSumMinor || '0');
  return s > 0n && p >= s ? 'Оплачено' : p > 0n ? 'Частично оплачено' : 'Не оплачено';
};

let invId, payId, coId;
try {
  // 1. find an UNPAID confirmed order with positions (sumMinor>0, payedSumMinor=0)
  const list = await get('/customer-orders?limit=100');
  const cand = (list.items || []).find(
    (o) => o.sumMinor && o.sumMinor !== '0' && (!o.payedSumMinor || o.payedSumMinor === '0') &&
      ['confirmed', 'awaiting_payment', 'partially_shipped'].includes(o.state),
  ) || (list.items || []).find((o) => o.sumMinor && o.sumMinor !== '0' && (!o.payedSumMinor || o.payedSumMinor === '0'));
  if (!cand) { bad('no unpaid order with a positive sum found'); throw new Error('no candidate'); }
  coId = cand.id;
  const before = await get(`/customer-orders/${coId}`);
  out.order = { id: coId, number: before.name, state: before.state, sumMinor: before.sumMinor, payedSumMinor: before.payedSumMinor };
  ok(`picked order №${before.name}: sum=${before.sumMinor}, paid=${before.payedSumMinor || '0'} → pill «${pill(before.sumMinor, before.payedSumMinor)}»`);
  if (pill(before.sumMinor, before.payedSumMinor) !== 'Не оплачено') bad('order was not «Не оплачено» to begin with');

  // 2. invoice from the order
  const inv = await post(`/invoices-out/from-customer-order/${coId}`, {});
  invId = inv.body?.id;
  if (!invId) { bad(`invoice create failed (${inv.status}): ${JSON.stringify(inv.body).slice(0, 160)}`); throw new Error('no invoice'); }
  ok(`created invoice №${inv.body.name} (sum=${inv.body.sumMinor})`);
  // post the invoice if it's a draft (so it can carry payment)
  if (inv.body.state === 'draft') {
    const pv = await post(`/invoices-out/${invId}/transitions/post`, {});
    ok(`posted invoice (${pv.status})`);
  }

  // 3. full payment from the invoice (defaults to remaining), then POST it
  const pay = await post(`/payments-in/from-invoice-out/${invId}`, {});
  payId = pay.body?.id;
  if (!payId) { bad(`payment create failed (${pay.status}): ${JSON.stringify(pay.body).slice(0, 160)}`); throw new Error('no payment'); }
  ok(`created payment №${pay.body.name} (sum=${pay.body.sumMinor}, state=${pay.body.state})`);
  if (pay.body.state !== 'posted') {
    const pp = await post(`/payments-in/${payId}/transitions/post`, {});
    ok(`posted payment (${pp.status})`);
  }

  // 4. re-read the order → the cascade should have flipped it
  const after = await get(`/customer-orders/${coId}`);
  const pAfter = pill(after.sumMinor, after.payedSumMinor);
  ok(`AFTER: sum=${after.sumMinor}, paid=${after.payedSumMinor} → pill «${pAfter}», state=${after.state}`);
  if (pAfter === 'Оплачено') ok('✅ «Не оплачено» → «Оплачено» (pill flipped GREEN)');
  else bad(`pill did NOT become «Оплачено» (got «${pAfter}»)`);
  if (after.state === 'paid' || after.state === 'closed') ok(`order state auto-moved → «${after.state}»`);
} catch (e) {
  out.error = String(e).slice(0, 200);
} finally {
  // CLEANUP — unpost (reverses the cascade) then delete, so the order returns to «Не оплачено».
  try {
    if (payId) { await post(`/payments-in/${payId}/transitions/unpost`, {}); out.steps.push(`↩ unposted payment (${await del(`/payments-in/${payId}`)} delete)`); }
    if (invId) { await post(`/invoices-out/${invId}/transitions/unpost`, {}); out.steps.push(`↩ deleted invoice (${await del(`/invoices-out/${invId}`)})`); }
    if (coId) {
      const restored = await get(`/customer-orders/${coId}`);
      out.steps.push(`↩ order restored: paid=${restored.payedSumMinor || '0'} → «${pill(restored.sumMinor, restored.payedSumMinor)}»`);
    }
  } catch (e) { out.cleanupError = String(e).slice(0, 160); }
  out.PASS = out.steps.some((s) => s.includes('flipped GREEN')) && !out.error;
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.PASS ? 0 : 1);
}
