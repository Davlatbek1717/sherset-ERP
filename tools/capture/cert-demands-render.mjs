// Render-only cert: log in robustly, screenshot the 25-field filter, count fields.
import { chromium } from 'playwright';
import { resolve } from 'node:path';
const OUT = resolve('D:/projects/moysklad/docs/audits/demands-list-2026-06-26');
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' })).newPage();
p.setDefaultTimeout(60000);
const out = {};
try {
  await p.goto('http://localhost:3219/login?redirect=%2Fdemands', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-test-id="login-password"]', { timeout: 60000 });
  await p.waitForTimeout(1500);
  await p.locator('[data-test-id="login-email"]').fill('admin@demo.local').catch(() => {});
  await p.locator('[data-test-id="login-password"]').fill('admin123').catch(() => {});
  await p.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
  // fallback: click the submit button if still on /login
  await p.waitForTimeout(2500);
  if (/\/login/.test(p.url())) {
    await p.locator('button:has-text("Kirish"), button[type="submit"]').first().click().catch(() => {});
  }
  await p.waitForURL('**/demands', { timeout: 60000 }).catch(() => {});
  await p.waitForSelector('[data-test-id="demands-inline-filter"]', { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(3000);
  out.url = p.url();
  out.render = await p.evaluate(() => {
    const fields = [...document.querySelectorAll('[data-test-id="demands-inline-filter"] [data-test-id="inline-filter-field"]')];
    return {
      fieldCount: fields.length,
      labels: fields.map((f) => (f.querySelector('span')?.textContent || '').replace(/^●\s*/, '').trim()),
      hasDeliveryComment: !!document.querySelector('[data-test-id="filter-delivery-address-comment"]'),
      gear: !!document.querySelector('[data-test-id="inline-filter-settings"]'),
      bookmark: !!document.querySelector('[data-test-id="inline-filter-bookmark"]'),
    };
  });
  await p.screenshot({ path: resolve(OUT, 'our-app-filter-25.png') });
} catch (e) {
  out.error = String(e).slice(0, 400);
}
console.log(JSON.stringify(out, null, 2));
await b.close();
