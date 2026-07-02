#!/usr/bin/env tsx
/**
 * Capture toolbar dropdowns + filter panel for each route, one
 * screenshot per interaction. Reads from a LIVE moysklad account
 * with REAL production data, so this script is built to be SAFE:
 * it only opens dropdowns to read their menu items, NEVER clicks
 * an action item inside a dropdown.
 *
 * ── DATA SAFETY GUARANTEES ────────────────────────────────────
 *  S1. Confirm dialogs are auto-cancelled (not auto-accepted).
 *      If a click somehow triggers a confirm prompt, we say NO.
 *  S2. Row-checkbox selections are RESTORED to unselected after
 *      every interaction so the live UI state is left clean.
 *  S3. After opening a dropdown we ONLY screenshot + read DOM —
 *      we never call `.click()` on `gwt-MenuItem` or any menu row.
 *  S4. We never touch the "Удалить" (delete) trigger directly.
 *      The TOOLBAR_DROPDOWNS list contains DROPDOWN TRIGGERS only,
 *      never destructive action labels.
 *  S5. Each interaction starts with a hard navigate (dashboard →
 *      target route) so leftover state can't bleed in. Combined
 *      with S2, the moysklad account state is the same at script
 *      end as at the start.
 *  S6. We send Escape after every screenshot. Many GWT popups
 *      ignore Escape, but the hard navigate in step S5 covers
 *      the case where a popup stays stuck.
 *  S7. We never enter text into any input field.
 *  S8. We never navigate forms or click "Save"/"Сохранить" buttons.
 * ────────────────────────────────────────────────────────────────
 *
 * Output per route:
 *   screenshots/i-default.png             — clean default
 *   screenshots/i-default.dom.html        — DOM at default
 *   screenshots/i-dropdown-izmenit.png    — bulk-action menu open
 *   screenshots/i-dropdown-izmenit.dom.html
 *   screenshots/i-dropdown-status.png     — status dropdown open
 *   screenshots/i-dropdown-sozdat.png     — create dropdown open
 *   screenshots/i-dropdown-pechat.png     — print dropdown open
 *   screenshots/i-dropdown-otpravit.png   — send dropdown open
 *   screenshots/i-dropdown-stolbcy.png    — columns dropdown open
 *   screenshots/i-filter-panel.png        — filter side-panel open
 *
 * KEY DISCOVERIES (probe-toolbar.ts, 2026-04-30):
 *   1. moysklad's app is GWT (Google Web Toolkit) compiled.
 *      Toolbar buttons compile to <span> elements, NOT <button>.
 *      We must include `span` in our selectors.
 *   2. Initial render takes ~12-15s for list pages (API fetch +
 *      GWT widget build). We wait 14s after each navigation.
 *   3. Bulk-action dropdowns ("Изменить", "Статус", "Отправить")
 *      ARE visible at default but only show real items once a row
 *      is selected. We tick the first row's checkbox before
 *      testing them — and untick it again afterwards (S2).
 *   4. Hash-route navigation in moysklad is a no-op when same
 *      hash is requested twice; we navigate to #dashboard first
 *      to force a state reset.
 *   5. Popup class is `popup-button-popup-menu` with rows of
 *      `gwt-MenuItem` (a <td>, not a <button>).
 *
 * Run:
 *   pnpm --filter @moysklad/capture exec tsx \
 *     src/screenshot-interactions.ts [route1 route2 ...]
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { launchAuthenticated } from './auth/session.ts';
import { TIMING, URLS, OUTPUT } from './config.ts';
import { APP_ROUTES } from './routes.ts';
import { child } from './utils/logger.ts';
import { sleep } from './utils/wait.ts';

const log = child('screenshot-interactions');

interface Dropdown {
  /** Visible button text */
  label: string;
  /** Output filename stem */
  file: string;
  /** Whether the toolbar button only fully populates once a row is selected */
  needsRowSelected: boolean;
}

