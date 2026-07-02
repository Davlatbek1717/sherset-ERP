// READ-ONLY deep grounding of the moysklad «Счета поставщиков» (invoicein) LIST.
// Captures, in order: toolbar at 0-selection; then selects row 1 (a checkbox —
// NO write) and opens «Изменить» / «Создать» / «Печать» menus (screenshot +
// extract item labels, Escape between); then opens «Фильтр» and reads its field
// labels in order. NEVER clicks a menu ITEM (no create/delete/save). Creds from
// .env.local. Output → invoices-in-list-2026-06-25/moysklad/full-ground.json + pngs.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/invoices-in-list-2026-06-25/moysklad');
mkdirSync(OUT, { recursive: true });
const env = {};
for (const line of readFileSync(resolve(REPO, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const SITE = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const EMAIL = env.MOYSKLAD_EMAIL;
const PASSWORD = env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('NO creds'); process.exit(2); }

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const p = await ctx.newPage();
p.setDefaultTimeout(45000);
p.setDefaultNavigationTimeout(120000);
const out = {};
const shot = (f) => p.screenshot({ path: resolve(OUT, f) }).catch(() => {});

// Read the items of the currently-open GWT popup menu.
const menuItems = () =>
  p.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const pops = [...document.querySelectorAll('.gwt-PopupPanel, .gwt-MenuBarPopup, [role="menu"]')]
      .filter((e) => e.getBoundingClientRect().width > 80 && e.getBoundingClientRect().height > 30);
    const last = pops[pops.length - 1];
    if (!last) return [];
    return [...last.querySelectorAll('.gwt-MenuItem, [role="menuitem"], td')]
      .map((e) => ({
        text: norm(e.textContent),
        disabled: /disabled|Disabled/.test(e.className) || e.getAttribute('aria-disabled') === 'true',
      }))
      .filter((x) => x.text && x.text.length < 50);
  });

const openByText = async (label) => {
  const el = p.locator(`:text-is("${label}") >> visible=true`).first();
  if ((await el.count()) && (await el.isVisible().catch(() => false))) {
    await el.click().catch(() => {});
    await p.waitForTimeout(1200);
    return true;
  }
  return false;
};

try {
  await p.goto(SITE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  const pass = p.locator('input[type="password"]').first();
  const login = p.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])').first();
  await login.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await login.fill(EMAIL).catch(() => {});
  await pass.fill(PASSWORD).catch(() => {});
  for (const s of ['button:has-text("Войти")', 'button[type="submit"]']) {
    const el = p.locator(s).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) { await el.click().catch(() => {}); break; }
  }
  await p.waitForTimeout(12000);

  const base = p.url().split('#')[0];
  await p.goto(`${base}#invoicein`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(10000);
  const cancel = p.locator('button:has-text("Отмена")').first();
  if ((await cancel.count()) && (await cancel.isVisible().catch(() => false))) { await cancel.click().catch(() => {}); await p.waitForTimeout(800); }

  // toolbar @ 0-selection — is «Создать» present? enabled?
  await shot('full-01-toolbar0.png');
  out.toolbar0 = await p.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('button, .gwt-Button, [class*="Button"]')]
      .map((e) => ({ text: norm(e.textContent), disabled: e.disabled || /disabled/i.test(e.className) }))
      .filter((x) => ['Изменить', 'Создать', 'Печать', 'Отправить', 'Счет', 'Фильтр'].some((k) => x.text.includes(k)) && x.text.length < 40);
  });

  // select row 1 (checkbox — NO write) so the menus enable
  const cb = p.locator('table input[type="checkbox"], .gwt-grid input[type="checkbox"]').nth(1);
  await cb.click().catch(() => {});
  await p.waitForTimeout(1500);
  await shot('full-02-row-selected.png');

  for (const [label, file, key] of [
    ['Изменить', 'full-03-izmenit.png', 'izmenit'],
    ['Создать', 'full-04-sozdat.png', 'sozdat'],
    ['Печать', 'full-05-pechat.png', 'pechat'],
  ]) {
    if (await openByText(label)) {
      await shot(file);
      out[key] = await menuItems();
      await p.keyboard.press('Escape').catch(() => {});
      await p.waitForTimeout(600);
    } else out[key] = `(«${label}» not found / disabled)`;
  }

  // filter panel field labels in order
  if (await openByText('Фильтр')) {
    await p.waitForTimeout(1500);
    await shot('full-06-filter.png');
    out.filterFields = await p.evaluate(() => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
      // the active filter panel is the visible one with the most gwt-Label children
      const panels = [...document.querySelectorAll('[class*="filter"], [class*="Filter"], form, .gwt-HTMLPanel')]
        .filter((e) => e.getBoundingClientRect().height > 100 && e.getBoundingClientRect().width > 400);
      const best = panels.sort((a, b) => b.querySelectorAll('.gwt-Label').length - a.querySelectorAll('.gwt-Label').length)[0];
      if (!best) return [];
      return [...best.querySelectorAll('.gwt-Label')].map((e) => norm(e.textContent)).filter((t) => t && t.length < 40);
    });
  } else out.filterFields = '(Фильтр not found)';
} catch (e) {
  out.error = String(e).slice(0, 400);
}

writeFileSync(resolve(OUT, 'full-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2).slice(0, 4500));
await b.close();
