// READ-ONLY re-ground of the REAL moysklad CUSTOMER-ORDER DETAIL position area.
// The first capture (doc-detail-ground.mjs) had the «Новый дизайн» promo panel
// covering the right side, so the totals placement (right-sidebar vs bottom-
// footer) and the «Вес/Объём/Прибыль» footer could NOT be confirmed. This run
// dismisses the promo, then MEASURES the bounding boxes of the position table vs
// the «Итого» totals block (falsifiable layout check) and clips the area cleanly.
// NEVER clicks Сохранить/Удалить. Fresh login from .env.local (creds never printed).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs', 'audits', 'customerorder-detail-live-2026-06-24');
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

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
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
  await loginEl.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await loginEl.click().catch(() => {});
  await loginEl.fill(EMAIL).catch(() => {});
  await passEl.fill(PASSWORD).catch(() => {});
  if ((await loginEl.inputValue().catch(() => '')).length === 0) {
    await loginEl.click().catch(() => {});
    await page.keyboard.type(EMAIL, { delay: 20 }).catch(() => {});
  }
  let submitted = false;
  for (const s of ['button:has-text("Войти")', 'button[type="submit"]', 'input[type="submit"]']) {
    const el = page.locator(s).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {});
      submitted = true;
      break;
    }
  }
  if (!submitted) await passEl.press('Enter').catch(() => {});
  await page.waitForTimeout(12000);

  const base = page.url().split('#')[0];
  await page.goto(`${base}#customerorder`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(15000);

  // open first row (robust loop — same as doc-detail-ground; do NOT touch the
  // list-view design toggle here, it breaks the open flow).
  let opened = false;
  for (let i = 0; i < 10 && !opened; i++) {
    for (const s of ['.slick-row .slick-cell', '.slick-row', '.gwt-cell', 'a[href*="customerorder"]']) {
      const el = page.locator(s).first();
      if (await el.count()) {
        await el.dblclick({ timeout: 3500 }).catch(() => {});
        await page.waitForTimeout(1000);
        if ((await page.locator(':text-is("Создать документ") >> visible=true').count()) > 0) break;
      }
    }
    await page.waitForTimeout(3500);
    opened = (await page.locator(':text-is("Создать документ") >> visible=true').count()) > 0;
  }
  out.detailOpened = opened;
  out.detailUrl = page.url();
  await page.waitForTimeout(2000);

  // MEASURE FIRST (promo only obscures the painted pixels, not DOM geometry).
  await shot('10-with-promo-full.png', { fullPage: true });

  // dismiss the promo popup ONLY (close its own × / «Старый дизайн» button if it is
  // inside a popup panel, not the list toolbar) — best-effort for a clean screenshot.
  for (const label of ['Старый дизайн', 'Понятно', 'Не сейчас', 'Скрыть']) {
    const el = page.locator(`:text-is("${label}") >> visible=true`).first();
    if (await el.count().catch(() => 0)) {
      await el.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(1500);
      out.dismissed = label;
      break;
    }
  }
  await page.waitForTimeout(1000);
  await shot('10-clean-full.png', { fullPage: true });

  // FALSIFIABLE LAYOUT CHECK: bounding box of the position table vs the «Итого» total.
  out.layout = await page.evaluate(() => {
    const txt = (re) =>
      [...document.querySelectorAll('*')].find(
        (e) => e.children.length === 0 && re.test((e.textContent || '').trim()),
      );
    const near = (el, re, up = 6) => {
      let e = el;
      for (let i = 0; i < up && e; i++) {
        if (re.test((e.textContent || '').replace(/\s+/g, ' '))) return e;
        e = e.parentElement;
      }
      return el;
    };
    const r = (e) => {
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
    };
    // the position grid: SlickGrid viewport, else a table with «Наименование» header
    const grid =
      document.querySelector('.slick-viewport, .slick-grid') ||
      near(txt(/^Наименование$/) || document.body, /Наименование/, 8);
    const itogo = txt(/^Итого/) || txt(/Промежуточный итог/);
    const itogoBox = itogo ? near(itogo, /Итого/, 4) : null;
    const pribyl = txt(/Прибыль/);
    const ves = txt(/^Вес:/);
    const obyem = txt(/^Объ[её]м:/);
    return {
      grid: r(grid),
      itogo: r(itogoBox),
      pribyl: r(pribyl),
      ves: r(ves),
      obyem: r(obyem),
      pribylText: pribyl ? (pribyl.textContent || '').trim().slice(0, 40) : null,
      vesText: ves ? (ves.textContent || '').trim().slice(0, 40) : null,
      obyemText: obyem ? (obyem.textContent || '').trim().slice(0, 40) : null,
    };
  });

  // clip the bottom area (table footer + totals) once we know the table position
  const g = out.layout?.grid;
  if (g) {
    const y = Math.max(0, g.y - 10);
    await shot('11-table-and-totals.png', {
      clip: { x: 0, y, width: 1660, height: Math.min(620, 1000 - y) },
    });
  }
  // also clip the toolbar + owner + «Смотрит» area (top strip)
  await shot('12-toolbar-owner.png', { clip: { x: 0, y: 70, width: 1660, height: 60 } });

  // name-cell format: read the first few position-row name cells verbatim
  out.nameCells = await page
    .$$eval('.slick-row', (rows) =>
      rows.slice(0, 5).map((row) => (row.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90)),
    )
    .catch(() => []);
} catch (e) {
  out.error = String(e).slice(0, 400);
}
writeFileSync(resolve(OUT, 'co-totals-layout.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
