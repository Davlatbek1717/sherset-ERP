/**
 * Discovery config — all URLs, output paths, timing parameters.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Monorepo root (tools/capture/src → ../../..)
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

export const URLS = {
  // Marketing + auth
  marketing: 'https://www.moysklad.uz',
  loginPage: 'https://online.moysklad.ru/',

  // App base (hash-routed SPA)
  app: 'https://online.moysklad.ru/app/',

  // API documentation (also hash-routed client-side SPA)
  apiDocsBase: 'https://dev.moysklad.ru/doc/api/remap/1.2/',
  apiDocsHash: (section: string, slug?: string) =>
    slug
      ? `https://dev.moysklad.ru/doc/api/remap/1.2/#/${section}/${slug}`
      : `https://dev.moysklad.ru/doc/api/remap/1.2/#/${section}`,
} as const;

export const OUTPUT = {
  root: path.join(REPO_ROOT, 'docs', 'moysklad-reference'),
  dataModel: path.join(REPO_ROOT, 'docs', 'moysklad-reference', 'data-model'),
  entitySchemas: path.join(REPO_ROOT, 'docs', 'moysklad-reference', 'data-model', 'entity-schemas'),
  documentSchemas: path.join(
    REPO_ROOT,
    'docs',
    'moysklad-reference',
    'data-model',
    'document-schemas',
  ),
  reports: path.join(REPO_ROOT, 'docs', 'moysklad-reference', 'data-model', 'reports'),
  visualCaptures: path.join(REPO_ROOT, 'docs', 'moysklad-reference', 'visual-captures'),
  designTokens: path.join(REPO_ROOT, 'docs', 'moysklad-reference', 'design-tokens-extracted.json'),

  // Auth state (gitignored — session cookies)
  authState: path.join(REPO_ROOT, '.credentials', 'moysklad-storage-state.json'),
} as const;

export const TIMING = {
  defaultNavigationTimeout: 45_000,
  defaultActionTimeout: 15_000,
  /** Delay between page visits (to respect rate limits) */
  betweenPages: 800,
  /** Wait after DOM load for JS to render */
  settleAfterNav: 500,
  /** Wait after clicking to let popover/modal render */
  settleAfterClick: 350,
} as const;

export const VIEWPORT = {
  width: 1440,
  height: 900,
  deviceScaleFactor: 2, // retina screenshots
} as const;

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Concurrency — how many parallel pages to run. Moysklad is reasonable; keep low to avoid detection. */
export const CONCURRENCY = {
  apiDocs: 3,
  app: 1, // sequential — session tied to single browser context
  tokens: 1,
} as const;
