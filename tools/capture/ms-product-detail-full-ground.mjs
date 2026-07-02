// FULL product-detail grounding — capture moysklad's product editor end-to-end so
// we can audit our /products/[id] page element-by-element. Captures: toolbar clip,
// header clip, name field, the whole left card-stack (full-page), and EACH of the 7
// right tabs (Цены · Модификации · Аналоги · Упаковка · Остатки · История · Файлы).
// READ-ONLY: never clicks Сохранить. Opens the editor by goto-ing #good/edit?id=.
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
const out = { tabs: {} };
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

  // open the goods list, then GOTO a row's edit href directly (clicking lands back
  // on the list — PO-grounding lesson). Fall back to a known rich product id.
  await page.goto(`${base}#good/list`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.cellTableEvenRow', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  let editHref = await page
    .locator('a[href*="good/edit"]')
    .first()
    .getAttribute('href')
    .catch(() => null);
  if (!editHref) editHref = `${base}#good/edit?id=e217460f-f5ca-11ef-0a80-0f65004c16b6`;
  if (editHref.startsWith('#')) editHref = base + editHref;
  await page.goto(editHref, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  out.editorUrl = page.url();

  // 00 — full default page (whatever tab + the whole left card-stack)
  await shot('00-full-default.png', { fullPage: false });
  await shot('00-full-page.png', { fullPage: true });

  // 01 — toolbar clip (top action bar)
  await shot('01-toolbar.png', { clip: { x: 0, y: 8, width: 1680, height: 50 } });
  // 02 — header clip (everything between toolbar and the tab strip: owner/Изменения
  //      top-right + the «Наименование товара» field — NB moysklad has NO «name·код·
  //      Активен» title line above the name field; verify against our page).
  await shot('02-header.png', { clip: { x: 0, y: 8, width: 1680, height: 160 } });
  // 03 — name field row
  await shot('03-name-field.png', { clip: { x: 0, y: 70, width: 1680, height: 70 } });
  // 04 — left card-stack column (x 0..500, full height)
  await shot('04-left-cards.png', { clip: { x: 0, y: 140, width: 500, height: 950 } });

  // enumerate the right-panel tab strip labels (for the audit) — strip y-band ~165-200
  out.tabStrip = await page.evaluate(() => {
    const labels = [];
    for (const e of document.querySelectorAll('*')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      if (t && t.length < 30 && r.y > 160 && r.y < 205 && r.x > 510 && r.x < 1320) {
        labels.push({ t, x: Math.round(r.x), y: Math.round(r.y) });
      }
    }
    return labels.sort((a, b) => a.x - b.x);
  });

  // capture each of the 7 tabs by clicking its label in the strip (y ~165-200)
  const TABS = ['Цены', 'Модификации', 'Аналоги', 'Упаковка', 'Остатки', 'История', 'Файлы'];
  let idx = 5;
  for (const tab of TABS) {
    idx += 1;
    const clicked = await page.evaluate((label) => {
      for (const e of document.querySelectorAll('*')) {
        if (e.children.length) continue;
        const t = (e.textContent || '').trim();
        const r = e.getBoundingClientRect();
        if ((t === label || t.startsWith(`${label} `)) && r.y > 160 && r.y < 205 && r.x > 510) {
          (e.closest('td, a, div') || e).dispatchEvent(new MouseEvent('click', { bubbles: true }));
          e.click?.();
          return { x: Math.round(r.x), y: Math.round(r.y) };
        }
      }
      return null;
    }, tab);
    out.tabs[tab] = { clicked };
    await page.waitForTimeout(2500);
    const n = String(idx).padStart(2, '0');
    // clip the right panel (x 505..1355, y 155..) for a focused tab capture
    await shot(`${n}-tab-${tab}.png`, { clip: { x: 505, y: 155, width: 860, height: 700 } });
    await shot(`${n}-tab-${tab}-fullpage.png`, { fullPage: false });
  }
} catch (e) {
  out.error = String(e).slice(0, 400);
  await shot('99-error.png');
} finally {
  writeFileSync(resolve(OUT, '_ground.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
