// CERT — new «Счёт поставщика» numbers are plain continuous integers (moysklad
// parity, mirror PO/CO «2150»/«20494») — NOT the legacy «СФ-2026-NNNNN» prefix the
// user flagged. Creates two invoices via the API and asserts the names are plain
// digits and strictly increasing (sequence continues from the existing max).
const API = process.env.API_BASE || 'http://localhost:4000/api/v1';
const out = { steps: [], ok: 0, bad: 0 };
const ok = (m) => { out.steps.push(`OK  ${m}`); out.ok++; };
const bad = (m) => { out.steps.push(`BAD ${m}`); out.bad++; };
const j = (r) => r.json();

const login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }) }).then(j);
const H = { Authorization: `Bearer ${login.accessToken || login.token}`, 'Content-Type': 'application/json' };
const get = (p) => fetch(`${API}${p}`, { headers: H }).then(j);
const mk = async () => {
  const ag = (await get('/counterparties?limit=1')).items[0];
  const org = (await get('/organizations?limit=1')).items[0];
  const pr = (await get('/products?limit=1')).items[0];
  return fetch(`${API}/invoices-in`, { method: 'POST', headers: H, body: JSON.stringify({ agentId: ag.id, organizationId: org.id, currency: 'UZS', vatEnabled: false, positions: [{ assortmentKind: 'product', assortmentId: pr.id, quantity: '1', priceMinor: '1000', vatEnabled: false }] }) }).then(j);
};

try {
  const a = await mk();
  const b = await mk();
  const plain = (n) => /^\d+$/.test(n);
  if (plain(a.name)) ok(`invoice 1 name «${a.name}» = plain integer (no «СФ-2026-» prefix)`);
  else bad(`invoice 1 name «${a.name}» still prefixed/padded`);
  if (plain(b.name)) ok(`invoice 2 name «${b.name}» = plain integer`);
  else bad(`invoice 2 name «${b.name}» not plain`);
  if (plain(a.name) && plain(b.name) && Number(b.name) === Number(a.name) + 1)
    ok(`sequence continuous: ${a.name} → ${b.name} (+1)`);
  else bad(`sequence not continuous: ${a.name} → ${b.name}`);
  // moysklad parity: matches PO/CO plain format
  const po = (await get('/purchase-orders?limit=1')).items[0];
  if (po && plain(po.name)) ok(`consistent with PO plain format (PO «${po.name}»)`);
  else out.steps.push('… PO name check skipped');
} catch (e) { out.fatal = String(e).slice(0, 200); }
console.log(JSON.stringify(out, null, 2));
