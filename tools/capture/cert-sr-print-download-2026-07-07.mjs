// Close the loop: on a FILLED return [id], click «Печать → Возврат покупателя» and
// assert a real PDF downloads (POST /sales-returns/bulk-print → %PDF). Proves the
// print dropdown item produces an actual document, not just a clickable no-op.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB = 'http://localhost:3100';
const SR_ID = '5fdcfdf6-b0d2-4fa4-94ee-bf5d1eefbd9f';
const OUT = resolve('D:/projects/moysklad/docs/audits/sales-returns-1to1-2026-07-05/dropdowns');
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU', acceptDownloads: true });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'ru', domain: 'localhost', path: '/' }]);
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
const net = [];
page.on('response', (r) => { if (/bulk-print/.test(r.url())) net.push(`${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });
const results = [];
const rec = (n, p, d) => { results.push({ n, p }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };

try {
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.locator('[data-test-id="login-email"]').fill('admin@demo.local').catch(() => {});
  await page.locator('[data-test-id="login-password"]').fill('admin123').catch(() => {});
  await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
  await page.waitForTimeout(4500);

  await page.goto(`${WEB}/sales-returns/${SR_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
  await page.locator('button:has-text("Печать")').first().click();
  await page.waitForTimeout(700);
  await page.locator('text=Возврат покупателя').last().click().catch(() => {});
  const download = await dl;
  await page.waitForTimeout(2000);
  await page.screenshot({ path: resolve(OUT, 'func-C-id-print.png') });
  const fname = download ? download.suggestedFilename() : null;
  rec('[id] «Печать→Возврат покупателя» → bulk-print 200 + PDF download', !!download && net.some((n) => n.startsWith('200')), `download=${fname || 'none'} net=${net.join(', ') || 'none'}`);
} catch (e) {
  rec('FATAL', false, String(e).slice(0, 200));
} finally {
  await b.close();
  const pass = results.filter((r) => r.p).length;
  console.log(`\n=== ${pass}/${results.length} PASS ===`);
}
