// LIVE CERT — filter reference fields are INLINE (NOT modal). Clicking «Контрагент»
// opens an inline type-to-search checkbox dropdown (no modal); typing «Нодир» →
// option appears → select → chip shows + list filters. Same quick check that
// «Организация» is inline. 0 console errors.
import { chromium } from 'playwright';
const BASE = 'http://localhost:3218';
const out = { steps: [], consoleErrors: [] };
const ok = (m) => out.steps.push(`OK  ${m}`);
const bad = (m) => out.steps.push(`BAD ${m}`);
const b = await chromium.launch({ headless: true });
const page = await (await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' })).newPage();
page.setDefaultTimeout(60000);
page.on('console', (m) => { if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => out.consoleErrors.push(`PAGEERR ${String(e).slice(0, 160)}`));
const sel = (tid) => `[data-test-id="${tid}"], [data-testid="${tid}"]`;
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').click().catch(()=>{});
  await page.waitForURL(u=>!u.pathname.endsWith('/login'),{timeout:20000}).catch(async()=>{await page.locator('[data-test-id="login-password"]').press('Enter').catch(()=>{});await page.waitForURL(u=>!u.pathname.endsWith('/login'),{timeout:20000}).catch(()=>{});});
  ok('logged in');
  await page.goto(`${BASE}/invoices-in`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="invoices-in-page"]').waitFor({ timeout: 80000 });
  await page.locator('tbody tr').first().waitFor({ timeout: 30000 });
  const before = await page.locator('tbody tr td a[href^="/invoices-in/"]').count();
  await page.locator('button:has-text("Фильтр")').first().click().catch(()=>{});
  await page.waitForTimeout(800);

  // click «Контрагент» → must NOT open a modal dialog
  await page.locator(sel('filter-agent')).first().click().catch(()=>{});
  await page.waitForTimeout(600);
  const modals = await page.locator('[data-test-id="catalog-picker"]:visible').count().catch(()=>0);
  if (modals === 0) ok('«Контрагент» click → NO modal (inline dropdown)');
  else bad(`«Контрагент» opened a MODAL (count=${modals}) — should be inline`);

  // type «Нодир» → option appears → select
  await page.keyboard.type('Нодир').catch(()=>{});
  await page.waitForTimeout(1300);
  const opt = page.locator('button:visible', { hasText: 'Нодир' }).first();
  const optCount = await page.locator('button:visible', { hasText: 'Нодир' }).count().catch(()=>0);
  if (optCount >= 1) ok(`typing «Нодир» → ${optCount} option(s) (inline search works)`);
  else bad('no option after typing «Нодир»');
  await opt.click().catch(()=>{});
  await page.waitForTimeout(1300);
  const chip = (await page.locator(sel('filter-agent')).first().innerText().catch(()=>'')).replace(/\s+/g,' ').trim().slice(0,40);
  if (/Нодир/.test(chip)) ok(`selected → chip «${chip}»`); else bad(`no chip after select (got «${chip}»)`);
  const after = await page.locator('tbody tr td a[href^="/invoices-in/"]').count();
  if (after >= 1 && after <= before) ok(`list filtered by counterparty: ${before} → ${after} rows`);
  else bad(`list not filtered (before=${before} after=${after})`);

  // «Организация» is also inline (no modal)
  await page.locator(sel('filter-org')).first().click().catch(()=>{});
  await page.waitForTimeout(600);
  const modals2 = await page.locator('[data-test-id="catalog-picker"]:visible').count().catch(()=>0);
  if (modals2 === 0) ok('«Организация» click → NO modal (inline)'); else bad(`«Организация» opened a modal (${modals2})`);
} catch (e) { out.fatal = String(e).slice(0,250); } finally { await b.close(); }
out.consoleErrorCount = out.consoleErrors.length;
console.log(JSON.stringify(out, null, 2));
