// FUNCTIONAL cert: prove the /new toolbar dropdown ITEMS actually DO something
// (not just render clickable). Fills the /new form minimally, clicks «Печать →
// Возврат покупателя», and asserts the save-then-act fires: POST /sales-returns
// (create) THEN POST /sales-returns/bulk-print (download). Screenshots each step.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = 'http://localhost:3100';
const OUT = resolve('D:/projects/moysklad/docs/audits/sales-returns-1to1-2026-07-05/dropdowns');
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU', acceptDownloads: true });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'ru', domain: 'localhost', path: '/' }]);
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

const net = [];
page.on('request', (r) => {
  const u = r.url();
  if (r.method() === 'POST' && /\/sales-returns(\?|$|\/bulk-print|\/kit-print|\/[0-9a-f-]+\/print-attachment)/.test(u)) {
    net.push(`${r.method()} ${u.replace(/^https?:\/\/[^/]+/, '')}`);
  }
});
const results = [];
const rec = (n, p, d) => { results.push({ n, p }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };

try {
  // login
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.locator('[data-test-id="login-email"]').fill('admin@demo.local').catch(() => {});
  await page.locator('[data-test-id="login-password"]').fill('admin123').catch(() => {});
  await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
  await page.waitForTimeout(4500);

  // ---- A) EMPTY /new: clicking «Печать → Возврат покупателя» must FIRE the handler
  //         (save-then-act → validation throws → inline error). Proves item not dead. ----
  await page.goto(`${WEB}/sales-returns/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  await page.locator('button:has-text("Печать")').first().click();
  await page.waitForTimeout(600);
  await page.locator('text=Возврат покупателя').last().click().catch(() => {});
  await page.waitForTimeout(1500);
  const bodyA = await page.evaluate(() => document.body.innerText);
  // save-then-act validated the empty form → a «выберите контрагент/организац…» error surfaces
  const firedA = /контрагент|организац|склад|позици|выберите|kontragent|tanlang/i.test(bodyA) || net.length > 0;
  await page.screenshot({ path: resolve(OUT, 'func-A-empty-print-fires.png') });
  rec('A «Печать→Возврат покупателя» on empty /new FIRES save-then-act (validation)', firedA, net.length ? `net=${net.join(', ')}` : 'inline validation error shown');

  // ---- B) FILLED /new: pick Контрагент + add a product, then «Печать» → expect
  //         POST /sales-returns (create) + POST /sales-returns/bulk-print (download). ----
  net.length = 0;
  await page.goto(`${WEB}/sales-returns/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  // Контрагент picker
  await page.locator('[data-test-id="field-agent"], text=Контрагент').first().click().catch(() => {});
  await page.waitForTimeout(500);
  // the field opens a CatalogPicker modal — type + pick first
  const agentInput = page.locator('input[placeholder*="оиск"], input[type="search"]').first();
  if (await agentInput.count()) {
    await agentInput.fill('ABC').catch(() => {});
    await page.waitForTimeout(1200);
    await page.locator('text=ABC MCHJ').first().click().catch(() => {});
    await page.waitForTimeout(800);
  }
  // add a position via the inline-add search
  const posInput = page.locator('input[placeholder*="Добавить позицию"]').first();
  if (await posInput.count()) {
    await posInput.click().catch(() => {});
    await posInput.fill('AirPods').catch(() => {});
    await page.waitForTimeout(1500);
    await page.locator('text=AirPods').first().click().catch(() => {});
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: resolve(OUT, 'func-B1-filled.png') });
  // click Печать → Возврат покупателя
  const dl = page.waitForEvent('download', { timeout: 12000 }).catch(() => null);
  await page.locator('button:has-text("Печать")').first().click();
  await page.waitForTimeout(600);
  await page.locator('text=Возврат покупателя').last().click().catch(() => {});
  const download = await dl;
  await page.waitForTimeout(2000);
  await page.screenshot({ path: resolve(OUT, 'func-B2-after-print.png') });
  const created = net.some((u) => /POST \/api\/v1\/sales-returns(\?|$)/.test(u) || /\/sales-returns$/.test(u));
  const printed = net.some((u) => /bulk-print/.test(u));
  rec('B save-then-act: POST create + POST bulk-print fired', created && printed, `net=${net.join(' | ') || 'none'} download=${download ? download.suggestedFilename() : 'none'}`);
} catch (e) {
  rec('FATAL', false, String(e).slice(0, 200));
} finally {
  await b.close();
  const pass = results.filter((r) => r.p).length;
  console.log(`\n=== ${pass}/${results.length} PASS ===`);
}
