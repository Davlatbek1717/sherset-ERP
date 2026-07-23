#!/usr/bin/env node
/**
 * Whole-site error crawler.
 *
 * Logs in once, walks EVERY app route (apps/web/src/app), resolves real ids for
 * dynamic `[id]` routes via the API, visits each page in a real browser, and
 * records every failed network request (HTTP >= 400, with the response body) plus
 * every console error / warning and uncaught page exception.
 *
 *   node scripts/crawl-site-errors.mjs --dry         # just print the route list
 *   node scripts/crawl-site-errors.mjs               # full crawl -> report json
 *
 * Env: BASE (web, default http://localhost:3140), API (default http://localhost:4000),
 *      EMAIL/PASSWORD (default admin@demo.local / admin123).
 */
import { chromium } from 'playwright';
import { readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = join(ROOT, 'apps/web/src/app');
const BASE = process.env.BASE || 'http://localhost:3140';
const API = process.env.API || 'http://localhost:4000';
const EMAIL = process.env.EMAIL || 'admin@demo.local';
const PASSWORD = process.env.PASSWORD || 'admin123';
const DRY = process.argv.includes('--dry');
const OUT = join(ROOT, 'scratch-crawl-report.json');

// ---- 1. enumerate routes from the filesystem -----------------------------
/** Walk app dir, collect every directory that has a page.tsx. */
function walk(dir, segs = []) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    if (name.startsWith('_') || name === 'node_modules') continue;
    // Route groups (auth) / (app) do NOT add a URL segment.
    const isGroup = name.startsWith('(') && name.endsWith(')');
    const nextSegs = isGroup ? segs : [...segs, name];
    const hasPage = readdirSync(full).some((f) => /^page\.(tsx|jsx|ts|js)$/.test(f));
    if (hasPage) out.push('/' + nextSegs.join('/'));
    out.push(...walk(full, nextSegs));
  }
  return out;
}

/** For a dynamic route, the "list" route is the prefix before the first [seg]. */
function listRouteOf(route) {
  const parts = route.split('/').filter(Boolean);
  const i = parts.findIndex((p) => p.startsWith('['));
  return '/' + parts.slice(0, i).join('/');
}

const allRoutes = [...new Set(walk(APP_DIR))].filter((r) => r && r !== '/login').sort();
const staticRoutes = allRoutes.filter((r) => !r.includes('['));
const dynamicRoutes = allRoutes.filter((r) => r.includes('['));

// ---- 2. API helpers (login + resolve ids) --------------------------------
let TOKEN = '';
async function apiLogin() {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const j = await res.json().catch(() => ({}));
  TOKEN = j.accessToken || j.access_token || j.token || '';
  if (!TOKEN) throw new Error(`API login failed (${res.status}): ${JSON.stringify(j).slice(0, 200)}`);
}

