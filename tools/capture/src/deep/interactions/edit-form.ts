import type { Page } from 'playwright';
import { URLS } from '../../config.ts';
import { sleep } from '../../utils/wait.ts';
import { type RouteManifest, captureTrio, recordArtifact } from '../capture-io.ts';
import type { InteractionResult, RouteOutputPaths } from '../types.ts';

/**
 * Capture the edit form in depth:
 *   1. Navigate to <hash>/edit?new
 *   2. Capture default state
 *   3. Capture title icons (?, ?, ... next to doc header)
 *   4. Capture each toolbar dropdown (Изменить, Создать документ, Печать, Отправить)
 *   5. Capture each child tab (Позиции, Связанные, Файлы, Задачи, События)
 *   6. Capture User avatar on the toolbar (document owner dropdown)
 *   7. Capture catalog picker modal (Добавить из справочника)
 *   8. Capture quick-create modals for each ref field (+ icons)
 *   9. Capture inline-edit overlays for each ref field (✎ icons)
 *   10. Capture column config panel on positions tab
 *   11. Capture save-confirm modal (close with dirty state)
 */

const EDIT_FORM_TOOLBAR_DROPDOWNS = ['Изменить', 'Создать документ', 'Печать', 'Отправить'];

const EDIT_FORM_CHILD_TABS = [
  { label: 'Позиции', id: 'positions' },
  { label: 'Связанные документы', id: 'linked' },
  { label: 'Файлы', id: 'files' },
  { label: 'Задачи', id: 'tasks' },
  { label: 'События', id: 'events' },
];

