import type { Page } from 'playwright';
import { VIEWPORT } from '../../config.ts';
import { sleep } from '../../utils/wait.ts';
import { type RouteManifest, captureTrio, recordArtifact } from '../capture-io.ts';
import type { InteractionResult, RouteOutputPaths } from '../types.ts';

/**
 * Capture responsive breakpoints — mobile (375px), tablet (768px), desktop (1440px).
 * Uses Playwright's setViewportSize.
 */

const BREAKPOINTS = [
  { id: 'mobile', width: 375, height: 812, device: 'iPhone X' },
  { id: 'tablet', width: 768, height: 1024, device: 'iPad' },
  // Desktop is default — already captured in default.png
];

export async function captureResponsive(
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

  for (const bp of BREAKPOINTS) {
    try {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await sleep(800); // Let layout reflow

      const info = await page.evaluate(() => ({
        scrollHeight: document.body.scrollHeight,
        clientWidth: document.body.clientWidth,
        navCollapsed: !!document.querySelector('[class*=burger], [class*=hamburger]'),
      }));

      const artifact = await captureTrio(page, paths, routeId, {
        seq,
        id: `responsive-${bp.id}`,
        label: `Responsive: ${bp.device} (${bp.width}px)`,
        meta: { breakpoint: bp, ...info },
      });
      recordArtifact(manifest, artifact);
      artifactsProduced++;
      seq++;
    } catch (err) {
      errors.push(`responsive-${bp.id}: ${(err as Error).message}`);
    }
  }

  // Restore desktop viewport
  try {
    await page.setViewportSize({ width: VIEWPORT.width, height: VIEWPORT.height });
    await sleep(500);
  } catch {
    // ignore
  }

  return {
    moduleName: 'responsive',
    ok: errors.length === 0,
    artifactsProduced,
    errors,
    durationMs: Date.now() - start,
  };
}
