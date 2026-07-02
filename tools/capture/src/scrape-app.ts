import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchAuthenticated } from './auth/session.ts';
import { OUTPUT, TIMING, URLS } from './config.ts';
import { type ListPageCapture, extractListPage } from './extractors/list-page.ts';
import { APP_ROUTES, type AppRoute } from './routes.ts';
import { screenshotDedup } from './utils/dedup.ts';
import { child } from './utils/logger.ts';
import { forceCloseAllModals, resetSessionState } from './utils/modal.ts';
import { ensureDir } from './utils/paths.ts';
import { sleep } from './utils/wait.ts';

const log = child('scrape-app');

interface CaptureQualityReport {
  routesAttempted: number;
  uniqueScreenshots: number;
  duplicates: { route: string; dupOf: string; hash: string }[];
  modalsForceClosed: { route: string; count: number }[];
}

/** Main app scraper — authenticated session required. */
export async function runScrapeApp(
  options: { routes?: string[]; skipExisting?: boolean } = {},
): Promise<void> {
  log.info('Starting app scraper (authenticated).');

  let auth = await launchAuthenticated(true);
  let page = await auth.context.newPage();
  page.setDefaultTimeout(TIMING.defaultActionTimeout);
  page.setDefaultNavigationTimeout(TIMING.defaultNavigationTimeout);

  // Track screenshot hashes across the whole run to detect stuck-modal
  // duplicates (the byte-identical PNGs that destroyed the previous corpus).
  const seenHashes = new Map<string, string>();
  const report: CaptureQualityReport = {
    routesAttempted: 0,
    uniqueScreenshots: 0,
    duplicates: [],
    modalsForceClosed: [],
  };

  try {
    // Warm up: visit app shell + clear any leftover state
    await page.goto(URLS.app, { waitUntil: 'domcontentloaded' });
    await sleep(2_000);
    await forceCloseAllModals(page);

    const filtered = options.routes
      ? APP_ROUTES.filter((r) => options.routes!.includes(r.id))
      : APP_ROUTES;

    log.info({ count: filtered.length }, 'Routes queued');

    for (const route of filtered) {
      report.routesAttempted++;
      try {
        const result = await scrapeRoute(page, route, seenHashes);
        if (result.modalsClosed > 0) {
          report.modalsForceClosed.push({ route: route.id, count: result.modalsClosed });
        }
        if (result.duplicate) {
          report.duplicates.push({
            route: route.id,
            dupOf: seenHashes.get(result.hash) ?? 'unknown',
            hash: result.hash.slice(0, 12),
          });
        } else {
          report.uniqueScreenshots++;
        }
      } catch (err) {
        const msg = (err as Error).message;
        log.error({ route: route.id, err: msg }, 'route failed');
        // Recover from browser crash
        if (/closed|crash|disconnect/i.test(msg)) {
          log.info('Reopening browser…');
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
          auth = await launchAuthenticated(true);
          page = await auth.context.newPage();
          page.setDefaultTimeout(TIMING.defaultActionTimeout);
          page.setDefaultNavigationTimeout(TIMING.defaultNavigationTimeout);
          await page.goto(URLS.app, { waitUntil: 'domcontentloaded' });
          await sleep(2_000);
        }
      }
      // Always reset state between routes — closes lingering modals and
      // clears focus from any input that the previous extractor may have
      // left active. Without this, "test-dirty" + Save-confirm dialogs
      // bleed across routes and yield byte-identical screenshots.
      await resetSessionState(page);
      await sleep(TIMING.betweenPages);
    }

    log.info('App scraping complete.');

    const reportPath = path.join(OUTPUT.visualCaptures, '_capture-quality.json');
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    log.info(
      {
        routes: report.routesAttempted,
        unique: report.uniqueScreenshots,
        duplicates: report.duplicates.length,
        modalsClosed: report.modalsForceClosed.length,
      },
      'capture quality report written',
    );
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

interface ScrapeRouteResult {
  hash: string;
  duplicate: boolean;
  modalsClosed: number;
}

async function scrapeRoute(
  page: import('playwright').Page,
  route: AppRoute,
  seenHashes: Map<string, string>,
): Promise<ScrapeRouteResult> {
  const outDir = path.join(
    OUTPUT.visualCaptures,
    String(route.module).padStart(2, '0') + '-module',
    route.id,
  );
  await ensureDir(outDir);

  const url = `${URLS.app}#${route.hash}`;
  log.info({ route: route.id, url }, 'navigating');

  let modalsClosed = 0;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await sleep(TIMING.settleAfterNav + 800); // SPA hydration

    // Critical pre-screenshot cleanup. moysklad's UI persists unsaved-changes
    // confirm dialogs across navigations; if we screenshot now, every route
    // would yield a byte-identical "stuck modal" frame. forceCloseAllModals
    // tries ESC + cancel-button click + DOM removal as a last resort.
    modalsClosed = await forceCloseAllModals(page);

    // Dismiss help popover if appeared (separate concern — first-run welcome cards)
    await dismissFirstRunHelpers(page);

    // Full-page screenshot with hash dedup. If the same image was already
    // captured by a previous route, modals + retry kicks in automatically.
    const screenshot = path.join(outDir, '01-default.png');
    const dedupResult = await screenshotDedup(page, screenshot, seenHashes, {
      route: route.id,
      logger: log,
    });

    // DOM snapshot
    const html = await page.content();
    await writeFile(path.join(outDir, 'dom-default.html'), html, 'utf8');

    // Structured capture (list-page extractor)
    if (route.kind === 'list') {
      const capture = await extractListPage(page, route.hash);
      await writeFile(path.join(outDir, 'capture.json'), JSON.stringify(capture, null, 2), 'utf8');
      log.info(
        {
          route: route.id,
          cols: capture.tableColumns.length,
          interactive: capture.interactiveCount,
        },
        'list-page captured',
      );
    } else {
      // Special / report / tool pages — basic capture only
      const data = await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        h1: document.querySelector('h1')?.textContent?.trim() ?? null,
        bodyHeight: document.body.scrollHeight,
      }));
      await writeFile(path.join(outDir, 'capture.json'), JSON.stringify(data, null, 2), 'utf8');
    }

    return {
      hash: dedupResult.hash,
      duplicate: dedupResult.duplicate,
      modalsClosed,
    };
  } catch (err) {
    log.error({ route: route.id, err: (err as Error).message }, 'route failed');
    return { hash: '', duplicate: false, modalsClosed };
  }
}

/** Dismiss welcome/help popovers that appear on first visits. */
async function dismissFirstRunHelpers(page: import('playwright').Page): Promise<void> {
  // Close any top-right ✕ icons on floating cards
  const candidates = await page.$$(
    '[role=dialog] button, [class*=modal] button, [class*=popover] button',
  );
  for (const c of candidates) {
    const label = (await c.getAttribute('aria-label')) ?? '';
    if (/close|закр|dismiss/i.test(label)) {
      await c.click().catch(() => undefined);
      await sleep(200);
    }
  }
}

export type { ListPageCapture };
