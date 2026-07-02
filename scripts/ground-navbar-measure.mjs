// Live moysklad.uz grounding — MEASURE the top module navbar + sub-nav geometry.
// Reads creds from .env.local (NEVER printed). READ-ONLY (no clicks that mutate).
// Goal: get the REAL pixel height of moysklad's navbar bar, per-module cell width,
// icon box, and label font-size so we can match it (user: «moyskladda height katta,
// kichik joyni egalagan, aniq»). Saves a screenshot + JSON to docs/audits/navbar-geom/.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'docs/audits/navbar-geom');
fs.mkdirSync(OUT, { recursive: true });

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const URL = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const EMAIL = env.MOYSKLAD_EMAIL;
const PASSWORD = env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('NO creds'); process.exit(2); }

const log = (...a) => console.log(...a);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const passEl = page.locator('input[type="password"]').first();
  const loginEl = page.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])').first();
  await loginEl.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await loginEl.click().catch(() => {});
  await loginEl.fill(EMAIL).catch(() => {});
  await passEl.fill(PASSWORD).catch(() => {});
  if ((await loginEl.inputValue().catch(() => '')).length === 0) {
    await loginEl.click().catch(() => {});
    await page.keyboard.type(EMAIL, { delay: 20 }).catch(() => {});
  }
  let submitted = false;
  for (const s of ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Войти")', '.login-button']) {
    const el = page.locator(s).first();
    if (await el.count() && await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); submitted = true; break; }
  }
  if (!submitted) await passEl.press('Enter').catch(() => {});
  await page.waitForTimeout(10000);
  log('url after login:', page.url());

  // Wait for the GWT top menu to render (module link «Закупки» appears in the bar).
  await page.waitForSelector('text=Закупки', { timeout: 60000 }).catch(() => log('no Закупки'));
  await page.waitForTimeout(3000);
  // Navigate to a page WITH a sub-nav strip so we can measure the navbar/sub-nav split.
  const base = page.url().split('#')[0];
  await page.goto(base + '#customerorder', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(4000);

  await page.screenshot({ path: path.join(OUT, 'ms-navbar.png'), clip: { x: 0, y: 0, width: 1680, height: 140 } }).catch(() => {});

  const geom = await page.evaluate(() => {
    const MODULES = ['Показатели', 'Закупки', 'Продажи', 'Товары', 'CRM', 'Склад', 'Деньги', 'Розница', 'Производство', 'Задачи', 'Решения'];
    const SUBS = ['Заказы покупателей', 'Счета покупателям', 'Отгрузки', 'Контрагенты', 'Договоры', 'Звонки'];

    const leafByText = (texts) => {
      for (const el of document.querySelectorAll('*')) {
        if (el.children.length === 0 && texts.includes((el.textContent || '').trim())) return el;
      }
      return null;
    };
    const rectOf = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left) }; };
    const cs = (el, props) => { const c = getComputedStyle(el); const o = {}; for (const p of props) o[p] = c[p]; return o; };

    const out = {};

    const mLabel = leafByText(MODULES);
    if (mLabel) {
      out.moduleLabel = { text: mLabel.textContent.trim(), rect: rectOf(mLabel), font: cs(mLabel, ['fontSize', 'fontWeight', 'lineHeight', 'color']) };
      // FULL cell = climb until the block that contains both an icon and the label
      // (height jumps well above the label's own ~12px once we include the icon).
      let cell = mLabel;
      for (let i = 0; i < 8 && cell.parentElement; i++) {
        const r = cell.getBoundingClientRect();
        if (r.height >= 40 && r.width >= 40 && r.width <= 200) break;
        cell = cell.parentElement;
      }
      out.moduleCell = { tag: cell.tagName, cls: (cell.className || '').toString().slice(0, 60), rect: rectOf(cell), pad: cs(cell, ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight']) };

      // icon: scan the cell subtree for an img/background-image box of plausible icon size
      let icon = null;
      for (const el of cell.querySelectorAll('*')) {
        const c = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if ((el.tagName === 'IMG' || c.backgroundImage !== 'none') && r.width >= 12 && r.width <= 48 && r.height >= 12 && r.height <= 48) { icon = el; break; }
      }
      if (icon) out.moduleIcon = { tag: icon.tagName, rect: rectOf(icon), bgImage: getComputedStyle(icon).backgroundImage.slice(0, 70) };
    }

    // sub-nav: the first sub-link, climb to its full-width strip
    const sLabel = leafByText(SUBS);
    if (sLabel) {
      out.subLabel = { text: sLabel.textContent.trim(), rect: rectOf(sLabel), font: cs(sLabel, ['fontSize', 'fontWeight', 'color']) };
      let sCell = sLabel;
      for (let i = 0; i < 6 && sCell.parentElement; i++) {
        const r = sCell.getBoundingClientRect();
        if (r.height >= 24 && r.width >= 60 && r.width <= 260) break;
        sCell = sCell.parentElement;
      }
      out.subCell = { tag: sCell.tagName, rect: rectOf(sCell), pad: cs(sCell, ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight']) };
      // full-width sub-nav strip
      let sBar = sLabel;
      while (sBar.parentElement) {
        const r = sBar.getBoundingClientRect();
        if (r.width >= window.innerWidth - 6 && r.height <= 60) break;
        sBar = sBar.parentElement;
      }
      out.subBar = { tag: sBar.tagName, cls: (sBar.className || '').toString().slice(0, 60), rect: rectOf(sBar) };
    }

    // --- SEPARATOR between module items ---
    // moysklad markup: <td class="topMenu-new-separator">. Find any element in the
    // top region whose class mentions "separator", report its box + the visible line
    // (background / border / gradient) so we can match its colour, not guess it.
    const seps = [];
    for (const el of document.querySelectorAll('[class*="separator" i]')) {
      const r = el.getBoundingClientRect();
      if (r.top > 110 || r.width > 12) continue; // only the thin navbar separators near the top
      const c = getComputedStyle(el);
      seps.push({
        cls: (el.className || '').toString().slice(0, 50),
        rect: rectOf(el),
        bg: c.backgroundColor, bgImage: c.backgroundImage.slice(0, 80),
        borderLeft: `${c.borderLeftWidth} ${c.borderLeftColor}`,
        borderRight: `${c.borderRightWidth} ${c.borderRightColor}`,
      });
      if (seps.length >= 4) break;
    }
    out.separators = seps;

    // DERIVED: navbar height = where sub-nav starts (sub-bar top)
    if (out.subBar) out.derivedNavbarHeight = out.subBar.rect.top;

    out.viewport = { w: window.innerWidth, h: window.innerHeight, rootFont: getComputedStyle(document.documentElement).fontSize, bodyFont: getComputedStyle(document.body).fontSize };
    return out;
  }).catch((e) => ({ error: e.message }));

  fs.writeFileSync(path.join(OUT, 'ms-navbar-geom.json'), JSON.stringify(geom, null, 2));
  log('MS GEOM:', JSON.stringify(geom, null, 2));
  log('DONE → ', OUT);
} catch (e) {
  log('ERROR:', e.message);
} finally {
  await browser.close();
}