const TOOLBAR_DROPDOWNS: Dropdown[] = [
  // Labels MUST match the exact <span class="text"> textContent of the
  // toolbar trigger. Validated against customerorder probe-after-select
  // (2026-04-30, account farrux@climart_santex_group).
  //
  // NOTE: Different routes expose different dropdowns. "Отправить"
  // exists on demand/factureout but NOT on customerorder. Each label
  // is attempted; the script silently skips routes that don't have it.
  { label: 'Изменить', file: 'i-dropdown-izmenit', needsRowSelected: true },
  { label: 'Статус', file: 'i-dropdown-status', needsRowSelected: true },
  { label: 'Создать', file: 'i-dropdown-sozdat', needsRowSelected: true },
  { label: 'Печать', file: 'i-dropdown-pechat', needsRowSelected: false },
  { label: 'Отправить', file: 'i-dropdown-otpravit', needsRowSelected: true },
  { label: 'Столбцы', file: 'i-dropdown-stolbcy', needsRowSelected: false },
];

/** Time to wait after navigation for GWT to render the toolbar + list. */
const RENDER_WAIT_MS = 14_000;

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const routes = requested.length
    ? APP_ROUTES.filter((r) => requested.includes(r.id))
    : APP_ROUTES;

  log.info({ count: routes.length }, 'Interaction screenshot pass — DATA-SAFE mode');

  const auth = await launchAuthenticated(true);
  const page = await auth.context.newPage();
  page.setDefaultTimeout(TIMING.defaultActionTimeout);
  page.setDefaultNavigationTimeout(TIMING.defaultNavigationTimeout);

  // S1: auto-cancel any native confirm/alert/prompt dialog.
  page.on('dialog', async (dialog) => {
    log.warn(
      { type: dialog.type(), msg: dialog.message() },
      'native dialog encountered — DISMISSING for safety',
    );
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
        await navigateToRoute(page, url);

        // Default
        await screenshot(page, path.join(screenshotsDir, 'i-default.png'));
        await saveDom(page, path.join(screenshotsDir, 'i-default.dom.html'));
        okShots++;

        // Each toolbar dropdown
        for (const dd of TOOLBAR_DROPDOWNS) {
          await navigateToRoute(page, url);

          let rowWasSelected = false;
          if (dd.needsRowSelected) {
            rowWasSelected = await selectFirstRow(page);
            if (!rowWasSelected) {
              log.debug(
                { route: route.id, dd: dd.label },
                'no row to select — skipping bulk dropdown',
              );
              continue;
            }
          }

          const urlBefore = page.url();
          const opened = await openDropdown(page, dd.label);
          const urlAfter = page.url();

          if (!opened) {
            log.debug({ route: route.id, dd: dd.label }, 'trigger not found on page');
            // S2: clean up if we selected a row.
            if (rowWasSelected) await unselectFirstRow(page);
            continue;
          }
          if (urlBefore !== urlAfter) {
            log.warn(
              { route: route.id, dd: dd.label, urlBefore, urlAfter },
              'click navigated away — top-nav match, not a dropdown',
            );
            continue;
          }

          // Some triggers — notably "Столбцы" — open a one-time
          // "use new design" modal on first click instead of the
          // expected dropdown. Detect that case, dismiss the modal,
          // then re-click the trigger; the second click usually shows
          // the real popup since the modal is shown only once per
          // session.
          let popupVisible = await waitForPopup(page);
          if (!popupVisible) {
            const modalDismissed = await dismissModalIfPresent(page);
            if (modalDismissed) {
              await sleep(400);
              await openDropdown(page, dd.label);
              popupVisible = await waitForPopup(page);
            }
          }
          if (!popupVisible) {
            log.debug(
              { route: route.id, dd: dd.label },
              'click did not open a popup — skipping',
            );
            if (rowWasSelected) await unselectFirstRow(page);
            continue;
          }

          await screenshot(page, path.join(screenshotsDir, `${dd.file}.png`));
          await saveDom(page, path.join(screenshotsDir, `${dd.file}.dom.html`));
          okShots++;

          // S6: Escape; full reset comes from next iteration's hard navigate.
          await page.keyboard.press('Escape').catch(() => undefined);
          await sleep(250);
          // S2 cleanup: untick if checkbox is still set.
          if (rowWasSelected) await unselectFirstRow(page);
        }

        // Filter panel
        await navigateToRoute(page, url);
        const urlBefore = page.url();
        const filterOpened = await openFilterPanel(page);
        const urlAfter = page.url();
        if (filterOpened && urlBefore === urlAfter) {
          const panelVisible = await waitForFilterPanel(page);
          if (panelVisible) {
            await screenshot(page, path.join(screenshotsDir, 'i-filter-panel.png'));
            await saveDom(page, path.join(screenshotsDir, 'i-filter-panel.dom.html'));
            okShots++;
            await page.keyboard.press('Escape').catch(() => undefined);
            await sleep(250);
          }
        }

        okPages++;
        log.info({ route: route.id, shots: okShots }, 'route done');
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
  // moysklad is a hash-routed SPA; goto the same hash is a no-op
  // and won't clear popups left over from previous interactions.
  // Force a full reload by navigating to dashboard first.
  await page.goto(URLS.app + '#dashboard', { waitUntil: 'domcontentloaded' });
  await sleep(800);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await sleep(RENDER_WAIT_MS);
  await dismissOverlays(page);
}

/**
 * Dismiss any one-time overlay modals that block normal interaction.
 *
 * Catches:
 *  - Generic small (X) close buttons by aria-label.
 *  - The detail-page "Попробуйте новый дизайн" prompt — clicks
 *    "Старый дизайн" so we stay on the legacy GWT layout for
 *    consistent captures.
 *  - The "Столбцы по статусам" prompt with the same modal class
 *    (also dismissed via "Старый дизайн" → defaults to keeping old UI).
 *
 * Calling this between every navigation + before every interaction
 * keeps moysklad's chatty session-modals from blocking real captures.
 */
async function dismissOverlays(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      // 1. "Попробуйте новый дизайн" / "Столбцы по статусам" modals —
      //    click "Старый дизайн" so we stay on the legacy GWT layout.
      //    The same button label appears on both modals.
      const oldDesignBtn = Array.from(document.querySelectorAll('button')).find((b) => {
        const t = (b.textContent ?? '').trim();
        return t === 'Старый дизайн';
      });
      if (oldDesignBtn) {
        (oldDesignBtn as HTMLElement).click();
        return;
      }
      // 2. Generic close (X) buttons — filter to small icon ones near
      //    the top of overlays.
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
 * Tick the first list-row checkbox so bulk-action dropdowns become
 * available. SAFE: this only changes UI selection state in memory;
 * no API call is made until an action button is clicked, which we
 * never do. We also un-tick afterwards (see unselectFirstRow).
 */
async function selectFirstRow(page: Page): Promise<boolean> {
  const ok = await page
    .evaluate(() => {
      const checkboxes = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type=checkbox]'),
      );
      const rowCheckbox = checkboxes.find((cb) => {
        const tr = cb.closest('tr');
        const td = cb.closest('td');
        const r = cb.getBoundingClientRect();
        return tr && td && r.width > 0 && r.top > 100;
      });
      if (!rowCheckbox) return false;
      // Only click if not already checked — paranoid no-op safeguard.
      if (!rowCheckbox.checked) rowCheckbox.click();
      return true;
    })
    .catch(() => false);
  await sleep(500);
  return ok;
}