// Route-folder -> API resource overrides (where they differ).
const API_ALIAS = {
  '/counterparties': 'counterparties',
  '/hr/employees': 'employees',
};
const idCache = new Map();
async function resolveId(listRoute) {
  if (idCache.has(listRoute)) return idCache.get(listRoute);
  const resource = API_ALIAS[listRoute] || listRoute.replace(/^\//, '');
  let id = null;
  try {
    const res = await fetch(`${API}/api/v1/${resource}?limit=1`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    if (res.ok) {
      const j = await res.json().catch(() => ({}));
      const items = Array.isArray(j) ? j : j.items || j.data || [];
      id = items[0]?.id ?? null;
    }
  } catch {}
  idCache.set(listRoute, id);
  return id;
}

/** Build concrete URLs for a dynamic route (returns [] if no id resolvable). */
async function concreteUrls(route) {
  const listRoute = listRouteOf(route);
  const id = await resolveId(listRoute);
  if (!id) return { urls: [], listRoute, reason: 'no id from API' };
  // Replace the FIRST [seg] with the id; replace any further [seg] with the same id.
  const url = route.replace(/\[[^\]]+\]/g, id);
  return { urls: [url], listRoute, reason: null };
}

// ---- 3. crawl ------------------------------------------------------------
const IGNORE_URL = [/\/favicon\.ico/, /\/_next\//, /\.(png|jpg|svg|ico|woff2?)($|\?)/];
const IGNORE_CONSOLE = [
  /message channel closed/i, // browser-extension noise
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /hydrat/i, // hydration dev-noise handled separately if needed
];
function ignored(list, s) {
  return list.some((re) => re.test(s));
}

async function main() {
  console.log(`routes: ${allRoutes.length} (static ${staticRoutes.length}, dynamic ${dynamicRoutes.length})`);
  if (DRY) {
    console.log('\n--- STATIC ---');
    staticRoutes.forEach((r) => console.log(r));
    console.log('\n--- DYNAMIC (template -> listRoute) ---');
    dynamicRoutes.forEach((r) => console.log(`${r}   [list ${listRouteOf(r)}]`));
    return;
  }

  await apiLogin();
  console.log('API login OK');

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // UI login (robust — the shared dev server can be flaky at any moment; never throw).
  async function uiLogin() {
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        if (!page.url().includes('/login')) return true; // already authenticated
        await page.waitForSelector('[data-test-id="login-email"]', { timeout: 20000 });
        await page.fill('[data-test-id="login-email"]', EMAIL);
        await page.fill('[data-test-id="login-password"]', PASSWORD);
        await page.click('[data-test-id="login-submit"]');
        await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30000 });
        return true;
      } catch (e) {
        console.log(`  login attempt ${attempt} failed: ${String(e).slice(0, 70)}`);
        await page.waitForTimeout(3000);
      }
    }
    return false;
  }
  console.log('UI login ->', (await uiLogin()) ? 'ok ' + page.url() : 'FAILED (crawling anyway)');

  // Build the concrete URL worklist.
  const worklist = staticRoutes.map((r) => ({ template: r, url: r }));
  const unresolved = [];
  for (const r of dynamicRoutes) {
    const { urls, listRoute, reason } = await concreteUrls(r);
    if (!urls.length) unresolved.push({ template: r, listRoute, reason });
    else worklist.push({ template: r, url: urls[0] });
  }
  console.log(`worklist: ${worklist.length} concrete urls, unresolved dynamic: ${unresolved.length}`);

  // Re-login through the UI (the in-memory access token is reset on every hard
  // navigation, so a flaky /auth/refresh during an API restart can log us out).
  async function ensureAuthed() {
    if (page.url().includes('/login')) await uiLogin();
  }

  /** One navigation; returns the raw error list (signatured). */
  async function crawlOnce(url) {
    const errs = [];
    const onResponse = (resp) => {
      const u = resp.url();
      const st = resp.status();
      if (st >= 400 && !ignored(IGNORE_URL, u)) {
        errs.push({ kind: 'http', status: st, method: resp.request().method(), url: u });
      }
    };
    const onConsole = (msg) => {
      const t = msg.type();
      if ((t === 'error' || t === 'warning') && !ignored(IGNORE_CONSOLE, msg.text())) {
        errs.push({ kind: `console-${t}`, text: msg.text().slice(0, 300) });
      }
    };
    const onPageError = (err) => errs.push({ kind: 'pageerror', text: String(err).slice(0, 300) });
    page.on('response', onResponse);
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    try {
      await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2200); // let client data-fetches fire
    } catch (e) {
      errs.push({ kind: 'navigation', text: String(e).slice(0, 200) });
    }
    page.off('response', onResponse);
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    return errs;
  }
  const sig = (e) =>
    e.kind === 'http' ? `http ${e.status} ${e.url.replace(/[0-9a-f-]{36}/g, '{id}').split('?')[0]}` : `${e.kind} ${(e.text || '').slice(0, 80)}`;

  const results = [];
  let idx = 0;
  // Write the report after EVERY route so a kill (session boundary, OOM, etc.)
  // never loses progress — the file always reflects what was crawled so far.
  const writeReport = () =>
    writeFileSync(
      OUT,
      JSON.stringify(
        {
          base: BASE,
          api: API,
          totals: {
            routes: worklist.length,
            crawled: idx,
            withErrors: results.length,
            unresolvedDynamic: unresolved.length,
          },
          unresolved,
          results,
        },
        null,
        2,
      ),
    );
  for (const item of worklist) {
    idx++;
    let errors = await crawlOnce(item.url);
    // Transient-blip filter: if the first pass errored, re-auth if needed and
    // crawl AGAIN — keep only errors that PERSIST across both passes (a real bug
    // repeats; an API-restart/HMR blip clears). Auth/SSE noise is dropped this way.
    if (errors.length) {
      await ensureAuthed();
      const second = await crawlOnce(item.url);
      const firstSigs = new Set(errors.map(sig));
      errors = second.filter((e) => firstSigs.has(sig(e)));
      await ensureAuthed();
    }
    for (const e of errors.filter((x) => x.kind === 'http')) {
      try {
        const r = await ctx.request.fetch(e.url, { headers: { authorization: `Bearer ${TOKEN}` } });
        e.body = (await r.text()).slice(0, 300);
      } catch {}
    }
    if (errors.length) results.push({ ...item, errors });
    console.log(`[${idx}/${worklist.length}] ${errors.length ? `❌ ${errors.length}` : '✓'}  ${item.url}`);
    writeReport();
  }

  await browser.close();
  writeReport();
  console.log(`\n==== DONE. ${results.length}/${worklist.length} routes had errors. report -> ${OUT}`);
  // Compact summary by status/kind.
  const byKind = {};
  for (const r of results) for (const e of r.errors) {
    const k = e.kind === 'http' ? `http-${e.status}` : e.kind;
    byKind[k] = (byKind[k] || 0) + 1;
  }
  console.log('by kind:', JSON.stringify(byKind));
}

main().catch((e) => {
  console.error('CRAWL FATAL:', e);
  process.exit(1);
});
