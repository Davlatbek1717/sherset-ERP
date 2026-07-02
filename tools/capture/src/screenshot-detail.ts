#!/usr/bin/env tsx
/**
 * Capture the DETAIL PAGE of a moysklad list entity by clicking the
 * first row, then walking each tab. Same data-safety guarantees as
 * screenshot-interactions.ts (S1-S8) — never modifies a real document,
 * only opens it for read-only capture.
 *
 * Output per route (under screenshots/):
 *   d-default.png             — landing detail page (Главная tab)
 *   d-default.dom.html
 *   d-tab-{slug}.png          — each subsequent tab
 *   d-tab-{slug}.dom.html
 *
 * Tab slugs derived from the actual <span class="tabName"> textContent
 * of the captured tab strip. Common ones:
 *   glavnaya, svyazannye-dokumenty, fayly, sobytiya, zadachi
 *
 * Run:
 *   pnpm --filter @moysklad/capture exec tsx \
 *     src/screenshot-detail.ts customerorder
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { launchAuthenticated } from './auth/session.ts';
import { TIMING, URLS, OUTPUT } from './config.ts';
import { APP_ROUTES } from './routes.ts';
import { child } from './utils/logger.ts';
import { sleep } from './utils/wait.ts';

const log = child('screenshot-detail');

const RENDER_WAIT_MS = 14_000;
const DETAIL_RENDER_WAIT_MS = 12_000;

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const routes = requested.length
    ? APP_ROUTES.filter((r) => requested.includes(r.id))
    : APP_ROUTES.filter((r) => r.kind === 'list');

  log.info({ count: routes.length }, 'Detail-page capture pass — DATA-SAFE');

  const auth = await launchAuthenticated(true);
  const page = await auth.context.newPage();
  page.setDefaultTimeout(TIMING.defaultActionTimeout);
  page.setDefaultNavigationTimeout(TIMING.defaultNavigationTimeout);

  // S1: dismiss native dialogs.
  page.on('dialog', async (dialog) => {
    log.warn({ msg: dialog.message() }, 'native dialog DISMISSED');
    await dialog.dismiss();
  });

  try {
    await page.goto(URLS.app, { waitUntil: 'domcontentloaded' });
    await sleep(RENDER_WAIT_MS);

    let okPages = 0;
    let okShots = 0;

    for (const route of routes) {
      const url = `${URLS.app}#${route.hash}`;
      const moduleSlug = `${String(route.module).padStart(2, '0')}-module`;
      const screenshotsDir = path.join(
        OUTPUT.visualCaptures,
        moduleSlug,
        route.id,
        'screenshots',
      );
      if (!existsSync(screenshotsDir)) mkdirSync(screenshotsDir, { recursive: true });

      try {
        // Hard-navigate (dashboard then route) to clear any popup state.
        await navigateToRoute(page, url);

        // Click the first row to enter the detail page.
        const opened = await openFirstRow(page);
        if (!opened) {
          log.debug({ route: route.id }, 'no row to open — skipping detail capture');
          continue;
        }

        await sleep(DETAIL_RENDER_WAIT_MS);
        // Detail-page modals (e.g. "Попробуйте новый дизайн") block
        // tab clicks until dismissed.
        await dismissOverlays(page);

        // Default detail page (lands on the first tab — usually Главная).
        await screenshot(page, path.join(screenshotsDir, 'd-default.png'));
        await saveDom(page, path.join(screenshotsDir, 'd-default.dom.html'));
        okShots++;

        // Discover the tabs that exist for this entity, then walk them.
        const tabs = await discoverTabs(page);
        log.info({ route: route.id, tabs: tabs.map((t) => t.label) }, 'tabs found');

        for (const tab of tabs.slice(1)) {
          // (Skip the first; we already captured it as d-default.)
          const clicked = await clickTab(page, tab.label);
          if (!clicked) continue;
          // Tab-specific lazy load can take a couple of seconds.
          await sleep(3_500);
          await dismissOverlays(page);
          const slug = tabSlug(tab.label);
          await screenshot(page, path.join(screenshotsDir, `d-tab-${slug}.png`));
          await saveDom(page, path.join(screenshotsDir, `d-tab-${slug}.dom.html`));
          okShots++;
        }

        okPages++;
        log.info({ route: route.id, shots: okShots }, 'detail done');
      } catch (err) {
        log.error({ route: route.id, err: (err as Error).message }, 'route failed');
      }
      await sleep(TIMING.betweenPages);
    }

    log.info({ okPages, okShots }, 'done');
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

async function navigateToRoute(page: Page, url: string): Promise<void> {
  await page.goto(URLS.app + '#dashboard', { waitUntil: 'domcontentloaded' });
  await sleep(800);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await sleep(RENDER_WAIT_MS);
  await dismissOverlays(page);
}

/**
 * Dismiss any one-time overlay modals that block the detail-page view.
 *
 * Catches:
 *  - Generic small (X) close buttons by aria-label.
 *  - The detail-page "Попробуйте новый дизайн" prompt: a confirm-modal
 *    with `data-test-id="use-new-design-modal-close"` close button +
 *    "Старый дизайн" CTA. We click "Старый дизайн" so subsequent
 *    captures stay in the old GWT layout (which is what the rest of
 *    the spec was authored against).
 *  - The "Столбцы по статусам" prompt with the same modal class.
 *
 * Calling this between every navigation + before every interaction
 * keeps moysklad's chatty session-modals from blocking real captures.
 */
