import { chromium } from 'playwright';

const BASE = 'http://localhost:3100';
const OUT = 'D:/projects/moysklad/docs/audits/small-fn-parity-audit-2026-07-06';
const log = (...a) => console.log('[verify]', ...a);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
const netErrors = [];
page.on('response', (r) => {
  if (r.status() >= 500) netErrors.push(`${r.status()} ${r.url()}`);
});

try {
  log('login…');
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="login-email"]', { timeout: 25000 });
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('[data-test-id="login-submit"]');
  await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});
  log('logged in, url=', page.url());

  await page.goto(`${BASE}/customer-orders/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="position-inline-add-input"]', { timeout: 25000 });
  await page.waitForTimeout(2500);
  log('on CO/new');

  const input = page.locator('[data-test-id="position-inline-add-input"]');
  let added = false;
  for (const term of ['a', 'o', 'e', '1', 'i', 'test', 'tovar', 's']) {
    await input.click();
    await input.fill('');
    await input.type(term, { delay: 40 });
    await page.waitForTimeout(1400);
    const items = page.locator('[data-test-id="position-inline-add-suggestions"] li button');
    const n = await items.count();
    log(`term "${term}" → ${n} suggestions`);
    if (n > 0) {
      await items.first().click();
      added = true;
      break;
    }
  }
  if (!added) {
    log('!! no product suggestions — product search likely failing. net 5xx:', netErrors.slice(0, 6));
    await page.screenshot({ path: `${OUT}/verify-oversell-NO-PRODUCTS.png` });
    throw new Error('no product suggestions');
  }
  await page.waitForTimeout(1800);

  // set qty very high → guaranteed oversell (the row auto-focuses its qty input)
  await page.keyboard.press('Control+A').catch(() => {});
  await page.keyboard.type('99999', { delay: 30 });
  await page.keyboard.press('Tab');
  await page.waitForTimeout(1800);

  const bannerVisible = await page
    .locator('text=saqlab bo')
    .first()
    .isVisible()
    .catch(() => false);

  const redRows = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-test-id^="position-row-"]'));
    return rows
      .map((r) => getComputedStyle(r).backgroundColor)
      .filter((bg) => {
        const m = bg.match(/rgba?\(([^)]+)\)/);
        if (!m) return false;
        const [red, g, b] = m[1].split(',').map((x) => Number.parseFloat(x));
        return red > g + 15 && red > b + 15;
      });
  });

  const saveDisabled = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter((b) =>
      /Сохранить|Saqla/i.test(b.textContent || ''),
    );
    return btns.map((b) => b.disabled);
  });

  log('block banner visible:', bannerVisible);
  log('red-tinted rows:', redRows.length, redRows);
  log('save button disabled states:', saveDisabled);

  await page.screenshot({ path: `${OUT}/verify-oversell-RESULT.png`, fullPage: false });
  log('screenshot →', `${OUT}/verify-oversell-RESULT.png`);

  if (bannerVisible || redRows.length > 0) {
    log('RESULT: PASS — oversell warning is active (red row and/or block banner).');
  } else {
    log('RESULT: INCONCLUSIVE — no red row / banner. net 5xx:', netErrors.slice(0, 6));
  }
} catch (e) {
  log('ERROR:', e.message);
  await page.screenshot({ path: `${OUT}/verify-oversell-ERROR.png` }).catch(() => {});
} finally {
  await browser.close();
}
