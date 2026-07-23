// Live verify — owner 2026-07-18 sequential entry chain on a position editor page.
// Chain: search → pick suggestion → MODAL (qty «1» selected → type → Enter →
//   price «1» selected → type → Enter = SAVE, 2 Enters) → row appended → focus
//   lands on the TABLE row's «Кол-во» (selected) → Enter → row «Цена» (selected)
//   → Enter → back to the search input (query selected). Esc in the modal adds
//   nothing and returns focus to the search input.
// Env: PAGE=/purchase-orders/new  QUERY=AirPods  SALES=1 (expect price-scope
//   checkboxes; default absent)  BASE=http://localhost:3100
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3100';
const PAGE = process.env.PAGE || '/customer-orders/new';
const QUERY = process.env.QUERY || 'AirPods';
const SALES = process.env.SALES === '1';
const TAG = PAGE.replace(/\W+/g, '-').replace(/^-|-$/g, '');
const SHOT = (n) => `tasdiq-chain-${TAG}-${n}.png`;
const results = [];
let failed = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) failed++;
  const line = `${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`;
  results.push(line);
  console.log(line);
};
const active = (page) =>
  page.evaluate(() => {
    const ae = document.activeElement;
    return {
      testId: ae?.getAttribute('data-test-id') || ae?.getAttribute('data-testid') || null,
      value: ae && 'value' in ae ? ae.value : null,
      selected:
        ae && 'selectionStart' in ae && ae.value != null
          ? ae.selectionStart === 0 && ae.selectionEnd === ae.value.length && ae.value.length > 0
          : false,
    };
  });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

try {
  await page.goto(`${BASE}${PAGE}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  if (page.url().includes('/login')) {
    await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
    await page.fill('[data-test-id="login-password"]', 'admin123');
    await page.click('button[type=submit]');
    await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });
    await page.goto(`${BASE}${PAGE}`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForTimeout(2500); // defaults autofill

  const search = page.locator('input[data-test-id$="-add-input"]');
  await search.waitFor({ state: 'visible' });

  // ── 1. modal path ──
  await search.click();
  await search.fill('');
  await search.type(QUERY, { delay: 30 });
  await page.waitForTimeout(900); // debounce + fetch
  const firstSugg = page
    .locator('[data-test-id="position-inline-add-suggestions"] li button')
    .first();
  await firstSugg.waitFor({ state: 'visible', timeout: 8000 });
  const rowsBefore = await page.locator('[data-test-id^="position-row-"]').count();
  await firstSugg.dispatchEvent('mousedown');

  const modal = page.locator('[data-testid="product-pick-modal"]');
  await modal.waitFor({ state: 'visible', timeout: 8000 });
  ok('modal opens on suggestion click', true);
  let a = await active(page);
  ok(
    'modal qty focused, «1» selected',
    a.testId === 'product-pick-qty' && a.value === '1' && a.selected,
    JSON.stringify(a),
  );

  // scope checkboxes: sales docs (UZS) show them, others must not
  const scopeCount = await modal.locator('[data-test-id^="product-pick-scope-"]').count();
  if (SALES)
    ok('price-scope checkboxes present (sales doc)', scopeCount >= 1, `count=${scopeCount}`);
  else ok('price-scope checkboxes ABSENT (non-sales doc)', scopeCount === 0, `count=${scopeCount}`);

  await page.keyboard.type('3');
  await page.keyboard.press('Enter');
  a = await active(page);
  ok(
    'Enter on qty → price focused, «1» selected',
    a.testId === 'product-pick-price' && a.selected,
    JSON.stringify(a),
  );
  await page.keyboard.type('5000');
  await page.keyboard.press('Enter'); // ← 2nd Enter = SAVE (owner 2026-07-18)
  await modal.waitFor({ state: 'hidden', timeout: 8000 });
  ok('price-Enter saves + closes the modal (2 Enters total)', true);
  await page.waitForTimeout(450); // close animation + onCloseAutoFocus hand-off

  const rowsAfter = await page.locator('[data-test-id^="position-row-"]').count();
  ok('row appended', rowsAfter === rowsBefore + 1, `rows ${rowsBefore}→${rowsAfter}`);
  a = await active(page);
  const onRowQty = /^pos-.+-qty$/.test(a.testId || '');
  ok(
    'focus lands on the NEW row «Кол-во», value selected',
    onRowQty && a.value === '3' && a.selected,
    JSON.stringify(a),
  );
  await page.screenshot({ path: SHOT('1-row-qty-focused') });

  // ── 2. in-table chain ──
  await page.keyboard.press('Enter');
  a = await active(page);
  ok(
    'table Enter on «Кол-во» → row «Цена» selected',
    /^pos-.+-price$/.test(a.testId || '') && a.selected,
    JSON.stringify(a),
  );
  await page.keyboard.type('7000');
  await page.keyboard.press('Enter');
  a = await active(page);
  ok(
    'table Enter on «Цена» → search input, query selected',
    /-add-input$/.test(a.testId || '') && a.selected,
    JSON.stringify(a),
  );
  await page.screenshot({ path: SHOT('2-back-in-search') });

  // ── 3. Esc-cancel path ──
  await search.fill('');
  await search.type(QUERY, { delay: 30 });
  await page.waitForTimeout(900);
  await firstSugg.waitFor({ state: 'visible', timeout: 8000 });
  await firstSugg.dispatchEvent('mousedown');
  await modal.waitFor({ state: 'visible', timeout: 8000 });
  await page.keyboard.press('Escape');
  await modal.waitFor({ state: 'hidden', timeout: 8000 });
  await page.waitForTimeout(450);
  const rowsAfterEsc = await page.locator('[data-test-id^="position-row-"]').count();
  ok('Esc adds NO row', rowsAfterEsc === rowsAfter, `rows ${rowsAfter}→${rowsAfterEsc}`);
  a = await active(page);
  ok(
    'Esc returns focus to the search input',
    /-add-input$/.test(a.testId || ''),
    JSON.stringify(a),
  );
} catch (e) {
  ok('EXCEPTION', false, String(e).slice(0, 300));
  await page.screenshot({ path: SHOT('error') }).catch(() => {});
} finally {
  console.log(
    `\n=== ${PAGE} — ${results.filter((r) => r.startsWith('PASS')).length}/${results.length} PASS ===`,
  );
  await browser.close();
  process.exit(failed ? 1 : 0);
}
