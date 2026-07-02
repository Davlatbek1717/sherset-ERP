#!/usr/bin/env tsx
/**
 * Diagnostic: navigate, select first row, then list every span.text
 * trigger that's visible in the toolbar zone (top 100-550). Tells
 * us which dropdown labels are actually present and where, so we
 * can update the capture script's TOOLBAR_DROPDOWNS list.
 */
import { launchAuthenticated } from './auth/session.ts';
import { TIMING, URLS } from './config.ts';
import { APP_ROUTES } from './routes.ts';
import { sleep } from './utils/wait.ts';

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  if (!requested.length) {
    console.error('Usage: probe-after-select.ts <route-id>');
    process.exit(1);
  }
  const route = APP_ROUTES.find((r) => r.id === requested[0]);
  if (!route) {
    console.error(`Route not found: ${requested[0]}`);
    process.exit(1);
  }

  const auth = await launchAuthenticated(true);
  const page = await auth.context.newPage();
  page.setDefaultTimeout(TIMING.defaultActionTimeout);
  page.setDefaultNavigationTimeout(TIMING.defaultNavigationTimeout);

  try {
    await page.goto(`${URLS.app}#${route.hash}`, { waitUntil: 'domcontentloaded' });
    await sleep(14000);

    console.log('\n=== span.text triggers in toolbar zone (top 100-550) BEFORE row select ===');
    const before = await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span.text'));
      return spans
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            text: (el.textContent ?? '').trim(),
            top: r.top,
            left: r.left,
            width: r.width,
            visible: r.width > 0 && r.height > 0,
          };
        })
        .filter((s) => s.top >= 100 && s.top < 550 && s.visible);
    });
    for (const s of before) {
      console.log(`  [${s.top.toFixed(0)},${s.left.toFixed(0)},w=${s.width.toFixed(0)}] "${s.text}"`);
    }

    // Select first row
    console.log('\n=== Selecting first row ===');
    const selected = await page.evaluate(() => {
      const checkboxes = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type=checkbox]'),
      );
      const rowCheckbox = checkboxes.find((cb) => {
        const tr = cb.closest('tr');
        const td = cb.closest('td');
        const r = cb.getBoundingClientRect();
        return tr && td && r.width > 0 && r.top > 100;
      });
      if (!rowCheckbox) return { ok: false };
      rowCheckbox.click();
      return { ok: true, row: rowCheckbox.getBoundingClientRect() };
    });
    console.log(JSON.stringify(selected, null, 2));
    await sleep(800);

    console.log('\n=== span.text triggers in toolbar zone AFTER row select ===');
    const after = await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span.text'));
      return spans
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            text: (el.textContent ?? '').trim(),
            top: r.top,
            left: r.left,
            width: r.width,
            visible: r.width > 0 && r.height > 0,
          };
        })
        .filter((s) => s.top >= 100 && s.top < 550 && s.visible);
    });
    for (const s of after) {
      console.log(`  [${s.top.toFixed(0)},${s.left.toFixed(0)},w=${s.width.toFixed(0)}] "${s.text}"`);
    }
  } finally {
    await auth.context.close().catch(() => undefined);
    await auth.browser.close().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('fatal', err);
  process.exit(1);
});
