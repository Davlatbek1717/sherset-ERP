import type { Page } from 'playwright';
import { launchAuthenticated } from '../auth/session.ts';
import { TIMING, URLS } from '../config.ts';
import { APP_ROUTES, type AppRoute } from '../routes.ts';
import { child } from '../utils/logger.ts';
import { sleep } from '../utils/wait.ts';
import { captureTrio, readManifest, recordArtifact, writeManifest } from './capture-io.ts';
import { captureActionModals } from './interactions/action-modals.ts';
import { captureBanner } from './interactions/banner.ts';
import { captureColumnSettings } from './interactions/column-settings.ts';
import { captureDetailPage } from './interactions/detail-page.ts';
import { captureEditForm } from './interactions/edit-form.ts';
import { captureFieldModals } from './interactions/field-modals.ts';
import { captureFilterPanel } from './interactions/filter-panel.ts';
import { captureTitleIcons } from './interactions/page-title-icons.ts';
import { captureResponsive } from './interactions/responsive.ts';
import { captureRowContextMenu } from './interactions/row-context-menu.ts';
import { captureToolbarDropdowns } from './interactions/toolbar-dropdowns.ts';
import { captureTopBar } from './interactions/top-bar.ts';
import { detectPageProfile } from './page-detector.ts';
import { resolveRoutePaths } from './paths.ts';
import type { InteractionResult, PageCapture } from './types.ts';

const log = child('deep');

export interface DeepOptions {
  /** Only scrape these route ids */
  routes?: string[];
  /** Capture top-bar ecosystem on first route only (shared across routes) */
  captureTopBarOnFirstOnly?: boolean;
  /** Re-capture even if manifest already has the artifact */
  force?: boolean;
}

