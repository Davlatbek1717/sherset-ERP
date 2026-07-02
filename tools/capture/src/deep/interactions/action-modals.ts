import type { Page } from 'playwright';
import { sleep } from '../../utils/wait.ts';
import { type RouteManifest, captureTrio, recordArtifact } from '../capture-io.ts';
import type { InteractionResult, RouteOutputPaths } from '../types.ts';

/**
 * After a row is selected (we tick the leading checkbox first), open
 * each item in the "Изменить" toolbar dropdown one by one and capture
 * the resulting confirm dialog / modal / inline panel. moysklad's
 * bulk-action menu typically carries: Удалить, Восстановить,
 * Объединить, Изменить статус, Изменить владельца, Архивировать,
 * Переместить в группу, Переслать, Изменить срок, …
 *
 * Each opens a different modal — capture them all so we have parity
 * data for every bulk dialog.
 */

const KNOWN_BULK_ACTIONS = [
  'Удалить',
  'Восстановить',
  'Объединить',
  'Изменить статус',
  'Изменить владельца',
  'Архивировать',
  'Переместить в группу',
  'Изменить срок',
  'Изменить организацию',
  'Изменить склад',
  'Переслать',
];

export async function captureActionModals(
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
    // Select first row to enable the bulk menu
    const checked = await page
      .evaluate(() => {
        const cb = Array.from(document.querySelectorAll('tbody tr input[type=checkbox]'))[0];
        if (!cb) return false;
        (cb as HTMLInputElement).click();
        return true;
      })
      .catch(() => false);

    if (!checked) {
      // Empty list — skip
      return {
        moduleName: 'action-modals',
        ok: true,
        artifactsProduced: 0,
        errors: [],
        durationMs: Date.now() - start,
      };
    }
    await sleep(400);

    for (const actionLabel of KNOWN_BULK_ACTIONS) {
      try {
        // Open "Изменить" dropdown
        const opened = await page
          .evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const izmenit = btns.find((el) => {
              const t = (el.textContent ?? '').trim();
              const r = el.getBoundingClientRect();
              return t === 'Изменить' && r.top < 400;
            });
            if (!izmenit) return false;
            const r = (izmenit as HTMLElement).getBoundingClientRect();
            (izmenit as HTMLElement).click();
            return { x: r.left + r.width / 2, y: r.bottom + 10 };
          })
          .catch(() => false);
        if (!opened) continue;
        await sleep(350);

        // Click the action item
        const clicked = await page
          .evaluate((expected) => {
            const items = Array.from(document.querySelectorAll('a, button, li, [role=menuitem]'));
            const target = items.find((el) => (el.textContent ?? '').trim() === expected);
            if (!target) return false;
            const r = (target as HTMLElement).getBoundingClientRect();
            const cs = getComputedStyle(target);
            if (cs.visibility === 'hidden' || r.width < 5) return false;
            (target as HTMLElement).click();
            return true;
          }, actionLabel)
          .catch(() => false);
        if (!clicked) {
          // Dismiss the dropdown and try the next action
          await page.keyboard.press('Escape').catch(() => undefined);
          await sleep(200);
          continue;
        }
        await sleep(700);

        // Capture whatever surfaced (confirm dialog, side panel,
        // inline editor — we don't pre-judge; just snapshot the
        // current viewport so the parity work has the truth).
        const hasModal = await page.evaluate(() => {
          const candidates = Array.from(
            document.querySelectorAll(
              '[role=dialog], [class*=modal], [class*=Modal], [class*=dialog], [class*=Dialog]',
            ),
          ).filter((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return r.width > 200 && r.height > 100 && cs.visibility !== 'hidden';
          });
          return candidates.length > 0;
        });

        if (hasModal) {
          const art = await captureTrio(page, paths, routeId, {
            seq,
            id: `action-modal-${slug(actionLabel)}`,
            label: `Bulk action modal: ${actionLabel}`,
            meta: { triggerLabel: actionLabel, source: 'izmenit-dropdown' },
          });
          recordArtifact(manifest, art);
          artifactsProduced++;
          seq++;
        }

        // Dismiss
        await page.keyboard.press('Escape').catch(() => undefined);
        await sleep(400);
      } catch (err) {
        errors.push(`${actionLabel}: ${(err as Error).message}`);
        await page.keyboard.press('Escape').catch(() => undefined);
        await sleep(200);
      }
    }

    // Untick the row so the toolbar resets for the next interaction
    await page
      .evaluate(() => {
        const cb = Array.from(document.querySelectorAll('tbody tr input[type=checkbox]'))[0];
        if (cb && (cb as HTMLInputElement).checked) (cb as HTMLInputElement).click();
      })
      .catch(() => undefined);
  } catch (err) {
    errors.push(`action-modals top-level: ${(err as Error).message}`);
  }

  return {
    moduleName: 'action-modals',
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
