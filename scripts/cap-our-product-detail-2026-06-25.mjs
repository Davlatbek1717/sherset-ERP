// Capture OUR /products/[id] page end-to-end (mirror of the moysklad grounding) so
// the two sit side-by-side for the full pixel audit. Captures toolbar, header, name,
// left cards, and each of the 7 tabs at a 1680 viewport (same width as moysklad).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.CERT_BASE || 'http://localhost:3225';
const API = process.env.CERT_API || 'http://localhost:4000/api/v1';
const OUT = resolve(process.cwd(), 'docs/audits/product-detail-fullaudit-2026-06-25/ours');
mkdirSync(OUT, { recursive: true });
const out = {};

const lr = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
});
const { accessToken } = await lr.json();
const auth = { authorization: `Bearer ${accessToken}` };
// pick a product WITH movement so История has rows
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
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1100 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const shot = (f, opts) => page.screenshot({ path: resolve(OUT, f), ...opts }).catch(() => {});

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
  await page.waitForTimeout(800);

  await shot('00-full-default.png', { fullPage: false });
  await shot('00-full-page.png', { fullPage: true });
  await shot('01-toolbar.png', { clip: { x: 0, y: 8, width: 1680, height: 50 } });
  await shot('02-header.png', { clip: { x: 0, y: 8, width: 1680, height: 220 } });
  await shot('03-name-field.png', { clip: { x: 0, y: 130, width: 1680, height: 90 } });
  await shot('04-left-cards.png', { clip: { x: 0, y: 230, width: 500, height: 870 } });

  const TABS = [
    ['Цены', 'tab-prices'],
    ['Модификации', 'tab-variants'],
    ['Аналоги', 'tab-analogs'],
    ['Упаковка', 'tab-packaging'],
    ['Остатки', 'tab-stock'],
    ['История', 'tab-history'],
    ['Файлы', 'tab-files'],
  ];
  let idx = 5;
  for (const [label, testId] of TABS) {
    idx += 1;
    await page.locator(`[data-test-id="${testId}"]`).click().catch(() => {});
    await page.waitForTimeout(900);
    const n = String(idx).padStart(2, '0');
    await shot(`${n}-tab-${label}.png`, { clip: { x: 480, y: 250, width: 860, height: 700 } });
    await shot(`${n}-tab-${label}-fullpage.png`, { fullPage: false });
  }
  out.ok = true;
} catch (e) {
  out.error = String(e).slice(0, 300);
  await shot('99-error.png');
} finally {
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