export async function captureEditForm(
  page: Page,
  paths: RouteOutputPaths,
  routeId: string,
  baseHash: string,
  manifest: RouteManifest,
  seqStart: number,
): Promise<InteractionResult> {
  const start = Date.now();
  const errors: string[] = [];
  let artifactsProduced = 0;
  let seq = seqStart;

  try {
    // Navigate to edit URL
    const editUrl = `${URLS.app}#${baseHash}/edit?new`;
    await page.goto(editUrl, { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Dismiss new-design modal if appears (first time only)
    await page
      .evaluate(() => {
        const dlg = Array.from(document.querySelectorAll('*')).find((el) =>
          /Попробуйте новый дизайн/.test(el.textContent ?? ''),
        );
        if (dlg) {
          const close = Array.from(document.querySelectorAll('button, svg')).find((el) => {
            const r = el.getBoundingClientRect();
            return r.width < 40 && r.height < 40 && r.right > 1500 && r.top < 500;
          });
          if (close) (close as HTMLElement).click();
        }
      })
      .catch(() => undefined);
    await sleep(500);

    // 1. Default edit form screenshot
    const formInfo = await page.evaluate(() => {
      const h1 = document.querySelector('h1, [class*=title]:not(nav *):not(a)');
      const saveBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        /^Сохранить$/.test((b.textContent ?? '').trim()),
      );
      const closeBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        /^Закрыть$/.test((b.textContent ?? '').trim()),
      );
      // Metadata grid fields (left + right columns)
      const fields: { label: string; hasPlus: boolean; hasPencil: boolean; required: boolean }[] =
        [];
      document.querySelectorAll('label, [class*=field-label]').forEach((lbl) => {
        const text = (lbl.textContent ?? '').trim();
        if (!text || text.length > 50) return;
        const required = text.startsWith('*');
        const clean = text.replace(/^\*\s*/, '');
        const row = lbl.closest('tr, [class*=row], [class*=field]');
        const hasPlus =
          !!row?.querySelector('button[class*=plus], a[class*=plus]') ||
          !!Array.from(row?.querySelectorAll('button, a') ?? []).find((el) =>
            /^\+$/.test((el.textContent ?? '').trim()),
          );
        const hasPencil =
          !!row?.querySelector('svg[class*=pencil], [class*=edit-icon]') ||
          !!row?.querySelector('[aria-label*=edit], [aria-label*=Edit]');
        fields.push({ label: clean, hasPlus, hasPencil, required });
      });
      // Child tabs row
      const childTabs: string[] = [];
      document.querySelectorAll('[role=tab], [class*=tab]').forEach((tab) => {
        const t = (tab.textContent ?? '').trim();
        if (t && t.length < 40) childTabs.push(t);
      });
      return {
        h1: (h1?.textContent ?? '').trim(),
        hasSave: !!saveBtn,
        hasClose: !!closeBtn,
        fieldCount: fields.length,
        fields: fields.slice(0, 25),
        childTabs: Array.from(new Set(childTabs)).slice(0, 20),
      };
    });

    const defaultArtifact = await captureTrio(page, paths, routeId, {
      seq,
      id: 'edit-default',
      label: 'Edit form — default state',
      meta: formInfo,
    });
    recordArtifact(manifest, defaultArtifact);
    artifactsProduced++;
    seq++;

    // 2. Edit form toolbar dropdowns
    for (const dropdownLabel of EDIT_FORM_TOOLBAR_DROPDOWNS) {
      try {
        const target = await page.evaluate((lbl) => {
          const btn = Array.from(document.querySelectorAll('button, a')).find(
            (el) => (el.textContent ?? '').trim() === lbl && el.getBoundingClientRect().top < 300,
          );
          if (!btn) return null;
          const r = btn.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }, dropdownLabel);

        if (!target) continue;
        await page.mouse.click(target.x, target.y);
        await sleep(500);

        const dropdown = await page.evaluate(() => {
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
          if (!top) return { items: [] };
          const items = Array.from(top.querySelectorAll('a, button, li, [role=menuitem]'))
            .map((el) => ({
              text: ((el as HTMLElement).textContent ?? '').trim().slice(0, 80),
              disabled: (el as HTMLButtonElement).disabled === true,
            }))
            .filter((i) => i.text);
          return { items };
        });

        if (dropdown.items.length > 0) {
          const artifact = await captureTrio(page, paths, routeId, {
            seq,
            id: `edit-dropdown-${cyrillicSlug(dropdownLabel)}`,
            label: `Edit form dropdown: ${dropdownLabel}`,
            meta: { triggerLabel: dropdownLabel, items: dropdown.items },
          });
          recordArtifact(manifest, artifact);
          artifactsProduced++;
          seq++;
        }

        // Close dropdown
        await page.mouse.click(50, 600).catch(() => undefined);
        await page.keyboard.press('Escape').catch(() => undefined);
        await sleep(300);
      } catch (err) {
        errors.push(`edit-dropdown ${dropdownLabel}: ${(err as Error).message}`);
      }
    }

    // 3. Child tabs — click each and capture content
    for (const tab of EDIT_FORM_CHILD_TABS) {
      try {
        const clicked = await page.evaluate((lbl) => {
          const btn = Array.from(document.querySelectorAll('button, a, [role=tab]')).find(
            (el) => (el.textContent ?? '').trim() === lbl,
          );
          if (!btn) return false;
          (btn as HTMLElement).click();
          return true;
        }, tab.label);
        if (!clicked) continue;
        await sleep(500);

        // Capture tab content
        const tabContent = await page.evaluate(() => {
          // Find the active tab panel — usually the area below the tabs row
          const panel =
            document.querySelector('[role=tabpanel]') ??
            document.querySelector('[class*=tab-content]');
          return {
            panelText: (panel?.textContent ?? '').trim().slice(0, 400),
            hasAddButton: !!Array.from(document.querySelectorAll('button')).find((b) =>
              /^\+|^Добав/.test((b.textContent ?? '').trim()),
            ),
          };
        });

        const artifact = await captureTrio(page, paths, routeId, {
          seq,
          id: `edit-tab-${tab.id}`,
          label: `Edit form tab: ${tab.label}`,
          meta: { tabLabel: tab.label, ...tabContent },
        });
        recordArtifact(manifest, artifact);
        artifactsProduced++;
        seq++;
      } catch (err) {
        errors.push(`edit-tab ${tab.label}: ${(err as Error).message}`);
      }
    }

    // 4. Return to Positions tab for catalog picker capture
    await page
      .evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button, a, [role=tab]')).find(
          (el) => (el.textContent ?? '').trim() === 'Позиции',
        );
        (btn as HTMLElement | undefined)?.click();
      })
      .catch(() => undefined);
    await sleep(500);

    // 5. Catalog picker modal via test-id
    try {
      const btn = await page.$('[data-test-id="position-dictionary-btn"]');
      const opened = !!btn;
      if (btn) {
        await btn.click();
      }

      if (opened) {
        await sleep(1000);
        const pickerData = await page.evaluate(() => {
          const dialog = document.querySelector('[role=dialog], [class*=modal], [class*=dialog]');
          if (!dialog) return null;
          const title = (
            dialog.querySelector('h1, h2, h3, [class*=title]')?.textContent ?? ''
          ).trim();
          const columns = Array.from(dialog.querySelectorAll('th, [role=columnheader]'))
            .map((c) => (c.textContent ?? '').trim())
            .filter(Boolean);
          const buttons = Array.from(dialog.querySelectorAll('button, a'))
            .map((b) => (b.textContent ?? '').trim())
            .filter((t) => t && t.length < 40);
          return { title, columns, buttons };
        });

        if (pickerData) {
          const artifact = await captureTrio(page, paths, routeId, {
            seq,
            id: 'catalog-picker',
            label: 'Catalog picker modal',
            meta: pickerData,
          });
          recordArtifact(manifest, artifact);
          artifactsProduced++;
          seq++;
        }

        // Close picker
        await page
          .evaluate(() => {
            const cancel = Array.from(document.querySelectorAll('button')).find((b) =>
              /^Отменить$/.test((b.textContent ?? '').trim()),
            );
            (cancel as HTMLButtonElement | undefined)?.click();
          })
          .catch(() => undefined);
        await page.keyboard.press('Escape').catch(() => undefined);
        await sleep(400);
      }
    } catch (err) {
      errors.push(`catalog-picker: ${(err as Error).message}`);
    }

    // 6. Quick-create modal for first (+) field via test-id
    try {
      // Moysklad uses data-test-id="dictionary-plus-btn" or "add_icon" for + buttons
      const plusBtn = await page.$('[data-test-id="dictionary-plus-btn"]').catch(() => null);
      const addIcon = plusBtn || (await page.$('[data-test-id="add_icon"]').catch(() => null));
      const plusClicked = !!addIcon;
      if (addIcon) {
        await addIcon.click();
      }

      if (plusClicked) {
        await sleep(1000);
        const quickCreateInfo = await page.evaluate(() => {
          const dialog = document.querySelector(
            '[role=dialog], [class*=modal]:not([class*=hidden])',
          );
          if (!dialog) return null;
          const title = (dialog.querySelector('h1, h2, h3')?.textContent ?? '').trim();
          const sections = Array.from(
            dialog.querySelectorAll('[class*=accordion], [class*=section], fieldset'),
          )
            .map((s) =>
              (s.querySelector('h1, h2, h3, legend, [class*=title]')?.textContent ?? '').trim(),
            )
            .filter(Boolean);
          const tabs = Array.from(dialog.querySelectorAll('[role=tab], [class*=tab]'))
            .map((t) => (t.textContent ?? '').trim())
            .filter(Boolean);
          const inputs = dialog.querySelectorAll('input, textarea, select').length;
          return { title, sections, tabs, inputCount: inputs };
        });

        if (quickCreateInfo) {
          const artifact = await captureTrio(page, paths, routeId, {
            seq,
            id: 'quick-create',
            label: 'Quick-create modal (first + button)',
            meta: quickCreateInfo,
          });
          recordArtifact(manifest, artifact);
          artifactsProduced++;
          seq++;
        }

        // Close modal
        await page
          .evaluate(() => {
            const cancel = Array.from(document.querySelectorAll('button')).find((b) =>
              /^Отмена$/.test((b.textContent ?? '').trim()),
            );
            (cancel as HTMLButtonElement | undefined)?.click();
          })
          .catch(() => undefined);
        await page.keyboard.press('Escape').catch(() => undefined);
        await sleep(400);
      }
    } catch (err) {
      errors.push(`quick-create: ${(err as Error).message}`);
    }

    // 7. Save-confirm dialog: modify Комментарий textarea then click editor-toolbar-close-button
    try {
      const modified = await page.evaluate(() => {
        // Prefer the Комментарий textarea — always dirty-triggers
        const textarea = document.querySelector<HTMLTextAreaElement>(
          'textarea[placeholder*="омментар"], textarea[placeholder]',
        );
        const target =
          textarea ??
          document.querySelector<HTMLInputElement>(
            'input[type=text]:not([disabled]):not([readonly])',
          );
        if (!target) return false;
        const setter =
          target instanceof HTMLTextAreaElement
            ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
            : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(target, 'test-dirty');
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        target.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      });

      if (modified) {
        await sleep(400);
        const closeBtn = await page.$('[data-test-id="editor-toolbar-close-button"]');
        if (closeBtn) {
          await closeBtn.click();
        } else {
          await page.evaluate(() => {
            const close = Array.from(document.querySelectorAll('button')).find((b) =>
              /^Закрыть$/.test((b.textContent ?? '').trim()),
            );
            (close as HTMLButtonElement | undefined)?.click();
          });
        }
        await sleep(700);

        const confirmInfo = await page.evaluate(() => {
          const dlg = Array.from(document.querySelectorAll('[role=dialog], [class*=modal]')).find(
            (d) => /Сохранение изменений|Данные были изменены/i.test(d.textContent ?? ''),
          );
          if (!dlg) return null;
          const buttons = Array.from(dlg.querySelectorAll('button')).map((b) =>
            (b.textContent ?? '').trim(),
          );
          return {
            title: (dlg.querySelector('h1, h2, h3')?.textContent ?? '').trim(),
            body: (dlg.textContent ?? '').trim().slice(0, 300),
            buttons,
          };
        });

        if (confirmInfo) {
          const artifact = await captureTrio(page, paths, routeId, {
            seq,
            id: 'save-confirm-dialog',
            label: 'Save confirmation dialog',
            meta: confirmInfo,
          });
          recordArtifact(manifest, artifact);
          artifactsProduced++;
          seq++;
        }

        // Dismiss with "Нет" (don't save)
        await page
          .evaluate(() => {
            const no = Array.from(document.querySelectorAll('button')).find((b) =>
              /^Нет$/.test((b.textContent ?? '').trim()),
            );
            (no as HTMLButtonElement | undefined)?.click();
          })
          .catch(() => undefined);
        await page.keyboard.press('Escape').catch(() => undefined);
        await sleep(500);
      }
    } catch (err) {
      errors.push(`save-confirm: ${(err as Error).message}`);
    }
  } catch (err) {
    errors.push(`edit-form: ${(err as Error).message}`);
  }

  return {
    moduleName: 'edit-form',
    ok: errors.length === 0,
    artifactsProduced,
    errors,
    durationMs: Date.now() - start,
  };
}

function cyrillicSlug(s: string): string {
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
  return s
    .toLowerCase()
    .replace(/[а-яё]/g, (ch) => map[ch] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
