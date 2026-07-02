// CERT — /invoices-in/[id] record navigator «N из ВСЕГО ‹ ›» is server-backed
// (moysklad parity). Proves GET /invoices-in/:id/position returns the REAL total +
// correct 1-based position + neighbour ids, and the FE toolbar shows «N из <total>»
// on a DIRECT-URL visit (no list cache). Mirrors purchase-orders.
import { chromium } from 'playwright';
const WEB = process.env.CERT_BASE || 'http://localhost:3100';
const API = 'http://localhost:4000/api/v1';
const out = { steps: [], ok: 0, bad: 0, consoleErrors: [] };
const ok = (m) => { out.steps.push(`OK  ${m}`); out.ok++; };
const bad = (m) => { out.steps.push(`BAD ${m}`); out.bad++; };

const tok = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }) }).then((r) => r.json());
const token = tok.accessToken || tok.token;
const H = { Authorization: `Bearer ${token}` };
const get = (p) => fetch(`${API}${p}`, { headers: H }).then((r) => r.json());

try {
  // newest-first list (default order) — limit high enough to cover the total.
  const list = await get('/invoices-in?limit=500');
  const items = list.items || [];
  const realTotal = items.length;
  if (realTotal >= 2) ok(`list has ${realTotal} invoices (need ≥2 for nav)`);
  else { bad('not enough invoices to test nav'); throw new Error('need ≥2'); }

  const first = items[0];
  const second = items[1];
  const mid = items[Math.floor(realTotal / 2)];

  // API: first doc → current 1, total = realTotal, prevId null, nextId = second
  const p1 = await get(`/invoices-in/${first.id}/position`);
  if (p1.current === 1) ok(`first doc → current=1`); else bad(`first current=${p1.current} (≠1)`);
  if (p1.total === realTotal) ok(`total=${p1.total} = real list count`); else bad(`total=${p1.total} ≠ ${realTotal}`);
  if (p1.prevId === null) ok('first doc → prevId=null'); else bad(`first prevId=${p1.prevId} (≠null)`);
  if (p1.nextId === second.id) ok('first doc → nextId = 2nd doc'); else bad(`first nextId=${p1.nextId} ≠ ${second.id}`);

  // API: middle doc → prev + next both set, current matches index+1
  const pm = await get(`/invoices-in/${mid.id}/position`);
  const expectedPos = items.findIndex((x) => x.id === mid.id) + 1;
  if (pm.current === expectedPos) ok(`mid doc → current=${pm.current} matches list index`); else bad(`mid current=${pm.current} ≠ ${expectedPos}`);
  if (pm.prevId && pm.nextId) ok('mid doc → prev + next both set'); else bad(`mid prev=${pm.prevId} next=${pm.nextId}`);

  // FE: direct-URL visit shows «N из <realTotal>» (not «1 из 1»)
  const b = await chromium.launch({ headless: true });
  const page = await (await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' })).newPage();
  page.setDefaultTimeout(90000);
  page.on('console', (m) => { if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 120)); });
  try {
    await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-test-id="login-submit"]').click().catch(() => {});
    await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }).catch(async () => {
      await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
      await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {});
    });
    // DIRECT visit to the first doc (no list page loaded → no cache)
    await page.goto(`${WEB}/invoices-in/${first.id}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-test-id="invoice-in-detail-page"]').waitFor({ timeout: 90000 });
    await page.waitForTimeout(1500);
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const m = body.match(/(\d+)\s+из\s+(\d+)/);
    if (m) {
      out.navText = `${m[1]} из ${m[2]}`;
      if (Number(m[2]) === realTotal) ok(`FE shows «${m[1]} из ${m[2]}» — total matches real count (server-backed)`);
      else bad(`FE total «${m[2]}» ≠ real ${realTotal} (not server-backed?)`);
    } else bad('FE «N из M» record-nav not found');
  } finally { await b.close(); }
} catch (e) { out.fatal = String(e).slice(0, 200); }
out.consoleErrorCount = out.consoleErrors.length;
console.log(JSON.stringify(out, null, 2));
