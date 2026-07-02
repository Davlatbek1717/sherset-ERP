// LIVE CERT — (1) the doc's SAVED FX rate shows on open (not today's reference) and
// (2) the «Баланс» caption matches moysklad: «(нам должны): X сум (Y доллар)».
// fadf4895 is USD with a saved rate 12700 (reference is 11990.26); its counterparty
// has a seeded UZS balance of 300 000,00 (they owe us). Isolated dev server.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.CERT_BASE || 'http://localhost:3221';
const USD_CO = 'fadf4895-1951-486c-8278-2e96faea9f0a';
const OUT = resolve('D:/projects/moysklad', 'docs', 'audits', 'co-balance-rate-cert-2026-06-25');
mkdirSync(OUT, { recursive: true });
const out = { steps: [], consoleErrors: [] };
const ok = (m) => out.steps.push(`✓ ${m}`);
const bad = (m) => out.steps.push(`✗ ${m}`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(90000);
const shot = (f) => page.screenshot({ path: resolve(OUT, f) }).catch(() => {});
// ignore the parallel session's in-flight CRM missing key
page.on('console', (m) => {
  if (m.type() === 'error' && !/subnav\.crm|bonus_operations/.test(m.text())) {
    out.consoleErrors.push(m.text().slice(0, 200));
  }
});
page.on('pageerror', (e) => out.consoleErrors.push(`PAGEERROR: ${String(e).slice(0, 200)}`));

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }).catch(async () => {
    await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
    await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {});
  });
  ok('logged in');

  await page.goto(`${BASE}/customer-orders/${USD_CO}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="agent-balance"]').waitFor({ state: 'visible', timeout: 90000 });
  await page.waitForTimeout(800);

  // #1 — the SAVED rate (12 700), not the reference (11 990,26)
  const helper = (await page.locator('text=/1 USD =/').first().textContent())?.replace(/\s+/g, ' ').trim();
  out.helper = helper;
  if (/12\s?700/.test(helper || '')) ok(`#1 saved rate shows on open: «${helper}»`);
  else bad(`#1 saved rate NOT shown (got «${helper}», expected 12 700)`);

  // #2 — balance «(нам должны): 300 000,00 сум (23,622 доллар)» in red
  const bal = await page.locator('[data-test-id="agent-balance"]');
  const balText = (await bal.textContent())?.replace(/\s+/g, ' ').trim();
  out.balText = balText;
  if (/нам должны/.test(balText || '')) ok('#2 qualifier «(нам должны)»'); else bad(`#2 no «(нам должны)»: «${balText}»`);
  if (/300\s?000,00 сум/.test(balText || '')) ok('#2 base amount «300 000,00 сум»'); else bad(`#2 base amount wrong: «${balText}»`);
  if (/доллар/.test(balText || '') && /23,6/.test(balText || '')) ok('#2 doc-currency equivalent «(23,6… доллар)»'); else bad(`#2 equivalent wrong: «${balText}»`);
  const cls = await bal.getAttribute('class');
  if (/destructive/.test(cls || '')) ok('#2 red (text-destructive) for a debt'); else bad('#2 not red');
  await shot('01-balance-rate.png');
} catch (e) {
  out.error = String(e).slice(0, 300);
  await shot('99-error.png');
} finally {
  out.consoleErrorCount = out.consoleErrors.length;
  out.PASS = out.steps.every((s) => s.startsWith('✓')) && out.consoleErrors.length === 0 && !out.error;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
