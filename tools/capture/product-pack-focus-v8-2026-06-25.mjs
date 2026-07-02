// v8 — GROUND the pack-row «Наименование» suggest ▾ + the green «+» (the two #5
// unknowns). Proven open path from v7: force-click the exact-text «Упаковка» add
// button, locate the row by its «EAN13» cell to get real Y. Then:
//   (A) click the name input's INTERNAL ▾ (right edge ~671) → enumerate the suggest list
//   (B) Escape, then click the green «+» (~x700) → capture whatever dialog/modal opens
// STRICTLY READ-ONLY: capture + screenshot + Escape. NEVER click Сохранить/Save/OK.
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

// row geometry: a leaf cell whose text is exactly «EAN13» in the pack area.
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
    return { y: Math.round(ean.y + ean.height / 2) };
  });

// enumerate every VISIBLE leaf text node in a screen band (for modal/list capture)
const captureBand = (yMin, yMax, xMin = 380, xMax = 1300) =>
  page.evaluate(
    ({ yMin, yMax, xMin, xMax }) => {
      const seen = [];
      for (const e of document.querySelectorAll('*')) {
        if (e.children.length) continue;
        const r = e.getBoundingClientRect();
        const t = (e.textContent || '').trim();
        if (!t || t.length > 80) continue;
        if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') continue;
        if (r.y < yMin || r.y > yMax || r.x < xMin || r.x > xMax) continue;
        if (r.width < 2 || r.height < 2) continue;
        seen.push({ t, x: Math.round(r.x), y: Math.round(r.y) });
      }
      return seen;
    },
    { yMin, yMax, xMin, xMax },
  );

// any dialog-ish container currently on screen (GWT uses .gwt-DialogBox / .b-popup)
const captureDialogs = () =>
  page.evaluate(() => {
    const out = [];
    const sel =
      '[role=dialog], .gwt-DialogBox, .gwt-PopupPanel, [class*=DialogBox], [class*=opupPanel], [class*=b-popup], [class*=modal], [class*=Modal]';
    for (const d of document.querySelectorAll(sel)) {
      const r = d.getBoundingClientRect();
      if (r.width < 40 || r.height < 20) continue;
      if (!d.offsetParent && getComputedStyle(d).position !== 'fixed') continue;
      out.push({
        cls: (typeof d.className === 'string' ? d.className : '').slice(0, 60),
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        text: (d.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
      });
    }
    return out;
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
  if (!g) throw new Error('no EAN13 row cell found');

  // focus the name cell (x ~600, inside the 544..683 name input)
  await page.mouse.click(600, g.y);
  await page.waitForTimeout(1000);
  await shot('70-name-focused.png', { clip: { x: 480, y: g.y - 26, width: 1180, height: 60 } });

  // (A) click the INTERNAL ▾ at the name input's right edge (~671) to open the suggest
  await page.mouse.click(671, g.y);
  await page.waitForTimeout(1600);
  await shot('71-suggest-open.png', { clip: { x: 480, y: g.y - 14, width: 760, height: 360 } });
  out.suggestBand = await captureBand(g.y + 6, g.y + 320, 500, 720);
  out.suggestDialogs = await captureDialogs();
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(800);

  // (B) the green «+» sits just right of the name input (683) before qty (724) → ~x700.
  // probe a couple of x positions for a clickable target, click, capture the result.
  out.plusProbe = await page.evaluate((yy) => {
    const hits = [];
    for (const e of document.querySelectorAll('img, button, a, [role=button], div, span')) {
      const r = e.getBoundingClientRect();
      if (r.y < yy - 16 || r.y > yy + 16) continue;
      if (r.x < 684 || r.x > 723) continue; // the gap between name-input-end and qty
      if (r.width < 6 || r.width > 40) continue;
      hits.push({
        tag: e.tagName.toLowerCase(),
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width),
        title: e.getAttribute('title') || '',
        src: (e.getAttribute('src') || '').slice(-30),
        cls: (typeof e.className === 'string' ? e.className : '').slice(0, 40),
      });
    }
    return hits;
  }, g.y);

  await page.mouse.click(700, g.y);
  await page.waitForTimeout(2200);
  await shot('72-after-plus.png', { fullPage: false });
  out.afterPlusDialogs = await captureDialogs();
  out.afterPlusBand = await captureBand(80, 760, 380, 1300);
  out.urlAfterPlus = page.url();
  // read-only: dismiss anything that opened, NEVER save
  await page.keyboard.press('Escape').catch(() => {});
} catch (e) {
  out.error = String(e).slice(0, 400);
  await shot('79-error.png');
} finally {
  writeFileSync(resolve(OUT, 'focus-v8.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
