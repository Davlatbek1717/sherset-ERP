import type { Page } from 'playwright';
import { sleep } from '../../utils/wait.ts';
import { type RouteManifest, captureTrio, recordArtifact } from '../capture-io.ts';
import type { InteractionResult, RouteOutputPaths } from '../types.ts';

/**
 * Open the filter panel via data-test-id="page-header-*-filter-button".
 * Then enumerate all filter fields by label and control type.
 */

export async function captureFilterPanel(
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
    // Click filter button (reliable via test-id)
    const filterBtn = await page.$('[data-test-id$="-filter-button"]');
    if (!filterBtn) {
      // Fallback: text-based
      const clicked = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button, a')).find((el) =>
          /^Фильтр/i.test((el.textContent ?? '').trim()),
        );
        if (btn) {
          (btn as HTMLButtonElement).click();
          return true;
        }
        return false;
      });
      if (!clicked) {
        return {
          moduleName: 'filter-panel',
          ok: true,
          artifactsProduced: 0,
          errors: [],
          durationMs: Date.now() - start,
        };
      }
    } else {
      await filterBtn.click();
    }

    await sleep(900);

    const filterData = await page.evaluate(() => {
      const fields: {
        label: string;
        type: string;
        placeholder: string | null;
        disabled: boolean;
        hasQuickChips: boolean;
        testId: string | null;
      }[] = [];

      const seenLabels = new Set<string>();
      document.querySelectorAll('input, select, textarea').forEach((el) => {
        const htmlEl = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        const r = htmlEl.getBoundingClientRect();
        if (r.top < 200 || r.top > 900) return;
        if (htmlEl.type === 'hidden') return;

        let labelEl: Element | null = null;
        let walker: Element | null = htmlEl;
        for (let i = 0; i < 6 && walker; i++) {
          const prev = walker.previousElementSibling;
          if (prev) {
            const prevText = (prev.textContent ?? '').trim();
            if (prev.tagName === 'LABEL' || (prevText.length > 0 && prevText.length < 60)) {
              labelEl = prev;
              break;
            }
          }
          walker = walker.parentElement;
        }
        if (!labelEl) {
          const parent = htmlEl.closest('[class*=field], [class*=row], td, div');
          labelEl = parent?.querySelector('label, [class*=label]') ?? null;
        }
        const label = (labelEl?.textContent ?? '')
          .trim()
          .replace(/^[•●]\s*/, '')
          .slice(0, 60);
        if (!label || seenLabels.has(label)) return;
        seenLabels.add(label);

        const chipsEl = htmlEl
          .closest('[class*=field], [class*=row]')
          ?.querySelector('[class*=chips], [class*=quick]');
        const hasQuickChips = !!chipsEl;

        fields.push({
          label,
          type:
            htmlEl.tagName.toLowerCase() +
            (htmlEl instanceof HTMLInputElement ? ':' + htmlEl.type : ''),
          placeholder: htmlEl.getAttribute('placeholder'),
          disabled: htmlEl.disabled,
          hasQuickChips,
          testId: htmlEl.getAttribute('data-test-id'),
        });
      });

      const actionButtons = Array.from(document.querySelectorAll('button, a'))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.top > 200 && r.top < 380 && r.width > 20;
        })
        .map((el) => ({
          label: (el.textContent ?? '').trim().slice(0, 30),
          testId: el.getAttribute('data-test-id'),
        }))
        .filter((b) => b.label);

      return { fieldCount: fields.length, fields, actionButtons };
    });

    const artifact = await captureTrio(page, paths, routeId, {
      seq: seqStart,
      id: 'filter-panel',
      label: 'Filter panel (expanded)',
      meta: filterData,
    });
    recordArtifact(manifest, artifact);
    artifactsProduced++;

    // Close filter
    const closeBtn = await page.$('[data-test-id$="-filter-button"]');
    if (closeBtn) await closeBtn.click().catch(() => undefined);
    await sleep(400);
  } catch (err) {
    errors.push(`filter-panel: ${(err as Error).message}`);
  }

  return {
    moduleName: 'filter-panel',
    ok: errors.length === 0,
    artifactsProduced,
    errors,
    durationMs: Date.now() - start,
  };
}
