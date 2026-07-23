// FE render cert — local app (localhost:3130) + seeded CERTPNL data.
// Login, open /reports/profitability, verify all 4 tabs render, chart draws,
// numbers appear; capture console errors. Screenshots to docs/audits.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve('D:/projects/moysklad/docs/audits/profitability-1to1-2026-07-05');
mkdirSync(OUT, { recursive: true });
const WEB = 'http://localhost:3130';
const out = { consoleErrors: [], tabs: {} };

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' }).then((c) => c.newPage());
page.setDefaultTimeout(45000);
page.on('console', (m) => { if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => out.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));

const shot = (f) => page.screenshot({ path: resolve(OUT, f), fullPage: false }).catch(() => {});

try {
  await page.goto(`${WEB}/reports/profitability`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  // login if bounced
  if (await page.locator('input[type="password"]').first().isVisible().catch(() => false)) {
    await page.fill('input[type="email"], input[name="email"]', 'admin@demo.local').catch(() => {});
    await page.fill('input[type="password"]', 'admin123');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(6000);
    await page.goto(`${WEB}/reports/profitability`, { waitUntil: 'domcontentloaded' });
  }
  // wait for the report to load (title + a data row or empty)
  await page.waitForSelector('[data-test-id="prof-tab-product"]', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);
  out.landedUrl = page.url();
  out.title = await page.locator('h1').first().textContent().catch(() => null);

  const grab = async (key) => {
    await page.waitForTimeout(2500);
    const rows = await page.locator('tbody tr[data-test-id^="prof-row-"]').count().catch(() => 0);
    const firstRow = await page.locator('tbody tr[data-test-id^="prof-row-"]').first().innerText().catch(() => '');
    const hasChart = await page.locator('svg[aria-label]').count().catch(() => 0);
    const footer = await page.locator('tfoot').innerText().catch(() => '');
    const pager = await page.locator('[data-test-id="prof-pager"]').textContent().catch(() => '');
    out.tabs[key] = { rows, firstRow: firstRow.replace(/\n/g, ' | ').slice(0, 160), hasChart, footer: footer.replace(/\n/g, ' | ').slice(0, 200), pager };
    await shot(`fe-${key}.png`);
  };

  await grab('product');
  await page.click('[data-test-id="prof-tab-employee"]'); await grab('employee');
  await page.click('[data-test-id="prof-tab-counterparty"]'); await grab('counterparty');
  await page.click('[data-test-id="prof-tab-saleschannel"]'); await grab('saleschannel');
  // banner check on channel tab
  out.channelBanner = await page.locator('[data-test-id="prof-channel-banner"]').count().catch(() => 0);
  // open filter + print + gear (no crash)
  await page.click('[data-test-id="prof-tab-product"]').catch(() => {});
  await page.waitForTimeout(1500);
  await page.click('[data-test-id="prof-filter-toggle"]').catch(() => {});
  await page.waitForTimeout(1000);
  out.filterFields = await page.locator('[data-test-id^="prof-"][data-test-id$="-store"], [data-test-id="prof-accounted"], [data-test-id="prof-doctype"]').count().catch(() => 0);
  await shot('fe-filter-open.png');
  await page.click('[data-test-id="prof-print"]').catch(() => {});
  await page.waitForTimeout(800);
  await shot('fe-print-open.png');
  out.ok = true;
} catch (e) {
  out.error = String(e).slice(0, 300);
  await shot('fe-99-error.png');
} finally {
  writeFileSync(resolve(OUT, '_fe-cert.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2).slice(0, 2500));
  await browser.close();
}
