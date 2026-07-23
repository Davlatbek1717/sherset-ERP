/**
 * Comprehensive parity-audit capture script.
 *
 * Goal: capture every list page (and a sample detail per module that has
 * a built detail page) at the same 1440×900 viewport as moysklad's
 * reference screenshots so we can do side-by-side comparison.
 *
 * Run:
 *   pnpm --filter @moysklad/web exec playwright test ../../audit/capture-all.spec.ts --project chromium
 *
 * Output:
 *   audit/our-final/list/<module>.png
 *   audit/our-final/detail/<module>.png   (only when an [id] route exists + a fixture id is found)
 *
 * The tests are sequential — auth is one-shot per worker, and 30+
 * parallel page loads would saturate the dev server's auth route.
 */
import { type Page, expect, test } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe.configure({ mode: 'serial' });

interface ListEntry {
  name: string;
  route: string;
  detailRoute?: string; // e.g., /customer-orders — list page that yields the first row's id
}

const LIST_ROUTES: ListEntry[] = [
  { name: 'homepage', route: '/' },
  { name: 'korzina', route: '/korzina' },
  { name: 'customer-orders', route: '/customer-orders', detailRoute: '/customer-orders' },
  { name: 'demands', route: '/demands', detailRoute: '/demands' },
  { name: 'invoices-out', route: '/invoices-out', detailRoute: '/invoices-out' },
  { name: 'sales-returns', route: '/sales-returns', detailRoute: '/sales-returns' },
  { name: 'purchase-orders', route: '/purchase-orders', detailRoute: '/purchase-orders' },
  { name: 'supplies', route: '/supplies', detailRoute: '/supplies' },
  { name: 'purchase-returns', route: '/purchase-returns', detailRoute: '/purchase-returns' },
  { name: 'invoices-in', route: '/invoices-in', detailRoute: '/invoices-in' },
  { name: 'enters', route: '/enters', detailRoute: '/enters' },
  { name: 'losses', route: '/losses', detailRoute: '/losses' },
  { name: 'moves', route: '/moves', detailRoute: '/moves' },
  { name: 'inventories', route: '/inventories', detailRoute: '/inventories' },
  { name: 'cash-in', route: '/cash-in', detailRoute: '/cash-in' },
  { name: 'cash-out', route: '/cash-out', detailRoute: '/cash-out' },
  { name: 'payments-in', route: '/payments-in', detailRoute: '/payments-in' },
  { name: 'payments-out', route: '/payments-out', detailRoute: '/payments-out' },
  { name: 'counterparties', route: '/counterparties', detailRoute: '/counterparties' },
  { name: 'contact-persons', route: '/contact-persons' },
  { name: 'products', route: '/products', detailRoute: '/products' },
  { name: 'services', route: '/services' },
  { name: 'bundles', route: '/bundles' },
  { name: 'product-folders', route: '/product-folders' },
  { name: 'variants', route: '/variants' },
  { name: 'price-types', route: '/price-types' },
  { name: 'tasks', route: '/tasks', detailRoute: '/tasks' },
  { name: 'opportunities', route: '/opportunities', detailRoute: '/opportunities' },
  { name: 'pipelines', route: '/pipelines', detailRoute: '/pipelines' },
  { name: 'calls', route: '/calls' },
  { name: 'reports', route: '/reports' },
  { name: 'settings', route: '/settings' },
  { name: 'settings-users', route: '/settings/users' },
  { name: 'settings-organizations', route: '/settings/organizations' },
  { name: 'settings-stores', route: '/settings/stores' },
  { name: 'settings-cash-desks', route: '/settings/cash-desks' },
  { name: 'settings-bank-accounts', route: '/settings/bank-accounts' },
  { name: 'settings-attributes', route: '/settings/attributes' },
  { name: 'settings-audit-log', route: '/settings/audit-log' },
  { name: 'settings-email', route: '/settings/email' },
  { name: 'settings-webhooks', route: '/settings/webhooks' },
  { name: 'settings-print-templates', route: '/settings/print-templates' },
  { name: 'settings-mxik', route: '/settings/mxik' },
  { name: 'settings-exchange-rates', route: '/settings/exchange-rates' },
  { name: 'settings-price-types', route: '/settings/price-types' },
];

const VIEWPORT = { width: 1440, height: 900 };

// __dirname here is .../apps/web/tests/e2e — climb 4 to repo root
const LIST_DIR = path.resolve(__dirname, '../../../../audit/our-final/list');
const DETAIL_DIR = path.resolve(__dirname, '../../../../audit/our-final/detail');

fs.mkdirSync(LIST_DIR, { recursive: true });
fs.mkdirSync(DETAIL_DIR, { recursive: true });

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.waitForSelector('[data-test-id="login-email"]', { timeout: 15_000 });
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('[data-test-id="login-submit"]');
  await page.waitForURL('/', { timeout: 15_000 });
}

test.describe('parity audit — capture all routes', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await login(page);
  });

  for (const entry of LIST_ROUTES) {
    test(`${entry.name} list`, async ({ page }) => {
      // Use domcontentloaded — SSE stream + react-query refetches keep
      // networkidle from settling on most authed pages.
      const status = await page.goto(entry.route, { waitUntil: 'domcontentloaded' });
      const code = status?.status() ?? 0;
      console.log(`[${entry.name}] ${entry.route} → HTTP ${code}`);

      // Wait for the list to actually paint — try both `tbody tr` (rows
      // present) and `[data-test-id*="empty"]` (empty state). Either
      // signals "data fetch settled".
      try {
        await page.waitForSelector('tbody tr, [data-test-id*="empty"], [role="grid"], h1', {
          timeout: 8000,
        });
      } catch {
        console.log(`[${entry.name}] no settle marker after 8s`);
      }
      // Extra time for async render of subsequent paint passes.
      await page.waitForTimeout(1500);

      const out = path.join(LIST_DIR, `${entry.name}.png`);
      await page.screenshot({ path: out, fullPage: false });
      expect(fs.existsSync(out)).toBe(true);

      // Try to capture the first detail row if a detail route exists.
      if (entry.detailRoute && code === 200) {
        const firstRow = page.locator('tbody tr[data-test-id^="row-"]').first();
        const hasRow = await firstRow.count();
        if (hasRow > 0) {
          const id = (await firstRow.getAttribute('data-test-id'))?.replace('row-', '');
          if (id) {
            await page.goto(`${entry.detailRoute}/${id}`, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);
            const outDetail = path.join(DETAIL_DIR, `${entry.name}.png`);
            await page.screenshot({ path: outDetail, fullPage: false });
            console.log(`[${entry.name}] detail captured for id=${id}`);
          }
        }
      }
    });
  }
});
