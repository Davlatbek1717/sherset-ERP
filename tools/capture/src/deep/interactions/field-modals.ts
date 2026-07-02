import type { Page } from 'playwright';
import { sleep } from '../../utils/wait.ts';
import { type RouteManifest, captureTrio, recordArtifact } from '../capture-io.ts';
import type { InteractionResult, RouteOutputPaths } from '../types.ts';

/**
 * Inside the edit form, click each field-trigger that opens a picker
 * modal (catalog, address, phone, date range, multi-select, …) and
 * snapshot the popup. moysklad uses these for every reference field
 * (Контрагент, Организация, Склад, Договор, …) so the parity work
 * needs the picker DOMs to mirror them in our own forms.
 *
 * Triggered after the edit form is open (called from the orchestrator
 * after `captureEditForm`). Falls back gracefully when a trigger
 * isn't present on the current entity.
 */

const FIELD_TRIGGERS = [
  // Reference pickers — small "+" or "→" affordance next to a field
  { selector: 'Контрагент', id: 'agent-picker' },
  { selector: 'Организация', id: 'org-picker' },
  { selector: 'Склад', id: 'store-picker' },
  { selector: 'Договор', id: 'contract-picker' },
  { selector: 'Проект', id: 'project-picker' },
  { selector: 'Канал продаж', id: 'channel-picker' },
  { selector: 'Сотрудник', id: 'employee-picker' },
  { selector: 'Группа', id: 'group-picker' },
  // Catalog / inline pickers
  { selector: 'Добавить из справочника', id: 'catalog-bulk-picker' },
  { selector: 'Привязать документ', id: 'link-document-picker' },
  // Date / time pickers (open a calendar popup)
  { selector: 'Срок', id: 'date-picker' },
  { selector: 'Планируемая дата', id: 'planned-date-picker' },
];

export async function captureFieldModals(
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

  for (const trigger of FIELD_TRIGGERS) {
    try {
      const found = await page.evaluate((label) => {
        const candidates = Array.from(
          document.querySelectorAll('label, span, div, button, a'),
        ).filter((el) => {
          const t = (el.textContent ?? '').trim();
          const r = el.getBoundingClientRect();
          // Match exact label, in viewport, reasonable size
          return t === label && r.top > 50 && r.top < 800 && r.width > 30;
        });
        const lbl = candidates[0];
        if (!lbl) return null;
        // Look for the input/button next to this label (sibling or
        // within the same field row)
        const row = lbl.closest('div, label, tr') ?? lbl.parentElement;
        if (!row) return null;
        const trig = Array.from(row.querySelectorAll('input, button, [role=button]')).find((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 50 && r.height > 18;
        });
        const target = trig ?? lbl;
        const r = (target as HTMLElement).getBoundingClientRect();
        return { x: r.left + Math.min(r.width / 2, 150), y: r.top + r.height / 2 };
      }, trigger.selector);

      if (!found) continue;

      await page.mouse.click(found.x, found.y);
      await sleep(600);

      // Did a popup/picker open?
      const opened = await page.evaluate(() => {
        const candidates = Array.from(
          document.querySelectorAll(
            '[role=dialog], [role=listbox], [class*=Picker], [class*=picker], [class*=modal], [class*=Popup], [class*=popup], [class*=DatePicker]',
          ),
        ).filter((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return r.width > 200 && r.height > 100 && cs.visibility !== 'hidden';
        });
        return candidates.length > 0;
      });

      if (opened) {
        const art = await captureTrio(page, paths, routeId, {
          seq,
          id: `field-modal-${trigger.id}`,
          label: `Field modal: ${trigger.selector}`,
          meta: { fieldLabel: trigger.selector, modalId: trigger.id },
        });
        recordArtifact(manifest, art);
        artifactsProduced++;
        seq++;
      }

      await page.keyboard.press('Escape').catch(() => undefined);
      await sleep(300);
    } catch (err) {
      errors.push(`${trigger.id}: ${(err as Error).message}`);
      await page.keyboard.press('Escape').catch(() => undefined);
      await sleep(200);
    }
  }

  return {
    moduleName: 'field-modals',
    ok: errors.length === 0,
    artifactsProduced,
    errors,
    durationMs: Date.now() - start,
  };
}
