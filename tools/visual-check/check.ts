#!/usr/bin/env tsx
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Screenshot verification — opens each key page in headless Chromium
 * and saves PNG for visual inspection.
 *
 * Run after any UI change to verify the result before committing.
 */
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../.screenshots');

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3020';
  const pages = [
    { name: '00-login', path: '/login' },
    { name: '01-home', path: '/' },
    { name: '02-products-list', path: '/products' },
    { name: '03-product-new', path: '/products/new' },
    { name: '04-product-detail', path: '/products/0339260d-dfca-4106-94a5-b5be3cd97975' },
  ];

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  for (const p of pages) {
    process.stdout.write(`  ${p.name}... `);
    try {
      await page.goto(`${baseUrl}${p.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2500); // allow React Query to fetch + render
      const screenshotPath = path.join(OUT_DIR, `${p.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`OK -> ${path.relative(path.resolve(__dirname, '../..'), screenshotPath)}`);
    } catch (e) {
      console.log(`FAIL: ${(e as Error).message.slice(0, 80)}`);
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
