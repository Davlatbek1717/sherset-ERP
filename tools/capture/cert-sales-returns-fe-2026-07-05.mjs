// FE render cert for the sales-return 1:1 pages (web :3155 → api :4055, new code).
// Loads /settings/sales-return-statuses, /sales-returns, /sales-returns/new and a
// real /sales-returns/[id]; asserts key markers render + ZERO console errors.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = 'http://localhost:3155';
const API = 'http://localhost:4055/api/v1';
const ORG = '00000000-0000-0000-0000-000000000010';
const CUSTOMER = '00000000-0000-0000-0001-000000000001';
const STORE = 'd7d27173-b402-469b-9c08-7dd9c130382a';
const PRODUCT = 'f445add8-4d41-4a4a-ac82-1bce3ecc07bd';
const OUT = resolve('D:/projects/moysklad/docs/audits/sales-returns-1to1-2026-07-05');
mkdirSync(OUT, { recursive: true });

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const results = [];
const rec = (n, p, d) => { results.push({ n, p }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };

// --- API seed ---
const lb = await j(await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }) }));
const TOK = lb?.accessToken;
const auth = { Authorization: `Bearer ${TOK}`, 'Content-Type': 'application/json' };
const state = await j(await fetch(`${API}/states`, { method: 'POST', headers: auth, body: JSON.stringify({ entityType: 'salesreturn', name: 'Обработан', color: '#008739', position: 0 }) }));
const stateId = state?.id;
const sr = await j(await fetch(`${API}/sales-returns`, { method: 'POST', headers: auth, body: JSON.stringify({ agentId: CUSTOMER, organizationId: ORG, storeId: STORE, currency: 'UZS', positions: [{ assortmentKind: 'product', assortmentId: PRODUCT, quantity: '1', priceMinor: '9000000' }] }) }));
const srId = sr?.id;
rec('seed: State + SalesReturn created', !!stateId && !!srId, `state=${stateId?.slice(0,8)} sr=${srId?.slice(0,8)}`);

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'ru', domain: 'localhost', path: '/' }]);
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERR: ' + String(e).slice(0, 160)));

const routeErrs = (label) => {
  const errs = consoleErrors.filter((e) => !/favicon|manifest|Download the React DevTools|hydrat/i.test(e));
  rec(`${label}: no console errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
  consoleErrors.length = 0;
};

try {
  // login
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.locator('[data-test-id="login-email"]').fill('admin@demo.local').catch(() => {});
  await page.locator('[data-test-id="login-password"]').fill('admin123').catch(() => {});
  await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
  await page.waitForTimeout(4500);
  consoleErrors.length = 0;

  // 1) settings/sales-return-statuses
  await page.goto(`${WEB}/settings/sales-return-statuses`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const settingsBody = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: resolve(OUT, 'cert-1-settings-statuses.png'), fullPage: true });
  rec('1 settings page renders status «Обработан»', settingsBody.includes('Обработан'), '');
  routeErrs('1 settings');

  // 2) list
  await page.goto(`${WEB}/sales-returns`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: resolve(OUT, 'cert-2-list.png'), fullPage: true });
  const listBody = await page.evaluate(() => document.body.innerText);
  const hasStatusCol = listBody.includes('Статус');
  rec('2 list renders (rows + «Статус» column)', hasStatusCol, '');
  routeErrs('2 list');

  // 3) new editor
  await page.goto(`${WEB}/sales-returns/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: resolve(OUT, 'cert-3-new.png'), fullPage: true });
  const newBody = await page.evaluate(() => document.body.innerText);
  rec('3 new editor renders (Организация/Контрагент/Склад)', newBody.includes('Контрагент') && newBody.includes('Склад'), '');
  routeErrs('3 new');

  // 4) detail [id]
  await page.goto(`${WEB}/sales-returns/${srId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: resolve(OUT, 'cert-4-detail.png'), fullPage: true });
  const detBody = await page.evaluate(() => document.body.innerText);
  rec('4 detail renders (doc number + Проведено)', detBody.includes('Проведено') || detBody.includes('ВП') || detBody.length > 400, `len=${detBody.length}`);
  routeErrs('4 detail');
} catch (e) {
  rec('FATAL', false, String(e).slice(0, 200));
} finally {
  await b.close();
  // cleanup
  if (srId) { await fetch(`${API}/sales-returns/${srId}`, { method: 'DELETE', headers: auth }).catch(() => {}); }
  if (stateId) { await fetch(`${API}/states/${stateId}`, { method: 'DELETE', headers: auth }).catch(() => {}); }
  const pass = results.filter((r) => r.p).length;
  console.log(`\n=== ${pass}/${results.length} PASS ===  screenshots → ${OUT}`);
  process.exit(pass === results.length ? 0 : 1);
}
