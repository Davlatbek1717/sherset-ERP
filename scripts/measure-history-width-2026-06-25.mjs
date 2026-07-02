// Measure the product-card layout width after the max-w cap — verify the right
// tab column (and the «История» table) no longer stretches full-viewport but
// matches moysklad (~765px right column, table right edge ~1265 at 1680 viewport).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.CERT_BASE || 'http://localhost:3225';
const API = process.env.CERT_API || 'http://localhost:4000/api/v1';
const OUT = resolve(process.cwd(), 'docs/audits/history-pixel-compare-2026-06-25');
mkdirSync(OUT, { recursive: true });
const out = {};

const lr = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
});
const { accessToken } = await lr.json();
const auth = { authorization: `Bearer ${accessToken}` };
// find a product with movement so the table has a row
const plist = await (await fetch(`${API}/products?limit=60`, { headers: auth })).json();
let productId = plist.items?.[0]?.id;
for (const p of plist.items ?? []) {
  const mv = await (
    await fetch(`${API}/reports/product-movement?productId=${p.id}&limit=10`, { headers: auth })
  ).json();
  if ((mv.sales?.length ?? 0) + (mv.purchases?.length ?? 0) > 0) {
    productId = p.id;
    break;
  }
}
out.productId = productId;

const browser = await chromium.launch({ headless: true });
// 1680 viewport = same width as the moysklad capture (hist-0-full.png)
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1100 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const shot = (f) => page.screenshot({ path: resolve(OUT, f) }).catch(() => {});

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').waitFor({ timeout: 30000 });
  await page.locator('[data-test-id="login-submit"]').click();
  await page
    .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 })
    .catch(async () => {
      await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
      await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 }).catch(() => {});
    });
  await page.goto(`${BASE}/products/${productId}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="product-detail-widget"]').waitFor({ timeout: 70000 });
  await page.locator('[data-test-id="tab-history"]').click();
  await page.waitForTimeout(1200);

  // measure the shell + the История table right edge
  out.shell = await page
    .locator('[data-test-id="product-form-shell"]')
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
    })
    .catch(() => null);
  out.table = await page
    .locator('[data-test-id="hist-purchases"] table, [data-test-id="hist-sales"] table')
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
    })
    .catch(() => null);
  await shot('our-card-1680.png');
  // moysklad reference (measured): right col 525..1290 (~765px), table 538..1263.
  out.moyskladRef = { rightCol: '525..1290 (~765px)', table: '538..1263 (~725px)' };
} catch (e) {
  out.error = String(e).slice(0, 300);
  await shot('99-measure-error.png');
} finally {
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
