import { existsSync } from 'node:fs';
import path from 'node:path';
import { type Browser, type BrowserContext, chromium } from 'playwright';
import { OUTPUT, URLS, USER_AGENT, VIEWPORT } from '../config.ts';
import { child } from '../utils/logger.ts';
import { ensureParent } from '../utils/paths.ts';

const log = child('auth');

/**
 * First-run: open a browser, let the user log in manually, save storage state.
 * Subsequent runs: load saved state → authenticated context.
 */
export async function runInteractiveLogin(): Promise<void> {
  log.info('Starting interactive login. A browser window will open.');
  log.info('Log in to moysklad.uz manually, then close the browser.');

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    deviceScaleFactor: VIEWPORT.deviceScaleFactor,
    userAgent: USER_AGENT,
  });

  const page = await context.newPage();
  page.setDefaultNavigationTimeout(120_000); // 2 minutes — slow networks OK
  page.setDefaultTimeout(30_000);

  try {
    await page.goto(URLS.loginPage, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'Initial navigation slow — retrying once');
    await page.goto(URLS.loginPage, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  }

  log.info(`Navigate: ${URLS.loginPage}`);
  log.info(`Waiting for navigation to app (after login)…`);

  // Wait until URL becomes the app (i.e., login succeeded)
  await page.waitForURL(/online\.moysklad\.ru\/app/, { timeout: 10 * 60_000 });
  log.info('Login detected. Saving storage state.');

  await ensureParent(OUTPUT.authState);
  await context.storageState({ path: OUTPUT.authState });
  log.info(`Saved storage state to ${path.relative(process.cwd(), OUTPUT.authState)}`);

  await browser.close();
}

/**
 * Polyfill helpers that esbuild/tsx inject into page.evaluate'd functions.
 * Without this, calls like `__name(fn, "label")` throw ReferenceError in the browser.
 */
const ESBUILD_HELPERS_POLYFILL = `
(() => {
  const g = globalThis;
  if (typeof g.__name === 'undefined') g.__name = (fn) => fn;
  if (typeof g.__publicField === 'undefined') g.__publicField = (obj, key, val) => { obj[key] = val; return val; };
  if (typeof g.__decorateClass === 'undefined') g.__decorateClass = (d, t) => t;
})();
`;

/** Launch a browser with saved auth state. Throws if no saved state. */
export async function launchAuthenticated(headless = true): Promise<{
  browser: Browser;
  context: BrowserContext;
}> {
  if (!existsSync(OUTPUT.authState)) {
    throw new Error(`No saved auth state. Run 'pnpm --filter @moysklad/capture auth' first.`);
  }
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    storageState: OUTPUT.authState,
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    deviceScaleFactor: VIEWPORT.deviceScaleFactor,
    userAgent: USER_AGENT,
  });
  await context.addInitScript(ESBUILD_HELPERS_POLYFILL);
  return { browser, context };
}

/** Launch a browser WITHOUT auth (for public API docs + marketing site). */
export async function launchAnonymous(headless = true): Promise<{
  browser: Browser;
  context: BrowserContext;
}> {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    deviceScaleFactor: VIEWPORT.deviceScaleFactor,
    userAgent: USER_AGENT,
  });
  await context.addInitScript(ESBUILD_HELPERS_POLYFILL);
  return { browser, context };
}
