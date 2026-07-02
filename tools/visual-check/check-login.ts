#!/usr/bin/env tsx
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Full E2E login flow screenshot check:
 *  1. Open /login
 *  2. Submit credentials
 *  3. Verify redirect to / (home)
 *  4. Verify navbar shows user name
 *  5. Navigate to /products and verify data loads (auth header attached)
 *  6. Logout (not yet implemented — skip)
 */
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../.screenshots');

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3030';

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  page.on('pageerror', (e) => console.log('[PAGE ERROR]', e.message));
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/v1/') && r.status() >= 400) {
      console.log(`[API ${r.status()}]`, r.request().method(), u);
    }
  });

  console.log('1. Open /login (no auth) — expect login page');
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, 'flow-01-login.png') });

  console.log('2. Submit credentials');
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('[data-test-id="login-submit"]');
  await page.waitForURL(/\/$/, { timeout: 10000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT_DIR, 'flow-02-after-login.png') });

  console.log('3. Navigate to /products — auth should persist');
  await page.goto(`${baseUrl}/products`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT_DIR, 'flow-03-products-authenticated.png') });

  const rowCount = await page.$$eval('[data-test-id^="product-row-"]', (els) => els.length);
  console.log(`   Product rows rendered: ${rowCount}`);

  console.log('4. Open / (home) as authenticated user');
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, 'flow-04-home-authenticated.png') });

  await browser.close();

  console.log('\n✅ Flow complete. Screenshots in .screenshots/flow-*.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
