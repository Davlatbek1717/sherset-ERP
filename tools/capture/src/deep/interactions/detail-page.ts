import type { Page } from 'playwright';
import { sleep } from '../../utils/wait.ts';
import { type RouteManifest, captureTrio, recordArtifact } from '../capture-io.ts';
import type { InteractionResult, RouteOutputPaths } from '../types.ts';

/**
 * Open the first row in a list page and capture the resulting detail
 * view (read-only). moysklad's detail screens differ from the edit
 * form — they show the document with linked-document tabs, audit
 * trail, attachments, and the "edit" toggle. This interaction also
 * captures each detail tab (Главная / Связанные документы / Файлы /
 * События / Задачи) so the parity work has the full surface.
 *
 * Skipped silently when the list is empty (no rows = no detail to
 * capture). Re-uses the back button to return to the list before
 * the next interaction kicks in.
 */

const DETAIL_TABS = ['Главная', 'Связанные документы', 'Файлы', 'События', 'Задачи'];

export async function captureDetailPage(
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
    // Find the first clickable row in the list table. moysklad uses a
    // `<tr>` with `data-test-id` patterns or simply a clickable cell.
    const firstRow = await page.evaluate(() => {
      // Look for table rows with content (skip header)
      const rows = Array.from(document.querySelectorAll('tbody tr')).filter((tr) => {
        const r = tr.getBoundingClientRect();
        return r.height > 20 && r.width > 100;
      });
      const first = rows[0];
      if (!first) return null;
      // Click first cell with text (usually the document number)
      const cell = Array.from(first.querySelectorAll('td')).find((td) => {
        const text = (td.textContent ?? '').trim();
        return text.length > 0 && !td.querySelector('input[type=checkbox]');
      });
      const target = cell ?? first;
      const r = (target as HTMLElement).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });

    if (!firstRow) {
      // Empty list — nothing to capture
      return {
        moduleName: 'detail-page',
        ok: true,
        artifactsProduced: 0,
        errors: [],
        durationMs: Date.now() - start,
      };
    }

    // Click row → navigate to detail page
    await page.mouse.click(firstRow.x, firstRow.y);
    await sleep(2000); // moysklad SPA transitions take ~1.5s

    // Default detail view
    const defaultArt = await captureTrio(page, paths, routeId, {
      seq,
      id: 'detail-default',
      label: 'Detail page — default tab',
      meta: { tab: DETAIL_TABS[0] },
    });
    recordArtifact(manifest, defaultArt);
    artifactsProduced++;
    seq++;

    // Walk through each detail tab and capture the body. Skip the
    // first tab (already captured as default) and any tab that fails
    // to click — moysklad doesn't ship every tab on every entity.
    for (let i = 1; i < DETAIL_TABS.length; i++) {
      const tabLabel = DETAIL_TABS[i]!;
      const clicked = await page
        .evaluate((expected) => {
          // Match tab buttons in the page's tab strip
          const candidates = Array.from(document.querySelectorAll('a, button')).filter((el) => {
            const t = (el.textContent ?? '').trim();
            const r = el.getBoundingClientRect();
            return t === expected && r.top > 80 && r.top < 400 && r.width > 30;
          });
          const tab = candidates[0];
          if (!tab) return false;
          (tab as HTMLElement).click();
          return true;
        }, tabLabel)
        .catch(() => false);

      if (!clicked) continue;
      await sleep(800);

      const art = await captureTrio(page, paths, routeId, {
        seq,
        id: `detail-tab-${slug(tabLabel)}`,
        label: `Detail tab: ${tabLabel}`,
        meta: { tab: tabLabel },
      });
      recordArtifact(manifest, art);
      artifactsProduced++;
      seq++;
    }

    // Return to the list so the next interaction (filter, dropdown,
    // ...) starts from the expected state.
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await sleep(1500);
  } catch (err) {
    errors.push(`detail-page: ${(err as Error).message}`);
    // Try to recover for the next interaction
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await sleep(1000);
  }

  return {
    moduleName: 'detail-page',
    ok: errors.length === 0,
    artifactsProduced,
    errors,
    durationMs: Date.now() - start,
  };
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[а-яё]/g, (ch) => {
      const map: Record<string, string> = {
        а: 'a',
        б: 'b',
        в: 'v',
        г: 'g',
        д: 'd',
        е: 'e',
        ё: 'yo',
        ж: 'zh',
        з: 'z',
        и: 'i',
        й: 'y',
        к: 'k',
        л: 'l',
        м: 'm',
        н: 'n',
        о: 'o',
        п: 'p',
        р: 'r',
        с: 's',
        т: 't',
        у: 'u',
        ф: 'f',
        х: 'h',
        ц: 'ts',
        ч: 'ch',
        ш: 'sh',
        щ: 'sch',
        ъ: '',
        ы: 'y',
        ь: '',
        э: 'e',
        ю: 'yu',
        я: 'ya',
      };
      return map[ch] ?? '';
    })
    .replace(/[^a-z0-9-]/g, '');
}
