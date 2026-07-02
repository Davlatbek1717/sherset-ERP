// Live-ground moysklad's product-editor «НДС» dropdown OPTIONS and the «Страна»/
// «Поставщик» trailing «+» actions — the two functional left-card bits we refused
// to guess. READ-ONLY: opens the editor via goto #good/edit, clicks НДС to reveal
// its option list, hovers/clicks the Страна «+» to see what opens. Never saves.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs', 'audits', 'product-detail-fullaudit-2026-06-25', 'moysklad');
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
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1100 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);
page.setDefaultNavigationTimeout(120_000);
const out = {};
const shot = (f, opts) => page.screenshot({ path: resolve(OUT, f), ...opts }).catch(() => {});

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
  let editHref = await page.locator('a[href*="good/edit"]').first().getAttribute('href').catch(() => null);
  if (!editHref) editHref = `${base}#good/edit?id=e217460f-f5ca-11ef-0a80-0f65004c16b6`;
  if (editHref.startsWith('#')) editHref = base + editHref;
  await page.goto(editHref, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  out.editorUrl = page.url();

  // ---- 1) НДС dropdown: find the field showing «без НДС», click, dump option list.
  const ndsField = await page.evaluate(() => {
    for (const e of document.querySelectorAll('input, div, td, span')) {
      const v = (e.value || e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      if (v === 'без НДС' && r.x < 500 && r.width > 30 && r.height > 8 && r.height < 40) {
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      }
    }
    return null;
  });
  out.ndsField = ndsField;
  if (ndsField) {
    await page.mouse.click(ndsField.x, ndsField.y);
    await page.waitForTimeout(1500);
    await shot('05-nds-open.png', { fullPage: false });
    // dump all currently-visible short text nodes that look like VAT options
    out.ndsOptions = await page.evaluate(() => {
      const seen = [];
      for (const e of document.querySelectorAll('*')) {
        if (e.children.length) continue;
        const t = (e.textContent || '').trim();
        const r = e.getBoundingClientRect();
        if (t && t.length < 20 && r.width > 0 && r.height > 0 && (/НДС|%/.test(t))) {
          seen.push({ t, x: Math.round(r.x), y: Math.round(r.y) });
        }
      }
      return seen.sort((a, b) => a.y - b.y || a.x - b.x);
    });
    // close the popup
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);
  }

  // ---- 2) Страна «+» : find the «+» glyph near a «Страна» label and probe it.
  const plus = await page.evaluate(() => {
    // find «Страна» label position
    let labelY = null;
    for (const e of document.querySelectorAll('*')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      if (t === 'Страна' && r.x < 200) { labelY = r.y; break; }
    }
    if (labelY == null) return null;
    // find a clickable «+» on the same row, to the right
    for (const e of document.querySelectorAll('*')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      if ((t === '+' || t === '＋') && Math.abs(r.y - labelY) < 14 && r.x > 300) {
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), labelY };
      }
    }
    return { labelY, note: 'plus-not-found-as-text' };
  });
  out.countryPlus = plus;
  if (plus && plus.x) {
    await page.mouse.click(plus.x, plus.y);
    await page.waitForTimeout(1800);
    await shot('05-country-plus.png', { fullPage: false });
    out.countryPlusAfter = await page.evaluate(() => {
      // capture any modal/popup title that appeared
      const titles = [];
      for (const e of document.querySelectorAll('*')) {
        if (e.children.length) continue;
        const t = (e.textContent || '').trim();
        const r = e.getBoundingClientRect();
        if (t && t.length < 40 && r.y < 300 && r.width > 40) titles.push(t);
      }
      return titles.slice(0, 30);
    });
  }
  out.ok = true;
} catch (e) {
  out.error = String(e).slice(0, 400);
  await shot('99-nds-error.png');
} finally {
  writeFileSync(resolve(OUT, '_nds-country-ground.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
