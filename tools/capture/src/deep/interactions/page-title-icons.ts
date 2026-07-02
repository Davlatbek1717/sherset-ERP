import type { Page } from 'playwright';
import { sleep } from '../../utils/wait.ts';
import { type RouteManifest, captureTrio, recordArtifact } from '../capture-io.ts';
import type { InteractionResult, RouteOutputPaths } from '../types.ts';

/**
 * Capture icon popovers near the page title.
 * Moysklad uses precise data-test-ids like:
 *   data-test-id="page-header-<entity>-refresh-button"
 *   data-test-id="page-header-<entity>-settings-button"
 *   data-test-id="page-header-<entity>-search-input"
 * plus title-attr icons like title="Помощь" (help).
 */

const ICON_SELECTORS = [
  { id: 'refresh', selector: '[data-test-id$="-refresh-button"]', label: 'Refresh' },
  { id: 'settings', selector: '[data-test-id$="-settings-button"]', label: 'Settings' },
  {
    id: 'help',
    selector: '[title="Помощь"], [data-test-id*="help"][data-test-id*="icon"]',
    label: 'Help',
  },
];

export async function captureTitleIcons(
  page: Page,
  paths: RouteOutputPaths,
  routeId: string,
  manifest: RouteManifest,
  seqStart: number,
): Promise<InteractionResult> {
  const start = Date.now();
  const errors: string[] = [];
  let artifactsProduced = 0;
  let seq = seqStart;

  for (const { id, selector, label } of ICON_SELECTORS) {
    try {
      const el = await page.$(selector);
      if (!el) continue;

      await el.click();
      await sleep(500);

      const popoverInfo = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('body *')).filter((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return (
            r.width > 100 &&
            r.height > 40 &&
            cs.visibility !== 'hidden' &&
            cs.opacity !== '0' &&
            (cs.position === 'fixed' || cs.position === 'absolute') &&
            Number.parseInt(cs.zIndex || '0', 10) >= 100
          );
        });
        const top = candidates.sort(
          (a, b) =>
            Number.parseInt(getComputedStyle(b).zIndex || '0', 10) -
            Number.parseInt(getComputedStyle(a).zIndex || '0', 10),
        )[0];
        return top
          ? {
              text: (top.textContent ?? '').trim().slice(0, 500),
              html: top.outerHTML.slice(0, 3000),
            }
          : null;
      });

      const artifact = await captureTrio(page, paths, routeId, {
        seq,
        id: `title-icon-${id}`,
        label: `Title icon — ${label}`,
        meta: { icon: id, selectorUsed: selector, popover: popoverInfo },
      });
      recordArtifact(manifest, artifact);
      artifactsProduced++;
      seq++;

      await page.mouse.click(50, 500).catch(() => undefined);
      await page.keyboard.press('Escape').catch(() => undefined);
      await sleep(250);
    } catch (err) {
      errors.push(`${id}: ${(err as Error).message}`);
    }
  }

  return {
    moduleName: 'page-title-icons',
    ok: errors.length === 0,
    artifactsProduced,
    errors,
    durationMs: Date.now() - start,
  };
}
