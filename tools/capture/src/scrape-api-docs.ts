import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { launchAnonymous } from './auth/session.ts';
import { OUTPUT, TIMING, URLS } from './config.ts';
import { type ApiEntityCapture, extractApiEntity } from './extractors/api-entity.ts';
import { API_DOCUMENTS, API_ENTITIES } from './routes.ts';
import { child } from './utils/logger.ts';
import { ensureDir, ensureParent } from './utils/paths.ts';
import { sleep } from './utils/wait.ts';

const log = child('scrape-api');

export interface RunOptions {
  /** Skip entities whose JSON file already exists (idempotent re-runs). */
  skipExisting?: boolean;
  /** Comma-separated slugs (entities + docs share namespace for flag). */
  only?: string[];
}

/** Run the API-docs scraper. Resilient — heals on browser crashes. */
export async function runScrapeApiDocs(opts: RunOptions = {}): Promise<void> {
  log.info({ skipExisting: opts.skipExisting ?? true }, 'Starting API docs scraper');

  await ensureDir(OUTPUT.entitySchemas);
  await ensureDir(OUTPUT.documentSchemas);

  const skipExisting = opts.skipExisting ?? true;
  const filterFn = (slug: string) => !opts.only || opts.only.includes(slug);

  let browser = await launchAnonymous(true);
  let page = await browser.context.newPage();
  configurePage(page);

  try {
    const entityTargets = API_ENTITIES.filter(filterFn);
    log.info({ count: entityTargets.length }, 'Entities to scrape');
    for (const slug of entityTargets) {
      const outFile = path.join(OUTPUT.entitySchemas, `${slug}.json`);
      if (skipExisting && isCompleteCapture(outFile)) {
        log.info({ slug }, 'skip (already captured with content)');
        continue;
      }
      ({ page, browser } = await scrapeOneResilient(page, browser, slug, 'dictionaries', outFile));
      await sleep(TIMING.betweenPages);
    }

    const docTargets = API_DOCUMENTS.filter(filterFn);
    log.info({ count: docTargets.length }, 'Documents to scrape');
    for (const slug of docTargets) {
      const outFile = path.join(OUTPUT.documentSchemas, `${slug}.json`);
      if (skipExisting && isCompleteCapture(outFile)) {
        log.info({ slug }, 'skip (already captured with content)');
        continue;
      }
      ({ page, browser } = await scrapeOneResilient(page, browser, slug, 'documents', outFile));
      await sleep(TIMING.betweenPages);
    }

    log.info('API docs scraping complete.');
  } finally {
    try {
      await browser.context.close();
    } catch {
      // context may already be closed
    }
    try {
      await browser.browser.close();
    } catch {
      // browser may already be closed
    }
  }
}

function configurePage(page: Page): void {
  page.setDefaultTimeout(TIMING.defaultActionTimeout);
  page.setDefaultNavigationTimeout(TIMING.defaultNavigationTimeout);
}

/** Check if a capture file exists AND has non-empty tables (treat 0-field files as needing re-scrape). */
function isCompleteCapture(file: string): boolean {
  if (!existsSync(file)) return false;
  try {
    const content = readFileSync(file, 'utf8');
    const data = JSON.parse(content) as { tables?: { fields: unknown[] }[] };
    const totalFields = data.tables?.reduce((s, t) => s + (t.fields?.length ?? 0), 0) ?? 0;
    return totalFields > 0;
  } catch {
    return false;
  }
}

