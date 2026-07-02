import type { Page } from 'playwright';
import { sleep } from '../../utils/wait.ts';
import { type RouteManifest, captureTrio, recordArtifact } from '../capture-io.ts';
import type { InteractionResult, RouteOutputPaths } from '../types.ts';

/**
 * Open column-settings panel via data-test-id="column-settings-btn".
 * Enumerate all available columns with their visibility state.
 */

export async function captureColumnSettings(
  page: Page,
  paths: RouteOutputPaths,
  routeId: string,
  manifest: RouteManifest,
  seqStart: number,
): Promise<InteractionResult> {
  const start = Date.now();
  const errors: string[] = [];
  let artifactsProduced = 0;

  try {
    const btn = await page.$('[data-test-id="column-settings-btn"]');
    if (!btn) {
      return {
        moduleName: 'column-settings',
        ok: true,
        artifactsProduced: 0,
        errors: [],
        durationMs: Date.now() - start,
      };
    }

    await btn.click();
    await sleep(800);

    const columnsData = await page.evaluate(() => {
      const cols: { label: string; checked: boolean; testId: string | null }[] = [];
      const panel = Array.from(document.querySelectorAll('body *')).find((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return (
          r.width > 250 &&
          r.height > 300 &&
          r.right > window.innerWidth - 500 &&
          cs.visibility !== 'hidden' &&
          cs.position !== 'static'
        );
      });
      const container = (panel ?? document) as Element | Document;
      container.querySelectorAll('input[type=checkbox]').forEach((cb) => {
        const parent = (cb as HTMLElement).closest('label, li, div');
        const labelText = (parent?.textContent ?? '').trim().slice(0, 60);
        if (labelText) {
          cols.push({
            label: labelText,
            checked: (cb as HTMLInputElement).checked,
            testId: (cb as HTMLElement).getAttribute('data-test-id'),
          });
        }
      });
      return { columns: cols, totalCount: cols.length };
    });

    const artifact = await captureTrio(page, paths, routeId, {
      seq: seqStart,
      id: 'column-settings',
      label: 'Column settings panel',
      meta: columnsData,
    });
    recordArtifact(manifest, artifact);
    artifactsProduced++;

    await page.keyboard.press('Escape').catch(() => undefined);
    await page.mouse.click(50, 500).catch(() => undefined);
    await sleep(300);
  } catch (err) {
    errors.push(`column-settings: ${(err as Error).message}`);
  }

  return {
    moduleName: 'column-settings',
    ok: errors.length === 0,
    artifactsProduced,
    errors,
    durationMs: Date.now() - start,
  };
}
