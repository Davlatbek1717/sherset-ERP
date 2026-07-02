// CERT — moysklad editor notices on /invoices-in/[id]: (1) the green-check
// «Позиции документа содержат повторяющиеся товары» line shows when the doc has the
// SAME product on >1 line, and is ABSENT otherwise; (2) the «Не оплачено» payment pill
// is GONE from the editor header (moysklad shows payment status only in the LIST).
import { chromium } from 'playwright';
const WEB = process.env.CERT_BASE || 'http://localhost:3100';
const API = 'http://localhost:4000/api/v1';
const out = { steps: [], consoleErrors: [], ok: 0, bad: 0 };
const ok = (m) => { out.steps.push(`OK  ${m}`); out.ok++; };
const bad = (m) => { out.steps.push(`BAD ${m}`); out.bad++; };

const tok = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }) }).then((r) => r.json());
const token = tok.accessToken || tok.token;
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const ag = (await fetch(`${API}/counterparties?limit=1`, { headers: H }).then((r) => r.json())).items[0];
const org = (await fetch(`${API}/organizations?limit=1`, { headers: H }).then((r) => r.json())).items[0];
const prod = (await fetch(`${API}/products?limit=1`, { headers: H }).then((r) => r.json())).items[0];
const mk = (positions) => fetch(`${API}/invoices-in`, { method: 'POST', headers: H, body: JSON.stringify({ agentId: ag.id, organizationId: org.id, currency: 'UZS', vatEnabled: false, positions }) }).then((r) => r.json());
// DUP: same product twice. NORMAL: single line.
const dup = await mk([
  { assortmentKind: 'product', assortmentId: prod.id, quantity: '2', priceMinor: '10000', vatEnabled: false },
  { assortmentKind: 'product', assortmentId: prod.id, quantity: '3', priceMinor: '10000', vatEnabled: false },
]);
const normal = await mk([{ assortmentKind: 'product', assortmentId: prod.id, quantity: '1', priceMinor: '10000', vatEnabled: false }]);
out.dup = dup.name; out.normal = normal.name;

const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' })).newPage();
p.setDefaultTimeout(90000);
p.on('console', (m) => { if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 140)); });
const sel = (t) => `[data-test-id="${t}"]`;
try {
  if (!dup.id || !normal.id) throw new Error('seed create failed');
  await p.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await p.locator(sel('login-submit')).click().catch(() => {});
  await p.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }).catch(async () => {
    await p.locator(sel('login-password')).press('Enter').catch(() => {});
    await p.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {});
  });

  // DUP doc → notice present, no «Не оплачено»
  await p.goto(`${WEB}/invoices-in/${dup.id}`, { waitUntil: 'domcontentloaded' });
  await p.locator(sel('invoice-in-detail-page')).waitFor({ timeout: 90000 });
  await p.waitForTimeout(1200);
  let body = (await p.locator('body').innerText()).replace(/\s+/g, ' ');
  if ((await p.locator(sel('duplicate-positions-notice')).count()) >= 1) ok('DUP doc: «повторяющиеся товары» notice SHOWN');
  else bad('DUP doc: dup-notice MISSING');
  if (body.includes('содержат повторяющиеся товары')) ok('DUP doc: notice text correct');
  else bad('DUP doc: notice text wrong');
  if (!/Не оплачено|Запросить оплату/.test(body)) ok('«Не оплачено»/«Запросить оплату» ABSENT (moysklad parity)');
  else bad('«Не оплачено» still shown in editor header');

  // NORMAL doc → notice absent (negative control)
  await p.goto(`${WEB}/invoices-in/${normal.id}`, { waitUntil: 'domcontentloaded' });
  await p.locator(sel('invoice-in-detail-page')).waitFor({ timeout: 90000 });
  await p.waitForTimeout(1000);
  body = (await p.locator('body').innerText()).replace(/\s+/g, ' ');
  if ((await p.locator(sel('duplicate-positions-notice')).count()) === 0) ok('NORMAL doc: NO dup-notice (negative control)');
  else bad('NORMAL doc: dup-notice wrongly shown');
  if (!/Не оплачено/.test(body)) ok('NORMAL doc: «Не оплачено» absent too');
  else bad('NORMAL doc: «Не оплачено» shown');
} catch (e) { out.fatal = String(e).slice(0, 200); } finally { await b.close(); }
out.consoleErrorCount = out.consoleErrors.length;
console.log(JSON.stringify(out, null, 2));
