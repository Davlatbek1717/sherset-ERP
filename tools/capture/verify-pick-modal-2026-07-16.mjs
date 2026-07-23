// Live verify — Band 1 product pick modal on /customer-orders/new.
// Flow: type product → suggestion → pick → modal (Остаток/Цена/Кол-во=1/Цена=1)
//   → type qty, Enter → price, Enter → Save, Enter → row appended with qty+price.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3100';
const PAGE = process.env.PAGE || '/customer-orders/new';
const TAG = PAGE.replace(/\W+/g, '-').replace(/^-|-$/g, '');
const SHOT = (n) =>
  `C:/Users/user/AppData/Local/Temp/claude/d--projects-moysklad/ecd49c65-6131-411b-88bd-e39b0aeb9ede/scratchpad/pick-${TAG}-${n}.png`;
const results = [];
const ok = (name, cond, extra = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

try {
  // ── login ──
  await page.goto(`${BASE}${PAGE}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  if (page.url().includes('/login')) {
    await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
    await page.fill('[data-test-id="login-password"]', 'admin123');
    await page.keyboard.press('Enter');
    await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });
    await page.goto(`${BASE}${PAGE}`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForTimeout(2500); // defaults autofill

  // ── type a product name → suggestion dropdown ──
  const search = page.locator('[data-test-id="position-inline-add-input"]');
  await search.waitFor({ state: 'visible' });
  await search.click();
  await search.type('Air', { delay: 40 });
  await page.waitForTimeout(1000); // debounce 200ms + fetch
  const sugg = page.locator('[data-test-id="position-inline-add-suggestions"]');
  const hasSugg = await sugg.isVisible().catch(() => false);
  ok('suggestion dropdown appears for "Air"', hasSugg);
  await page.screenshot({ path: SHOT('1-suggestions') });

  // ── pick first suggestion (ArrowDown highlights, Enter picks) ──
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  // ── modal should open (Modal primitive emits data-testid, NO hyphen) ──
  const modal = page.locator('[data-testid="product-pick-modal"]');
  await modal.waitFor({ state: 'visible', timeout: 8000 });
  ok('pick modal opens on selection', await modal.isVisible());

  // read fields
  const qty = page.locator('[data-test-id="product-pick-qty"]');
  const price = page.locator('[data-test-id="product-pick-price"]');
  const stockText = (await page.locator('[data-test-id="product-pick-stock"]').textContent()) || '';
  const origPrice =
    (await page.locator('[data-test-id="product-pick-orig-price"]').textContent()) || '';
  const qty0 = await qty.inputValue();
  const price0 = await price.inputValue();
  ok('qty defaults to "1"', qty0 === '1', `got "${qty0}"`);
  ok('sale price defaults to "1"', price0 === '1', `got "${price0}"`);
  ok('stock (Остаток) shown', stockText.trim().length > 0, `"${stockText.trim()}"`);
  ok('original price (Цена) shown', origPrice.trim().length > 0, `"${origPrice.trim()}"`);
  // qty should be the focused element (auto-focus)
  const qtyFocused = await page.evaluate(
    () => document.activeElement?.getAttribute('data-test-id') === 'product-pick-qty',
  );
  ok('cursor auto-focuses qty on open', qtyFocused);
  await page.screenshot({ path: SHOT('2-modal') });

  // ── cursor flow: type qty (replaces via select-all) → Enter → price → Enter → Save → Enter ──
  await page.keyboard.type('3'); // replaces the selected "1"
  const qtyAfter = await qty.inputValue();
  ok('typing replaces qty from scratch (select-all)', qtyAfter === '3', `got "${qtyAfter}"`);
  await page.keyboard.press('Enter');
  const priceFocused = await page.evaluate(
    () => document.activeElement?.getAttribute('data-test-id') === 'product-pick-price',
  );
  ok('Enter on qty moves cursor to price', priceFocused);
  await page.keyboard.type('5000'); // replaces the selected "1"
  const priceAfter = await price.inputValue();
  ok('typing replaces price from scratch', priceAfter === '5000', `got "${priceAfter}"`);
  await page.keyboard.press('Enter');
  const saveFocused = await page.evaluate(
    () => document.activeElement?.getAttribute('data-test-id') === 'product-pick-save',
  );
  ok('Enter on price moves cursor to Save button', saveFocused);
  await page.keyboard.press('Enter'); // save

  // ── modal closes + a row is appended ──
  await modal.waitFor({ state: 'hidden', timeout: 8000 });
  ok('modal closes after save', !(await modal.isVisible().catch(() => true)));
  await page.waitForTimeout(500);
  const rowQty = page.locator('[data-test-id^="pos-"][data-test-id$="-qty"]').first();
  const rowQtyVal = await rowQty.inputValue().catch(() => '');
  ok('row appended with entered qty (3)', rowQtyVal === '3', `got "${rowQtyVal}"`);
  const rowPrice = page.locator('[data-test-id^="pos-"][data-test-id$="-price"]').first();
  const rowPriceVal = (await rowPrice.inputValue().catch(() => '')) || '';
  ok('row price reflects entered sale price', /5\s?000/.test(rowPriceVal), `got "${rowPriceVal}"`);
  await page.screenshot({ path: SHOT('3-row-added') });

  // ── inline editing still works (edit qty in the grid) ──
  await rowQty.click();
  await rowQty.fill('7');
  const edited = await rowQty.inputValue();
  ok('inline grid editing still works after modal save', edited === '7', `got "${edited}"`);
  await page.screenshot({ path: SHOT('4-inline-edit') });
} catch (e) {
  ok('EXCEPTION', false, String(e).slice(0, 300));
  await page.screenshot({ path: SHOT('error') }).catch(() => {});
} finally {
  console.log('\n=== RESULTS ===');
  console.log(results.join('\n'));
  await browser.close();
}
