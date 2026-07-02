import type { Page } from 'playwright';

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait until `fn` returns truthy, polling every `interval`ms up to `timeout`ms. */
export async function waitFor<T>(
  fn: () => Promise<T | null | undefined>,
  { timeout = 10_000, interval = 200 }: { timeout?: number; interval?: number } = {},
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = await fn();
    if (v) return v;
    await sleep(interval);
  }
  throw new Error(`waitFor: timeout after ${timeout}ms`);
}

/** Wait for network + DOM to settle before extracting. */
export async function settle(page: Page, ms = 500): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
    // Some SPAs keep long-poll open; fall through
  });
  await sleep(ms);
}