async function dismissOverlays(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      // 1. The detail-page "Попробуйте новый дизайн" modal — click
      //    "Старый дизайн" so we stay on the legacy GWT layout for
      //    consistent captures.
      const oldDesignBtn = Array.from(document.querySelectorAll('button')).find((b) => {
        const t = (b.textContent ?? '').trim();
        return t === 'Старый дизайн';
      });
      if (oldDesignBtn) {
        (oldDesignBtn as HTMLElement).click();
        return; // one click is enough; modal animates out
      }

      // 2. Generic close (X) buttons — filter to the small icon ones
      //    near the top of overlays.
      const closeButtons = Array.from(
        document.querySelectorAll('button, svg, span'),
      ).filter((el) => {
        const label = (el.getAttribute('aria-label') ?? '').toLowerCase();
        const dataTest = (el.getAttribute('data-test-id') ?? '').toLowerCase();
        return (
          /^close$|закр|dismiss/.test(label) ||
          /modal-close|use-new-design-modal-close/.test(dataTest)
        );
      });
      for (const el of closeButtons) {
        const r = el.getBoundingClientRect();
        if (r.width < 40 && r.height < 40) {
          const btn = (el as Element).closest('button, span');
          if (btn) (btn as HTMLElement).click();
        }
      }
    })
    .catch(() => undefined);
  await sleep(600);
}

/**
 * Click the first list row to navigate to its detail page. Targets
 * the first <a> link inside the table that points at a doc id (i.e.
 * the № column link).
 */
async function openFirstRow(page: Page): Promise<boolean> {
  return page
    .evaluate(() => {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
      const rowLink = links.find((a) => {
        const r = a.getBoundingClientRect();
        // Inside table cells, below the toolbar.
        const td = a.closest('td');
        return !!td && r.top > 200 && r.top < 500 && r.width > 30 && r.width < 200;
      });
      if (!rowLink) return false;
      rowLink.click();
      return true;
    })
    .catch(() => false);
}

interface DetailTab {
  label: string;
}

async function discoverTabs(page: Page): Promise<DetailTab[]> {
  const tabs = await page
    .evaluate(() => {
      // moysklad detail tabs are <div class="tabName"> inside React tab strip.
      const spans = Array.from(document.querySelectorAll('.tabName'));
      const seen = new Set<string>();
      const out: { label: string; top: number }[] = [];
      for (const s of spans) {
        const label = (s.textContent ?? '').trim();
        if (!label || seen.has(label)) continue;
        const r = (s as HTMLElement).getBoundingClientRect();
        // Tab strip lives roughly at top 100-300 below the page header.
        // Detail pages can have a taller header so we allow up to 400.
        if (r.top < 80 || r.top > 400) continue;
        seen.add(label);
        out.push({ label, top: r.top });
      }
      return out;
    })
    .catch(() => [] as { label: string; top: number }[]);
  return tabs.map((t) => ({ label: t.label }));
}

async function clickTab(page: Page, label: string): Promise<boolean> {
  return page
    .evaluate((l) => {
      // Tab labels render as <div class="tabName"> inside a <td>
      // tab-strip cell. The <div> itself often doesn't carry the
      // click handler — GWT attaches it to the <td> ancestor (a
      // `tabItem-fbjvxl` element). Walk up to find the actual
      // clickable: the closest <td>, <a>, or [role=tab].
      const spans = Array.from(document.querySelectorAll('.tabName'));
      const labelEl = spans.find((s) => (s.textContent ?? '').trim() === l);
      if (!labelEl) return false;
      const target =
        (labelEl.closest('[role="tab"]') as HTMLElement | null) ??
        (labelEl.closest('a') as HTMLElement | null) ??
        (labelEl.closest('td') as HTMLElement | null) ??
        (labelEl as HTMLElement);
      target.click();
      return true;
    }, label)
    .then((r) => sleep(500).then(() => r))
    .catch(() => false);
}

function tabSlug(label: string): string {
  // Romanise + slugify common Cyrillic tab labels for a stable filename.
  const map: Record<string, string> = {
    Главная: 'glavnaya',
    'Связанные документы': 'svyazannye-dokumenty',
    Файлы: 'fayly',
    События: 'sobytiya',
    Задачи: 'zadachi',
    История: 'istoriya',
    Аудит: 'audit',
  };
  if (map[label]) return map[label];
  return label
    .toLowerCase()
    .replace(/[\s/]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 30) || 'tab';
}

async function screenshot(page: Page, file: string): Promise<void> {
  await page.screenshot({ path: file, fullPage: false });
}

async function saveDom(page: Page, file: string): Promise<void> {
  try {
    const html = await page.content();
    writeFileSync(file, html, 'utf8');
  } catch (err) {
    log.error({ file, err: (err as Error).message }, 'saveDom failed');
  }
}

main().catch((err) => {
  log.error({ err }, 'fatal');
  process.exit(1);
});
