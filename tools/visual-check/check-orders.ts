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

  console.log('2. /customer-orders (empty)');
  await page.goto(`${baseUrl}/customer-orders`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT_DIR, '11-customer-orders-empty.png') });

  console.log('3. Create one via API for demo');
  const loginRes = await page.request.post(`${baseUrl}/api/v1/auth/login`, {
    data: { email: 'admin@demo.local', password: 'admin123' },
  });
  const { accessToken } = (await loginRes.json()) as { accessToken: string };

  const agents = await page.request.get(`${baseUrl}/api/v1/counterparties?limit=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const agent = (await agents.json()).items[0];

  const orgs = await page.request.get(`${baseUrl}/api/v1/product-folders?limit=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // Need org + store + product
  const prodRes = await page.request.get(`${baseUrl}/api/v1/products?limit=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const product = (await prodRes.json()).items[0];

  // Get first org/store from DB (expose via API later; for now, know admin's seed)
  // We'll use raw org/store via Products relation or need to expose list. Skip for now.
  console.log(`   Got agent: ${agent?.name}, product: ${product?.name}`);

  await browser.close();
  console.log('\n✅ Done (list empty is expected — no orders seeded yet)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
