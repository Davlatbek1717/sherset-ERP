// Live moysklad.uz grounding for the «Штрихкоды товара» card on the product
// create form (#good/edit?new&type=Good). Reads creds from .env.local (NEVER
// printed). READ-ONLY — never clicks Сохранить (an added barcode row on an
// unsaved form is not persisted). Captures the card HTML + a screenshot + the
// barcode-type dropdown options + the «➕ Штрихкод» add-row structure.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'docs/audits/product-barcodes-live-2026-06-22');
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
const shot = async (page, name, full = false) =>
  page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full }).catch((e) => log('shot fail', name, e.message));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);

try {
  log('1. goto', URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  log('2. login as', EMAIL);
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
  for (const s of ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Войти")', 'button:has-text("Вход")', '.login-button']) {
    const el = page.locator(s).first();
    if (await el.count() && await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); submitted = true; break; }
  }
  if (!submitted) await passEl.press('Enter').catch(() => {});
  await page.waitForTimeout(10000);
  log('   url after login:', page.url());

  log('3. open product create form');
  const base = page.url().split('#')[0];
  await page.goto(base + '#good', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.goto(base + '#good/edit?new&type=Good', { waitUntil: 'domcontentloaded' }).catch(() => {});
  log('   waiting for GWT form…');
  await page.waitForSelector('text=Сохранить', { timeout: 60000 }).catch(() => log('   no Сохранить'));
  await page.waitForTimeout(4000);
  await shot(page, '00-form-initial', true);

  // Expand the «Штрихкоды» card if collapsed (click its header).
  log('4. expand Штрихкоды card');
  const bcHeader = page.locator('text=/Штрихкод/').first();
  if (await bcHeader.count()) {
    await bcHeader.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    await bcHeader.click().catch(() => {});
    await page.waitForTimeout(1500);
  } else {
    log('   Штрихкод header NOT found');
  }
  await shot(page, '01-barcodes-card', true);

  // Capture the card region HTML: the element whose text contains "Штрихкод" → walk up
  // to a reasonable container and dump its outerHTML + visible text.
  const cardInfo = await page.evaluate(() => {
    const all = [...document.querySelectorAll('*')];
    const hit = all.find((e) => /Штрихкоды/.test(e.textContent || '') && (e.children.length <= 3));
    if (!hit) return { found: false };
    // Walk up ~6 levels to capture the whole card.
    let card = hit;
    for (let i = 0; i < 6 && card.parentElement; i++) card = card.parentElement;
    const buttons = [...card.querySelectorAll('button, [role="button"], a')].map((b) => (b.textContent || '').trim()).filter(Boolean);
    const inputs = [...card.querySelectorAll('input, select')].map((el) => ({ tag: el.tagName, type: el.type || '', ph: el.getAttribute('placeholder') || '', val: (el.value || '').slice(0, 40) }));
    return { found: true, text: (card.innerText || '').slice(0, 1200), html: card.outerHTML.slice(0, 6000), buttons, inputs };
  }).catch((e) => ({ found: false, err: e.message }));
  fs.writeFileSync(path.join(OUT, '01-barcodes-card.json'), JSON.stringify(cardInfo, null, 2));
  log('   card found:', cardInfo.found, 'buttons:', cardInfo.buttons);

  // Click «Штрихкод» add button to reveal a typed row, then capture the new row.
  log('5. click + Штрихкод add');
  const addBtn = page.locator('text=/^\\s*\\+?\\s*Штрихкод\\s*$/').first();
  let addClicked = false;
  if (await addBtn.count()) { await addBtn.click().catch(() => {}); addClicked = true; await page.waitForTimeout(1500); }
  log('   add clicked:', addClicked);
  await shot(page, '02-after-add-barcode', true);

  const rowInfo = await page.evaluate(() => {
    const all = [...document.querySelectorAll('*')];
    const hit = all.find((e) => /Штрихкоды/.test(e.textContent || '') && (e.children.length <= 3));
    if (!hit) return { found: false };
    let card = hit;
    for (let i = 0; i < 6 && card.parentElement; i++) card = card.parentElement;
    return { found: true, text: (card.innerText || '').slice(0, 1500), html: card.outerHTML.slice(0, 9000) };
  }).catch((e) => ({ found: false, err: e.message }));
  fs.writeFileSync(path.join(OUT, '02-barcodes-card-after-add.json'), JSON.stringify(rowInfo, null, 2));

  // Capture the barcode-TYPE option list. First check for a native <select>
  // whose options include EAN13 (the row type dropdown). If GWT-combo, click it.
  log('6. capture barcode type options');
  const nativeOpts = await page.evaluate(() => {
    for (const sel of document.querySelectorAll('select')) {
      const opts = [...sel.options].map((o) => o.textContent.trim());
      if (opts.some((o) => /EAN13/i.test(o))) return opts;
    }
    return null;
  }).catch(() => null);
  let typeList = nativeOpts;
  if (!nativeOpts) {
    // GWT combo: click the element showing "EAN13", capture the popup list.
    const combo = page.locator('text=/^EAN13$/').first();
    await combo.click().catch(() => {});
    await page.waitForTimeout(1000);
    typeList = await page.evaluate(() => {
      const pop = document.querySelector('.selector-popup, .gwt-PopupPanel, [class*="popup"], [class*="dropdown"]');
      if (!pop) return null;
      return [...pop.querySelectorAll('*')].map((e) => (e.childElementCount === 0 ? e.textContent.trim() : '')).filter(Boolean);
    }).catch(() => null);
  }
  fs.writeFileSync(path.join(OUT, '03-type-options.json'), JSON.stringify({ native: !!nativeOpts, options: typeList }, null, 2));
  await shot(page, '03-type-dropdown', true);
  log('   barcode type options:', JSON.stringify(typeList));

  log('DONE →', OUT);
} catch (e) {
  log('ERROR:', e.message);
  await shot(page, 'zz-error', true);
} finally {
  await browser.close();
}
