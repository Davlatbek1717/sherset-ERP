// READ-ONLY ground-truth for the product card «История» tab. Opens products from
// the GWT CellTable goods list (name cell = td idx 5 → #good/edit?id=), clicks the
// «История» tab, captures its real structure (headers + rows + sub-section titles).
// Tries several products until one has populated history (else reports the empty shape).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs', 'audits', 'product-history-live-2026-06-25');
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
const out = { products: [] };
const shot = (f, opts) => page.screenshot({ path: resolve(OUT, f), ...opts }).catch(() => {});

const grabHistory = async () => {
  return page.evaluate(() => {
    // sub-section titles (e.g. «Закупки» / «Продажи» headings), grid/table headers,
    // and the count of data rows currently shown in the История panel.
    const headers = [];
    document
      .querySelectorAll('.slick-column-name, .slick-header-column, th, [class*=headerCell]')
      .forEach((h) => {
        const t = (h.getAttribute('title') || h.textContent || '').replace(/\s+/g, ' ').trim();
        if (t && t.length < 40) headers.push(t);
      });
    // visible short bold/section-ish leaves that might be sub-table titles
    const titles = [];
    for (const e of document.querySelectorAll('h1,h2,h3,h4,b,strong,.gwt-Label,div,span,td')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
      if (
        t &&
        t.length < 30 &&
        /Закупк|Продаж|Перемещ|Списан|Оприходов|Инвентар|Возврат|Производ|Розниц|История|Документ|движени/i.test(
          t,
        ) &&
        e.offsetParent
      )
        titles.push(t);
    }
    const dataRows = document.querySelectorAll('.slick-row, .cellTableEvenRow, .cellTableOddRow, tbody tr').length;
    // full visible text of the right panel area (best-effort) for manual read
    const panelText = (document.body.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      headers: [...new Set(headers)],
      titles: [...new Set(titles)],
      dataRows,
      hasHistoryWord: /История/.test(panelText),
    };
  });
};

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

  const rowCount = await page.locator('.cellTableEvenRow').count();
  out.rowCount = rowCount;

  // try up to 6 products; stop at the first with a populated История.
  let captured = 0;
  for (let i = 0; i < Math.min(6, rowCount); i++) {
    // re-open the list each iteration (clicking a product navigates away)
    if (i > 0) {
      await page.goto(`${base}#good/list`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.cellTableEvenRow', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(2500);
    }
    const row = page.locator('.cellTableEvenRow').nth(i);
    const cells = row.locator('td');
    const name = (await cells.nth(5).textContent().catch(() => '') || '').trim().slice(0, 40);
    await cells.nth(5).click().catch(() => {});
    await page.waitForURL(/#good\/edit/, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(7000);
    if (!/#good\/edit/.test(page.url())) continue;

    // click the «История» tab
    const histTab = page.locator(':text-matches("^История", "i") >> visible=true').last();
    if (!(await histTab.count())) continue;
    await histTab.click().catch(() => {});
    await page.waitForTimeout(4000);
    const info = await grabHistory();
    const rec = { name, url: page.url().split('?')[1] || page.url(), ...info };
    out.products.push(rec);
    // screenshot the first 2 products' История + the first one with rows
    if (captured < 3) {
      await shot(`hist-${i}-${name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 16)}.png`, { fullPage: false });
      await shot(`hist-${i}-full.png`, { fullPage: true });
      captured++;
    }
    // stop early once we have a product whose История shows data rows
    if (info.dataRows > 0 && info.titles.length) {
      out.populatedAt = name;
      break;
    }
  }
} catch (e) {
  out.error = String(e).slice(0, 400);
}
writeFileSync(resolve(OUT, 'history-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
