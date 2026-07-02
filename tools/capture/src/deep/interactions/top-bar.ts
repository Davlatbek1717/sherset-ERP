import type { Page } from 'playwright';
import { sleep } from '../../utils/wait.ts';
import { type RouteManifest, captureTrio, recordArtifact } from '../capture-io.ts';
import type { InteractionResult, RouteOutputPaths } from '../types.ts';

/**
 * Capture the ecosystem UI in the app's top blue bar:
 *   - Chat icon panel
 *   - Notification bell panel
 *   - Help (?) panel
 *   - User avatar dropdown
 *
 * These are shared across ALL routes but capturing them on a couple of pages
 * is enough (we only need to see them once).
 */

const TOP_RIGHT_ICONS = [
  { id: 'top-chat', approxX: 1215 },
  { id: 'top-bell', approxX: 1260 },
  { id: 'top-help', approxX: 1305 },
  { id: 'top-user', approxX: 1485 }, // Click on avatar / user area
];

export async function captureTopBar(
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

  for (const icon of TOP_RIGHT_ICONS) {
    try {
      // Click the icon approximately
      await page.mouse.click(icon.approxX, 87);
      await sleep(700);

      // Capture state
      const panelInfo = await page.evaluate(() => {
        const overlays = Array.from(document.querySelectorAll('body *')).filter((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return (
            r.width > 150 &&
            r.height > 100 &&
            (cs.position === 'fixed' || cs.position === 'absolute') &&
            Number.parseInt(cs.zIndex || '0', 10) >= 50 &&
            cs.visibility !== 'hidden' &&
            r.top < 400
          );
        });
        const top = overlays[0];
        return top
          ? {
              text: (top.textContent ?? '').trim().slice(0, 800),
              outerHtml: top.outerHTML.slice(0, 5000),
              bbox: {
                x: top.getBoundingClientRect().left,
                y: top.getBoundingClientRect().top,
                w: top.getBoundingClientRect().width,
                h: top.getBoundingClientRect().height,
              },
            }
          : null;
      });

      if (panelInfo) {
        const artifact = await captureTrio(page, paths, routeId, {
          seq,
          id: icon.id,
          label: `Top bar — ${icon.id.replace('top-', '')}`,
          meta: { icon: icon.id, panel: panelInfo },
        });
        recordArtifact(manifest, artifact);
        artifactsProduced++;
        seq++;
      }

      // Dismiss
      await page.mouse.click(50, 500).catch(() => undefined);
      await page.keyboard.press('Escape').catch(() => undefined);
      await sleep(300);
    } catch (err) {
      errors.push(`${icon.id}: ${(err as Error).message}`);
    }
  }

  return {
    moduleName: 'top-bar',
    ok: errors.length === 0,
    artifactsProduced,
    errors,
    durationMs: Date.now() - start,
  };
}
