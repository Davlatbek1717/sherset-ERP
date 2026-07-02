#!/usr/bin/env tsx
/**
 * Minimal capture: open each route, dismiss overlays, take ONE
 * default screenshot + DOM. No interactions, no dropdowns, no
 * detail-page, no field modals. The full v2 sweep has a navigation
 * bug that leaves later routes pointing at /korzina; this script
 * is the unbug'd alternative used to reseed default.png + default.html
 * for the parity work.
 *
 * Run:
 *   pnpm --filter @moysklad/capture exec tsx \
 *     src/screenshot-defaults.ts [route1 route2 ...]
 *
 * With no routes: hits all 72.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { launchAuthenticated } from './auth/session.ts';
import { TIMING, URLS, OUTPUT } from './config.ts';
import { APP_ROUTES, type AppRoute } from './routes.ts';
import { child } from './utils/logger.ts';
import { sleep } from './utils/wait.ts';

const log = child('screenshot-defaults');

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const routes = requested.length
    ? APP_ROUTES.filter((r) => requested.includes(r.id))
    : APP_ROUTES;

  log.info({ count: routes.length }, 'Default-only screenshot pass');

  const auth = await launchAuthenticated(true);
  const page = await auth.context.newPage();
  page.setDefaultTimeout(TIMING.defaultActionTimeout);
  page.setDefaultNavigationTimeout(TIMING.defaultNavigationTimeout);

  try {
    // Warm-up — moysklad SPA needs one full load before hash routes
    // start behaving deterministically.
    await page.goto(URLS.app, { waitUntil: 'domcontentloaded' });
    await sleep(2500);

    let ok = 0;
    let failed = 0;

    for (const route of routes) {
      const url = `${URLS.app}#${route.hash}`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await sleep(TIMING.settleAfterNav + 1500);

        // Dismiss any first-run modals (wizard, tutorial)
        await dismissOverlays(page);
        // Re-navigate after dismissal — wizard sometimes redirects
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await sleep(1500);

        const moduleSlug = computeModuleDir(route);
        const baseDir = path.join(OUTPUT.visualCaptures, moduleSlug, route.id);
        const screenshotsDir = path.join(baseDir, 'screenshots');
        const domsDir = path.join(baseDir, 'dom');
        if (!existsSync(screenshotsDir)) mkdirSync(screenshotsDir, { recursive: true });
        if (!existsSync(domsDir)) mkdirSync(domsDir, { recursive: true });

        const pngPath = path.join(screenshotsDir, '00-clean-default.png');
        const htmlPath = path.join(domsDir, '00-clean-default.html');

        await page.screenshot({ path: pngPath, fullPage: false });
        const html = await page.content();
        writeFileSync(htmlPath, html, 'utf8');

        ok++;
        log.info({ route: route.id, png: pngPath }, 'captured');
      } catch (err) {
        failed++;
        log.error({ route: route.id, err: (err as Error).message }, 'failed');
      }
      await sleep(TIMING.betweenPages);
    }

    log.info({ ok, failed }, 'done');
  } finally {
    try {
      await auth.context.close();
    } catch {
      /* ignore */
    }
    try {
      await auth.browser.close();
    } catch {
      /* ignore */
    }
  }
}

function computeModuleDir(route: AppRoute): string {
  return `${String(route.module).padStart(2, '0')}-module`;
}

async function dismissOverlays(page: import('playwright').Page): Promise<void> {
  // Mirror of orchestrator.dismissOverlays — wizard + tutorial + help
  await page
    .evaluate(() => {
      const closeButtons = Array.from(
        document.querySelectorAll('button, svg'),
      ).filter((el) => {
        const label = (el.getAttribute('aria-label') ?? '').toLowerCase();
        return /^close$|закр|dismiss/.test(label);
      });
      for (const el of closeButtons) {
        const r = el.getBoundingClientRect();
        if (r.width < 40 && r.height < 40) {
          const btn = (el as Element).closest('button');
          if (btn) (btn as HTMLButtonElement).click();
        }
      }
    })
    .catch(() => undefined);
  await sleep(400);
}

main().catch((err) => {
  log.error({ err }, 'fatal');
  process.exit(1);
});
