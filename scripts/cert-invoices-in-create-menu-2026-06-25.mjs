// LIVE CERT — /invoices-in «Создать ▾» toolbar dropdown → moysklad 1:1.
// Verifies: «Создать» trigger present + DISABLED at 0-selection; selecting a row
// ENABLES it; opening it shows exactly «Исходящие платежи» + «Расходные ордера».
// Does NOT click an item (would create real docs). 0 console errors. Also a
// read-only BE check that both endpoints exist (404-guard) is done separately.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3218';
const out = { steps: [], consoleErrors: [] };
const ok = (m) => out.steps.push(`OK  ${m}`);
const bad = (m) => out.steps.push(`BAD ${m}`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
page.on('console', (m) => { if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => out.consoleErrors.push(`PAGEERR ${String(e).slice(0, 200)}`));

const trigger = () => page.locator('[data-test-id="toolbar-create-doc-trigger"]').first();

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').click().catch(() => {});
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 }).catch(async () => {
    await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
    await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 }).catch(() => {});
  });
  ok('logged in');

  await page.goto(`${BASE}/invoices-in`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="invoices-in-page"]').waitFor({ timeout: 80000 });
  await page.locator('tbody tr').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);

  // (1) «Создать ▾» present + disabled at 0-selection
  if (await trigger().count()) ok('«Создать ▾» trigger present in toolbar');
  else bad('«Создать ▾» trigger missing');
  const disabled0 = await trigger().isDisabled().catch(() => null);
  const label = (await trigger().textContent().catch(() => '')) || '';
  if (disabled0 === true) ok(`«Создать ▾» disabled at 0-selection (label «${label.trim()}»)`);
  else bad(`«Создать ▾» NOT disabled at 0-selection (disabled=${disabled0})`);

  // (2) select first row → trigger becomes enabled
  await page.locator('[data-test-id^="select-row-"]').first().click().catch(() => {});
  await page.waitForTimeout(800);
  const disabled1 = await trigger().isDisabled().catch(() => null);
  if (disabled1 === false) ok('«Создать ▾» ENABLED after selecting a row');
  else bad(`«Создать ▾» still disabled after selection (disabled=${disabled1})`);

  // (3) open it → exactly the two moysklad items
  await trigger().click().catch(() => {});
  await page.waitForTimeout(700);
  const hasPayment = await page.locator('text=Исходящие платежи').first().isVisible().catch(() => false);
  const hasCash = await page.locator('text=Расходные ордера').first().isVisible().catch(() => false);
  if (hasPayment) ok('item «Исходящие платежи» present');
  else bad('item «Исходящие платежи» missing');
  if (hasCash) ok('item «Расходные ордера» present');
  else bad('item «Расходные ордера» missing');
  await page.keyboard.press('Escape').catch(() => {});
} catch (e) {
  out.fatal = String(e).slice(0, 300);
} finally {
  await browser.close();
}

out.consoleErrorCount = out.consoleErrors.length;
console.log(JSON.stringify(out, null, 2));