/**
 * S2 cleanup: un-tick the first row's checkbox after we're done so
 * we leave the live moysklad UI in the same state we found it.
 */
async function unselectFirstRow(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      const checkboxes = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type=checkbox]'),
      );
      const rowCheckbox = checkboxes.find((cb) => {
        const tr = cb.closest('tr');
        const td = cb.closest('td');
        return tr && td && cb.checked;
      });
      if (rowCheckbox) rowCheckbox.click(); // toggle off
    })
    .catch(() => undefined);
  await sleep(200);
}

async function openDropdown(page: Page, label: string): Promise<boolean> {
  return page
    .evaluate((l) => {
      // moysklad's GWT app uses <span> for most clickable triggers.
      // We include button/a/span. Exclude top header (top<100) and
      // below-fold (top>=550). Toolbar dropdowns live in 100-550 zone.
      // Toolbar triggers in moysklad's GWT app use the exact pattern:
      //   <span class="text">{label}</span>
      // We require the EXACT span.text textContent to equal the label
      // — this is the most reliable selector and rules out matches
      // inside sub-nav links or popup items.
      const spans = Array.from(document.querySelectorAll('span.text'));
      const match = spans.find((el) => {
        const t = (el.textContent ?? '').trim();
        if (t !== l) return false;
        const r = el.getBoundingClientRect();
        return r.top >= 100 && r.top < 550 && r.width > 20 && r.width < 250;
      });
      if (!match) return false;
      (match as HTMLElement).click();
      return true;
    }, label)
    .then((result) => {
      return sleep(500).then(() => result);
    })
    .catch(() => false);
}

