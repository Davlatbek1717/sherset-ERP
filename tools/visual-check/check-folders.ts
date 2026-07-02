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

  console.log('1. Login...');
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('[data-test-id="login-submit"]');
  await page.waitForURL(/\/$/, { timeout: 10000 });

  console.log('2. Navigate to /product-folders');
  await page.goto(`${baseUrl}/product-folders`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT_DIR, '05-product-folders.png') });
  console.log('   screenshot saved');

  const folders = await page.$$eval('[data-test-id^="folder-row-"]', (els) => els.length);
  console.log(`   folder rows: ${folders}`);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
