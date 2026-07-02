import { createHash } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import type { Page } from 'playwright';
import { forceCloseAllModals } from './modal.ts';
import { sleep } from './wait.ts';

/**
 * Take a full-page screenshot and verify it's not a near-duplicate of any
 * previously captured frame. moysklad sessions frequently end up with a
 * stuck "Сохранение изменений" modal that produces byte-identical screenshots
 * across many routes; without dedup, the capture corpus becomes 90%+ noise.
 *
 * If the screenshot hash matches one we've seen, force-close modals + retry.
 * If it still matches after retry, log a warning and keep the (suspect) file
 * so the run can finish — the caller's quality report flags it.
 *
 * Returns the SHA256 hash of the final saved screenshot.
 */
export async function screenshotDedup(
  page: Page,
  outPath: string,
  seen: Map<string, string>,
  options: { route: string; logger: { warn: (...args: unknown[]) => void } },
): Promise<{ hash: string; duplicate: boolean }> {
  // First attempt
  await page.screenshot({ path: outPath, fullPage: true });
  let hash = await sha256OfFile(outPath);

  if (seen.has(hash)) {
    const firstSeenRoute = seen.get(hash)!;
    options.logger.warn(
      { route: options.route, dupOf: firstSeenRoute, hash: hash.slice(0, 12) },
      'duplicate screenshot detected — forcing modal close + retry',
    );

    // Recovery — clean state, scroll to top, give SPA time to re-render.
    await forceCloseAllModals(page);
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
    await sleep(1000);

    // Take again
    await unlink(outPath).catch(() => undefined);
    await page.screenshot({ path: outPath, fullPage: true });
    hash = await sha256OfFile(outPath);

    if (seen.has(hash)) {
      options.logger.warn(
        { route: options.route, hash: hash.slice(0, 12) },
        'screenshot still duplicate after retry — page is likely stuck on the same overlay',
      );
      return { hash, duplicate: true };
    }
  }

  seen.set(hash, options.route);
  return { hash, duplicate: false };
}

async function sha256OfFile(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  return createHash('sha256').update(buf).digest('hex');
}