export async function runDeepCapture(opts: DeepOptions = {}): Promise<void> {
  log.info(
    { captureTopBarOnFirstOnly: opts.captureTopBarOnFirstOnly ?? true },
    'Deep capture starting',
  );

  let auth = await launchAuthenticated(true);
  let page = await auth.context.newPage();
  page.setDefaultTimeout(TIMING.defaultActionTimeout);
  page.setDefaultNavigationTimeout(TIMING.defaultNavigationTimeout);

  try {
    // Warm up
    await page.goto(URLS.app, { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    const filtered = opts.routes
      ? APP_ROUTES.filter((r) => opts.routes!.includes(r.id))
      : APP_ROUTES;
    log.info({ count: filtered.length }, 'Routes queued for deep capture');

    let firstRoute = true;

    for (const route of filtered) {
      try {
        await capturePage(page, route, {
          alsoCaptureTopBar: firstRoute,
          force: opts.force ?? false,
        });
        firstRoute = false;
      } catch (err) {
        const msg = (err as Error).message;
        log.error({ route: route.id, err: msg }, 'route deep-capture failed');
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
          await sleep(2000);
        }
      }
      await sleep(TIMING.betweenPages);
    }

    log.info('Deep capture complete.');
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

async function capturePage(
  page: Page,
  route: AppRoute,
  opts: { alsoCaptureTopBar: boolean; force: boolean },
): Promise<PageCapture> {
  const paths = await resolveRoutePaths(route.module, route.id);
  const manifest = readManifest(paths, route.id);

  const url = `${URLS.app}#${route.hash}`;
  log.info({ route: route.id, url }, 'navigating');

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await sleep(TIMING.settleAfterNav + 1500);

  // Dismiss any first-run popovers (onboarding wizard redirects to #homepage after complete)
  const dismissed = await dismissOverlays(page);

  // If we dismissed the wizard, the app likely navigated away — re-navigate to target route
  if (dismissed) {
    log.info({ route: route.id }, 're-navigating after wizard dismissal');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await sleep(1500);
    // One more pass for any in-app tutorial modals that open on first visit
    await dismissOverlays(page);
  }

  const startedAt = new Date().toISOString();
  const profile = await detectPageProfile(page, route.id, route.hash);
  log.info({ route: route.id, kind: profile.kind, title: profile.title }, 'profile detected');

  // Artifact seq starts at 1 (or continues from manifest)
  let seq = Math.max(0, ...manifest.artifacts.map((a) => a.seq)) + 1;

  const interactions: InteractionResult[] = [];

  // 1. Default screenshot
  const defaultArt = await captureTrio(page, paths, route.id, {
    seq,
    id: 'default',
    label: 'Default view',
    meta: { profile },
  });
  recordArtifact(manifest, defaultArt);
  seq++;

  // 2. Page title icons (?, refresh, settings)
  if (
    profile.kind === 'list' ||
    profile.kind === 'edit' ||
    profile.kind === 'detail' ||
    profile.kind === 'report'
  ) {
    const r = await captureTitleIcons(page, paths, route.id, manifest, seq);
    interactions.push(r);
    seq += r.artifactsProduced;
  }

  // 3. Filter panel (list pages only)
  if (profile.kind === 'list') {
    const r = await captureFilterPanel(page, paths, route.id, manifest, seq);
    interactions.push(r);
    seq += r.artifactsProduced;

    // 4. Toolbar dropdowns
    const r2 = await captureToolbarDropdowns(page, paths, route.id, manifest, seq);
    interactions.push(r2);
    seq += r2.artifactsProduced;

    // 5. Column settings
    const r3 = await captureColumnSettings(page, paths, route.id, manifest, seq);
    interactions.push(r3);
    seq += r3.artifactsProduced;

    // 5b. Right-click context menu on first row (skipped if list empty)
    const r4 = await captureRowContextMenu(page, paths, route.id, manifest, seq);
    interactions.push(r4);
    seq += r4.artifactsProduced;

    // 5c. Bulk action modals — tick a row, then walk Изменить → each item
    const r5 = await captureActionModals(page, paths, route.id, manifest, seq);
    interactions.push(r5);
    seq += r5.artifactsProduced;
  }

  // 6. Responsive breakpoints
  {
    const r = await captureResponsive(page, paths, route.id, manifest, seq);
    interactions.push(r);
    seq += r.artifactsProduced;
  }

  // 6b. Subscription banner (free-tier only; captured once per route but idempotent)
  {
    const r = await captureBanner(page, paths, route.id, manifest, seq);
    interactions.push(r);
    seq += r.artifactsProduced;
  }

  // 7. Top bar ecosystem (chat/bell/help/user) — captured on every route now
  // (alsoCaptureTopBar remains as a flag for future optimization)
  if (opts.alsoCaptureTopBar) {
    const r = await captureTopBar(page, paths, route.id, manifest, seq);
    interactions.push(r);
    seq += r.artifactsProduced;
  }

  // 8. Edit form deep capture (for list kinds — navigate to <hash>/edit?new)
  if (profile.kind === 'list') {
    const r = await captureEditForm(page, paths, route.id, route.hash, manifest, seq);
    interactions.push(r);
    seq += r.artifactsProduced;

    // 8b. Field-level pickers inside the edit form (catalog, address,
    // date, ...). The form is still open after captureEditForm
    // returns; we trigger each field-modal in turn before tearing
    // down. Skipped silently when a trigger isn't on the entity.
    const r2 = await captureFieldModals(page, paths, route.id, manifest, seq);
    interactions.push(r2);
    seq += r2.artifactsProduced;
  }

  // 9. Detail page (list kinds only — open first row, walk tabs)
  if (profile.kind === 'list') {
    // Re-navigate to the list before the detail click — the previous
    // edit-form capture may have left us on a different URL.
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await sleep(TIMING.settleAfterNav + 500);
    const r = await captureDetailPage(page, paths, route.id, manifest, seq);
    interactions.push(r);
    seq += r.artifactsProduced;
  }

  writeManifest(paths, manifest);

  const finishedAt = new Date().toISOString();
  const totalDurationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();

  const totalArtifacts = interactions.reduce((s, i) => s + i.artifactsProduced, 0) + 1;
  log.info(
    {
      route: route.id,
      kind: profile.kind,
      artifacts: totalArtifacts,
      interactions: interactions.length,
      ms: totalDurationMs,
    },
    'route captured',
  );

  return {
    profile,
    artifacts: manifest.artifacts,
    interactions,
    startedAt,
    finishedAt,
    totalDurationMs,
  };
}

async function dismissOverlays(page: Page): Promise<boolean> {
  let dismissed = false;

  // 1. Handle the business-direction onboarding wizard that blocks everything
  //    on first-visit accounts. Select "Другой бизнес" + description + click "Начать работу"
  const handledOnboarding = await page
    .evaluate(() => {
      const surveyBackdrop = document.querySelector(
        '[data-test-id="surveyModalWindow"], [class*="backdrop"][class*="survey"]',
      );
      const hasWizardH1 = Array.from(document.querySelectorAll('h1, h2')).some((el) =>
        /Основное направление вашего бизнеса/i.test(el.textContent ?? ''),
      );
      if (!surveyBackdrop && !hasWizardH1) return false;

      // Find the "Другой бизнес" card and click it
      const otherCard = Array.from(
        document.querySelectorAll('label, div[class*="card"], [class*="card"]'),
      ).find((el) => /^Другой бизнес$/.test((el.textContent ?? '').trim()));
      if (otherCard) {
        const radio = otherCard.querySelector('input[type="radio"]');
        if (radio) {
          (radio as HTMLInputElement).click();
        } else {
          (otherCard as HTMLElement).click();
        }
      }

      // Fill in the "Опишите свой бизнес" input
      const descInput = Array.from(
        document.querySelectorAll('input[type="text"], input:not([type])'),
      ).find((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return r.width > 200 && r.top > 300;
      });
      if (descInput) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        nativeSetter?.call(descInput, 'Универсальная торговля');
        (descInput as HTMLInputElement).dispatchEvent(new Event('input', { bubbles: true }));
        (descInput as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    })
    .catch(() => false);

  if (handledOnboarding) {
    await sleep(800);
    // Click "Начать работу"
    await page
      .evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(
          (b) =>
            (b.textContent ?? '').trim() === 'Начать работу' && !(b as HTMLButtonElement).disabled,
        );
        if (btn) {
          (btn as HTMLButtonElement).click();
          return true;
        }
        return false;
      })
      .catch(() => undefined);
    await sleep(2500);
    dismissed = true;
  }

  // 2. Close the "Первые шаги в товароучете" tutorial modal if it auto-opens
  const closedTutorial = await page
    .evaluate(() => {
      const hasTutorial = Array.from(document.querySelectorAll('h1, h2, h3')).some((el) =>
        /Первые шаги в товароучете|Укажите название вашей компании/i.test(el.textContent ?? ''),
      );
      if (!hasTutorial) return false;
      const closeIcon = Array.from(document.querySelectorAll('svg, button')).find((el) => {
        const r = (el as Element).getBoundingClientRect();
        return r.top < 150 && r.right > 1250 && r.width < 40 && r.height < 40;
      });
      if (closeIcon) {
        const btn = (closeIcon as Element).closest('button') ?? (closeIcon as Element);
        (btn as HTMLElement).click();
        return true;
      }
      return false;
    })
    .catch(() => false);
  await sleep(400);
  if (closedTutorial) dismissed = true;

  // 3. Close the help bubble ("Нужна помощь?") if visible
  await page
    .evaluate(() => {
      const hasBubble = Array.from(document.querySelectorAll('*')).some(
        (el) => /Нужна помощь\?/i.test(el.textContent ?? '') && el.children.length < 10,
      );
      if (!hasBubble) return;
      const closeBtn = Array.from(document.querySelectorAll('button, svg')).find((el) => {
        const r = (el as Element).getBoundingClientRect();
        return r.top > 100 && r.top < 200 && r.right > 1200 && r.right < 1400 && r.width < 40;
      });
      if (closeBtn) {
        const btn = (closeBtn as Element).closest('button') ?? (closeBtn as Element);
        (btn as HTMLElement).click();
      }
    })
    .catch(() => undefined);
  await sleep(300);

  // 4. Generic close for any remaining aria-labeled close buttons
  await page
    .evaluate(() => {
      const close = Array.from(document.querySelectorAll('button, svg')).filter((el) => {
        const label = (el.getAttribute('aria-label') ?? '').toLowerCase();
        return /^close$|закр|dismiss/.test(label);
      });
      for (const el of close) {
        const r = el.getBoundingClientRect();
        if (r.width < 40 && r.height < 40) {
          const btn = (el as Element).closest('button');
          if (btn) (btn as HTMLButtonElement).click();
        }
      }
    })
    .catch(() => undefined);
  await sleep(300);

  return dismissed;
}
