#!/usr/bin/env tsx
/** Debug page loading — capture console + network errors. */
import { chromium } from 'playwright';

async function main(): Promise<void> {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3020';

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') {
      console.log(`[${t.toUpperCase()}]`, msg.text());
    }
  });
  page.on('pageerror', (err) => console.log('[PAGE ERROR]', err.message));
  page.on('requestfailed', (req) =>
    console.log('[REQ FAIL]', req.method(), req.url(), req.failure()?.errorText),
  );
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/v1/')) {
      console.log('[API]', res.status(), res.request().method(), url);
    }
  });

  console.log(`\n=== ${baseUrl}/products ===`);
  await page.goto(`${baseUrl}/products`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const rowCount = await page.$$eval('[data-test-id^="product-row-"]', (els) => els.length);
  console.log(`Product rows rendered: ${rowCount}`);

  const loadingText = await page.textContent('body');
  const hasLoading = loadingText?.includes('Yuklanmoqda');
  console.log(`Still loading?: ${hasLoading}`);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
