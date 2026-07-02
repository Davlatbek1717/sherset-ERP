import { type Page, expect, test } from '@playwright/test';

/**
 * ARIA structural-snapshot baseline (Q1.3 of the quality foundation).
 *
 * The third leg of the parity-drift net:
 *  - `pnpm audit:module`        → dropdown *text* parity (bulk/print menus)
 *  - `visual-regression.spec`   → *pixel* drift
 *  - this spec                  → *structural* drift of each list page's
 *    chrome, captured as the accessibility tree.
 *
 * Two snapshots per module, both data-independent so they never break on a
 * seed change:
 *   <module>.toolbar.aria.yml  — the moysklad toolbar: page title, action
 *                                buttons (create / filter / bulk / print),
 *                                search box, selection counter.
 *   <module>.columns.aria.yml  — the table head: the column-header contract
 *                                (order + labels + sort affordance).
 *
 * The data <tbody> and the "Всего: N" pagination are deliberately NOT
 * snapshotted — they depend on seed data. Targeting the toolbar
 * (`toolbar-moysklad`) and `<thead>` sidesteps them entirely, so no DOM
 * scrubbing is needed.
 *
 * Coverage: pages built on the shared ListView expose a
 * `[data-test-id$="-page"]` root. Bespoke settings tables / onboarding
 * splashes do not — they are detected at runtime and SKIPPED with a reason,
 * never silently counted as covered.
 *
 *   pnpm --filter @moysklad/web test:aria:update   # create/refresh baseline
 *   pnpm --filter @moysklad/web test:aria          # enforce drift
 *
 * Requires the dev server on :3100 (config baseURL) + API :4000 + DB.
 */
test.describe.configure({ mode: 'serial' });

interface ModuleEntry {
  name: string;
  route: string;
}

// The 22 real list pages with a built UI. Differs from the 22 captured
// moysklad-reference modules by two swaps: contact-persons + variants are
// onboarding splashes (no list) and are dropped; sales-returns +
// purchase-returns are real shared-ListView pages and are added.
const MODULES: ModuleEntry[] = [
  // sales / purchase documents
  { name: 'customer-orders', route: '/customer-orders' },
  { name: 'demands', route: '/demands' },
  { name: 'invoices-out', route: '/invoices-out' },
  { name: 'sales-returns', route: '/sales-returns' },
  { name: 'purchase-orders', route: '/purchase-orders' },
  { name: 'supplies', route: '/supplies' },
  { name: 'purchase-returns', route: '/purchase-returns' },
  { name: 'invoices-in', route: '/invoices-in' },
  // warehouse documents
  { name: 'enters', route: '/enters' },
  { name: 'losses', route: '/losses' },
  { name: 'moves', route: '/moves' },
  { name: 'inventories', route: '/inventories' },
  // money documents
  { name: 'cash-in', route: '/cash-in' },
  { name: 'cash-out', route: '/cash-out' },
  { name: 'payments-in', route: '/payments-in' },
  { name: 'payments-out', route: '/payments-out' },
  // catalogs
  { name: 'counterparties', route: '/counterparties' },
  { name: 'products', route: '/products' },
  // settings + hr catalogs (may be bespoke → auto-skip if no -page root)
  { name: 'projects', route: '/settings/projects' },
  { name: 'currencies', route: '/settings/currencies' },
  { name: 'uoms', route: '/settings/uoms' },
  { name: 'employees', route: '/hr/employees' },
];

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.waitForSelector('[data-test-id="login-username"]', { timeout: 15_000 });
  await page.fill('[data-test-id="login-username"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('[data-test-id="login-submit"]');
  await page.waitForURL('/', { timeout: 15_000 });
}

test.describe('ARIA structural snapshot — list chrome', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    // Next.js dev compiles each route lazily on first visit (10-20s). In
    // serial mode that compile cost lands inside the test, so the default
    // 30s per-test timeout is too tight — a slow first hit would fail the
    // test and (serial) abort every module after it. 90s absorbs the
    // worst-case cold compile.
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    // Pin the locale so the snapshot is deterministic regardless of the
    // browser/app default (label text is the signal here).
    await page
      .context()
      .addCookies([{ name: 'NEXT_LOCALE', value: 'uz', url: baseURL ?? 'http://localhost:3100' }]);
    await login(page);
  });

  for (const m of MODULES) {
    test(`${m.name} list chrome`, async ({ page }) => {
      const resp = await page.goto(m.route, { waitUntil: 'domcontentloaded' });
      const code = resp?.status() ?? 0;
      expect(code, `${m.route} should load (HTTP ${code})`).toBeLessThan(400);

      // Shared ListView mounts a `<...>-page` Container. Bespoke / splash
      // pages don't — skip honestly rather than fake a baseline.
      const root = page.locator('[data-test-id$="-page"]').first();
      const appeared = await root
        .waitFor({ state: 'visible', timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      test.skip(!appeared, `${m.name}: no ListView -page root (bespoke/splash) — not baselined`);

      // Wait for the toolbar to mount (30s absorbs Next.js dev's cold
      // lazy-compile of a freshly-visited route — without it the first hit
      // flakes and, in serial mode, aborts every module after it).
      const toolbar = root
        .locator('[data-test-id="toolbar-moysklad"], [data-test-id="toolbar"]')
        .first();
      await expect(toolbar, `${m.name}: toolbar not found`).toBeVisible({ timeout: 30_000 });

      // CRITICAL: settle the data fetch BEFORE snapshotting. The DataTable
      // re-renders on the loading→loaded transition, which detaches and
      // re-creates the toolbar's React subtree. Snapshotting mid-transition
      // races that remount ("element(s) not found"). Waiting for the list
      // to reach a terminal state — a <thead> (has rows) OR an empty-state
      // marker (no rows) — guarantees the DOM is stable for both snapshots.
      const thead = root.locator('thead').first();
      const settled = root.locator('thead, [data-test-id*="empty"], [data-test-id="rich-empty"]');
      await settled
        .first()
        .waitFor({ state: 'visible', timeout: 20_000 })
        .catch(() => {});
      await page.waitForTimeout(300);

      // 1. Toolbar — title + actions + search + selection counter.
      await expect(toolbar).toMatchAriaSnapshot({ name: `${m.name}.toolbar.aria.yml` });

      // 2. Column-header contract — only when the list has rows. An empty
      //    list renders the onboarding/empty state instead of a <thead>, so
      //    there is nothing structural to capture.
      // An empty list renders the onboarding/empty state instead of a
      // <thead>, so there is nothing structural to capture; the absence of
      // a `<module>-columns.aria.yml` file is itself the record of that.
      if (await thead.count()) {
        await expect(thead).toMatchAriaSnapshot({ name: `${m.name}.columns.aria.yml` });
      }
    });
  }
});
