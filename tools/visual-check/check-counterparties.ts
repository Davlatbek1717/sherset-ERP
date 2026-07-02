#!/usr/bin/env tsx
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../.screenshots');

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3030';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  page.on('pageerror', (e) => console.log('[ERR]', e.message));
  page.on('response', (r) => {
    if (r.url().includes('/api/v1/') && r.status() >= 400) {
      console.log(`[API ${r.status()}]`, r.request().method(), r.url());
    }
  });

  console.log('1. Login');
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('[data-test-id="login-submit"]');
  await page.waitForURL(/\/$/, { timeout: 10000 });

  console.log('2. /counterparties');
  await page.goto(`${baseUrl}/counterparties`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT_DIR, '06-counterparties-list.png') });
  const rows = await page.$$eval('[data-test-id^="counterparty-row-"]', (els) => els.length);
  console.log(`   rows: ${rows}`);

  console.log('3. /counterparties/new');
  await page.goto(`${baseUrl}/counterparties/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, '07-counterparty-new.png') });

  // Get existing id for detail
  if (rows > 0) {
    console.log('4. /counterparties/:id (first row)');
    await page.goto(`${baseUrl}/counterparties`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const firstRow = await page.$('[data-test-id^="counterparty-row-"] a');
    if (firstRow) {
      await firstRow.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(OUT_DIR, '08-counterparty-detail.png') });
    }
  }

  await browser.close();
  console.log('\n✅ Done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
