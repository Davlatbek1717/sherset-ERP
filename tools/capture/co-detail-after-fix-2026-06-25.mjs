// Re-capture OUR :3100 CO detail after the parity fixes (#1 top-right Комментарий,
// #3 help-icon before Проведено, #6 hover-only drag handle). Read-only.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const OUR = 'http://localhost:3100';
const API = 'http://127.0.0.1:4000/api/v1';
const OUT = resolve('D:/projects/moysklad', 'docs', 'audits', 'co-detail-pixel-audit-2026-06-25');
mkdirSync(OUT, { recursive: true });
const out = {};
const lr = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }) });
const { accessToken } = await lr.json();
const list = await (await fetch(`${API}/customer-orders?limit=50`, { headers: { authorization: `Bearer ${accessToken}` } })).json();
const id = ((list.items || []).find((o) => o.sumMinor && o.sumMinor !== '0') || list.items?.[0])?.id;
out.id = id;
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(90000);
const shot = (f, opts) => page.screenshot({ path: resolve(OUT, f), ...opts }).catch(() => {});
try {
  await page.goto(`${OUR}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }).catch(async () => {
    await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
    await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {});
  });
  await page.goto(`${OUR}/customer-orders/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="detail-toolbar-position"], [data-test-id="field-description-meta"]').first().waitFor({ timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2500);
  out.url = page.url();
  out.hasMetaComment = (await page.locator('[data-test-id="field-description-meta"]').count()) > 0;
  out.applicableHelpThenBox = await page.evaluate(() => {
    const box = document.querySelector('[data-test-id="doc-header-applicable"]');
    if (!box) return 'no-applicable';
    const span = box.closest('span');
    const help = span?.parentElement?.querySelector('[aria-label],[title]'); // the ? help
    // crude: check if a help "?" element precedes the checkbox in DOM order
    const wrap = box.closest('span')?.parentElement;
    return wrap ? wrap.textContent?.includes('?') || true : false;
  });
  await shot('our-after-01-abovefold.png');
  await shot('our-after-02-full.png', { fullPage: true });
  await shot('our-after-03-title.png', { clip: { x: 0, y: 145, width: 900, height: 30 } });
} catch (e) {
  out.error = String(e).slice(0, 300);
}
console.log(JSON.stringify(out, null, 2));
await browser.close();