async function openFilterPanel(page: Page): Promise<boolean> {
  return page
    .evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span.text'));
      const match = spans.find((el) => {
        const t = (el.textContent ?? '').trim();
        if (t !== 'Фильтр') return false;
        const r = el.getBoundingClientRect();
        return r.top >= 100 && r.top < 550 && r.width > 20 && r.width < 250;
      });
      if (!match) return false;
      (match as HTMLElement).click();
      return true;
    })
    .then((result) => {
      return sleep(700).then(() => result);
    })
    .catch(() => false);
}

/**
 * Wait up to ~1.5s for any popup/menu/dropdown panel to appear.
 * Returns true if a panel is detected, false otherwise.
 *
 * moysklad's GWT framework uses `popup-button-popup-menu` for
 * toolbar dropdowns and `popupContent` for content. Items are
 * <td class="gwt-MenuItem"> rows.
 */
async function waitForPopup(page: Page): Promise<boolean> {
  for (let i = 0; i < 15; i++) {
    const visible = await page
      .evaluate(() => {
        const sel = [
          '.popup-button-popup-menu',
          '.popup-button-popup',
          '.b-popup-list',
          '.b-popup-list-item',
          '.popup-content',
          '.popupContent',
          '.dropdown-menu',
          '[role="menu"]',
          '[role="menubar"]',
          '.b-list-popover',
          '.list-actions__menu',
          '.b-popover',
          '.b-popup',
          'div[role="tooltip"]',
        ].join(',');
        const els = Array.from(document.querySelectorAll(sel));
        return els.some((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return r.width > 60 && r.height > 30 && r.top < 800 && r.left < 1500;
        });
      })
      .catch(() => false);
    if (visible) return true;
    await sleep(100);
  }
  return false;
}

/**
 * Filter panels slide in from the right as a side panel. Wait up to ~1.5s.
 */
async function waitForFilterPanel(page: Page): Promise<boolean> {
  for (let i = 0; i < 15; i++) {
    const visible = await page
      .evaluate(() => {
        const sel = [
          '.b-filter-panel',
          '.filter-panel',
          '.b-filter-form',
          '.filter-form',
          '[data-test*="filter-panel"]',
          '.b-side-panel',
          '.b-side-bar',
          '.b-rich-filter',
          '.rich-filter',
        ].join(',');
        const els = Array.from(document.querySelectorAll(sel));
        return els.some((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return r.width > 200 && r.height > 200;
        });
      })
      .catch(() => false);
    if (visible) return true;
    await sleep(100);
  }
  return false;
}

/**
 * Detect the "use new design" / "Столбцы по статусам" modal and
 * dismiss it via the "Старый дизайн" button. Returns true if a modal
 * was present and dismissed, false otherwise.
 */
async function dismissModalIfPresent(page: Page): Promise<boolean> {
  return page
    .evaluate(() => {
      const modal = document.querySelector('[data-test-id="confirm-modal"]');
      if (!modal) return false;
      const oldDesign = Array.from(document.querySelectorAll('button')).find(
        (b) => (b.textContent ?? '').trim() === 'Старый дизайн',
      );
      if (oldDesign) {
        (oldDesign as HTMLElement).click();
        return true;
      }
      const close = modal.querySelector<HTMLElement>(
        '[data-test-id="confirm-modal-close-button"], [data-test-id*="modal-close"]',
      );
      if (close) {
        close.click();
        return true;
      }
      return false;
    })
    .then((r) => sleep(400).then(() => r))
    .catch(() => false);
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
