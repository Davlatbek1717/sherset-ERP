import type { Page } from 'playwright';
import { sleep } from '../../utils/wait.ts';
import { type RouteManifest, captureTrio, recordArtifact } from '../capture-io.ts';
import type { InteractionResult, RouteOutputPaths } from '../types.ts';

/**
 * Open each dropdown button in the page toolbar (Изменить, Статус, Создать, Создать документ,
 * Печать, Отправить) and capture the opened menu + enumerate items.
 */

const KNOWN_DROPDOWNS = [
  'Изменить',
  'Статус',
  'Создать',
  'Создать документ',
  'Печать',
  'Отправить',
];

export async function captureToolbarDropdowns(
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

  for (const label of KNOWN_DROPDOWNS) {
    try {
      // Check if button with this label exists and is in the toolbar area
      const found = await page.evaluate((expectedLabel) => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        const match = btns.find((el) => {
          const t = (el.textContent ?? '').trim();
          const r = el.getBoundingClientRect();
          return t === expectedLabel && r.top < 400;
        });
        if (!match) return null;
        const r = (match as HTMLElement).getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, label);

      if (!found) continue;

      // Click to open dropdown
      await page.mouse.click(found.x, found.y);
      await sleep(400);

      // Capture the popover + enumerate items
      const dropdown = await page.evaluate(() => {
        // Look for menu-like popover (role="menu" or visible absolute-positioned list)
        const menus = Array.from(
          document.querySelectorAll(
            '[role=menu], [class*=menu], [class*=dropdown], [class*=popup]',
          ),
        ).filter((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return (
            r.width > 50 && r.height > 20 && cs.visibility !== 'hidden' && cs.display !== 'none'
          );
        });
        const top = menus[0];
        if (!top) return { items: [], html: null };
        const items = Array.from(top.querySelectorAll('a, button, li, [role=menuitem]'))
          .map((el) => {
            const htmlEl = el as HTMLElement;
            return {
              text: (htmlEl.textContent ?? '').trim().slice(0, 80),
              disabled: (htmlEl as HTMLButtonElement).disabled === true,
              isSeparator: !(htmlEl.textContent ?? '').trim(),
            };
          })
          .filter((i) => i.text || i.isSeparator);
        return { items, html: top.outerHTML.slice(0, 3000) };
      });

      if (dropdown.items.length > 0) {
        const artifact = await captureTrio(page, paths, routeId, {
          seq,
          id: `dropdown-${slug(label)}`,
          label: `Dropdown: ${label}`,
          meta: {
            triggerLabel: label,
            items: dropdown.items,
            itemCount: dropdown.items.length,
          },
        });
        recordArtifact(manifest, artifact);
        artifactsProduced++;
        seq++;
      }

      // Close dropdown — click elsewhere + Escape for safety
      await page.mouse.click(50, 500).catch(() => undefined);
      await page.keyboard.press('Escape').catch(() => undefined);
      await sleep(250);
    } catch (err) {
      errors.push(`${label}: ${(err as Error).message}`);
    }
  }

  return {
    moduleName: 'toolbar-dropdowns',
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
    .replace(/[^a-z0-9-а-яё]/gi, '')
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
    });
}
