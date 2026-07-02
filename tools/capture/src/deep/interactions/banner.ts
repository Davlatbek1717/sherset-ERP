import type { Page } from 'playwright';
import { type RouteManifest, captureTrio, recordArtifact } from '../capture-io.ts';
import type { InteractionResult, RouteOutputPaths } from '../types.ts';

/**
 * Capture the subscription/upgrade banner + "Выбрать тариф" modal flow.
 * These are the top-bar marketing elements unique to free-tier accounts.
 */

export async function captureBanner(
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

  try {
    const banner = await page.$('[data-test-id="subscriptionBanner"]');
    if (!banner) {
      return {
        moduleName: 'banner',
        ok: true,
        artifactsProduced: 0,
        errors: [],
        durationMs: Date.now() - start,
      };
    }

    // Capture banner contents
    const bannerInfo = await page.evaluate(() => {
      const b = document.querySelector('[data-test-id="subscriptionBanner"]');
      if (!b) return null;
      return {
        text: (b.textContent ?? '').trim().slice(0, 500),
        ctaLabel: (
          b.querySelector('[data-test-id="selectTariffButton"]')?.textContent ?? ''
        ).trim(),
        html: b.outerHTML.slice(0, 2000),
      };
    });

    const artifact = await captureTrio(page, paths, routeId, {
      seq,
      id: 'banner',
      label: 'Subscription / upgrade banner',
      meta: bannerInfo ?? {},
    });
    recordArtifact(manifest, artifact);
    artifactsProduced++;
    seq++;
  } catch (err) {
    errors.push(`banner: ${(err as Error).message}`);
  }

  return {
    moduleName: 'banner',
    ok: errors.length === 0,
    artifactsProduced,
    errors,
    durationMs: Date.now() - start,
  };
}
