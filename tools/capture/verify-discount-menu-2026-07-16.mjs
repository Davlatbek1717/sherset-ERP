// Live verify — Band 3 «Скидка» header button + Скидка/наценка modal.
// Flow: open PAGE → add product via pick modal → click «Скидка» header →
//   modal opens → enter 10% discount → apply → row discount becomes 10.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3100';
const PAGE = process.env.PAGE || '/demands/new';
const TAG = PAGE.replace(/\W+/g, '-').replace(/^-|-$/g, '');
const SHOT = (n) =>
  `C:/Users/user/AppData/Local/Temp/claude/d--projects-moysklad/ecd49c65-6131-411b-88bd-e39b0aeb9ede/scratchpad/disc-${TAG}-${n}.png`;
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

  // ── add a product row (via the Band 1 pick modal) so discount has a target ──
  const search = page.locator('[data-test-id="position-inline-add-input"]');
  await search.waitFor({ state: 'visible' });
  await search.click();
  await search.type('Air', { delay: 40 });
  await page.waitForTimeout(1000);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const pickModal = page.locator('[data-testid="product-pick-modal"]');
  await pickModal.waitFor({ state: 'visible', timeout: 8000 });
  await page.keyboard.press('Enter'); // qty 1 → price
  await page.keyboard.press('Enter'); // price 1 → save btn
  await page.keyboard.press('Enter'); // save
  await pickModal.waitFor({ state: 'hidden', timeout: 8000 });
  ok('row added via pick modal', true);

  // ── «Скидка» column header is a button; click opens the modal ──
  const trigger = page.locator('[data-test-id="position-discount-menu"]');
  ok('«Скидка» header trigger exists', (await trigger.count()) === 1);
  await trigger.click();
  const modal = page.locator('[data-testid="position-discount-modal"]');
  await modal.waitFor({ state: 'visible', timeout: 8000 });
  ok('Скидка/наценка modal opens', await modal.isVisible());
  const box = await modal.boundingBox();
  ok('modal width measured', !!box, `width=${box?.width}px`);
  await page.screenshot({ path: SHOT('1-modal') });
  await modal.screenshot({ path: SHOT('1b-modal-only') });

  // ── enter 10% discount and apply ──
  await page.fill('[data-test-id="position-discount-input-discount"]', '10');
  await page.click('[data-test-id="position-discount-apply"]');
  await modal.waitFor({ state: 'hidden', timeout: 8000 });
  ok('modal closes on apply', true);
  await page.waitForTimeout(400);
  const rowDisc = page.locator('[data-test-id^="pos-"][data-test-id$="-discount"]').first();
  const discVal = await rowDisc.inputValue().catch(() => '');
  ok('row discount set to 10', discVal === '10', `got "${discVal}"`);
  await page.screenshot({ path: SHOT('2-applied') });
} catch (e) {
  ok('EXCEPTION', false, String(e).slice(0, 300));
  await page.screenshot({ path: SHOT('error') }).catch(() => {});
} finally {
  console.log('\n=== RESULTS ===');
  console.log(results.join('\n'));
  await browser.close();
}
