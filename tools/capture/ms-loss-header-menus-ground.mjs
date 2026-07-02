// READ-ONLY grounding of the moysklad #loss editor POSITION HEADER dropdowns:
// «Наименование ▾» (line-sort menu) and «Цена ▾» (price menu). Opens an existing
// loss editor (edit href), clicks each header, reads the popup menu items. NEVER
// saves. Creds from .env.local, never printed.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/losses-new-2026-06-25/moysklad');
mkdirSync(OUT, { recursive: true });
const env = {};
for (const line of readFileSync(resolve(REPO, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const SITE = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const EMAIL = env.MOYSKLAD_EMAIL;
const PASSWORD = env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('NO creds');
  process.exit(2);
}

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const p = await ctx.newPage();
p.setDefaultTimeout(45000);
p.setDefaultNavigationTimeout(120000);
const out = {};
const shot = (f) => p.screenshot({ path: resolve(OUT, f), fullPage: false }).catch(() => {});

const readLastPopup = () =>
  p.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const pops = [
      ...document.querySelectorAll('.gwt-PopupPanel, [role="menu"], .gwt-MenuBar-vertical, [class*="popup"]'),
    ].filter((e) => e.getBoundingClientRect().height > 10);
    const last = pops[pops.length - 1];
    if (!last) return [];
    return [...new Set(
      [...last.querySelectorAll('td, .gwt-MenuItem, [role="menuitem"], label, div')]
        .map((e) => norm(e.textContent))
        .filter((t) => t && t.length < 50),
    )];
  });

try {
  await p.goto(SITE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  const pass = p.locator('input[type="password"]').first();
  const login = p
    .locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])')
    .first();
  await login.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await login.fill(EMAIL).catch(() => {});
  await pass.fill(PASSWORD).catch(() => {});
  for (const s of ['button:has-text("Войти")', 'button[type="submit"]']) {
    const el = p.locator(s).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {});
      break;
    }
  }
  await p.waitForTimeout(12000);

  const base = p.url().split('#')[0];
  await p.goto(`${base}#loss`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(16000);
  const cancel = p.locator('button:has-text("Отмена")').first();
  if ((await cancel.count()) && (await cancel.isVisible().catch(() => false))) {
    await cancel.click().catch(() => {});
    await p.waitForTimeout(800);
  }
  const editHref = await p.evaluate(() => {
    const a = document.querySelector('a[href*="loss/edit"]') || document.querySelector('a[href*="loss/"]');
    return a ? a.getAttribute('href') : null;
  });
  if (editHref) await p.goto(editHref.startsWith('#') ? `${base}${editHref}` : editHref, { waitUntil: 'domcontentloaded' });
  await p.locator(':text-is("Сохранить") >> visible=true').first().waitFor({ timeout: 40000 }).catch(() => {});
  await p.waitForTimeout(12000);

  // «Наименование ▾» header menu
  const nameHdr = p.locator(':text-is("Наименование") >> visible=true').first();
  if (await nameHdr.count()) {
    await nameHdr.click().catch(() => {});
    await p.waitForTimeout(1000);
    await shot('15-name-menu.png');
    out.nameMenu = await readLastPopup();
    await p.keyboard.press('Escape').catch(() => {});
    await p.waitForTimeout(500);
  }

  // DEBUG: dump ALL position-grid header texts (+ whether each is a link) so we
  // can see how «Цена» is rendered (caret? link? plain?).
  out.headerCells = await p.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('th, td')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.top > 300 && r.top < 365 && r.width > 8;
      })
      .map((e) => ({
        text: norm(e.textContent),
        x: Math.round(e.getBoundingClientRect().left),
        isLink: !!e.querySelector('a, [class*="link"], [class*="caret"], [class*="arrow"]'),
      }))
      .filter((c) => c.text);
  });
  // click the cell that CONTAINS «Цена» (substring), read the popup.
  out.priceClickXY = await p.evaluate(() => {
    const cell = [...document.querySelectorAll('th, td, a, span, div')].find(
      (e) =>
        /^Цена/.test((e.textContent || '').trim()) &&
        (e.textContent || '').trim().length < 12 &&
        e.getBoundingClientRect().top > 300 &&
        e.getBoundingClientRect().top < 365,
    );
    if (!cell) return null;
    const r = cell.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: cell.textContent.trim() };
  });
  if (out.priceClickXY) {
    await p.mouse.click(out.priceClickXY.x, out.priceClickXY.y).catch(() => {});
    await p.waitForTimeout(1200);
    await shot('16-price-menu.png');
    out.priceMenu = await readLastPopup();
    await p.keyboard.press('Escape').catch(() => {});
    await p.waitForTimeout(500);
  }
} catch (e) {
  out.error = String(e).slice(0, 400);
}

writeFileSync(resolve(OUT, 'header-menus-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
