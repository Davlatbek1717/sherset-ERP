import { expect, test } from '@playwright/test';

/**
 * Visual regression baseline. Captures one screenshot per primary route
 * and compares against the committed baseline in
 * `tests/e2e/visual-regression.spec.ts-snapshots/`.
 *
 * **First run from a clean checkout has no baseline** — every test
 * fails until the snapshots are generated. Use `test:visual:update` to
 * create them, then plain `test:visual` enforces drift afterwards.
 *
 *   pnpm --filter @moysklad/web test:visual:update   # create baseline
 *   pnpm --filter @moysklad/web test:visual          # enforce drift
 *
 * Tests run **sequentially** (mode: 'serial') because:
 *  - 8 parallel logins overwhelm the dev server's auth route + DB
 *  - the SSE /notifications/stream subscriber holds a connection per
 *    page-load; 8 of them in flight saturates the Node event loop
 *  - visual diffs don't benefit from parallelism — they're CPU-light
 *    and bottle-necked on page render
 */
test.describe.configure({ mode: 'serial' });

const ROUTES_UNAUTHED = [
  { name: 'login', path: '/login' },
];

const ROUTES_AUTHED = [
  { name: 'homepage', path: '/' },
  { name: 'customer-orders-list', path: '/customer-orders' },
  { name: 'invoices-out-list', path: '/invoices-out' },
  { name: 'demands-list', path: '/demands' },
  { name: 'products-list', path: '/products' },
  { name: 'counterparties-list', path: '/counterparties' },
  { name: 'cash-in-list', path: '/cash-in' },
  { name: 'reports-overview', path: '/reports' },
  { name: 'settings-overview', path: '/settings' },
  { name: 'korzina', path: '/korzina' },
];

// Pixel diff threshold per page. Pages with dynamic data (timestamps,
// counts) get a higher threshold so noise doesn't trip the test.
const THRESHOLD_PCT = 0.5;

test.describe('visual regression — unauthenticated', () => {
  for (const route of ROUTES_UNAUTHED) {
    test(`${route.name} matches baseline`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot(`${route.name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: THRESHOLD_PCT / 100,
        // Mask elements that legitimately change between runs.
        mask: [page.locator('time'), page.locator('[data-test-id="locale-switcher"]')],
      });
    });
  }
});

test.describe('visual regression — authenticated', () => {
  // Sign in once for every authed test in this file.
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
    await page.fill('[data-test-id="login-password"]', 'admin123');
    await page.click('[data-test-id="login-submit"]');
    await page.waitForURL('/');
  });

  for (const route of ROUTES_AUTHED) {
    test(`${route.name} matches baseline`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      // Hide live data that legitimately changes per run.
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('time, [data-volatile]')) {
          (el as HTMLElement).style.visibility = 'hidden';
        }
      });
      await expect(page).toHaveScreenshot(`${route.name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: THRESHOLD_PCT / 100,
      });
    });
  }
});
