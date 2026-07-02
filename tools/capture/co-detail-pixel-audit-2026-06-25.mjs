// READ-ONLY side-by-side pixel audit capture: moysklad CO detail vs our :3100 CO detail.
// Same viewport (1680x1000), both opened on an order WITH positions. Outputs paired
// full-page + region screenshots so the differences can be judged element-by-element.
// moysklad: fresh login from .env.local, hash-direct editor (NEVER saves/deletes).
// ours: login at :3100, open a CO that has positions (picked via API by sumMinor>0).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs', 'audits', 'co-detail-pixel-audit-2026-06-25');
mkdirSync(OUT, { recursive: true });
const MS_IMG_ORDER = 'a0fac2ff-6faa-11f1-0a80-1f67000852c8'; // moysklad order with image positions
const OUR = 'http://localhost:3100';
const API = 'http://127.0.0.1:4000/api/v1';

const env = {};
for (const line of readFileSync(resolve(REPO, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const SITE = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const EMAIL = env.MOYSKLAD_EMAIL;
const PASSWORD = env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD;
const out = { moysklad: {}, ours: {} };

const browser = await chromium.launch({ headless: true });

// ---------- A. moysklad ----------
try {
  const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);
  page.setDefaultNavigationTimeout(120_000);
  const shot = (f, opts) => page.screenshot({ path: resolve(OUT, f), ...opts }).catch(() => {});
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const passEl = page.locator('input[type="password"]').first();
  const loginEl = page.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])').first();
  await loginEl.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await loginEl.fill(EMAIL).catch(() => {});
  await passEl.fill(PASSWORD).catch(() => {});
  for (const s of ['button:has-text("Войти")', 'button[type="submit"]', 'input[type="submit"]']) {
    const el = page.locator(s).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) { await el.click().catch(() => {}); break; }
  }
  await page.waitForTimeout(12000);
  const base = page.url().split('#')[0];
  await page.goto(`${base}#customerorder/edit?id=${MS_IMG_ORDER}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(15000);
  // dismiss «Новый дизайн» promo if present
  for (const s of ['button:has-text("Остаться")', 'button:has-text("Позже")', ':text("Старый интерфейс")']) {
    const el = page.locator(s).first();
    if ((await el.count().catch(() => 0)) && (await el.isVisible().catch(() => false))) { await el.click().catch(() => {}); await page.waitForTimeout(1500); }
  }
  out.moysklad.opened = (await page.locator(':text-is("Создать документ") >> visible=true').count()) > 0;
  out.moysklad.url = page.url();
  await shot('ms-01-abovefold.png');
  await shot('ms-02-full.png', { fullPage: true });
  await shot('ms-03-toolbar.png', { clip: { x: 0, y: 64, width: 1660, height: 200 } });
  await shot('ms-04-meta.png', { clip: { x: 0, y: 200, width: 1660, height: 260 } });
  await shot('ms-05-positions.png', { clip: { x: 0, y: 440, width: 1660, height: 280 } });
  await ctx.close();
} catch (e) {
  out.moysklad.error = String(e).slice(0, 300);
}

// ---------- B. ours (:3100) ----------
try {
  // pick a CO that has positions (sumMinor > 0) via API
  const lr = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }) });
  const { accessToken } = await lr.json();
  const list = await (await fetch(`${API}/customer-orders?limit=50`, { headers: { authorization: `Bearer ${accessToken}` } })).json();
  const withPos = (list.items || []).find((o) => o.sumMinor && o.sumMinor !== '0');
  const ourId = (withPos || list.items?.[0])?.id;
  out.ours.id = ourId;
  out.ours.sumMinor = withPos?.sumMinor;

  const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  const shot = (f, opts) => page.screenshot({ path: resolve(OUT, f), ...opts }).catch(() => {});
  await page.goto(`${OUR}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }).catch(async () => {
    await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
    await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {});
  });
  await page.goto(`${OUR}/customer-orders/${ourId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  // wait for the position table or meta to render
  await page.locator('[data-test-id="detail-toolbar-position"], table, [data-test-id="document-totals-panel"]').first().waitFor({ timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2500);
  out.ours.url = page.url();
  await shot('our-01-abovefold.png');
  await shot('our-02-full.png', { fullPage: true });
  await shot('our-03-toolbar.png', { clip: { x: 0, y: 0, width: 1660, height: 200 } });
  await shot('our-04-meta.png', { clip: { x: 0, y: 150, width: 1660, height: 320 } });
  await shot('our-05-positions.png', { clip: { x: 0, y: 440, width: 1660, height: 300 } });
  await ctx.close();
} catch (e) {
  out.ours.error = String(e).slice(0, 300);
}

writeFileSync(resolve(OUT, 'audit-meta.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
