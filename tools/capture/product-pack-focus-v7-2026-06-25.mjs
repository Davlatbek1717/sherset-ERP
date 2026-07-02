// v7 — locate the row by its «EAN13»/«шт» cell to get its real Y, then click the
// Наименование cell (just left of «Количество») to FOCUS it → reveals the ▾/+/↻
// controls + yellow row. Click the ▾ to read the suggest list. READ-ONLY.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs', 'audits', 'product-pack-active-live-2026-06-25');
mkdirSync(OUT, { recursive: true });
const env = {};
for (const line of readFileSync(resolve(REPO, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const SITE = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const EMAIL = env.MOYSKLAD_EMAIL;
const PASSWORD = env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);
page.setDefaultNavigationTimeout(120_000);
const out = {};
const shot = (f, opts) => page.screenshot({ path: resolve(OUT, f), ...opts }).catch(() => {});
// the row's geometry: find a leaf cell whose text is exactly «EAN13» in the pack area.
const rowGeom = () =>
  page.evaluate(() => {
    let ean = null;
    for (const e of document.querySelectorAll('*')) {
      if (e.children.length) continue;
      if ((e.textContent || '').trim() === 'EAN13') {
        const r = e.getBoundingClientRect();
        if (r.x > 700 && r.y > 300 && r.y < 470) { ean = r; break; }
      }
    }
    if (!ean) return null;
    // name cell is the far-left editable area on the same row (~x 543), qty ~724
    return { y: Math.round(ean.y + ean.height / 2), nameX: 560, arrowX: 705 };
  });

try {
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const passEl = page.locator('input[type="password"]').first();
  const loginEl = page
    .locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])')
    .first();
  await loginEl.click().catch(() => {});
  await loginEl.fill(EMAIL).catch(() => {});
  await passEl.fill(PASSWORD).catch(() => {});
  for (const s of ['button:has-text("Войти")', 'button[type="submit"]', 'input[type="submit"]']) {
    const el = page.locator(s).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) { await el.click().catch(() => {}); break; }
  }
  await page.waitForTimeout(13000);
  const base = page.url().split('#')[0];
  await page.goto(`${base}#good/list`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.cellTableEvenRow', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.locator('.cellTableEvenRow').first().locator('td').nth(5).click().catch(() => {});
  await page.waitForURL(/#good\/edit/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(9000);
  await page.locator(':text-matches("Упаков", "i") >> visible=true').first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await page.locator(':text-is("Упаковка")').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(2500);

  const g = await rowGeom();
  out.geom = g;
  if (g) {
    // focus the Наименование cell
    await page.mouse.click(g.nameX, g.y);
    await page.waitForTimeout(1400);
    await shot('60-focused.png', { clip: { x: 480, y: g.y - 26, width: 1180, height: 60 } });
    await shot('60-focused-full.png', { fullPage: false });
    // click the ▾ at the name cell's right edge
    await page.mouse.click(g.arrowX, g.y);
    await page.waitForTimeout(1800);
    await shot('61-suggest.png', { clip: { x: 480, y: g.y - 10, width: 700, height: 320 } });
    out.suggest = await page.evaluate(() => {
      const opts = [];
      // capture any popup/list rows that are NOT the top nav (y > 360)
      for (const e of document.querySelectorAll('td, .item, [role=option], [class*=uggest] div, [class*=opup] div')) {
        if (e.children.length) continue;
        const r = e.getBoundingClientRect();
        const t = (e.textContent || '').trim();
        if (t && t.length < 60 && e.offsetParent && r.y > 360 && r.x > 480 && r.x < 1100) opts.push(t);
      }
      return [...new Set(opts)].slice(0, 30);
    });
    // tooltips on the focused row
    out.tips = await page.evaluate((yy) =>
      [...document.querySelectorAll('[title]')]
        .map((e) => ({ t: e.getAttribute('title'), x: Math.round(e.getBoundingClientRect().x), y: Math.round(e.getBoundingClientRect().y) }))
        .filter((o) => o.t && o.y > yy - 30 && o.y < yy + 30 && o.x > 460), g.y);
    await page.keyboard.press('Escape').catch(() => {});
  }
} catch (e) {
  out.error = String(e).slice(0, 400);
}
writeFileSync(resolve(OUT, 'focus-v7.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
