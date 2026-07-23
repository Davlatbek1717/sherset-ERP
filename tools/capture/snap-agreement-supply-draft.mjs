/** One-off: agreement button on a DRAFT (unconducted) supply. */
import { chromium } from 'playwright';
const ID = process.env.DOC_ID || '23ffe4a8-9395-4b10-9216-9b9dba22ae8f';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
try {
  await page.goto('http://localhost:3100/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });
  await page.goto(`http://localhost:3100/supplies/${ID}`, { waitUntil: 'domcontentloaded' });
  const btn = page.locator('[data-test-id="position-agreement-button"]');
  await btn.waitFor({ state: 'visible', timeout: 25000 });
  await btn.click();
  const opened = await page
    .locator('[data-test-id="position-agreement-save"]')
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  console.log(opened ? 'PASS supplies/[id] qoralama: Kelishuv tugma + modal' : 'FAIL modal ochilmadi');
} catch (e) {
  console.log('FAIL', String(e).slice(0, 150));
} finally {
  await browser.close();
}
