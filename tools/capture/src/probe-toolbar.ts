#!/usr/bin/env tsx
/**
 * One-off diagnostic probe — navigates to a route and prints out
 * frames + their button counts. moysklad embeds list pages inside
 * iframes, so the main page DOM is empty of toolbar widgets.
 */

import { launchAuthenticated } from './auth/session.ts';
import { TIMING, URLS } from './config.ts';
import { APP_ROUTES } from './routes.ts';
import { sleep } from './utils/wait.ts';

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  if (!requested.length) {
    console.error('Usage: probe-toolbar.ts <route-id>');
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
    await sleep(15000); // moysklad GWT app needs longer to load

    console.log('\n=== After 15s wait — main frame iframes detail ===');
    const iframeDetails = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('iframe')).map((f) => ({
        src: f.src,
        name: f.name,
        id: f.id,
        srcdoc: (f.srcdoc ?? '').slice(0, 100),
        rect: f.getBoundingClientRect(),
      }));
    });
    console.log(JSON.stringify(iframeDetails, null, 2));

    console.log('\n=== Shadow roots in main frame ===');
    const shadowRoots = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'));
      const shadow = all.filter((el) => (el as HTMLElement).shadowRoot);
      return shadow.map((el) => ({
        tag: el.tagName,
        id: el.id,
        cls: el.className,
      }));
    });
    console.log(`Shadow root count: ${shadowRoots.length}`);
    console.log(JSON.stringify(shadowRoots.slice(0, 5), null, 2));

    console.log('\n=== Frames + their tag distribution ===');
    for (const f of page.frames()) {
      try {
        const stats = await f.evaluate(() => {
          const all = Array.from(document.querySelectorAll('*'));
          const tagCounts: Record<string, number> = {};
          for (const el of all) {
            const tag = el.tagName.toLowerCase();
            tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
          }
          // top 15 tags
          const top = Object.entries(tagCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .map(([t, c]) => `${t}=${c}`)
            .join(' ');
          return {
            url: location.href,
            totalElements: all.length,
            top,
            bodyHtmlLength: document.body?.innerHTML?.length ?? 0,
            // Sample the first 200 chars of body innerHTML to see structure
            bodyStart: (document.body?.innerHTML ?? '').slice(0, 200),
          };
        });
        console.log(`\nFrame [${f.name() || '(main)'}] url=${stats.url}`);
        console.log(`  totalElements=${stats.totalElements}, bodyHtmlLength=${stats.bodyHtmlLength}`);
        console.log(`  top tags: ${stats.top}`);
        console.log(`  bodyStart: ${stats.bodyStart}`);
      } catch (err) {
        console.log(`Frame [${f.name() || '(main)'}] error: ${(err as Error).message}`);
      }
    }

    // Now find the frame with most buttons (= the content frame)
    const contentFrame = page
      .frames()
      .find(async (f) => {
        try {
          const count = await f.evaluate(() => document.querySelectorAll('button').length);
          return count > 5;
        } catch {
          return false;
        }
      });

    // Use a sequential search since the find() with async predicate can't be awaited
    let bestFrame = page.mainFrame();
    let bestCount = 0;
    for (const f of page.frames()) {
      try {
        const count = await f.evaluate(() => document.querySelectorAll('button').length);
        if (count > bestCount) {
          bestCount = count;
          bestFrame = f;
        }
      } catch {
        /* ignore */
      }
    }

    console.log(`\n=== Best content frame: ${bestFrame.name() || '(main)'} (${bestCount} buttons) ===`);

    if (bestCount === 0) {
      console.log('No content frame found — moysklad app may not have loaded yet');
      return;
    }

    // Probe buttons in toolbar zone in the content frame
    const probes = await bestFrame.evaluate(() => {
      const all = Array.from(document.querySelectorAll('button, a'));
      return all
        .map((el) => {
          const r = el.getBoundingClientRect();
          const text = (el.textContent ?? '').trim().slice(0, 60);
          return {
            text,
            tag: el.tagName.toLowerCase(),
            rect: { top: r.top, left: r.left, width: r.width, height: r.height },
            parentClass: ((el.parentElement as HTMLElement | null)?.className ?? '').slice(0, 80),
            ariaLabel: (el.getAttribute('aria-label') ?? '').slice(0, 40),
          };
        })
        .filter(
          (p) => p.rect.width > 20 && p.rect.height > 10 && p.rect.top < 600 && p.text.length > 0,
        );
    });

    console.log('\n=== Buttons in toolbar (top<600) inside content frame ===');
    for (const p of probes.slice(0, 40)) {
      console.log(
        `[${p.rect.top.toFixed(0)},${p.rect.left.toFixed(0)}]`.padEnd(14) +
          `<${p.tag}>`.padEnd(8) +
          ` "${p.text}"`.padEnd(50) +
          ` parent="${p.parentClass}"`,
      );
    }

    // Try clicking "Изменить" inside content frame
    console.log('\n=== Click "Изменить" inside content frame ===');
    const clicked = await bestFrame.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a, span'));
      const matches = btns.filter((el) => {
        const t = (el.textContent ?? '').trim();
        const r = el.getBoundingClientRect();
        return t.startsWith('Изменить') && r.top < 500 && r.width > 30;
      });
      return matches.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? '').trim().slice(0, 60),
          rect: { top: r.top, left: r.left, width: r.width, height: r.height },
          parentClass: ((el.parentElement as HTMLElement | null)?.className ?? '').slice(0, 80),
        };
      });
    });
    console.log(JSON.stringify(clicked, null, 2));

    // Try selecting first row checkbox inside content frame
    console.log('\n=== Select first row checkbox inside content frame ===');
    const rowResult = await bestFrame.evaluate(() => {
      const checkboxes = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type=checkbox]'),
      );
      const rowCheckbox = checkboxes.find((cb) => {
        const tr = cb.closest('tr');
        const td = cb.closest('td');
        const r = cb.getBoundingClientRect();
        return tr && td && r.width > 0 && r.top > 50;
      });
      if (!rowCheckbox) return { found: false, count: checkboxes.length };
      rowCheckbox.click();
      return {
        found: true,
        count: checkboxes.length,
        rect: rowCheckbox.getBoundingClientRect(),
      };
    });
    console.log(JSON.stringify(rowResult, null, 2));
  } finally {
    try {
      await auth.context.close();
    } catch {
      /* ignore */
    }
    try {
      await auth.browser.close();
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error('fatal', err);
  process.exit(1);
});
