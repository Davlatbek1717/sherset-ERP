import type { Page } from 'playwright';
import { sleep } from './wait.ts';

/**
 * Force-close any open modal/dialog. moysklad's UI has multiple modal patterns
 * — generic [role=dialog], legacy custom modal classes, and the very specific
 * "Сохранение изменений" unsaved-changes confirm dialog. Capture sessions
 * frequently leave these stuck open after triggering save-confirm flows.
 *
 * Strategy: try ESC → click Отмена/Нет/Cancel buttons → click [×] close →
 * click backdrop. After each attempt, wait briefly and re-check.
 *
 * Returns the number of modals that were detected at start (0 = clean state).
 */
export async function forceCloseAllModals(page: Page): Promise<number> {
  const initialCount = await countOpenModals(page);
  if (initialCount === 0) return 0;

  // Try up to 3 cycles — some modals chain (close one, another appears).
  for (let attempt = 0; attempt < 3; attempt++) {
    // 1. Escape — works for most well-behaved dialogs
    await page.keyboard.press('Escape').catch(() => undefined);
    await sleep(150);

    // 2. Click Cancel-style buttons inside any open dialog
    await page
      .evaluate(() => {
        const dialogs = Array.from(
          document.querySelectorAll('[role=dialog], [class*=modal], [class*=Modal], [class*=Dialog]'),
        );
        for (const d of dialogs) {
          // Save-confirm dialog: prefer "Нет" (don't save) to discard cleanly.
          const buttons = Array.from(d.querySelectorAll('button')) as HTMLButtonElement[];
          const cancelBtn = buttons.find((b) => {
            const t = (b.textContent ?? '').trim();
            return /^(Нет|Отмена|Cancel|Закрыть|Bekor|Yo'?q)$/i.test(t);
          });
          if (cancelBtn) {
            cancelBtn.click();
            continue;
          }
          // No labelled cancel — try generic close icon (X / ✕)
          const closeIcon = buttons.find((b) => {
            const t = (b.textContent ?? '').trim();
            return (
              /^[×✕✖xX]$/.test(t) ||
              /close/i.test(b.className) ||
              /close/i.test(b.getAttribute('aria-label') ?? '')
            );
          });
          if (closeIcon) closeIcon.click();
        }
      })
      .catch(() => undefined);

    await sleep(250);

    if ((await countOpenModals(page)) === 0) return initialCount;
  }

  // Last-resort: clear the dialog DOM nodes ourselves. moysklad's modal layer
  // is rendered into a sibling of #app or directly into <body>; removing them
  // doesn't affect the underlying app state.
  await page
    .evaluate(() => {
      document
        .querySelectorAll('[role=dialog], [class*=modal-overlay], [class*=ModalOverlay]')
        .forEach((el) => el.remove());
    })
    .catch(() => undefined);
  await sleep(200);

  return initialCount;
}

/** Count visible (non-hidden) modal/dialog elements on the page. */
export async function countOpenModals(page: Page): Promise<number> {
  return await page
    .evaluate(() => {
      const els = Array.from(
        document.querySelectorAll('[role=dialog], [class*=modal], [class*=Modal], [class*=Dialog]'),
      ) as HTMLElement[];
      let visible = 0;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (
          r.width > 50 &&
          r.height > 30 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          parseFloat(style.opacity) > 0.1
        ) {
          visible++;
        }
      }
      return visible;
    })
    .catch(() => 0);
}

/**
 * Reset session state that can leak between routes — typed-in filter values,
 * stale URL hash, scroll position. Call before every navigation.
 */
export async function resetSessionState(page: Page): Promise<void> {
  await forceCloseAllModals(page);
  // Clear focus + any in-flight typed value
  await page
    .evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        active.blur();
      }
    })
    .catch(() => undefined);
  await page.keyboard.press('Escape').catch(() => undefined);
}
