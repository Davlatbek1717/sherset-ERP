import type { Page } from 'playwright';
import { sleep } from '../../utils/wait.ts';
import { type RouteManifest, captureTrio, recordArtifact } from '../capture-io.ts';
import type { InteractionResult, RouteOutputPaths } from '../types.ts';

/**
 * Right-click the first table row to capture moysklad's per-row
 * context menu. The menu carries quick actions (Открыть, Удалить,
 * Восстановить, Скопировать ссылку, …) that aren't surfaced in the
 * toolbar. Skipped when the list is empty.
 */

export async function captureRowContextMenu(
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
    const firstRow = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr')).filter((tr) => {
        const r = tr.getBoundingClientRect();
        return r.height > 20 && r.width > 100;
      });
      const first = rows[0];
      if (!first) return null;
      const r = (first as HTMLElement).getBoundingClientRect();
      // Aim at the middle of the row, away from any checkbox
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });

    if (!firstRow) {
      return {
        moduleName: 'row-context-menu',
        ok: true,
        artifactsProduced: 0,
        errors: [],
        durationMs: Date.now() - start,
      };
    }

    // Right-click → fire native context menu request
    await page.mouse.click(firstRow.x, firstRow.y, { button: 'right' });
    await sleep(400);

    const menu = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll('[role=menu], [class*=context-menu], [class*=ContextMenu]'),
      ).filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 80 && r.height > 30 && cs.visibility !== 'hidden';
      });
      const top = candidates[0];
      if (!top) return { items: [], hasMenu: false };
      const items = Array.from(top.querySelectorAll('a, button, li, [role=menuitem]'))
        .map((el) => (el.textContent ?? '').trim())
        .filter((t) => t.length > 0);
      return { items, hasMenu: true };
    });

    if (menu.hasMenu && menu.items.length > 0) {
      const art = await captureTrio(page, paths, routeId, {
        seq: seqStart,
        id: 'row-context-menu',
        label: 'Row right-click context menu',
        meta: { items: menu.items, itemCount: menu.items.length },
      });
      recordArtifact(manifest, art);
      artifactsProduced++;
    }

    // Dismiss
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.mouse.click(50, 500).catch(() => undefined);
    await sleep(300);
  } catch (err) {
    errors.push(`row-context: ${(err as Error).message}`);
  }

  return {
    moduleName: 'row-context-menu',
    ok: errors.length === 0,
    artifactsProduced,
    errors,
    durationMs: Date.now() - start,
  };
}
