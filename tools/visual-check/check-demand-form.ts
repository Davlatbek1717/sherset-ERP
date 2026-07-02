#!/usr/bin/env tsx
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/** Quick screenshot of /demands/new form (Sprint 3.2b). */
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../.screenshots');

async function main(): Promise<void> {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => {
    console.log('[ERR]', e.message);
    errors.push(e.message);
  });
  page.on('response', (r) => {
    if (r.url().includes('/api/v1/') && r.status() >= 400) {
      console.log(`[API ${r.status()}]`, r.request().method(), r.url());
      errors.push(`${r.status()} ${r.url()}`);
    }
  });

  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-test-id="login-email"]', { timeout: 60000 });
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('[data-test-id="login-submit"]');
  await page.waitForURL(/\/$/, { timeout: 60000 });

  console.log('-> /demands/new');
  await page.goto(`${baseUrl}/demands/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="demand-new-page"]', { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(OUT_DIR, '32b-01-demand-new-empty.png'),
    fullPage: true,
  });

  console.log('-> Add position + fill');
  await page.click('[data-test-id="add-position"]');
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(OUT_DIR, '32b-02-demand-new-with-position.png'),
    fullPage: true,
  });

  await browser.close();
  if (errors.length === 0) console.log('\n✅ DONE');
  else {
    console.log(`⚠️ ${errors.length} issues`);
    errors.forEach((e) => console.log(' -', e));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
