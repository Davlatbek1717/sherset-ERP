// Live verify — Band 2 «Kelishuv» + pick-modal price-scope checkboxes.
// Flow on /customer-orders/new:
//   1. pick modal: checkboxes render, default unchecked → save (no permanent POST)
//   2. pick modal with «Doimiy narx» → POST /products/:id/sale-price fires (200)
//   3. Kelishuv: save with no checkbox → RED warning, modal stays; «Qo'shish» +
//      5 000 → totals grow by exactly 5 000; «Ayirish» flow shrinks it back.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3100';
const PAGE = process.env.PAGE || '/customer-orders/new';
const TAG = PAGE.replace(/\W+/g, '-').replace(/^-|-$/g, '');
const SHOT = (n) =>
  `C:/Users/user/AppData/Local/Temp/claude/d--projects-moysklad/ecd49c65-6131-411b-88bd-e39b0aeb9ede/scratchpad/kel-${TAG}-${n}.png`;
const results = [];
const ok = (name, cond, extra = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

// Collect permanent-price POSTs.
const salePricePosts = [];
page.on('response', (res) => {
  if (res.request().method() === 'POST' && /\/products\/[^/]+\/sale-price/.test(res.url())) {
    salePricePosts.push({ url: res.url(), status: res.status() });
  }
});

async function pickProduct(query, { qty, price, permanent } = {}) {
  const search = page.locator('[data-test-id="position-inline-add-input"]');
  await search.click();
  await search.fill('');
  await search.type(query, { delay: 40 });
  await page.waitForTimeout(1000);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const modal = page.locator('[data-testid="product-pick-modal"]');
  await modal.waitFor({ state: 'visible', timeout: 8000 });
  if (qty != null) {
    await page.keyboard.type(qty); // replaces selected "1"
  }
  await page.keyboard.press('Enter'); // → price
  if (price != null) {
    await page.keyboard.type(price);
  }
  if (permanent) {
    await page.click('[data-test-id="product-pick-scope-permanent"]');
  }
  await page.click('[data-test-id="product-pick-save"]');
  await modal.waitFor({ state: 'hidden', timeout: 8000 });
}

function parseTotal(text) {
  // «1 234 567,89» → minor bigint
  const m = text.replace(/[^\d,]/g, '').replace(',', '.');
  return BigInt(Math.round(Number(m) * 100));
}

try {
  await page.goto(`${BASE}${PAGE}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  if (page.url().includes('/login')) {
    await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
    await page.fill('[data-test-id="login-password"]', 'admin123');
    await page.keyboard.press('Enter');
    await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });
    await page.goto(`${BASE}${PAGE}`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForTimeout(2500);

  // ── 1. pick modal: scope checkboxes render, both unchecked; plain save → no POST ──
  {
    const search = page.locator('[data-test-id="position-inline-add-input"]');
    await search.waitFor({ state: 'visible' });
    await search.click();
    await search.type('Air', { delay: 40 });
    await page.waitForTimeout(1000);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const modal = page.locator('[data-testid="product-pick-modal"]');
    await modal.waitFor({ state: 'visible', timeout: 8000 });
    const cbSale = page.locator('[data-test-id="product-pick-scope-sale"]');
    const cbPerm = page.locator('[data-test-id="product-pick-scope-permanent"]');
    ok('scope checkboxes render', (await cbSale.count()) === 1 && (await cbPerm.count()) === 1);
    ok(
      'both unchecked by default',
      !(await cbSale.isChecked()) && !(await cbPerm.isChecked()),
    );
    // mutual exclusivity: tick sale → tick permanent → sale clears
    await cbSale.click();
    await cbPerm.click();
    ok(
      'checkboxes are mutually exclusive',
      !(await cbSale.isChecked()) && (await cbPerm.isChecked()),
    );
    await cbPerm.click(); // back to default (neither)
    await page.screenshot({ path: SHOT('1-pick-scope') });
    await page.click('[data-test-id="product-pick-save"]');
    await modal.waitFor({ state: 'hidden', timeout: 8000 });
    await page.waitForTimeout(600);
    ok('plain save fires NO permanent-price POST', salePricePosts.length === 0);
  }

  // ── 2. permanent save → POST /products/:id/sale-price 2xx ──
  {
    await pickProduct('Air', { qty: '1', price: '35000', permanent: true });
    await page.waitForTimeout(1200);
    ok(
      'permanent save fires the sale-price POST',
      salePricePosts.length === 1,
      JSON.stringify(salePricePosts),
    );
    const st = salePricePosts[0]?.status ?? 0;
    ok('sale-price POST succeeds (2xx)', st >= 200 && st < 300, `status=${st}`);
    await page.screenshot({ path: SHOT('2-permanent-saved') });
  }

  // ── 3. Kelishuv modal ──
  {
    const btn = page.locator('[data-test-id="position-agreement-button"]');
    ok('Kelishuv button renders in the footer bar', (await btn.count()) === 1);
    const totalsBefore = await page
      .locator('[data-test-id="position-agreement-total"]')
      .textContent()
      .catch(() => null); // not yet in DOM — modal closed
    await btn.click();
    const modal = page.locator('[data-testid="position-agreement-modal"]');
    await modal.waitFor({ state: 'visible', timeout: 8000 });
    const totalText = (await page
      .locator('[data-test-id="position-agreement-total"]')
      .textContent()) ?? '';
    ok('modal shows the document total', totalText.trim().length > 0, `"${totalText.trim()}"`);
    const before = parseTotal(totalText);

    // amount field auto-focused?
    const amountFocused = await page.evaluate(
      () =>
        document.activeElement?.getAttribute('data-test-id') === 'position-agreement-amount',
    );
    ok('cursor auto-focuses the amount field', amountFocused);

    // Save with NO checkbox → red warning, modal stays open
    await page.click('[data-test-id="position-agreement-save"]');
    await page.waitForTimeout(300);
    ok('modal stays open when no checkbox chosen', await modal.isVisible());
    const warnClass = await page
      .locator('[data-test-id="position-agreement-add"]')
      .evaluate((el) => el.parentElement?.className ?? '');
    ok(
      'both checkboxes warn in red',
      warnClass.includes('ms-action-destructive'),
      warnClass.slice(0, 80),
    );
    await page.screenshot({ path: SHOT('3-red-warning') });

    // «Qo'shish» + 5 000 → Enter (amount field) → applied
    await page.click('[data-test-id="position-agreement-add"]');
    await page.fill('[data-test-id="position-agreement-amount"]', '5000');
    await page.keyboard.press('Enter');
    await modal.waitFor({ state: 'hidden', timeout: 8000 });
    await page.waitForTimeout(500);

    // Re-open to read the NEW total from the same element.
    await btn.click();
    await modal.waitFor({ state: 'visible', timeout: 8000 });
    const afterText = (await page
      .locator('[data-test-id="position-agreement-total"]')
      .textContent()) ?? '';
    const after = parseTotal(afterText);
    ok(
      'total grew by exactly 5 000,00 (proportional spread)',
      after - before === 500000n,
      `before=${before} after=${after}`,
    );
    await page.screenshot({ path: SHOT('4-after-add') });

    // «Ayirish» 3 000 → total shrinks by exactly 3 000
    await page.click('[data-test-id="position-agreement-subtract"]');
    await page.fill('[data-test-id="position-agreement-amount"]', '3000');
    await page.keyboard.press('Enter');
    await modal.waitFor({ state: 'hidden', timeout: 8000 });
    await page.waitForTimeout(500);
    await btn.click();
    await modal.waitFor({ state: 'visible', timeout: 8000 });
    const after2 = parseTotal(
      (await page.locator('[data-test-id="position-agreement-total"]').textContent()) ?? '',
    );
    ok(
      'subtract shrinks the total by exactly 3 000,00',
      after - after2 === 300000n,
      `after=${after} after2=${after2}`,
    );
    await page.keyboard.press('Escape');
    await page.screenshot({ path: SHOT('5-after-subtract') });
  }
} catch (e) {
  ok('EXCEPTION', false, String(e).slice(0, 300));
  await page.screenshot({ path: SHOT('error') }).catch(() => {});
} finally {
  console.log('\n=== RESULTS ===');
  console.log(results.join('\n'));
  await browser.close();
}