/** Scrape one entity; reopen browser on any fatal error. */
async function scrapeOneResilient(
  page: Page,
  browser: { browser: import('playwright').Browser; context: BrowserContext },
  slug: string,
  section: 'dictionaries' | 'documents',
  outFile: string,
): Promise<{
  page: Page;
  browser: { browser: import('playwright').Browser; context: BrowserContext };
}> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await scrapeOne(page, slug, section, outFile);
      return { page, browser };
    } catch (err) {
      const msg = (err as Error).message;
      log.error(
        { slug, section, attempt, err: msg },
        `scrape failed${attempt === 1 ? ' — reopening browser and retrying' : ''}`,
      );
      if (attempt === 1 && /closed|crash|disconnect/i.test(msg)) {
        try {
          await browser.context.close();
        } catch {
          // ignore — may already be closed
        }
        try {
          await browser.browser.close();
        } catch {
          // ignore — may already be closed
        }
        browser = await launchAnonymous(true);
        page = await browser.context.newPage();
        configurePage(page);
      } else {
        // Give up on this entity, move on
        return { page, browser };
      }
    }
  }
  return { page, browser };
}

const ERROR_TITLE_RE = /Ошибка\s+загрузки\s+документа/i;

async function scrapeOne(
  page: Page,
  slug: string,
  section: 'dictionaries' | 'documents',
  outFile: string,
): Promise<void> {
  const url = URLS.apiDocsHash(section, slug);
  log.info({ slug, section }, `GET ${url}`);

  // Attempt 1: normal navigation (fast)
  let data = await navigateAndExtract(page, url, slug, section, 900);

  // Attempt 2: hard-reload via base URL (covers SPA router-stuck states)
  if (isBroken(data)) {
    log.warn({ slug, section }, 'attempt 2: hard-reload via base URL');
    await page.goto(URLS.apiDocsBase, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    data = await navigateAndExtract(page, url, slug, section, 2000);
  }

  // Attempt 3: full reload of target URL + wait for content indicator
  if (isBroken(data)) {
    log.warn({ slug, section }, 'attempt 3: full reload with content wait');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    // Wait for "Ошибка" to disappear OR for any table to appear, up to 30s
    await page
      .waitForFunction(
        () => {
          const title = document.querySelector('h1, h2')?.textContent ?? '';
          const hasErr = /Ошибка\s+загрузки/i.test(title);
          const hasTable = document.querySelectorAll('table').length > 0;
          return !hasErr && hasTable;
        },
        { timeout: 30_000 },
      )
      .catch(() => {
        // fall through; we'll still extract whatever rendered
      });
    await page.waitForTimeout(1000);
    data = await extractApiEntity(page, slug, section);
  }

  // Attempt 4: click the sidebar link directly (bypasses URL-based router)
  if (isBroken(data)) {
    log.warn({ slug, section }, 'attempt 4: click sidebar link');
    const clickedOk = await page
      .evaluate((targetSlug) => {
        const link = Array.from(document.querySelectorAll('a[href*="#/"]')).find((a) =>
          (a.getAttribute('href') ?? '').includes(`/${targetSlug}`),
        );
        if (link) {
          (link as HTMLAnchorElement).click();
          return true;
        }
        return false;
      }, slug)
      .catch(() => false);
    if (clickedOk) {
      await page.waitForTimeout(3000);
      data = await extractApiEntity(page, slug, section);
    }
  }

  await ensureParent(outFile);
  await writeFile(outFile, JSON.stringify(data, null, 2), 'utf8');
  const totalFields = data.tables.reduce((s, t) => s + t.fields.length, 0);
  if (totalFields === 0) {
    log.warn({ slug, title: data.title }, 'saved but EMPTY after 4 attempts');
  } else {
    log.info({ slug, tables: data.tables.length, fields: totalFields }, 'saved');
  }
}

function isBroken(data: {
  tables: unknown[];
  title: string | null;
  rawTableCount: number;
}): boolean {
  return (
    data.tables.length === 0 && (ERROR_TITLE_RE.test(data.title ?? '') || data.rawTableCount === 0)
  );
}

async function navigateAndExtract(
  page: Page,
  url: string,
  slug: string,
  section: 'dictionaries' | 'documents',
  waitMs = 900,
): Promise<Awaited<ReturnType<typeof extractApiEntity>>> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(waitMs);
  return extractApiEntity(page, slug, section);
}

export type { ApiEntityCapture };
