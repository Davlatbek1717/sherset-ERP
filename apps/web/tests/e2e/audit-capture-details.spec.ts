import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Detail-page parity capture. Pairs with audit-capture-all.spec.ts —
 * that one captures lists; this one captures the FIRST detail row of
 * each entity that has a built `[id]/page.tsx`.
 *
 * Strategy: navigate to the list page, find the first <tr> with a
 * data-test-id starting with the entity slug, extract the id, then
 * navigate to the detail page.
 */
import { type Page, expect, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe.configure({ mode: 'serial' });

interface DetailEntry {
  name: string;
  listRoute: string;
  detailRouteBase: string; // /customer-orders → detail will be /customer-orders/{id}
  rowTestIdPrefix: string; // e.g., "customer-order-row-" → match via `[data-test-id^=...]`
}

const ENTRIES: DetailEntry[] = [
  {
    name: 'customer-orders',
    listRoute: '/customer-orders',
    detailRouteBase: '/customer-orders',
    rowTestIdPrefix: 'customer-order-row-',
  },
  {
    name: 'demands',
    listRoute: '/demands',
    detailRouteBase: '/demands',
    rowTestIdPrefix: 'demand-row-',
  },
  {
    name: 'invoices-out',
    listRoute: '/invoices-out',
    detailRouteBase: '/invoices-out',
    rowTestIdPrefix: 'invoice-out-row-',
  },
  {
    name: 'sales-returns',
    listRoute: '/sales-returns',
    detailRouteBase: '/sales-returns',
    rowTestIdPrefix: 'sales-return-row-',
  },
  {
    name: 'purchase-orders',
    listRoute: '/purchase-orders',
    detailRouteBase: '/purchase-orders',
    rowTestIdPrefix: 'purchase-order-row-',
  },
  {
    name: 'supplies',
    listRoute: '/supplies',
    detailRouteBase: '/supplies',
    rowTestIdPrefix: 'supply-row-',
  },
  {
    name: 'purchase-returns',
    listRoute: '/purchase-returns',
    detailRouteBase: '/purchase-returns',
    rowTestIdPrefix: 'purchase-return-row-',
  },
  {
    name: 'invoices-in',
    listRoute: '/invoices-in',
    detailRouteBase: '/invoices-in',
    rowTestIdPrefix: 'invoice-in-row-',
  },
  {
    name: 'enters',
    listRoute: '/enters',
    detailRouteBase: '/enters',
    rowTestIdPrefix: 'enter-row-',
  },
  {
    name: 'losses',
    listRoute: '/losses',
    detailRouteBase: '/losses',
    rowTestIdPrefix: 'loss-row-',
  },
  { name: 'moves', listRoute: '/moves', detailRouteBase: '/moves', rowTestIdPrefix: 'move-row-' },
  {
    name: 'inventories',
    listRoute: '/inventories',
    detailRouteBase: '/inventories',
    rowTestIdPrefix: 'inventory-row-',
  },
  {
    name: 'cash-in',
    listRoute: '/cash-in',
    detailRouteBase: '/cash-in',
    rowTestIdPrefix: 'cash-in-row-',
  },
  {
    name: 'cash-out',
    listRoute: '/cash-out',
    detailRouteBase: '/cash-out',
    rowTestIdPrefix: 'cash-out-row-',
  },
  {
    name: 'payments-in',
    listRoute: '/payments-in',
    detailRouteBase: '/payments-in',
    rowTestIdPrefix: 'payment-in-row-',
  },
  {
    name: 'payments-out',
    listRoute: '/payments-out',
    detailRouteBase: '/payments-out',
    rowTestIdPrefix: 'payment-out-row-',
  },
  {
    name: 'counterparties',
    listRoute: '/counterparties',
    detailRouteBase: '/counterparties',
    rowTestIdPrefix: 'counterparty-row-',
  },
  {
    name: 'products',
    listRoute: '/products',
    detailRouteBase: '/products',
    rowTestIdPrefix: 'product-row-',
  },
  { name: 'tasks', listRoute: '/tasks', detailRouteBase: '/tasks', rowTestIdPrefix: 'task-row-' },
  {
    name: 'opportunities',
    listRoute: '/opportunities',
    detailRouteBase: '/opportunities',
    rowTestIdPrefix: 'opportunity-row-',
  },
];

const VIEWPORT = { width: 1440, height: 900 };
const DETAIL_DIR = path.resolve(__dirname, '../../../../audit/our-final/detail');
fs.mkdirSync(DETAIL_DIR, { recursive: true });

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.waitForSelector('[data-test-id="login-username"]', { timeout: 15_000 });
  await page.fill('[data-test-id="login-username"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('[data-test-id="login-submit"]');
  await page.waitForURL('/', { timeout: 15_000 });
}

test.describe('parity audit — detail captures', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await login(page);
  });

  for (const entry of ENTRIES) {
    test(`${entry.name} detail`, async ({ page }) => {
      // Visit list and wait for ANY row to appear OR timeout (no data).
      await page.goto(entry.listRoute, { waitUntil: 'domcontentloaded' });

      // react-query fetches rows after first paint — give it up to 8s
      // for the first row to materialize. If no row ever shows, the
      // entity has no seed data and we skip.
      try {
        await page.waitForSelector(`tr[data-test-id^="${entry.rowTestIdPrefix}"]`, {
          timeout: 8000,
        });
      } catch {
        console.log(`[${entry.name}] no rows after 8s wait — skipping (no seed data)`);
        return;
      }

      const firstRow = page.locator(`tr[data-test-id^="${entry.rowTestIdPrefix}"]`).first();
      const testId = await firstRow.getAttribute('data-test-id');
      const id = testId?.replace(entry.rowTestIdPrefix, '');
      if (!id) {
        console.log(`[${entry.name}] could not extract id from "${testId}" — skipping`);
        return;
      }

      const detailUrl = `${entry.detailRouteBase}/${id}`;
      console.log(`[${entry.name}] navigating to ${detailUrl}`);
      await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });

      // Wait for the page to actually finish loading: either entity-name
      // appears (DetailHeader render signal), or the spinner disappears,
      // or 8s timeout — whichever first. Detail pages often re-fetch
      // related data after first paint, so we give them extra time.
      try {
        await page.waitForSelector('[data-test-id="entity-name"], [data-test-id="detail-header"]', {
          timeout: 8000,
        });
      } catch {
        // Some pages don't have those test-ids; fall back to a longer wait.
        console.log(`[${entry.name}] no entity-name selector — falling back to timeout`);
      }
      await page.waitForTimeout(1500);

      const out = path.join(DETAIL_DIR, `${entry.name}.png`);
      await page.screenshot({ path: out, fullPage: false });
      expect(fs.existsSync(out)).toBe(true);
    });
  }
});
